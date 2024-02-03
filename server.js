const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
mongoose.connect('mongodb+srv://luonglux89:FATvdlYa5uKwLDUh@cluster0.encfwww.mongodb.net/?', { useNewUrlParser: true, useUnifiedTopology: true });

const folderSchema = new mongoose.Schema({
    name: String,
    type: { type: String, enum: ['folder', 'file'] },
    content: { type: String, default: null },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Folder' }]
});
  
const Folder = mongoose.model('Folder', folderSchema);

async function createObject(name, type, parentId, content) {
    let newObject;
    if (type === 'folder' || type === 'file') {
        if (parentId && parentId.trim() !== "") {
            const parentFolder = await Folder.findById(parentId);
            if (!parentFolder) {
                throw new Error('Parent folder not found.');
            }
            if (parentFolder.type === 'file') {
                throw new Error('Cannot create children in a file.');
            }
            newObject = new Folder({ name, type, content, parentId });
            await newObject.save();
            parentFolder.children.push(newObject);
            await parentFolder.save();
        } else {
            newObject = new Folder({ name, type, content });
            await newObject.save();
        }
    } else {
        throw new Error('Invalid type. Must be "folder" or "file".');
    }
    return newObject;
}

app.post('/api/folders', async (req, res) => {
  try {
    const { name, parentId, type, content } = req.body;
    if (!name || !type) {
      throw new Error('Name and type are required.');
    }
    const newObject = await createObject(name, type, parentId, content);
    res.status(201).json(newObject);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

async function populateChildren(folder) {
    try {
        const folderWithChildren = await Folder.findById(folder._id).populate('children').lean();
        for (const child of folderWithChildren.children) {
            if (child.type === 'folder') {
                await populateChildren(child);
                delete child.content; 
            } else {
                delete child.children; 
            }
        }
        folder.children = folderWithChildren.children;
        if (!folder.parentId && folder.type === 'folder') {
            delete folder.content;
        }
        if (!folder.parentId && folder.type === 'file') {
            delete folder.children;
        }
    } catch (error) {
        console.error(`Error populating children for folder ${folder._id}: ${error.message}`);
        throw error;
    }
}

app.get('/api/folders', async (req, res) => {
    try {
        const rootFolders = await Folder.find({ parentId: null }).lean();
        for (const rootFolder of rootFolders) {
            await populateChildren(rootFolder);
        }
        res.json(rootFolders);
    } catch (error) {
        console.error(`Error retrieving folders: ${error.message}`);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.put('/api/folders/:id', async (req, res) => {
    try {
        const { name, content } = req.body;
        const folderId = req.params.id;
        if (!name) {
            throw new Error('Name is required for updating.');
        }
        const folder = await Folder.findById(folderId);
        if (!folder) {
            throw new Error('Folder or file not found.');
        }
        if (folder.type === 'folder') {
            folder.name = name;
        }
        if (folder.type === 'file') {
            folder.name = name;
            if (content !== undefined) {
                folder.content = content;
            }
        }
        await folder.save();
        res.json(folder);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/folders/:id', async (req, res) => {
    try {
        const folderId = req.params.id;
        const folder = await Folder.findById(folderId);
        if (!folder) {
            throw new Error('Folder or file not found.');
        }
        if (folder.parentId) {
            const parentFolder = await Folder.findById(folder.parentId);
            if (parentFolder) {
                parentFolder.children = parentFolder.children.filter(childId => childId.toString() !== folderId);
                await parentFolder.save();
            }
        }
        await Folder.findByIdAndDelete(folderId);
        res.json({ message: 'Folder or file deleted successfully.' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
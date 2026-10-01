const fs = require('fs');
const file = 'tests/e2e/test-entry.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("const { app } = require('electron');", "const { app } = require('electron');\nObject.defineProperty(app, 'isPackaged', { get: () => false });");
fs.writeFileSync(file, content);

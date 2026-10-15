const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), path.join(root, 'dist'), { recursive: true });
console.log('Built static site in dist/');

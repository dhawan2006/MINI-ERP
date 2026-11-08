process.env.MINIPOS_E2E_TEST = 'true';
const { app } = require('electron');
Object.defineProperty(app, 'isPackaged', { get: () => false });

const userDirArg = process.argv.find(arg => typeof arg === 'string' && arg.startsWith('--user-data-dir='));
if (userDirArg) {
  app.setPath('userData', userDirArg.slice('--user-data-dir='.length));
}

require('../../dist-electron/main.js');

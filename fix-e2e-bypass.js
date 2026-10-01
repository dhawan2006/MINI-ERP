const fs = require('fs');
const path = require('path');

const mainTsPath = path.join(__dirname, 'electron', 'main.ts');
let mainTs = fs.readFileSync(mainTsPath, 'utf8');

mainTs = mainTs.replace(
  /const dialogService = process\.env\.MINIPOS_E2E_TEST === 'true'/,
  "const dialogService = !app.isPackaged && process.env.MINIPOS_E2E_TEST === 'true'"
);

mainTs = mainTs.replace(
  /const isTestMode = process\.env\.MINIPOS_E2E_TEST === 'true';/,
  "const isTestMode = !app.isPackaged && process.env.MINIPOS_E2E_TEST === 'true';"
);

fs.writeFileSync(mainTsPath, mainTs);

const fakeProviderPath = path.join(__dirname, 'electron', 'native', 'FakeDeviceIdentityProvider.ts');
let fakeProvider = fs.readFileSync(fakeProviderPath, 'utf8');

if (!fakeProvider.includes("import { app } from 'electron';")) {
  fakeProvider = "import { app } from 'electron';\n" + fakeProvider;
}

if (!fakeProvider.includes("SEC-FATAL: FakeDeviceIdentityProvider")) {
  fakeProvider = fakeProvider.replace(
    /export class FakeDeviceIdentityProvider implements IDeviceIdentityProvider \{/,
    `export class FakeDeviceIdentityProvider implements IDeviceIdentityProvider {\n  constructor() {\n    if (app && app.isPackaged) {\n      throw new Error('SEC-FATAL: FakeDeviceIdentityProvider cannot be used in production builds.');\n    }\n  }`
  );
  fs.writeFileSync(fakeProviderPath, fakeProvider);
}
console.log('Fixed bypasses');

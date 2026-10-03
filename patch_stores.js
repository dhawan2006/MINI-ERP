const fs = require('fs');

function patchFile(path, regex, replacement) {
  const code = fs.readFileSync(path, 'utf8');
  fs.writeFileSync(path, code.replace(regex, replacement));
}

patchFile('src/application/state/licensingStore.ts', /fetchStatus: async \(\) => \{/, "fetchStatus: async () => {\n    console.log('[DEBUG] fetchStatus called');");
patchFile('src/application/state/licensingStore.ts', /set\(\{ status: response.data, isInitializing: false \}\);/g, "console.log('[DEBUG] fetchStatus DONE SUCCESS');\n        set({ status: response.data, isInitializing: false });");
patchFile('src/application/state/licensingStore.ts', /set\(\{ status: \{ state: 'STORAGE_ERROR' \}, isInitializing: false \}\);/g, "console.log('[DEBUG] fetchStatus DONE ERROR');\n        set({ status: { state: 'STORAGE_ERROR' }, isInitializing: false });");

patchFile('src/application/state/setupStore.ts', /fetchState: async \(\) => \{/, "fetchState: async () => {\n    console.log('[DEBUG] fetchSetupState called');");
patchFile('src/application/state/setupStore.ts', /set\(\{ isInitializing: false \}\);/g, "console.log('[DEBUG] fetchSetupState FINALLY');\n      set({ isInitializing: false });");


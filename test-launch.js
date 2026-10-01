const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['tests/e2e/test-entry.js'] });
  const isPackaged = await app.evaluate(({ app }) => {
    try {
      Object.defineProperty(app, 'isPackaged', { get: () => false });
      return app.isPackaged;
    } catch(e) { return e.toString(); }
  });
  console.log("IS PACKAGED:", isPackaged);
  await app.close();
})();

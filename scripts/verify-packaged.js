const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const executablePath = path.resolve(
    process.platform === 'darwin'
      ? './release/mac-arm64/Mini POS.app/Contents/MacOS/Mini POS'
      : './release/win-unpacked/Mini POS.exe'
  );
  
  if (!fs.existsSync(executablePath)) {
    console.error(`❌ [Verify] Packaged executable not found at: ${executablePath}`);
    process.exit(1);
  }

  console.log(`[Verify] Launching packaged app: ${executablePath}`);
  
  const electronApp = await electron.launch({
    executablePath,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  });

  // 1. Verify User Data Path
  const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  const dbPath = path.join(userDataPath, 'mini-erp-data', 'billing.db');
  
  console.log(`[Verify] Database path resolved to: ${dbPath}`);
  if (dbPath.includes('tests') || dbPath.includes('fixtures') || !dbPath.includes('userData') && !dbPath.includes('Application Support') && !dbPath.includes('AppData')) {
      console.warn(`⚠️ [Verify] Database path looks suspicious: ${dbPath}`);
  }

  console.log('✅ [Verify] App launched. Waiting for first window...');
  const window = await electronApp.firstWindow();
  
  const title = await window.title();
  console.log(`✅ [Verify] Window title confirmed: ${title}`);
  
  if (title !== 'Mini Billing System') {
    console.error('❌ [Verify] Incorrect window title.');
    process.exit(1);
  }

  await window.waitForLoadState('networkidle');

  // Verify DB exists after init
  if (!fs.existsSync(dbPath)) {
      console.error(`❌ [Verify] Database file was not created at expected path: ${dbPath}`);
      process.exit(1);
  }

  console.log('[Verify] 2. Testing SQLite and IPC (Billing & Products)...');
  const searchResult = await window.evaluate(() => window.api.products.searchActiveByPrefix('Test'));
  if (!searchResult || !searchResult.success) {
    console.error('❌ [Verify] SQLite/IPC failed during product search.');
    process.exit(1);
  }
  console.log('✅ [Verify] SQLite search successful.');

  console.log('[Verify] 3. Testing Settings persistence...');
  const newShopName = 'Test Shop ' + Date.now();
  const settingsSave = await window.evaluate(async (shopName) => {
    const current = await window.api.settings.get();
    if (!current.success) return current;
    return window.api.settings.update({
      store: {
        shopName,
        shopAddress: '123 Test St',
        shopPhone: '555-0000'
      },
      printer: current.data.printer
    });
  }, newShopName);
  
  if (!settingsSave || !settingsSave.success) {
    console.error('❌ [Verify] Settings save failed:', JSON.stringify(settingsSave, null, 2));
    process.exit(1);
  }

  const settingsLoad = await window.evaluate(() => window.api.settings.get());
  if (settingsLoad.data.store.shopName !== newShopName) {
    console.error('❌ [Verify] Settings persistence failed.');
    process.exit(1);
  }
  console.log('✅ [Verify] Settings persistence successful.');

  console.log('[Verify] 4. Testing History retrieval...');
  const historyLoad = await window.evaluate(() => window.api.history.list({ offset: 0, limit: 10 }));
  if (!historyLoad || !historyLoad.success) {
    console.error('❌ [Verify] History retrieval failed.');
    process.exit(1);
  }
  console.log('✅ [Verify] History retrieval successful.');

  console.log('✅ [Verify] All runtime verifications passed successfully. The artifact is fully validated.');
  
  await electronApp.close();
})().catch(err => {
  console.error('❌ [Verify] Fatal error during verification:', err);
  process.exit(1);
});

// scripts/test-dmg.js
// Automated End-to-End DMG Installer Verification Script for Mini POS

delete process.env.ELECTRON_RUN_AS_NODE;
process.env.MINIPOS_E2E_TEST = 'true';
const { execSync } = require('child_process');
const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');

async function testDmg() {
  const dmgPath = path.resolve('release/Mini POS-1.0.0-arm64.dmg');
  if (!fs.existsSync(dmgPath)) {
    throw new Error('DMG file not found at: ' + dmgPath);
  }

  console.log('=================================================================');
  console.log(' Mini POS 2.0 — Automated DMG Artifact & Runtime Verification');
  console.log('=================================================================');
  console.log(`[DMG] Target DMG: ${dmgPath} (${(fs.statSync(dmgPath).size / 1024 / 1024).toFixed(1)} MB)`);

  // 1. Mount DMG
  console.log('\n[DMG Step 1] Mounting disk image...');
  const attachOutput = execSync(`hdiutil attach "${dmgPath}" -nobrowse`).toString();
  console.log(attachOutput.trim());

  // Find mount point from attach output
  const mountMatch = attachOutput.match(/\/Volumes\/[^\n\r]+/);
  if (!mountMatch) {
    throw new Error('Failed to determine mount point from hdiutil output');
  }
  const mountPoint = mountMatch[0].trim();
  console.log(`✅ [DMG Step 1] Mounted successfully at: ${mountPoint}`);

  try {
    // 2. Validate volume layout
    console.log('\n[DMG Step 2] Inspecting volume layout...');
    const volumeContents = fs.readdirSync(mountPoint);
    console.log(`[DMG Step 2] Volume entries: ${volumeContents.join(', ')}`);

    if (!volumeContents.includes('Mini POS.app')) {
      throw new Error('Mini POS.app not found inside DMG volume!');
    }
    if (!volumeContents.includes('Applications')) {
      throw new Error('Applications drag-and-drop symlink not found inside DMG volume!');
    }
    console.log('✅ [DMG Step 2] Volume layout contains Mini POS.app and Applications shortcut.');

    // 3. Inspect application bundle inside DMG
    console.log('\n[DMG Step 3] Inspecting application bundle...');
    const appPathInDmg = path.join(mountPoint, 'Mini POS.app');
    const infoPlistPath = path.join(appPathInDmg, 'Contents', 'Info.plist');
    if (!fs.existsSync(infoPlistPath)) {
      throw new Error('Info.plist not found at: ' + infoPlistPath);
    }
    const codesignCheck = execSync(`codesign -dv "${appPathInDmg}" 2>&1`).toString();
    console.log(`[DMG Step 3] Code signature: ${codesignCheck.split('\n')[0]}`);
    console.log('✅ [DMG Step 3] Application bundle structure and ad-hoc signature confirmed.');

    // 4. Simulate drag-and-drop installation to staging directory
    console.log('\n[DMG Step 4] Simulating user drag-and-drop installation...');
    const installDir = '/tmp/minipos-dmg-e2e-install';
    execSync(`rm -rf "${installDir}" && mkdir -p "${installDir}"`);
    execSync(`cp -R "${appPathInDmg}" "${installDir}/"`);
    const installedAppPath = path.join(installDir, 'Mini POS.app', 'Contents', 'MacOS', 'Mini POS');
    console.log(`✅ [DMG Step 4] Application installed to: ${installDir}/Mini POS.app`);

    // 5. Launch installed application and run runtime verification
    console.log('\n[DMG Step 5] Launching installed desktop application...');
    const electronApp = await electron.launch({
      executablePath: installedAppPath,
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
    });

    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    const dbPath = path.join(userDataPath, 'mini-erp-data', 'billing.db');
    console.log(`[DMG Step 5] UserData directory: ${userDataPath}`);
    console.log(`[DMG Step 5] SQLite database: ${dbPath}`);

    const window = await electronApp.firstWindow();
    const title = await window.title();
    console.log(`✅ [DMG Step 5] Window title confirmed: "${title}"`);
    if (title !== 'Mini Billing System') {
      throw new Error(`Unexpected window title: ${title}`);
    }

    await window.waitForLoadState('networkidle');

    // 6. Test SQLite search via IPC
    console.log('\n[DMG Step 6] Testing local SQLite product search via IPC...');
    const searchResult = await window.evaluate(() => window.api.products.searchActiveByPrefix('Test'));
    if (!searchResult || !searchResult.success) {
      throw new Error('Product search IPC failed: ' + JSON.stringify(searchResult));
    }
    console.log('✅ [DMG Step 6] Local SQLite product search executed successfully.');

    // 7. Test Settings read/write persistence
    console.log('\n[DMG Step 7] Testing local settings persistence...');
    const testStoreName = 'DMG Test Store ' + Date.now();
    const settingsSave = await window.evaluate(async (shopName) => {
      const current = await window.api.settings.get();
      if (!current.success) return current;
      return window.api.settings.update({
        store: {
          shopName,
          shopAddress: '100 DMG Test Boulevard',
          shopPhone: '555-DMG-TEST'
        },
        printer: current.data.printer
      });
    }, testStoreName);

    if (!settingsSave || !settingsSave.success) {
      throw new Error('Settings save failed: ' + JSON.stringify(settingsSave));
    }

    const settingsLoad = await window.evaluate(() => window.api.settings.get());
    if (settingsLoad.data.store.shopName !== testStoreName) {
      throw new Error('Settings persistence mismatch');
    }
    console.log(`✅ [DMG Step 7] Settings persisted and verified: "${settingsLoad.data.store.shopName}"`);

    // 8. Test Sales History retrieval
    console.log('\n[DMG Step 8] Testing sales history retrieval...');
    const historyLoad = await window.evaluate(() => window.api.history.list({ offset: 0, limit: 10 }));
    if (!historyLoad || !historyLoad.success) {
      throw new Error('History list retrieval failed: ' + JSON.stringify(historyLoad));
    }
    console.log('✅ [DMG Step 8] Sales history retrieved successfully.');

    // 9. Negative assertion: Verify zero licensing prompts in UI
    console.log('\n[DMG Step 9] Verifying offline standalone UI (zero licensing prompts)...');
    const bodyText = await window.innerText('body');
    const lower = bodyText.toLowerCase();
    if (lower.includes('license key') || lower.includes('activate license') || lower.includes('lease expired')) {
      throw new Error('Found unexpected licensing prompt in UI text!');
    }
    console.log('✅ [DMG Step 9] Verified standalone UI (0 licensing prompts, 0 activation gates).');

    await electronApp.close();
    console.log('\n✅ [DMG Step 10] Application closed cleanly.');

    // Cleanup temp installation
    execSync(`rm -rf "${installDir}"`);
  } finally {
    // Unmount DMG volume
    console.log('\n[DMG Cleanup] Detaching disk image...');
    try {
      execSync(`hdiutil detach "${mountPoint}" -force`);
      console.log(`✅ [DMG Cleanup] Ejected volume: ${mountPoint}`);
    } catch (e) {
      console.warn(`⚠️ [DMG Cleanup] Could not cleanly detach ${mountPoint}:`, e.message);
    }
  }

  console.log('\n=================================================================');
  console.log(' 🎉 ALL DMG ARTIFACT & RUNTIME VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('=================================================================\n');
}

testDmg().catch(err => {
  console.error('\n❌ [DMG Test] FAILED:', err);
  process.exit(1);
});

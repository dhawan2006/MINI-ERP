const fs = require('fs');
const path = 'tests/e2e/licensing-real/step3-runtime-checkin.spec.ts';
const code = fs.readFileSync(path, 'utf8');

const replacement = `
  test('0. Activate the App to set baseline', async () => {
    app = await electron.launch({
      args: ['dist-electron/main.js', \`--user-data-dir=\${userDataPath}\`],
      env: {
        ...process.env,
        MINIPOS_E2E_TEST: 'true',
        MINIPOS_E2E_TEST_DEVICE_KEY: TEST_DEVICE_KEY_ID,
        LICENSING_SERVER_URL: 'http://localhost:3456',
        NODE_ENV: 'qa',
        LICENSING_SERVER_KEY_ID: 'qa-key-1',
        LICENSING_SERVER_PUBLIC_KEY: publicKeyPem,
      }
    });

    app.on('console', (msg: any) => console.log(\`[MAIN CONSOLE] \${msg.type()}: \${msg.text()}\`));
    page = await app.firstWindow();
    page.on('console', (msg: any) => console.log(\`[RENDERER CONSOLE] \${msg.type()}: \${msg.text()}\`));

    try {
      await expect(page.getByText('Activate Mini POS')).toBeVisible({ timeout: 10000 });
      const input = page.getByPlaceholder('XXXX-XXXX-XXXX-XXXX');
      await input.fill(TEST_LICENSE_KEY);
      await page.getByRole('button', { name: 'Activate Device' }).click();

      await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 20000 });
    } catch(err) {
      console.log('HTML DUMP STEP 3:');
      console.log(await page.content());
      throw err;
    }
    
    await app.close();
  });
`;

fs.writeFileSync(path, code.replace(/test\('0\. Activate the App to set baseline', async \(\) => \{[\s\S]*?await app\.close\(\);\n  \}\);/, replacement.trim()));

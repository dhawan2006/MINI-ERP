const fs = require('fs');

const path = 'tests/e2e/licensing-real/activation-real.spec.ts';
const code = fs.readFileSync(path, 'utf8');

const replacement = `
  test('L1: App starts in NOT_ACTIVATED state and shows Activation UI', async () => {
    try {
      await expect(page.getByText('Activate Mini POS')).toBeVisible({ timeout: 10000 });
      await expect(page.getByPlaceholder('XXXX-XXXX-XXXX-XXXX')).toBeVisible();
    } catch (err) {
      console.log('HTML DUMP:');
      console.log(await page.content());
      throw err;
    }
  });
`;

fs.writeFileSync(path, code.replace(/test\('L1: App starts in NOT_ACTIVATED state and shows Activation UI', async \(\) => \{[\s\S]*?\}\);/, replacement.trim()));

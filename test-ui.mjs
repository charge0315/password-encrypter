import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    
    console.log('Uploading file...');
    await page.setInputFiles('#csv-input', 'dummy_passwords.csv');
    
    // Wait for table to be visible
    await page.waitForSelector('#entries-table', { state: 'visible' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'data/screenshots/ui-test-1-uploaded.png' });
    console.log('Uploaded => data/screenshots/ui-test-1-uploaded.png');

    console.log('Clicking check breaches...');
    await page.click('#btn-check-breaches');
    // Wait for progress modal to disappear or finish
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'data/screenshots/ui-test-2-checked.png' });
    console.log('Checked => data/screenshots/ui-test-2-checked.png');

    console.log('Clicking generate passwords...');
    await page.click('#btn-generate-passwords');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'data/screenshots/ui-test-3-generated.png' });
    console.log('Generated => data/screenshots/ui-test-3-generated.png');

    console.log('UI Tests completed successfully!');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await browser.close();
  }
})();

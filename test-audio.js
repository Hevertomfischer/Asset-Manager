import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream'
    ]
  });
  const page = await browser.newPage();
  await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
  console.log("Puppeteer works");
  await browser.close();
})();

import puppeteer from 'puppeteer';
import { launch } from 'puppeteer-stream';

(async () => {
  try {
    const execPath = puppeteer.executablePath();
    const browser = await launch({
      executablePath: execPath,
      headless: true, // test headless: true
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log("Success with headless: true");
    await browser.close();
  } catch (err) {
    console.error("Failed with headless: true", err.message);
  }
})();

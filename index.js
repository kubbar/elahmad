const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const port = process.env.PORT || 3000;

app.get('/:channel', async (req, res) => {
  const { channel } = req.params;

  if (!channel || typeof channel !== 'string') {
    return res.status(400).json({ error: 'Channel parameter is required' });
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update'
      ],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // إعداد الكوكيز والهيدر
    await page.setCookie({
      name: 'PHPSESSID',
      value: 'paohg4ujlm07u292s8lckvl9tj',
      domain: 'www.elahmad.com'
    });
    await page.setExtraHTTPHeaders({
      'Origin': 'https://www.elahmad.com',
      'Referer': `https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`,
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, مثل Gecko) Chrome/131.0.0.0 Safari/537.36'
    });

    let streamingLink = null;
    const streamingLinkPromise = new Promise((resolve) => {
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.m3u8') && !url.includes('stat.kwikmotion.com')) {
          resolve(url);
        }
      });
    });

    // بيانات البوست
    const postData = {
      licType: 'rmp',
      licenseKey: 'Kl8lYWVvPTNla2Nza3YyNzk/cm9tNWRhc2lzMzBkYjBBJV8q',
      hostname: 'elahmad.com',
      version: '9.15.16',
      cs: '10040'
    };

    await page.goto(`https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`, {
      waitUntil: 'domcontentloaded',
      timeout: 35000
    });

    // إرسال طلب البوست
    await page.evaluate((postData) => {
      return fetch('https://www.elahmad.com/tv/embed/radiant/increment.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryrBNuE3BGOEoDOwUF'
        },
        body: `
        ------WebKitFormBoundaryrBNuE3BGOEoDOwUF
        Content-Disposition: form-data; name="licType"

        ${postData.licType}
        ------WebKitFormBoundaryrBNuE3BGOEoDOwUF
        Content-Disposition: form-data; name="licenseKey"

        ${postData.licenseKey}
        ------WebKitFormBoundaryrBNuE3BGOEoDOwUF
        Content-Disposition: form-data; name="hostname"

        ${postData.hostname}
        ------WebKitFormBoundaryrBNuE3BGOEoDOwUF
        Content-Disposition: form-data; name="version"

        ${postData.version}
        ------WebKitFormBoundaryrBNuE3BGOEoDOwUF
        Content-Disposition: form-data; name="cs"

        ${postData.cs}
        ------WebKitFormBoundaryrBNuE3BGOEoDOwUF--
        `
      });
    }, postData);

    streamingLink = await streamingLinkPromise;

    if (streamingLink) {
      console.log('Streaming Link:', streamingLink);
      return res.status(200).json({ streamingLink });
    } else {
      console.log('No streaming link found for channel:', channel);
      return res.status(404).json({ error: 'No streaming link found' });
    }
  } catch (error) {
    console.error('Error in API route:', error);
    return res.status(500).json({ error: 'An error occurred while fetching channel data' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

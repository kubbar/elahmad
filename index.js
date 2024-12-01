const express = require('express');
const puppeteer = require('puppeteer-extra');
const chromium = require('@sparticuz/chromium');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

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

    let foundLink = false;
    const streamingLinkPromise = new Promise((resolve) => {
      page.on('response', async (response) => {
        const url = response.url();
        if (!foundLink && url.includes('.m3u8') && !url.includes('stat.kwikmotion.com')) {
          foundLink = true;
          resolve(url);
          page.removeAllListeners('request');
        }
      });
    });

    await page.goto(`https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`, {
      waitUntil: 'domcontentloaded',
      timeout: 35000
    });

    const streamingLink = await streamingLinkPromise;
    if (streamingLink) {
      const proxyUrl = `${req.protocol}://${req.get('host')}/proxy?target=${encodeURIComponent(streamingLink)}`;
      return res.status(200).json({ streamingLink: proxyUrl });
    } else {
      return res.status(404).json({ error: 'No streaming link found' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'An error occurred while fetching channel data' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.get('/proxy', async (req, res) => {
  const targetUrl = decodeURIComponent(req.query.target);
  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'Referer': 'https://www.elahmad.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, مثل Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      responseType: 'stream'
    });
    res.setHeader('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

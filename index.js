const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const chromium = require('@sparticuz/chromium');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createProxyMiddleware } = require('http-proxy-middleware');

puppeteer.use(StealthPlugin());

const app = express();
const port = process.env.PORT || 3000;

// قائمة عناوين IP الثابتة الصادرة
const staticIPs = ['52.41.36.82', '54.191.253.12', '44.226.122.3'];

app.use('/proxy', createProxyMiddleware({
  target: '',
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    const targetUrl = decodeURIComponent(req.query.target);
    proxyReq.setHeader('Referer', 'https://www.elahmad.com');
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML، مثل Gecko) Chrome/131.0.0.0 Safari/537.36');
    proxyReq.setHeader('X-Forwarded-For', staticIPs[Math.floor(Math.random() * staticIPs.length)]); // تعيين عنوان IP ثابت عشوائي من القائمة
    proxyReq.path = targetUrl;
  },
  router: (req) => decodeURIComponent(req.query.target),
}));

app.get('/:channel', async (req, res) => {
  const { channel } = req.params;

  if (!channel || typeof channel !== 'string') {
    console.log('Invalid channel parameter:', channel);
    return res.status(400).json({ error: 'Channel parameter is required' });
  }

  try {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
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

    console.log('Browser launched.');

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);

    let streamingLinkFound = false;

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (streamingLinkFound) {
        request.abort(); // إيقاف الطلبات بعد العثور على الرابط
        return;
      }
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    console.log('Page interception set.');

    let streamingLink = null;
    const streamingLinkPromise = new Promise((resolve) => {
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.m3u8') && !url.includes('stat.kwikmotion.com') && !streamingLinkFound) {
          streamingLinkFound = true; // إيقاف البحث بعد العثور على الرابط
          console.log('Found streaming link:', url);
          resolve(url);
          // إيقاف الاعتراض بعد العثور على الرابط
          page.removeAllListeners('request');
        }
      });
    });

    console.log(`Navigating to https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`);
    await page.goto(`https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`, {
      waitUntil: 'domcontentloaded',
      timeout: 35000
    });

    console.log('Page loaded.');

    streamingLink = await streamingLinkPromise;

    if (streamingLink) {
      console.log('Streaming Link:', streamingLink);
      // فك تشفير الرابط وتعديله بشكل صحيح
      const decodedStreamingLink = decodeURIComponent(streamingLink);
      const proxyUrl = `${req.protocol}://${req.get('host')}/proxy?target=${encodeURIComponent(decodedStreamingLink)}`;
      console.log('Proxy URL:', proxyUrl);

      return res.status(200).json({ streamingLink: proxyUrl });
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
      console.log('Browser closed.');
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

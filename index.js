const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const { createProxyMiddleware } = require('http-proxy-middleware');
const awsLambda = require('chrome-aws-lambda');

puppeteer.use(StealthPlugin());

const app = express();
const port = process.env.PORT || 3000;

// استخدام بروكسي ثابت
const proxy = '188.166.197.129:3128'; // البروكسي الذي جربته ويعمل

app.use('/proxy', createProxyMiddleware({
  target: '',
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    const targetUrl = decodeURIComponent(req.query.target);
    proxyReq.setHeader('Referer', 'https://www.elahmad.com');
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML، مثل Gecko) Chrome/131.0.0.0 Safari/537.36');
    proxyReq.path = targetUrl;
  },
  router: (req) => decodeURIComponent(req.query.target),
}));

app.get('/:channel', async (req, res) => {
  const { channel } = req.params;

  if (!channel || typeof channel !== 'string') {
    return res.status(400).json({ error: 'Channel parameter is required' });
  }

  // تجاهل طلب favicon.ico
  if (channel === 'favicon.ico') {
    return res.status(204).end();
  }

  let browser = null;
  try {
    const executablePath = await awsLambda.executablePath;
    const args = [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'];

    browser = await puppeteer.launch({
      args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);

    // إعداد رأس الطلب لتقليد المتصفح العادي
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML، مثل Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    let streamingLink = null;

    // استخدم on(response) للعثور على الرابط من الاستجابات الواردة
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('.m3u8') && !url.includes('stat.kwikmotion.com')) {
        streamingLink = url;
      }
    });

    console.log(`Navigating to https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`);
    await page.goto(`https://www.elahmad.com/tv/mobiletv/glarb.php?id=${channel}`, {
      waitUntil: 'networkidle2',
      timeout: 120000 // زيادة وقت الانتظار إلى 120 ثانية
    });

    // الانتظار قليلاً للسماح للروابط بالتحميل
    await new Promise(resolve => setTimeout(resolve, 20000)); // زيادة التأخير إلى 20 ثانية

    if (streamingLink) {
      console.log('Streaming Link:', streamingLink);

      // إنشاء رابط البروكسي بدون رموز غير مفهومة
      const proxyUrl = `${req.protocol}://${req.get('host')}/proxy?target=${encodeURIComponent(streamingLink)}`;
      return res.status(200).json({ streamingLink: decodeURIComponent(proxyUrl) });
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

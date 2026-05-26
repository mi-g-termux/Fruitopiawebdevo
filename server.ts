/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import nodemailer from 'nodemailer';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  app.use(express.json());

  const PORT = 3000;

  // --- API ROUTE: HEALTH CHECK ---
  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', time: new Date().toISOString() });
  });

  // --- API ROUTE: SEND SMTP EMAIL & GENERATE INVOICE MAIL ---
  app.post('/api/send-email', async (req: express.Request, res: express.Response) => {
    const { to, subject, html, smtpSettings } = req.body;

    if (!to || !subject || !html) {
      res.status(400).json({ error: 'Missing parameter: to, subject, or html body is required.' });
      return;
    }

    console.log(`[EMAIL DISPATCH] To: ${to} | Subject: "${subject}"`);

    // Check if the admin settings has enabled SMTP
    const smtp = smtpSettings || { isEnabled: false };

    if (smtp.isEnabled && smtp.host && smtp.port && smtp.email) {
      try {
        console.log(`[SMTP] Attempting connection to ${smtp.host}:${smtp.port} using user ${smtp.email}`);
        
        // Setup transporter
        // WARNING: Always handle credentials safely, do not expose keys
        const transporter = nodemailer.createTransport({
          host: smtp.host,
          port: Number(smtp.port),
          secure: Number(smtp.port) === 465, // true for 465, false for 587
          auth: {
            user: smtp.email,
            pass: smtp.password || '', // SMTP email password (configured dynamically in admin panel of running container)
          },
          tls: {
            rejectUnauthorized: false
          }
        });

        const mailOptions = {
          from: `"Quirky Fruity Store" <${smtp.email}>`,
          to,
          subject,
          html,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('[SMTP] Real Email sent successfully! MessageID:', info.messageId);
        res.json({ success: true, message: 'SMTP email sent successfully.', messageId: info.messageId });
        return;
      } catch (err: any) {
        console.error('[SMTP ERROR] Failed to send real email. Falling back to log print.', err);
        res.json({
          success: true,
          warn: true,
          message: `Attempted real email via SMTP, but failed: ${err.message}. Printed email content to server log instead.`,
          logSimulated: true
        });
        return;
      }
    } else {
      // SMTP not configured or disabled by admin
      console.log('================================================================');
      console.log(`[SIMULATED EMAIL DISPATCH] (SMTP is not enabled in settings)`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`--- Email HTML Content ---`);
      console.log(html);
      console.log('================================================================');

      res.json({
        success: true,
        message: 'Email simulated and printed to terminal successfully. (Configure SMTP in settings to send real emails!)',
        simulated: true
      });
      return;
    }
  });

  // --- API ROUTE: BKASH PAYMENT INITIATION (Tokenized Checkout) ---
  app.post('/api/bkash/create-payment', async (req: express.Request, res: express.Response) => {
    const { amount, orderId, appKey, appSecret, username, password, sandboxMode } = req.body;

    if (!appKey || !appSecret || !username || !password) {
      res.status(400).json({ error: 'bKash API credentials are not configured. Please add them in the Admin Panel → Payments.' });
      return;
    }

    const baseUrl = sandboxMode
      ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
      : 'https://tokenized.pay.bka.sh/v1.2.0-beta';

    try {
      // Step 1: Grant Token
      const tokenRes = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'username': username,
          'password': password,
        },
        body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
      });
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.id_token) {
        res.status(502).json({ error: 'bKash token grant failed.', detail: tokenData });
        return;
      }

      // Step 2: Create Payment
      const createRes = await fetch(`${baseUrl}/tokenized/checkout/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tokenData.id_token,
          'X-APP-Key': appKey,
        },
        body: JSON.stringify({
          mode: '0011',
          payerReference: orderId,
          callbackURL: `${req.protocol}://${req.get('host')}/api/bkash/callback`,
          amount: String(amount),
          currency: 'BDT',
          intent: 'sale',
          merchantInvoiceNumber: orderId,
        }),
      });
      const createData = await createRes.json() as any;

      if (createData.statusCode === '0000' && createData.bkashURL) {
        res.json({ success: true, bkashURL: createData.bkashURL, paymentID: createData.paymentID });
      } else {
        res.status(502).json({ error: 'bKash payment creation failed.', detail: createData });
      }
    } catch (err: any) {
      console.error('[bKash API Error]', err);
      res.status(500).json({ error: `bKash API error: ${err.message}` });
    }
  });

  // --- API ROUTE: BKASH CALLBACK (execute after customer pays) ---
  app.get('/api/bkash/callback', async (req: express.Request, res: express.Response) => {
    const { paymentID, status } = req.query;
    if (status === 'cancel' || status === 'failure') {
      res.redirect(`/?bkash=failed&paymentID=${paymentID}`);
      return;
    }
    // In production, execute the payment here with the paymentID
    res.redirect(`/?bkash=success&paymentID=${paymentID}`);
  });

  // --- API ROUTE: NAGAD PAYMENT INITIATION ---
  app.post('/api/nagad/create-payment', async (req: express.Request, res: express.Response) => {
    const { amount, orderId, merchantId, sandboxMode } = req.body;

    if (!merchantId) {
      res.status(400).json({ error: 'Nagad Merchant ID is not configured. Please add it in Admin Panel → Payments.' });
      return;
    }

    const baseUrl = sandboxMode
      ? 'https://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs'
      : 'https://api.mynagad.com/api/dfs';

    const datetime = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/nagad/callback`;

    try {
      // Step 1: Initialize Payment
      const initRes = await fetch(`${baseUrl}/check-out/initialize/${merchantId}/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-KM-Api-Version': 'v-0.2.0', 'X-KM-IP-V4': req.ip || '127.0.0.1', 'X-KM-Client-Type': 'PC_WEB', 'X-KM-MC-Id': merchantId },
        body: JSON.stringify({
          dateTime: datetime,
          sensitiveData: Buffer.from(JSON.stringify({ merchantId, orderId, datetime, challenge: orderId })).toString('base64'),
          signature: '', // In production, RSA sign with merchant private key
        }),
      });
      const initData = await initRes.json() as any;

      if (initData.callBackUrl) {
        res.json({ success: true, nagadURL: initData.callBackUrl, paymentReferenceId: initData.paymentReferenceId });
      } else {
        res.status(502).json({ error: 'Nagad payment initialization failed.', detail: initData });
      }
    } catch (err: any) {
      console.error('[Nagad API Error]', err);
      res.status(500).json({ error: `Nagad API error: ${err.message}` });
    }
  });

  // --- API ROUTE: NAGAD CALLBACK ---
  app.get('/api/nagad/callback', (req: express.Request, res: express.Response) => {
    const { order_id, payment_ref_id, status } = req.query;
    if (status === 'Aborted' || status === 'Cancelled') {
      res.redirect(`/?nagad=failed&order=${order_id}`);
      return;
    }
    res.redirect(`/?nagad=success&order=${order_id}&ref=${payment_ref_id}`);
  });


  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    // Mount Vite dev server middlewares
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OK] Full-Stack Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('[CRITICAL] Server startup error:', error);
});

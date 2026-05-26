/**
 * Vercel Serverless Function: /api/send-email
 *
 * This replaces the Express server's /api/send-email route.
 * Vercel auto-deploys files in /api/ as serverless functions.
 *
 * Gmail SMTP setup:
 *   host: smtp.gmail.com
 *   port: 587
 *   email: yourname@gmail.com
 *   password: YOUR_APP_PASSWORD  ← NOT your Gmail login password!
 *             (Google Account → Security → 2-Step Verification → App Passwords)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, subject, html, smtpSettings } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
  }

  const smtp = smtpSettings || { isEnabled: false };

  // If SMTP is not configured, just acknowledge (email skipped)
  if (!smtp.isEnabled || !smtp.host || !smtp.email || !smtp.password) {
    console.log(`[EMAIL SKIPPED] SMTP not configured. Would have sent to: ${to} | Subject: ${subject}`);
    return res.status(200).json({
      success: true,
      simulated: true,
      message: 'SMTP not configured — email skipped. Configure SMTP in Admin → Settings → SMTP.',
    });
  }

  try {
    const port = Number(smtp.port || 587);

    const transporter = nodemailer.createTransport({
      host: smtp.host,               // e.g. smtp.gmail.com
      port,                          // 587 for TLS, 465 for SSL
      secure: port === 465,          // true only for port 465
      auth: {
        user: smtp.email,            // your Gmail address
        pass: smtp.password,         // Gmail App Password (16-char code)
      },
      tls: {
        rejectUnauthorized: false,   // allow self-signed certs on some hosts
      },
    });

    const info = await transporter.sendMail({
      from: `"${smtp.fromName || 'Store'}" <${smtp.email}>`,
      to,
      subject,
      html,
    });

    console.log(`[EMAIL SENT] To: ${to} | MessageID: ${info.messageId}`);
    return res.status(200).json({ success: true, messageId: info.messageId });

  } catch (err: any) {
    console.error('[EMAIL ERROR]', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      hint: 'For Gmail: make sure you used an App Password (not your Gmail password). Enable 2FA first, then generate App Password at myaccount.google.com/apppasswords',
    });
  }
}

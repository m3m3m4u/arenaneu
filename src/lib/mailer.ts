import nodemailer from 'nodemailer';
import { env } from './env';

let transporter: nodemailer.Transporter | null = null;

function getTransport() {
  if (transporter) return transporter;
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
    console.warn('[mail] SMTP nicht vollständig konfiguriert – Fallback auf console');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: Number(env.SMTP_PORT) === 465, // gängige Heuristik
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(opts: SendMailOptions) {
  const t = getTransport();
  const from = env.MAIL_FROM || 'no-reply@example.com';
  if (!t) {
    console.log('[mail:mock]', { ...opts, from });
    return { mock: true };
  }
  try {
    const info = await t.sendMail({ from, ...opts });
    return { id: info.messageId };
  } catch (e) {
    console.error('[mail] send error', e);
    return { error: true };
  }
}

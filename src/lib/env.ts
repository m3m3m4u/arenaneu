// Zentralisierte ENV Validierung für Vercel / lokal
// Nur Variablen definieren die wirklich benötigt werden – optional markiert.
interface EnvShape {
  MONGODB_URI: string;
  NEXTAUTH_SECRET?: string; // sollte in Produktion gesetzt sein
  NEXTAUTH_URL?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string; // string for easier parsing
  SMTP_USER?: string;
  SMTP_PASS?: string;
  MAIL_FROM?: string;
}

function required(name: keyof EnvShape, fallback?: string) {
  const v = process.env[name as string] ?? fallback;
  if (!v) {
    console.warn(`[env] Variable ${name} fehlt – Feature evtl. eingeschränkt.`);
  }
  return v as string;
}

export const env: EnvShape = {
  MONGODB_URI: required('MONGODB_URI'),
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  MAIL_FROM: process.env.MAIL_FROM,
};

export function assertProductionEnv() {
  if (process.env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!env.MONGODB_URI) missing.push('MONGODB_URI');
    if (!env.NEXTAUTH_SECRET) missing.push('NEXTAUTH_SECRET');
    // Mail optional – nur warnen falls teilweise konfiguriert
    const mailVars = [env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASS, env.MAIL_FROM];
    if (mailVars.some(v=>v) && mailVars.some(v=>!v)) {
      console.warn('[env] Unvollständige Mail-Konfiguration – Reset-Mails evtl. fehlerhaft. Erwartet: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM');
    }
    if (missing.length) {
      console.warn('[env] Fehlende Produktions-Variablen:', missing.join(', '));
    }
  }
}

// Trimiterea emailurilor.
// - Cu SMTP_URL setat și pachetul nodemailer instalat: trimite prin SMTP.
// - Altfel: salvează mesajul ca fișier .eml în data/outbox/ (ideal pentru dezvoltare locală).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { OUTBOX_DIR } from './store.js';
import { site } from '../config/site.js';

let transport;

async function getTransport() {
  if (transport !== undefined) return transport;
  transport = null;
  if (process.env.SMTP_URL) {
    try {
      const { default: nodemailer } = await import('nodemailer');
      transport = nodemailer.createTransport(process.env.SMTP_URL);
    } catch {
      console.warn('[mail] SMTP_URL este setat, dar nodemailer nu este instalat (npm install nodemailer). Folosesc data/outbox/.');
    }
  }
  return transport;
}

const fromAddress = () => process.env.MAIL_FROM || `${site.brand} <no-reply@localhost>`;

// Antet MIME codificat (permite diacritice în subiect).
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

export async function sendMail({ to, subject, text, headers = {} }) {
  const t = await getTransport();
  if (t) {
    await t.sendMail({ from: fromAddress(), to, subject, text, headers });
    return;
  }
  const lines = [
    `From: ${fromAddress()}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
    '',
    text,
  ];
  const safeTo = to.replace(/[^a-z0-9@._-]/gi, '_');
  const file = path.join(OUTBOX_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeTo}.eml`);
  await fsp.writeFile(file, lines.join('\r\n'));
  console.log(`[mail] „${subject}” → ${to} (salvat în data/outbox/${path.basename(file)})`);
}

// Subsolul emailurilor comerciale: identitatea firmei + link de dezabonare.
export function marketingFooter(unsubscribeUrl) {
  const c = site.company;
  return [
    '',
    '—',
    `${c.legalName} · CUI ${c.cui} · ${c.address}`,
    `Primești acest email pentru că te-ai abonat la newsletterul ${site.brand}.`,
    `Dezabonare cu un singur clic: ${unsubscribeUrl}`,
  ].join('\n');
}

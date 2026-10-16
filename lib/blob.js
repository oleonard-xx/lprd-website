// Imaginile încărcate din panoul de administrare.
// - local: în data/uploads/, servite de server la /uploads/...;
// - pe Vercel: în Vercel Blob (BLOB_READ_WRITE_TOKEN), servite direct de CDN-ul Vercel.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_DIR } from './store.js';

export const USES_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const BLOB_HOST = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export async function saveUpload(name, buf, ext) {
  if (USES_BLOB) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`uploads/${name}`, buf, { access: 'public', contentType: TYPES[ext], addRandomSuffix: false });
    return blob.url;
  }
  await fsp.writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

// Adresele de imagine acceptate pentru un proiect: doar fișiere încărcate prin panou.
export const isUploadUrl = (url) =>
  /^\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/.test(url) ||
  (BLOB_HOST.test(url) && /\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/.test(url));

export function deleteUpload(url) {
  if (!url) return;
  if (BLOB_HOST.test(url)) {
    if (USES_BLOB) import('@vercel/blob').then(({ del }) => del(url)).catch((err) => console.error('[blob]', err.message));
    return;
  }
  if (!url.startsWith('/uploads/')) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
}

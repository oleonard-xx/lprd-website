// Stocare simplă în fișier JSON, cu scriere atomică și serializată.
// Suficientă pentru volumul unui site de prezentare; poate fi înlocuită ulterior cu o bază de date.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const OUTBOX_DIR = path.join(DATA_DIR, 'outbox');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = () => ({
  projects: [],
  reviews: [],
  messages: [],
  subscribers: [],
  deletionRequests: [],
  deletionLog: [],
  stats: {},
  meta: { seeded: false },
});

for (const dir of [DATA_DIR, UPLOAD_DIR, OUTBOX_DIR]) fs.mkdirSync(dir, { recursive: true });

let db = EMPTY();
if (fs.existsSync(DB_FILE)) {
  db = { ...EMPTY(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
}

export function getDb() {
  return db;
}

let queue = Promise.resolve();

async function writeAtomic() {
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(db, null, 2));
  // Pe Windows, rename poate eșua temporar dacă fișierul e citit de antivirus.
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(tmp, DB_FILE);
      return;
    } catch (err) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}

// Aplică o modificare și o persistă. Modificările se scriu pe disc în ordinea în care au fost făcute.
export function update(mutator) {
  const result = mutator(db);
  queue = queue.then(writeAtomic, writeAtomic);
  return queue.then(() => result);
}

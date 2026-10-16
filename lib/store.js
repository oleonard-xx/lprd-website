// Stocarea datelor: un singur document JSON.
// - local: fișier pe disc (data/db.json), cu scriere atomică și serializată;
// - pe Vercel: Upstash Redis (prin API-ul REST), cu scriere condiționată de versiune,
//   ca două instanțe care scriu simultan să nu-și suprascrie modificările.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const IS_VERCEL = Boolean(process.env.VERCEL);
// Pe Vercel doar /tmp poate fi scris (și se golește oricând) — acolo ajung doar fișierele temporare.
export const DATA_DIR = process.env.DATA_DIR || (IS_VERCEL ? '/tmp/lprd-data' : path.join(ROOT, 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const OUTBOX_DIR = path.join(DATA_DIR, 'outbox');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const USES_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);
const KEY_DB = 'lprd:db';
const KEY_VERSION = 'lprd:db:version';

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

if (IS_VERCEL && !USES_REDIS) {
  console.error('⚠ Rulează pe Vercel fără Upstash Redis: datele NU se păstrează. Conectează baza de date din dashboard (Storage).');
}

let db = EMPTY();
let version = 0;
if (!USES_REDIS && fs.existsSync(DB_FILE)) {
  db = { ...EMPTY(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
}

export function getDb() {
  return db;
}

// ---------- Upstash Redis (REST) ----------

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Upstash Redis: ${body.error || res.status}`);
  return body.result;
}

// Scrie documentul doar dacă versiunea din Redis este cea pe care am citit-o.
const COMPARE_AND_SET = `
if tonumber(redis.call('GET', KEYS[2]) or '0') ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('INCR', KEYS[2])
return 1`;

// Citește starea curentă. Pe Vercel se apelează la începutul fiecărei cereri; local nu face nimic.
export async function load() {
  if (!USES_REDIS) return;
  const [raw, ver] = await redis(['MGET', KEY_DB, KEY_VERSION]);
  db = { ...EMPTY(), ...(raw ? JSON.parse(raw) : {}) };
  version = Number(ver || 0);
}

async function saveRedis(mutator) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await load();
    const result = mutator(db);
    const ok = await redis(['EVAL', COMPARE_AND_SET, '2', KEY_DB, KEY_VERSION, String(version), JSON.stringify(db)]);
    if (ok === 1) {
      version += 1;
      return result;
    }
    // Altă instanță a scris între timp: recitim și reaplicăm modificarea pe datele noi.
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * attempt));
  }
  throw new Error('Nu am putut salva datele (conflict de scriere). Încearcă din nou.');
}

// ---------- Fișier local ----------

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

// Aplică o modificare și o persistă, în ordinea în care au fost făcute.
// Important: mutatorul trebuie să lucreze doar cu `db` primit ca argument (poate fi reaplicat pe date proaspete).
export function update(mutator) {
  if (USES_REDIS) {
    queue = queue.then(() => saveRedis(mutator), () => saveRedis(mutator));
    return queue;
  }
  const result = mutator(db);
  queue = queue.then(writeAtomic, writeAtomic);
  return queue.then(() => result);
}

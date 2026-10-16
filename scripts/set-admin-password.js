// Setează parola pentru /admin.  Utilizare: npm run set-password   (sau: npm run set-password -- "parola-noua")
import readline from 'node:readline/promises';
import { saveAdminPassword } from '../lib/security.js';

let password = process.argv[2];
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Parola nouă (minimum 12 caractere): ');
  rl.close();
}
if (!password || password.length < 12) {
  console.error('Parola trebuie să aibă cel puțin 12 caractere.');
  process.exit(1);
}
saveAdminPassword(password);
console.log('Parola a fost salvată. Repornește serverul pentru a închide sesiunile existente.');

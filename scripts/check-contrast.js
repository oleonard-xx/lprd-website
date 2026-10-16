// Verifică raportul de contrast WCAG pentru combinațiile de culori folosite în cele trei versiuni.
// Utilizare: npm run check

const lum = (hex) => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// [descriere, text, fundal, minim]  — 4.5 pentru text normal, 3 pentru componente/elemente grafice
const pairs = {
  'Secțiuni închise (#0F172A / #0B1222 / #1E293B)': [
    ['Text pe fundal', '#F8FAFC', '#0F172A', 4.5],
    ['Text secundar pe fundal', '#CBD5E1', '#0F172A', 4.5],
    ['Text secundar pe card', '#CBD5E1', '#1E293B', 4.5],
    ['Accent text pe fundal', '#60A5FA', '#0F172A', 4.5],
    ['Accent text pe fundal adânc', '#60A5FA', '#0B1222', 4.5],
    ['Accent text pe card', '#60A5FA', '#1E293B', 4.5],
    ['Buton (alb pe #2563EB)', '#FFFFFF', '#2563EB', 4.5],
    ['Buton hover (alb pe #1D4ED8)', '#FFFFFF', '#1D4ED8', 4.5],
    ['Text pe bloc albastru de proces', '#EFF6FF', '#2563EB', 4.5],
    ['Contur câmp pe panou', '#718096', '#1E293B', 3],
    ['Eroare pe panou', '#FCA5A5', '#1E293B', 4.5],
    ['(respins) alb pe #3B82F6', '#FFFFFF', '#3B82F6', 4.5],
  ],
  'Secțiuni luminoase (#F8FAFC)': [
    ['Titluri și text', '#0F172A', '#F8FAFC', 4.5],
    ['Text secundar', '#475569', '#F8FAFC', 4.5],
    ['Accent text', '#2563EB', '#F8FAFC', 4.5],
    ['Linii de separare (grafic)', '#0F172A', '#F8FAFC', 3],
    ['(respins) #3B82F6 ca text', '#3B82F6', '#F8FAFC', 4.5],
  ],
};

let failures = 0;
for (const [theme, list] of Object.entries(pairs)) {
  console.log(`\n${theme}`);
  for (const [label, fg, bg, min] of list) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    const rejected = label.startsWith('(respins)');
    if (!ok && !rejected) failures++;
    const mark = ok ? '✔' : rejected ? '✘ (nefolosit — de aceea a fost ajustat)' : '✘ EȘEC';
    console.log(`  ${mark.padEnd(4)} ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${label}`);
  }
}
console.log(failures ? `\n${failures} combinații nu trec.` : '\nToate combinațiile folosite trec WCAG AA.');
process.exit(failures ? 1 : 0);

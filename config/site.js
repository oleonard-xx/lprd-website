// Configurația centrală a site-ului.
// Valorile între [paranteze drepte] sunt de completat cu datele reale ale firmei —
// la pornire serverul afișează în consolă tot ce lipsește, iar pe site apar marcate vizibil.
// Nu publica site-ul în producție cât timp mai există astfel de valori.

export const site = {
  brand: 'SeeCode',
  tagline: 'Studio de dezvoltare web',
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),

  // Design final: V1 · Midnight (paleta #0F172A · #1E293B · #3B82F6 · #F8FAFC).
  themeColor: '#0F172A',

  // Date de identificare obligatorii (Legea 365/2002, art. 5 + OG 21/1992).
  company: {
    legalName: '[Denumirea juridică, ex. SeeCode SRL]',
    cui: '[CUI / CIF]',
    regCom: '[Nr. Registrul Comerțului, ex. J00/0000/2026]',
    euid: '[EUID, ex. ROONRC.J00/0000/2026]',
    address: '[Adresa sediului social]',
    country: 'România',
    email: '[contact@domeniul-tau.ro]',
    phone: '[+40 7XX XXX XXX]',
    privacyEmail: '[confidentialitate@domeniul-tau.ro]',
    vatPayer: null, // true / false — determină mențiunea despre TVA de la prețuri
    hostingProvider: '[Furnizorul de găzduire, ex. Hetzner Online GmbH, Germania]',
    emailProvider: '[Furnizorul de email, ex. Zoho Mail / Google Workspace]',
  },

  locations: [
    { label: 'Sediu', address: '[Adresa biroului]', hours: '[Luni–Vineri, 09:00–18:00]' },
  ],

  // Angajamente afișate în hero și în secțiunea „De ce SeeCode”.
  // Păstrați doar ce puteți respecta în fiecare contract — altfel devin afirmații nesusținute.
  commitments: [
    'Ofertă cu preț fix, în scris',
    'Codul sursă îți aparține după plata integrală',
    'Construim după ghidurile WCAG 2.2 și GDPR',
  ],

  // Pachete afișate în secțiunea de prețuri. price: null afișează „Preț fix, stabilit în ofertă”.
  // Când completați prețuri, scrieți prețul final (cu tot ce include) — fără taxe ascunse.
  packages: [
    {
      name: 'Site de prezentare',
      price: null,
      description: 'Pentru firme care au nevoie de o prezență online clară și credibilă.',
      includes: ['Design personalizat, responsive', 'Până la 8 pagini', 'Formular de contact conform GDPR', 'Optimizare SEO tehnică de bază', 'Instruire pentru editarea conținutului'],
    },
    {
      name: 'Magazin online',
      price: null,
      featured: true,
      description: 'Pentru afaceri care vând online și vor un proces de comandă simplu.',
      includes: ['Catalog de produse și filtre', 'Plăți online și integrare curierat', 'Pagini legale și flux de retur', 'Panou de administrare', 'Rapoarte de vânzări'],
    },
    {
      name: 'Aplicație web',
      price: null,
      description: 'Pentru procese interne, portaluri de clienți sau produse SaaS.',
      includes: ['Analiză tehnică și arhitectură', 'Autentificare și roluri', 'API și integrări', 'Testare automată', 'Documentație tehnică'],
    },
  ],
  // Costuri care NU sunt incluse — afișate explicit, ca să nu existe surprize.
  extraCosts: [
    'Numele de domeniu și găzduirea, plătite direct furnizorului, pe numele tău',
    'Licențe pentru extensii sau servicii plătite, doar dacă alegi să le folosești',
    'Modificări cerute după aprobarea finală a designului, estimate separat înainte de execuție',
  ],

  legal: {
    lastUpdated: '16 octombrie 2026',
    minAge: 16, // vârsta consimțământului digital în România (Legea 190/2018)
    retention: {
      messagesMonths: 24,
      reviewsRejectedDays: 90,
      pendingDays: 7,
      statsMonths: 13,
    },
  },
};

// Câmpurile încă necompletate (valori între paranteze drepte).
export function missingConfig(obj = site, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' && /^\[.*\]$/.test(v)) out.push(key);
    else if (v && typeof v === 'object') out.push(...missingConfig(v, key));
    else if (v === null && key === 'company.vatPayer') out.push(key);
  }
  return out;
}

# SeeCode — site de prezentare

Site pentru studioul de dezvoltare web **SeeCode**: servicii, portofoliu, recenzii, prețuri, întrebări frecvente și formularul de contact „Hai să începem”, plus panou de administrare și pagini legale complete.

Server Node.js **fără nicio dependență externă** (nimic de instalat, nicio bibliotecă terță încărcată în pagină).

## Pornire

```bash
npm start
```

- Site: <http://localhost:3000>
- Administrare: <http://localhost:3000/admin>
- La prima pornire se generează o parolă de administrator, afișată o singură dată în consolă. O poți schimba oricând cu `npm run set-password`.
- `npm run dev` repornește serverul automat la modificări.
- `npm run check` verifică contrastul culorilor (WCAG AA) pentru toate versiunile.

Necesită Node.js 20.12 sau mai nou.

## Design

Paleta finală este **V1 · Midnight**: `#0F172A` (fundal), `#1E293B` (carduri și secțiuni), `#3B82F6` (accent) și `#F8FAFC` (text).
Interfața are un stil editorial: titluri foarte groase cu majuscule, un slider de proiecte pe toată lățimea, secțiuni luminoase alternate cu cele închise, blocuri numerotate pentru proces, FAQ pe două coloane și un meniu pe tot ecranul.
Toate stilurile sunt în `public/css/base.css`.

## Găzduire pe Railway

Proiectul conține `railway.json` (pornire cu `node server.js`, verificare de sănătate, repornire la eroare).

1. Serviciul are atașat un **volum montat la `/app/data`** — acolo stau baza de date JSON, încărcările, cheia secretă și parola de administrator. Fără volum, datele se pierd la fiecare deploy.
2. Variabile de mediu: `NODE_ENV=production`, `TRUST_PROXY=1`, `BASE_URL=https://<domeniul-tău>`. Opțional `ADMIN_PASSWORD` (altfel parola generată apare o singură dată în jurnalul primului deploy), `SMTP_URL`, `MAIL_FROM`.
3. Deploy nou: `railway up` sau push pe ramura conectată din GitHub.

## Înainte de lansare

1. Completați toate valorile `[între paranteze]` din `config/site.js` (date firmă, CUI, adresă, furnizori). Până atunci apar marcate cu galben pe site, iar serverul le listează la pornire.
2. Verificați angajamentele (`commitments`), pachetele (`packages`) și costurile excluse (`extraCosts`) — trebuie să fie promisiuni pe care le respectați în fiecare contract.
3. Înlocuiți cele 3 **proiecte demonstrative** din `/admin` cu lucrări reale (sunt etichetate vizibil ca „Proiect demonstrativ”).
4. Configurați emailul real: `npm install nodemailer` și `SMTP_URL` în `.env` (vezi `.env.example`). Fără SMTP, emailurile ajung în `data/outbox/` ca fișiere `.eml`.
5. Rulați în producție cu `NODE_ENV=production`, în spatele HTTPS.
6. **Textele legale sunt un punct de plecare solid, dar trebuie revizuite de un jurist** înainte de publicare (în special termenii comerciali, garanția și condițiile de rambursare).

## Funcționalități

- **Proiecte** — adăugare/editare/ștergere din admin, încărcare imagine (tipul real al fișierului este verificat), text alternativ obligatoriu, filtre pe categorii, fereastră de detalii.
- **Recenzii** — trimise de vizitatori, moderate în admin (aprobare, respingere, răspuns public, eticheta „Client verificat”).
- **Contact** — formularul din machetă, cu etichete accesibile, contor de caractere, protecție anti-spam fără captcha și fără terți.
- **Newsletter** — confirmare dublă, trimitere campanii din admin, dezabonare cu un clic.
- **GDPR** — ștergere de date self-service, export de date pentru cereri de acces, ștergere automată la expirarea perioadei de păstrare.
- **Statistici anonime** — doar cu acord, fără cookie-uri și fără IP.

## Lista de conformitate

| # | Cerință | Unde / cum |
|---|---|---|
| 1 | Privacy policy | `/confidentialitate` — operator, scopuri, temeiuri, păstrare, destinatari, drepturi, ANSPDCP |
| 2 | Terms of service | `/termeni` |
| 3 | Refund policy | `/rambursare` — inclusiv dreptul de retragere de 14 zile (OUG 34/2014) și formularul-model |
| 4 | Cookie policy | `/cookies` — tabel cu fiecare element stocat |
| 5 | Cookie consent banner | Nimic opțional nu rulează înainte de acord; „Refuz” și „Accept” au aceeași vizibilitate; alegerea se poate schimba din subsol |
| 6 | Form consents | Căsuțe nebifate implicit, scopuri separate (contact ≠ newsletter ≠ publicarea recenziei), link la politică |
| 7 | No unnecessary data | Telefonul și firma sunt opționale; nu se salvează IP-ul; datele expiră automat |
| 8 | Audit third-party SDKs | Zero scripturi, fonturi sau servicii terțe; CSP-ul blochează tehnic orice resursă externă |
| 9 | Remove dark patterns | Fără căsuțe prebifate, fără presiune falsă, fără butoane de refuz ascunse, dezabonare dintr-un clic |
| 10 | Remove hidden fees | Secțiunea de prețuri listează explicit ce nu este inclus; termenii interzic costurile nemenționate |
| 11 | Remove fake reviews | Nicio recenzie inventată; politica de verificare este publică; media include și recenziile negative |
| 12 | Remove unsupported claims | Fără statistici sau superlative neverificabile; angajamentele sunt editabile în config |
| 13 | Accessibility alt text | Alt obligatoriu la imaginile proiectelor; grafica decorativă este ascunsă cititoarelor de ecran |
| 14 | Fix color contrast | Toate combinațiile folosite trec WCAG AA (`npm run check`); nuanțele ajustate sunt explicate la începutul `base.css` |
| 15 | Keyboard navigation | Link „Sari la conținut”, focus vizibil, dialoguri native cu Esc, meniu mobil accesibil |
| 16 | Add business details | Subsolul fiecărei pagini + Termeni (CUI, Reg. Com., EUID, sediu, contact, ANPC/SAL) |
| 17 | Age consent for kids' data | Confirmarea vârstei de 16 ani în fiecare formular; secțiune dedicată în politică |
| 18 | Unsubscribe link in emails | Link în fiecare email + antetele `List-Unsubscribe` și `List-Unsubscribe-Post` (RFC 8058) |
| 19 | License fonts/images | Fonturi de sistem (nimic redistribuit), ilustrații originale în SVG/CSS; cele două videoclipuri din hero sunt de pe Pexels (licență Pexels: „Workers Talking By Partners”, Kampus Production; „Vibrant Computer Coding Workspace Setup”, Jakub Zerdzicki), găzduit local în `public/media/` și creditat în subsol |
| + | Mișcare redusă | Animațiile și videoclipul se opresc cu `prefers-reduced-motion` sau din butonul „Reduce animațiile”; videoclipul are buton propriu de pauză (WCAG 2.2.2) |

## Structură

```
server.js            serverul HTTP și rutele de pagini
config/site.js       datele firmei, pachete, perioade de păstrare
lib/                 stocare JSON, securitate, email, validare, șabloane
routes/public.js     API public (contact, recenzii, newsletter, GDPR)
routes/admin.js      API administrare
views/               șabloane HTML (layout, pagini, fragmente)
public/              CSS, JavaScript, admin
data/                (generat) baza de date, încărcări, emailuri — nu se urcă în git
```

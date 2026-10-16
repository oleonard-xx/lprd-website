// Validare declarativă: fiecare câmp are reguli, rezultatul conține datele curățate și erorile per câmp.

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9 ().-]{7,20}$/;

const truthy = (v) => v === true || v === 'true' || v === 'on' || v === '1' || v === 1;

export function validate(input, schema) {
  const data = {};
  const errors = {};
  for (const [field, rule] of Object.entries(schema)) {
    let value = input[field];

    if (rule.type === 'bool') {
      data[field] = truthy(value);
      if (rule.mustBeTrue && !data[field]) errors[field] = rule.message || 'Acest câmp este obligatoriu.';
      continue;
    }

    if (rule.type === 'int') {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n) || n < rule.min || n > rule.max) {
        if (rule.required) errors[field] = rule.message || 'Valoare invalidă.';
        data[field] = null;
      } else data[field] = n;
      continue;
    }

    if (rule.type === 'list') {
      const arr = Array.isArray(value) ? value : String(value || '').split(',');
      data[field] = arr.map((s) => String(s).trim()).filter(Boolean).slice(0, rule.maxItems || 10).map((s) => s.slice(0, rule.maxItemLength || 40));
      continue;
    }

    value = typeof value === 'string' ? value : value == null ? '' : String(value);
    // Câmpurile pe o singură linie nu pot conține caractere de control (previne injecția de antete în emailuri).
    value = rule.multiline ? value.replace(/\r\n/g, '\n').replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '') : value.replace(/[\x00-\x1f\x7f]/g, ' ');
    value = value.trim();

    if (!value) {
      if (rule.required) errors[field] = rule.requiredMessage || 'Acest câmp este obligatoriu.';
      data[field] = '';
      continue;
    }
    if (rule.max && value.length > rule.max) errors[field] = `Maximum ${rule.max} de caractere.`;
    else if (rule.min && value.length < rule.min) errors[field] = `Minimum ${rule.min} de caractere.`;
    else if (rule.type === 'email' && !EMAIL_RE.test(value)) errors[field] = 'Adresa de email nu pare validă.';
    else if (rule.type === 'phone' && !PHONE_RE.test(value)) errors[field] = 'Numărul de telefon nu pare valid.';
    else if (rule.type === 'url') {
      const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      try {
        const u = new URL(normalized);
        if (!u.hostname.includes('.')) throw new Error();
        value = u.href;
      } catch {
        errors[field] = 'Adresa web nu pare validă.';
      }
    } else if (rule.oneOf && !rule.oneOf.includes(value)) errors[field] = 'Valoare invalidă.';

    data[field] = rule.type === 'email' ? value.toLowerCase() : value;
  }
  return { data, errors, ok: Object.keys(errors).length === 0 };
}

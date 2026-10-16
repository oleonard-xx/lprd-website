// Trimiterea formularelor prin fetch, cu validare accesibilă.
// Fără JavaScript, aceleași formulare funcționează prin POST clasic (serverul acceptă ambele).

import { toast, jiggle } from './ui.js';

const loadedAt = performance.now();

const MESSAGES = {
  valueMissing: 'Acest câmp este obligatoriu.',
  typeMismatch: 'Adresa de email nu pare validă.',
  tooShort: (el) => `Minimum ${el.minLength} de caractere.`,
  checkbox: 'Bifează această căsuță pentru a continua.',
  radio: 'Alege o opțiune.',
};

function errorSlot(form, name) {
  return form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
}

function setError(form, name, message) {
  const slot = errorSlot(form, name);
  const inputs = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
  inputs.forEach((input) => {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    input.closest('.ffield, .field')?.classList.toggle('has-error', Boolean(message));
  });
  if (slot) slot.textContent = message || '';
}

function clearErrors(form) {
  form.querySelectorAll('[data-error-for]').forEach((slot) => setError(form, slot.dataset.errorFor, ''));
}

function clientValidate(form) {
  const errors = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.type === 'hidden' || errors[el.name]) continue;
    const v = el.validity;
    if (v.valid) continue;
    if (el.type === 'checkbox') errors[el.name] = MESSAGES.checkbox;
    else if (el.type === 'radio') errors[el.name] = MESSAGES.radio;
    else if (v.valueMissing) errors[el.name] = MESSAGES.valueMissing;
    else if (v.typeMismatch) errors[el.name] = MESSAGES.typeMismatch;
    else if (v.tooShort) errors[el.name] = MESSAGES.tooShort(el);
    else errors[el.name] = el.validationMessage;
  }
  return errors;
}

function showErrors(form, errors) {
  Object.entries(errors).forEach(([name, msg]) => setError(form, name, msg));
  const first = form.querySelector('[aria-invalid="true"]');
  first?.focus();
  form.classList.remove('shake');
  void form.offsetWidth; // repornește animația
  form.classList.add('shake');
}

function serialize(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
    data[el.name] = el.type === 'checkbox' ? 'true' : el.value;
  }
  data.t = Math.round(performance.now() - loadedAt);
  return data;
}

async function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();

  const status = form.querySelector('[data-form-status]');
  const submit = form.querySelector('[type="submit"]');
  clearErrors(form);
  status.textContent = '';
  status.className = 'form-status';

  const errors = clientValidate(form);
  if (Object.keys(errors).length) {
    showErrors(form, errors);
    status.textContent = 'Te rugăm să corectezi câmpurile marcate.';
    status.classList.add('is-error');
    return;
  }

  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(serialize(form)),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.fields) showErrors(form, body.fields);
      status.textContent = body.error || 'Nu am putut trimite formularul. Încearcă din nou.';
      status.classList.add('is-error');
      return;
    }
    status.textContent = body.message || 'Mulțumim!';
    status.classList.add('is-success');
    if (form.dataset.form === 'token') {
      submit.hidden = true;
    } else {
      form.reset();
      form.querySelectorAll('[data-counter]').forEach((el) => el.dispatchEvent(new Event('input')));
    }
    jiggle(submit);
    toast(body.message || 'Trimis!');
  } catch {
    status.textContent = 'Conexiunea a eșuat. Verifică internetul și încearcă din nou.';
    status.classList.add('is-error');
  } finally {
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
  }
}

export function initForms() {
  document.addEventListener('submit', onSubmit);

  // Elimină eroarea unui câmp imediat ce este corectat.
  document.addEventListener('input', (e) => {
    const el = e.target;
    const form = el.closest?.('form[data-form]');
    if (form && el.name && el.getAttribute('aria-invalid') === 'true' && el.validity.valid) setError(form, el.name, '');
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    const form = el.closest?.('form[data-form]');
    if (form && el.name && (el.type === 'checkbox' || el.type === 'radio') && el.validity.valid) setError(form, el.name, '');
  });

  // Contoare de caractere („0 din 750 caractere maxim”).
  document.querySelectorAll('[data-counter]').forEach((field) => {
    const out = document.getElementById(field.dataset.counter);
    const max = field.maxLength;
    const suffix = out.textContent.replace(/^\d+ din \d+/, '');
    const update = () => {
      out.textContent = `${field.value.length} din ${max}${suffix}`;
      out.classList.toggle('is-near', field.value.length > max * 0.9);
    };
    field.addEventListener('input', update);
    update();
  });
}

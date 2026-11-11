// Small reusable UI helpers (no framework).

/** Hyperscript: h('div', {class:'x', onclick: fn}, 'text', childEl, ...). Text is always escaped. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(message, kind = 'info') {
  const t = h('div', { class: `toast ${kind}` }, message);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 2600);
}

function openModal(content) {
  const overlay = document.getElementById('overlay');
  const scrim = h('div', { class: 'scrim' }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, content));
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); scrim._onCancel?.(); } };
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) { close(); scrim._onCancel?.(); } });
  document.addEventListener('keydown', onKey);
  overlay.append(scrim);
  return { scrim, close };
}

/** Resolves true/false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const done = (v) => { close(); resolve(v); };
    const { scrim, close } = openModal([
      h('h2', {}, title), h('p', { class: 'muted' }, message),
      h('div', { class: 'actions' },
        h('button', { onclick: () => done(false) }, 'Cancel'),
        h('button', { class: danger ? 'primary' : 'primary', onclick: () => done(true) }, confirmLabel)),
    ]);
    scrim._onCancel = () => resolve(false);
    scrim.querySelector('button.primary').focus();
  });
}

/**
 * Form dialog. Supports structured fields array or custom DOM body.
 * fields: [{name,label,type:'text'|'date'|'select'|'textarea',options?,value?,required?,half?}]
 * Resolves with values object or boolean, or null/false if cancelled.
 */
export function formDialog({ title, fields, body, submitLabel, confirmLabel }) {
  const lbl = submitLabel || confirmLabel || 'Save';
  return new Promise((resolve) => {
    let form;
    const done = (v) => { close(); resolve(v); };

    if (body) {
      form = h('form', { onsubmit: (e) => { e.preventDefault(); done(true); } },
        h('h2', {}, title), body,
        h('div', { class: 'actions' },
          h('button', { type: 'button', onclick: () => done(false) }, 'Cancel'),
          h('button', { type: 'submit', class: 'primary' }, lbl)));
    } else {
      const inputs = {};
      const nodes = fields.map((f) => {
        let input;
        if (f.type === 'select') input = h('select', {}, f.options.map((o) => h('option', { value: o, selected: o === f.value }, o)));
        else if (f.type === 'textarea') { input = h('textarea', { rows: 4 }); input.value = f.value || ''; }
        else { input = h('input', { type: f.type || 'text', autocomplete: 'off' }); input.value = f.value || ''; }
        inputs[f.name] = input;
        return h('div', { class: 'field' }, h('label', {}, f.label), input);
      });
      const submit = () => {
        const missing = fields.find((f) => f.required && !inputs[f.name].value.trim());
        if (missing) { inputs[missing.name].focus(); return; }
        done(Object.fromEntries(fields.map((f) => [f.name, inputs[f.name].value])));
      };
      form = h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } },
        h('h2', {}, title), nodes,
        h('div', { class: 'actions' },
          h('button', { type: 'button', onclick: () => done(null) }, 'Cancel'),
          h('button', { type: 'submit', class: 'primary' }, lbl)));
    }

    const { scrim, close } = openModal(form);
    scrim._onCancel = () => resolve(body ? false : null);
    const firstInput = form.querySelector('input:not([type=hidden]), textarea, select');
    if (firstInput) firstInput.focus();
  });
}

export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

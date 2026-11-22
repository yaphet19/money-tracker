import { balances, ymd } from './logic.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
export const today = () => ymd(new Date());
export const WALLETS = { cash: 'Cash', telebirr: 'Telebirr' };
export const walletOptions = selected =>
  Object.entries(WALLETS).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${v}</option>`).join('');

// Shows a form in the shared <dialog>. onSubmit(FormData) returns an error message to keep it open.
// Save comes first in the DOM so Enter / "Go" on the iOS keyboard saves; .actions reverses it visually.
export function openForm(title, fieldsHtml, onSubmit, extraButtons = '') {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${fieldsHtml}<p class="err" role="alert"></p>
    <div class="actions"><button value="ok" class="primary">Save</button><button value="cancel" formnovalidate>Cancel</button>${extraButtons}</div></form>`;
  const form = $('form', dlg);
  form.addEventListener('submit', ev => {
    if (ev.submitter?.value === 'cancel') return;
    const err = onSubmit(new FormData(form));
    if (err) { ev.preventDefault(); $('.err', form).textContent = err; }
  });
  dlg.showModal();
  return form;
}

export function warnIfNegative(state) {
  const b = balances(state);
  const low = Object.keys(WALLETS).filter(k => b[k] < 0).map(k => WALLETS[k]);
  if (low.length) alert(`Heads up: ${low.join(' and ')} is now below 0.`);
}

import { balances, daysUntil, ymd } from './logic.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
export const today = () => ymd(new Date());
export const WALLETS = { cash: 'Cash', telebirr: 'Telebirr' };
// "due 5 Dec · in 3 days" / "· today" / "· 2 days late"; red when late, amber within 3 days.
export function dueText(due) {
  if (!due) return '';
  const n = daysUntil(due, today());
  const date = new Date(due + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const when = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : `${-n} day${n === -1 ? '' : 's'} late`;
  return `<small class="${n < 0 ? 'neg' : n <= 3 ? 'soon' : ''}">due ${date} · ${when}</small>`;
}

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

// In-page stand-ins for alert/confirm: embedded previews block native dialogs, and on iPhone they show the site address.
export function notify(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { t.hidden = true; }, 4000);
}

export function ask(msg, yes = 'Delete') {
  const dlg = $('#ask');
  dlg.innerHTML = `<form method="dialog"><p>${esc(msg)}</p>
    <div class="actions"><button value="yes" class="primary">${esc(yes)}</button><button value="no">Cancel</button></div></form>`;
  dlg.showModal();
  // Answer from the button's submit, not the dialog's 'close' event, which some embedded browsers never fire.
  return new Promise(resolve => {
    $('form', dlg).addEventListener('submit', ev => resolve(ev.submitter?.value === 'yes'));
    dlg.addEventListener('cancel', () => resolve(false), { once: true });
  });
}

export function warnIfNegative(state) {
  const b = balances(state);
  const low = Object.keys(WALLETS).filter(k => b[k] < 0).map(k => WALLETS[k]);
  if (low.length) notify(`Heads up: ${low.join(' and ')} is now below 0.`);
}

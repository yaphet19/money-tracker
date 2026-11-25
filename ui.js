import { balances, daysUntil, limitStatus, periodStart, periodTotals, ymd } from './logic.js';
import { locale, t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
export const today = () => ymd(new Date());
export const shortDate = s => new Date(s + 'T00:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

// Wallet keys stay English in the data; translate the label where it is shown with t(WALLETS[k]).
export const WALLETS = { cash: 'Cash', telebirr: 'Telebirr' };

// "due 5 Dec · in 3 days" / "· today" / "· 2 days late"; red when late, amber within 3 days.
export function dueText(due) {
  if (!due) return '';
  const n = daysUntil(due, today());
  const when = n === 0 ? t('today') : n === 1 ? t('tomorrow') : n > 1 ? t('in {n} days', { n })
    : n === -1 ? t('{n} day late', { n: 1 }) : t('{n} days late', { n: -n });
  return `<small class="${n < 0 ? 'neg' : n <= 3 ? 'soon' : ''}">${t('due {date} · {when}', { date: shortDate(due), when })}</small>`;
}

export const walletOptions = selected =>
  Object.entries(WALLETS).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${t(v)}</option>`).join('');

// Shows a form in the shared <dialog>. onSubmit(FormData) returns an error message to keep it open.
// Save comes first in the DOM so Enter / "Go" on the iOS keyboard saves; .actions reverses it visually.
export function openForm(title, fieldsHtml, onSubmit, extraButtons = '') {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${fieldsHtml}<p class="err" role="alert"></p>
    <div class="actions"><button value="ok" class="primary">${t('Save')}</button><button value="cancel" formnovalidate>${t('Cancel')}</button>${extraButtons}</div></form>`;
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
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { el.hidden = true; }, 4000);
}

export function ask(msg, yes = t('Delete')) {
  const dlg = $('#ask');
  dlg.innerHTML = `<form method="dialog"><p>${esc(msg)}</p>
    <div class="actions"><button value="yes" class="primary">${esc(yes)}</button><button value="no">${t('Cancel')}</button></div></form>`;
  dlg.showModal();
  // Answer from the button's submit, not the dialog's 'close' event, which some embedded browsers never fire.
  return new Promise(resolve => {
    $('form', dlg).addEventListener('submit', ev => resolve(ev.submitter?.value === 'yes'));
    dlg.addEventListener('cancel', () => resolve(false), { once: true });
  });
}

// One message after a save: wallets below 0 and, after spending, how much of the monthly limit is used.
export function warn(state, { spending = false } = {}) {
  const msgs = [];
  const b = balances(state);
  const low = Object.keys(WALLETS).filter(k => b[k] < 0).map(k => t(WALLETS[k]));
  if (low.length) msgs.push(t('Heads up: {w} is now below 0.', { w: low.join(t(' and ')) }));
  if (spending && state.limit) {
    const spent = periodTotals(state.entries, periodStart('month', today()), today()).out;
    const s = limitStatus(spent, state.limit);
    if (s.level === 'over') msgs.push(t('You passed your monthly limit ({spent} of {limit}).', { spent: fmt(spent), limit: fmt(state.limit) }));
    else if (s.level === 'near') msgs.push(t("You've used {pct}% of your monthly limit.", { pct: s.pct }));
  }
  if (msgs.length) notify(msgs.join(' '));
}

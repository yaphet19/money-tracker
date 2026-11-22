import { parseAmount, uid } from '../logic.js';
import { $, esc, openForm, today, walletOptions, warnIfNegative } from '../ui.js';

const TITLES = { in: 'Got money', out: 'Spent / lost money', move: 'Move money' };

// type: 'in' | 'out' | 'move'. Pass `entry` to edit it (adds a Delete button).
// shortcut: editing a loan entry's amount does not re-check its debt; fine for one careful user.
export function openEntryForm(ctx, type, entry) {
  const e = entry || { type, date: today(), wallet: 'cash', from: 'cash', to: 'telebirr', person: '', note: '' };
  const walletFields = e.type === 'move'
    ? `<label>From <select name="from">${walletOptions(e.from)}</select></label>
       <label>To <select name="to">${walletOptions(e.to)}</select></label>`
    : `<label>Wallet <select name="wallet">${walletOptions(e.wallet)}</select></label>
       <label>${e.type === 'in' ? 'From who' : 'To who / what for'} <input name="person" value="${esc(e.person)}" autocomplete="off"></label>`;
  const form = openForm(TITLES[e.type], `
    <label>Amount (birr) <input name="amount" inputmode="decimal" required value="${e.amount ?? ''}" autocomplete="off"></label>
    ${walletFields}
    <label>Note <input name="note" value="${esc(e.note)}" autocomplete="off"></label>
    <label>Date <input name="date" type="date" required value="${e.date}"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return 'Enter an amount above 0 (at most 2 decimals).';
      if (e.type === 'move' && fd.get('from') === fd.get('to')) return 'Pick two different wallets.';
      const next = { amount, note: fd.get('note').trim(), date: fd.get('date') };
      if (e.type === 'move') Object.assign(next, { from: fd.get('from'), to: fd.get('to') });
      else Object.assign(next, { wallet: fd.get('wallet'), person: fd.get('person').trim() });
      if (entry) Object.assign(entry, next);
      else ctx.state.entries.push({ id: uid(), type: e.type, ...next });
      warnIfNegative(ctx.state);
      ctx.commit();
    },
    entry ? '<button type="button" class="danger" data-del>Delete</button>' : '');
  $('[data-del]', form)?.addEventListener('click', () => {
    if (!confirm('Delete this entry?')) return;
    ctx.state.entries = ctx.state.entries.filter(x => x !== entry);
    $('#dlg').close();
    ctx.commit();
  });
}

import { parseAmount, uid } from '../logic.js';
import { t } from '../i18n.js';
import { $, ask, esc, openForm, today, walletOptions, warn } from '../ui.js';

const TITLES = { in: 'Got money', out: 'Spent / lost money', move: 'Move money' };

// type: 'in' | 'out' | 'move'. Pass `entry` to edit it (adds a Delete button), or `prefill` to start
// a new one with values filled in (a quick button). `onSaved` runs right before the save is committed.
// shortcut: editing a loan entry's amount does not re-check its debt; fine for one careful user.
export function openEntryForm(ctx, type, entry, prefill = {}, onSaved) {
  const e = entry || { type, date: today(), wallet: 'cash', from: 'cash', to: 'telebirr', person: '', note: '', ...prefill };
  const canSaveQuick = !entry && e.type !== 'move';
  const walletFields = e.type === 'move'
    ? `<label>${t('From')} <select name="from">${walletOptions(e.from)}</select></label>
       <label>${t('To')} <select name="to">${walletOptions(e.to)}</select></label>`
    : `<label>${t('Wallet')} <select name="wallet">${walletOptions(e.wallet)}</select></label>
       <label>${e.type === 'in' ? t('From who') : t('To who / what for')} <input name="person" value="${esc(e.person)}" autocomplete="off"></label>`;
  const form = openForm(t(TITLES[e.type]), `
    <label>${t('Amount (birr)')} <input name="amount" inputmode="decimal" required value="${e.amount ?? ''}" autocomplete="off"></label>
    ${walletFields}
    <label>${t('Note')} <input name="note" value="${esc(e.note)}" autocomplete="off"></label>
    <label>${t('Date')} <input name="date" type="date" required value="${e.date}"></label>
    ${canSaveQuick ? `<label class="check"><input type="checkbox" name="quick"> ${t('Save as quick button')}</label>` : ''}`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return t('Enter an amount above 0 (at most 2 decimals).');
      if (e.type === 'move' && fd.get('from') === fd.get('to')) return t('Pick two different wallets.');
      const next = { amount, note: fd.get('note').trim(), date: fd.get('date') };
      if (e.type === 'move') Object.assign(next, { from: fd.get('from'), to: fd.get('to') });
      else Object.assign(next, { wallet: fd.get('wallet'), person: fd.get('person').trim() });
      if (entry) Object.assign(entry, next);
      else ctx.state.entries.push({ id: uid(), type: e.type, ...next });
      if (canSaveQuick && fd.get('quick') === 'on') {
        ctx.state.quick.push({ id: uid(), type: e.type, amount, wallet: next.wallet, person: next.person, note: next.note });
      }
      onSaved?.();
      warn(ctx.state, { spending: e.type === 'out' && !e.debtId });
      ctx.commit();
    },
    entry ? `<button type="button" class="danger" data-del>${t('Delete')}</button>` : '');
  $('[data-del]', form)?.addEventListener('click', async () => {
    if (!(await ask(t('Delete this entry?')))) return;
    ctx.state.entries = ctx.state.entries.filter(x => x !== entry);
    $('#dlg').close();
    ctx.commit();
  });
}

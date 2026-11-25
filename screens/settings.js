import { parseAmount } from '../logic.js';
import { t } from '../i18n.js';
import { ask, esc, fmt, notify, today, WALLETS } from '../ui.js';
import { exportBackup, readBackup } from '../store.js';

const quickList = state => state.quick.map(q => `<li>
    <span><strong>${q.type === 'in' ? '+' : '−'}${fmt(q.amount)}</strong> ${esc(q.person || q.note)} <small>${t(WALLETS[q.wallet])}</small></span>
    <button data-del-quick="${q.id}" aria-label="${t('Delete')}">✕</button></li>`).join('')
  || `<li class="muted">${t('None yet.')}</li>`;

export default {
  html(state) {
    const g = state.goal;
    return `<section class="card"><h3>${t('Language')}</h3>
        <div class="seg">
          <button type="button" data-lang="en" aria-pressed="${state.lang === 'en'}">English</button>
          <button type="button" data-lang="am" aria-pressed="${state.lang === 'am'}" lang="am">አማርኛ</button>
        </div></section>
      <form class="card start"><h3>${t('Starting balances')}</h3>
        <p class="muted">${t('What you had before your first entry.')}</p>
        ${Object.entries(WALLETS).map(([k, v]) =>
          `<label>${t(v)} <input name="${k}" inputmode="decimal" value="${state.start[k]}" autocomplete="off"></label>`).join('')}
        <p class="err" role="alert"></p><button class="primary">${t('Save balances')}</button></form>
      <form class="card limit"><h3>${t('Monthly spending limit')}</h3>
        <p class="muted">${t('Leave empty for no limit.')}</p>
        <label>${t('Amount (birr)')} <input name="limit" inputmode="decimal" value="${state.limit ?? ''}" autocomplete="off"></label>
        <p class="err" role="alert"></p><button class="primary">${t('Save')}</button></form>
      <form class="card goal"><h3>${t('Savings goal')}</h3>
        <p class="muted">${t('Progress uses your total money (Cash + Telebirr).')}</p>
        <label>${t('What for')} <input name="name" value="${esc(g?.name)}" placeholder="${t('Laptop')}" autocomplete="off"></label>
        <label>${t('Target amount')} <input name="amount" inputmode="decimal" value="${g?.amount ?? ''}" autocomplete="off"></label>
        <label>${t('By (optional)')} <input name="by" type="date" value="${g?.by ?? ''}"></label>
        <p class="err" role="alert"></p>
        <div class="row" style="justify-content:flex-start"><button class="primary">${t('Save')}</button>
          ${g ? `<button type="button" data-clear-goal>${t('Remove goal')}</button>` : ''}</div></form>
      <section class="card"><h3>${t('Quick buttons')}</h3>
        <ul class="list">${quickList(state)}</ul>
        <p class="muted">${t('To add one, tick "Save as quick button" when you add money with + or −.')}</p></section>
      <section class="card"><h3>${t('Backup')}</h3>
        <p>${t('Last backup:')} <strong>${state.lastBackup || t('never')}</strong></p>
        <p class="muted">${t('Your data lives only on this phone. Back up weekly to iCloud Drive or Telegram.')}</p>
        <div class="row" style="justify-content:flex-start">
          <button data-backup class="primary">${t('Backup now')}</button>
          <label class="button" style="margin:0">${t('Restore from file')}<input type="file" accept=".json,application/json" hidden data-restore></label>
        </div></section>`;
  },
  bind(root, ctx) {
    const onSubmit = (sel, handle) => root.querySelector(sel).addEventListener('submit', ev => {
      ev.preventDefault();
      const err = handle(new FormData(ev.target));
      if (err) { ev.target.querySelector('.err').textContent = err; return; }
      ctx.commit();
      notify(t('Saved'));
    });

    onSubmit('form.start', fd => {
      const start = Object.fromEntries(Object.keys(WALLETS).map(k => [k, parseAmount(fd.get(k), true)]));
      if (Object.values(start).some(v => v === null)) return t('Use 0 or a positive amount (at most 2 decimals).');
      ctx.state.start = start;
    });
    onSubmit('form.limit', fd => {
      const raw = fd.get('limit').trim();
      const limit = raw ? parseAmount(raw) : null;
      if (raw && !limit) return t('Enter an amount above 0 (at most 2 decimals).');
      ctx.state.limit = limit;
    });
    onSubmit('form.goal', fd => {
      const name = fd.get('name').trim();
      if (!name) return t('Enter a name.');
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return t('Enter an amount above 0 (at most 2 decimals).');
      ctx.state.goal = { name, amount, by: fd.get('by') || null };
    });

    root.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.lang) { ctx.state.lang = b.dataset.lang; ctx.commit(); }
      if (b.hasAttribute('data-clear-goal')) { ctx.state.goal = null; ctx.commit(); }
      if (b.dataset.delQuick) { ctx.state.quick = ctx.state.quick.filter(q => q.id !== b.dataset.delQuick); ctx.commit(); }
    });
    root.querySelector('[data-backup]').addEventListener('click', async () => {
      try {
        if (await exportBackup(ctx.state, today())) { ctx.state.lastBackup = today(); ctx.commit(); }
      } catch (err) { notify(t('Backup failed: {msg}', { msg: err.message })); }
    });
    root.querySelector('[data-restore]').addEventListener('change', async ev => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const s = await readBackup(file);
        const counts = { entries: s.entries.length, debts: s.debts.length, todos: s.todos.length };
        if (!(await ask(t('Replace ALL current data with this backup ({entries} entries, {debts} debts, {todos} to-dos)?', counts), t('Replace')))) return;
        ctx.state = s;
        ctx.commit();
      } catch (err) { notify(err.message); }
    });
  },
};

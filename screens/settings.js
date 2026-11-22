import { parseAmount } from '../logic.js';
import { ask, notify, today, WALLETS } from '../ui.js';
import { exportBackup, readBackup } from '../store.js';

export default {
  html(state) {
    return `<form class="card start"><h3>Starting balances</h3>
        <p class="muted">What you had before your first entry.</p>
        ${Object.entries(WALLETS).map(([k, v]) =>
          `<label>${v} <input name="${k}" inputmode="decimal" value="${state.start[k]}" autocomplete="off"></label>`).join('')}
        <p class="err" role="alert"></p><button class="primary">Save balances</button></form>
      <section class="card"><h3>Backup</h3>
        <p>Last backup: <strong>${state.lastBackup || 'never'}</strong></p>
        <p class="muted">Your data lives only on this phone. Back up weekly to iCloud Drive or Telegram.</p>
        <div class="row" style="justify-content:flex-start">
          <button data-backup class="primary">Backup now</button>
          <label class="button" style="margin:0">Restore from file<input type="file" accept=".json,application/json" hidden data-restore></label>
        </div></section>`;
  },
  bind(root, ctx) {
    root.querySelector('form.start').addEventListener('submit', ev => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const start = Object.fromEntries(Object.keys(WALLETS).map(k => [k, parseAmount(fd.get(k), true)]));
      if (Object.values(start).some(v => v === null)) {
        root.querySelector('.err').textContent = 'Use 0 or a positive amount (at most 2 decimals).';
        return;
      }
      ctx.state.start = start;
      ctx.commit();
    });
    root.querySelector('[data-backup]').addEventListener('click', async () => {
      try {
        if (await exportBackup(ctx.state, today())) { ctx.state.lastBackup = today(); ctx.commit(); }
      } catch (err) { notify(`Backup failed: ${err.message}`); }
    });
    root.querySelector('[data-restore]').addEventListener('change', async ev => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const s = await readBackup(file);
        if (!(await ask(`Replace ALL current data with this backup (${s.entries.length} entries, ${s.debts.length} debts, ${s.todos.length} to-dos)?`, 'Replace'))) return;
        ctx.state = s;
        ctx.commit();
      } catch (err) { notify(err.message); }
    });
  },
};

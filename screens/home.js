import { balances, debtTotals, periodStart, periodTotals } from '../logic.js';
import { esc, fmt, signed, today, WALLETS } from '../ui.js';
import { openEntryForm } from './entry-form.js';

const PERIODS = { day: 'Today', week: 'This week', month: 'This month' };
let period = 'day';

const people = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])
  .map(([who, n]) => `<li><span>${esc(who)}</span><span>${fmt(n)}</span></li>`).join('')
  || '<li class="muted">Nothing yet</li>';

export default {
  html(state) {
    const b = balances(state);
    const t = periodTotals(state.entries, periodStart(period, today()), today());
    const d = debtTotals(state);
    return `
      <section class="card balances">
        ${Object.entries(WALLETS).map(([k, v]) => `<div><small>${v}</small><strong class="${b[k] < 0 ? 'neg' : ''}">${fmt(b[k])}</strong></div>`).join('')}
        <div><small>Total</small><strong>${fmt(b.total)}</strong></div>
      </section>
      <div class="seg">${Object.entries(PERIODS).map(([k, v]) =>
        `<button data-period="${k}" aria-pressed="${k === period}">${v}</button>`).join('')}</div>
      <section class="card totals">
        <div><small>Got</small><strong class="pos">+${fmt(t.in)}</strong></div>
        <div><small>Lost</small><strong class="neg">−${fmt(t.out)}</strong></div>
        <div><small>Net</small><strong class="${t.net < 0 ? 'neg' : 'pos'}">${signed(t.net)}</strong></div>
      </section>
      <section class="card"><h3>Got from</h3><ul class="list">${people(t.byPersonIn)}</ul></section>
      <section class="card"><h3>Lost to</h3><ul class="list">${people(t.byPersonOut)}</ul></section>
      <button class="card loans" data-go="debts">
        <span><small>People owe you</small><br><strong>${fmt(d.owedToMe)}</strong></span>
        <span><small>You owe</small><br><strong>${fmt(d.iOwe)}</strong></span>
      </button>
      <div class="fab">
        <button data-add="out" aria-label="Add money spent or lost">−</button>
        <button data-add="move" aria-label="Move money between wallets">⇄</button>
        <button data-add="in" aria-label="Add money got">+</button>
      </div>`;
  },
  bind(root, ctx) {
    root.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.period) { period = b.dataset.period; ctx.render(); }
      if (b.dataset.add) openEntryForm(ctx, b.dataset.add);
      if (b.dataset.go) ctx.go(b.dataset.go);
    });
  },
};

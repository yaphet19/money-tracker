import { balances, debtTotals, periodStart, periodTotals } from '../logic.js';
import { esc, fmt, signed, today, WALLETS } from '../ui.js';
import { openEntryForm } from './entry-form.js';

const PERIODS = { day: 'Today', week: 'This week', month: 'This month' };
const expanded = new Set(); // periods whose "from who" lists are open; kept across re-renders

const people = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])
  .map(([who, n]) => `<li><span>${esc(who)}</span><span>${fmt(n)}</span></li>`).join('')
  || '<li class="muted">Nothing yet</li>';

function periodCard(state, key, label) {
  const t = periodTotals(state.entries, periodStart(key, today()), today());
  return `<details class="card period" data-period="${key}" ${expanded.has(key) ? 'open' : ''}>
    <summary>
      <div class="pline">
        <strong>${label}</strong>
        <strong class="neg" aria-label="lost">−${fmt(t.out)}</strong>
        <strong class="pos" aria-label="got">+${fmt(t.in)}</strong>
        <span class="chev" aria-hidden="true">▾</span>
      </div>
      <small>net <span class="${t.net < 0 ? 'neg' : 'pos'}">${signed(t.net)}</span> · tap to see who</small>
    </summary>
    <h4>Got from</h4><ul class="list">${people(t.byPersonIn)}</ul>
    <h4>Lost to</h4><ul class="list">${people(t.byPersonOut)}</ul>
  </details>`;
}

export default {
  html(state) {
    const b = balances(state);
    const d = debtTotals(state);
    return `
      <section class="card balances">
        <div class="total"><small>Total</small><strong class="${b.total < 0 ? 'neg' : ''}">${fmt(b.total)}</strong></div>
        ${['telebirr', 'cash'].map(k => `<div><small>${WALLETS[k]}</small><strong class="${b[k] < 0 ? 'neg' : ''}">${fmt(b[k])}</strong></div>`).join('')}
      </section>
      ${Object.entries(PERIODS).map(([k, v]) => periodCard(state, k, v)).join('')}
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
      if (b.dataset.add) openEntryForm(ctx, b.dataset.add);
      if (b.dataset.go) ctx.go(b.dataset.go);
    });
    // 'toggle' doesn't bubble, so listen in the capture phase
    root.addEventListener('toggle', ev => {
      const k = ev.target.dataset.period;
      if (k) ev.target.open ? expanded.add(k) : expanded.delete(k);
    }, true);
  },
};

import { balances, debtRemaining, debtTotals, periodStart, periodTotals, round2 } from '../logic.js';
import { esc, fmt, signed, today, WALLETS } from '../ui.js';
import { openEntryForm } from './entry-form.js';

const PERIODS = { day: 'Today', week: 'This week', month: 'This month' };
const expanded = new Set(); // periods whose "from who" lists are open; kept across re-renders

const people = (obj, empty = 'Nothing yet') => Object.entries(obj).sort((a, b) => b[1] - a[1])
  .map(([who, n]) => `<li><span>${esc(who)}</span><span>${fmt(n)}</span></li>`).join('')
  || `<li class="muted">${empty}</li>`;

// What is still open per person, so two loans to the same person show as one line.
function openDebtsByPerson(state, direction) {
  const by = {};
  for (const d of state.debts) {
    if (d.direction !== direction) continue;
    const left = debtRemaining(d, state.entries);
    if (left > 0) by[d.person] = round2((by[d.person] || 0) + left);
  }
  return by;
}

function periodCard(state, key, label) {
  const t = periodTotals(state.entries, periodStart(key, today()), today());
  return `<details class="card period" data-period="${key}" ${expanded.has(key) ? 'open' : ''}>
    <summary>
      <h3>${label} <small>net <span class="${t.net < 0 ? 'neg' : 'pos'}">${signed(t.net)}</span> <span class="chev" aria-hidden="true">▾</span></small></h3>
      <div class="split">
        <div class="lost"><strong>−${fmt(t.out)}</strong><small>lost</small></div>
        <div class="got"><strong>+${fmt(t.in)}</strong><small>got</small></div>
      </div>
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
      <section class="card loans">
        <h3>People owe you <span class="pos">${fmt(d.owedToMe)}</span></h3>
        <ul class="list">${people(openDebtsByPerson(state, 'owedToMe'), 'Nobody')}</ul>
        <h3>You owe <span class="neg">${fmt(d.iOwe)}</span></h3>
        <ul class="list">${people(openDebtsByPerson(state, 'iOwe'), 'Nobody')}</ul>
        <button data-go="debts">Open Debts</button>
      </section>
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

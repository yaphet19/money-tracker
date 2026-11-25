import { balances, dailyTotals, debtRemaining, debtTotals, dueSoon, goalProgress, limitStatus, periodStart, periodTotals, round2 } from '../logic.js';
import { locale, t } from '../i18n.js';
import { dueText, esc, fmt, signed, today, WALLETS } from '../ui.js';
import { openEntryForm } from './entry-form.js';

const PERIODS = { day: 'Today', week: 'This week', month: 'This month' };
const expanded = new Set(); // periods whose "from who" lists are open; kept across re-renders

const people = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])
  .map(([who, n]) => `<li><span>${esc(who)}</span><span>${fmt(n)}</span></li>`).join('')
  || `<li class="muted">${t('Nothing yet')}</li>`;

// One line per person (two loans to the same person add up), with their soonest pay-back date.
// Soonest date first; people with no date after, biggest amount first.
function openDebtsList(state, direction) {
  const by = {};
  for (const d of state.debts) {
    if (d.direction !== direction) continue;
    const left = debtRemaining(d, state.entries);
    if (left <= 0) continue;
    const p = (by[d.person] ||= { left: 0, due: null });
    p.left = round2(p.left + left);
    if (d.dueDate && (!p.due || d.dueDate < p.due)) p.due = d.dueDate;
  }
  return Object.entries(by)
    .sort(([, a], [, b]) => (a.due || '9999').localeCompare(b.due || '9999') || b.left - a.left)
    .map(([who, p]) => `<li><span>${esc(who)}${p.due ? `<br>${dueText(p.due)}` : ''}</span><span>${fmt(p.left)}</span></li>`).join('')
    || `<li class="muted">${t('Nobody')}</li>`;
}

const quickRow = state => state.quick.length ? `<div class="quick">${state.quick.map(q =>
  `<button data-quick="${q.id}" class="chip ${q.type}"><strong>${q.type === 'in' ? '+' : '−'}${fmt(q.amount)}</strong> ${esc(q.person || q.note)}</button>`).join('')}</div>` : '';

// Debts I owe that are late or due within 3 days, at the top of Home so they can't be missed.
function paySoonCard(state) {
  const soon = dueSoon(state, today(), 3);
  if (!soon.length) return '';
  return `<section class="card paysoon ${soon.some(d => d.days < 0) ? 'late' : ''}">
    <h3>${t('Pay soon')}</h3>
    <ul class="list">${soon.map(d => `<li><span>${esc(d.person)}<br>${dueText(d.dueDate)}</span><strong>${fmt(d.left)}</strong></li>`).join('')}</ul>
  </section>`;
}

const bar = pct => `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;

function limitCard(state) {
  if (!state.limit) return '';
  const spent = periodTotals(state.entries, periodStart('month', today()), today()).out;
  const s = limitStatus(spent, state.limit);
  return `<section class="card meter ${s.level}">
    <h3>${t('Monthly limit')} <small>${s.level === 'over' ? t('Over by {n}', { n: fmt(-s.left) }) : t('{n} left', { n: fmt(s.left) })}</small></h3>
    ${bar(Math.min(s.pct, 100))}
    <small>${t('{spent} of {limit} spent this month', { spent: fmt(spent), limit: fmt(state.limit) })}</small>
  </section>`;
}

function goalCard(state, have) {
  const g = state.goal;
  if (!g) return '';
  const p = goalProgress(have, g, today());
  const detail = p.done ? t('Goal reached!') : [
    t('{n} to go', { n: fmt(p.left) }),
    p.daysLeft > 0 ? t('{n} days left', { n: p.daysLeft }) : p.daysLeft !== null ? t('date passed') : '',
    p.perDay ? t('about {n} a day', { n: fmt(Math.ceil(p.perDay)) }) : '', // whole birr reads better than 202.25
  ].filter(Boolean).join(' · ');
  return `<section class="card meter goal ${p.done ? 'done' : ''}">
    <h3>${t('Savings goal')}: ${esc(g.name)} <small>${p.pct}%</small></h3>
    ${bar(p.pct)}
    <small>${t('{have} of {goal}', { have: fmt(Math.max(0, have)), goal: fmt(g.amount) })} · ${detail}</small>
  </section>`;
}

function weekChart(state) {
  const days = dailyTotals(state.entries, today());
  const max = Math.max(1, ...days.flatMap(d => [d.in, d.out]));
  const h = n => Math.round((n / max) * 100);
  return `<section class="card chart"><h3>${t('Last 7 days')}</h3>
    <div class="bars">${days.map(d => {
      const label = new Date(d.date + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'short' });
      return `<div class="day" role="img" aria-label="${esc(label)}: +${fmt(d.in)} −${fmt(d.out)}">
        <div class="pair"><span class="b got" style="height:${h(d.in)}%"></span><span class="b lost" style="height:${h(d.out)}%"></span></div>
        <small>${esc(label)}</small></div>`;
    }).join('')}</div>
    <div class="legend"><span><i class="key got"></i>${t('got')}</span><span><i class="key lost"></i>${t('lost')}</span></div>
  </section>`;
}

function periodCard(state, key, label) {
  const p = periodTotals(state.entries, periodStart(key, today()), today());
  return `<details class="card period" data-period="${key}" ${expanded.has(key) ? 'open' : ''}>
    <summary>
      <h3>${t(label)} <small>${t('net')} <span class="${p.net < 0 ? 'neg' : 'pos'}">${signed(p.net)}</span> <span class="chev" aria-hidden="true">▾</span></small></h3>
      <div class="split">
        <div class="lost"><strong>−${fmt(p.out)}</strong><small>${t('lost')}</small></div>
        <div class="got"><strong>+${fmt(p.in)}</strong><small>${t('got')}</small></div>
      </div>
    </summary>
    <h4>${t('Got from')}</h4><ul class="list">${people(p.byPersonIn)}</ul>
    <h4>${t('Lost to')}</h4><ul class="list">${people(p.byPersonOut)}</ul>
  </details>`;
}

export default {
  html(state) {
    const b = balances(state);
    const d = debtTotals(state);
    return `
      <section class="card balances">
        <div class="total"><small>${t('Total')}</small><strong class="${b.total < 0 ? 'neg' : ''}">${fmt(b.total)}</strong></div>
        ${['telebirr', 'cash'].map(k => {
          // moves carry no `wallet`, so this filter leaves them out, like the other totals
          const w = periodTotals(state.entries.filter(e => e.wallet === k), today(), today());
          return `<div><small>${t(WALLETS[k])}</small><strong class="${b[k] < 0 ? 'neg' : ''}">${fmt(b[k])}</strong>
            <div class="split mini"><div class="lost">−${fmt(w.out)}</div><div class="got">+${fmt(w.in)}</div></div></div>`;
        }).join('')}
        <small class="today-note">${t('− and + are today')}</small>
      </section>
      ${paySoonCard(state)}
      ${quickRow(state)}
      ${limitCard(state)}
      ${goalCard(state, b.total)}
      ${Object.entries(PERIODS).map(([k, v]) => periodCard(state, k, v)).join('')}
      ${weekChart(state)}
      <section class="card loans">
        <h3>${t('People owe you')} <span class="pos">${fmt(d.owedToMe)}</span></h3>
        <ul class="list">${openDebtsList(state, 'owedToMe')}</ul>
        <h3>${t('You owe')} <span class="neg">${fmt(d.iOwe)}</span></h3>
        <ul class="list">${openDebtsList(state, 'iOwe')}</ul>
        <button data-go="debts">${t('Open Debts')}</button>
      </section>
      <div class="fab">
        <button data-add="out" aria-label="${t('Add money spent or lost')}">−</button>
        <button data-add="move" aria-label="${t('Move money between wallets')}">⇄</button>
        <button data-add="in" aria-label="${t('Add money got')}">+</button>
      </div>`;
  },
  bind(root, ctx) {
    root.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.add) openEntryForm(ctx, b.dataset.add);
      if (b.dataset.go) ctx.go(b.dataset.go);
      if (b.dataset.quick) {
        const q = ctx.state.quick.find(x => x.id === b.dataset.quick);
        if (q) openEntryForm(ctx, q.type, null, { amount: q.amount, wallet: q.wallet, person: q.person, note: q.note });
      }
    });
    // 'toggle' doesn't bubble, so listen in the capture phase
    root.addEventListener('toggle', ev => {
      const k = ev.target.dataset.period;
      if (k) ev.target.open ? expanded.add(k) : expanded.delete(k);
    }, true);
  },
};

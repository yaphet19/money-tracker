import { t } from '../i18n.js';
import { esc, fmt, WALLETS } from '../ui.js';
import { openEntryForm } from './entry-form.js';

const SIGN = { in: '+', out: '−', move: '⇄ ' };

const line = e => {
  const where = e.type === 'move' ? `${t(WALLETS[e.from])} → ${t(WALLETS[e.to])}` : t(WALLETS[e.wallet]);
  const extra = [e.person, e.note].filter(Boolean).map(esc).join(' · ');
  return `<li><button data-id="${e.id}" class="entry ${e.type}"><span>
    <strong>${SIGN[e.type]}${fmt(e.amount)}</strong> ${e.debtId ? `<em class="tag">${t('Loan')}</em>` : ''}
    <br><small>${where}${extra ? ' · ' + extra : ''}</small></span></button></li>`;
};

export default {
  html(state) {
    if (!state.entries.length) return `<p class="muted center">${t('No entries yet. Add one from Home.')}</p>`;
    const byDay = {};
    // reverse first: the sort is stable, so the newest entry of each day ends up on top
    for (const e of [...state.entries].reverse().sort((a, b) => b.date.localeCompare(a.date))) (byDay[e.date] ||= []).push(e);
    return Object.entries(byDay).map(([day, list]) =>
      `<section class="card"><h3>${day}</h3><ul class="list">${list.map(line).join('')}</ul></section>`).join('');
  },
  bind(root, ctx) {
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-id]');
      if (!b) return;
      const entry = ctx.state.entries.find(x => x.id === b.dataset.id);
      openEntryForm(ctx, entry.type, entry);
    });
  },
};

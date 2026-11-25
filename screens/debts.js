import { addDebt, borrowCheck, debtRemaining, deleteDebt, lendCheck, parseAmount, repay, round2, ymd } from '../logic.js';
import { t } from '../i18n.js';
import { $, ask, dueText, esc, fmt, openForm, shortDate, today, walletOptions, warn } from '../ui.js';

const TITLE = { owedToMe: 'People who owe me', iOwe: 'People I owe' };
const badAmount = () => t('Enter an amount above 0 (at most 2 decimals).');

function row(d, left) {
  return `<li class="debt"><div>
      <strong>${esc(d.person)}</strong> ${fmt(left)}${left !== d.amount ? ` <small>${t('of {n}', { n: fmt(d.amount) })}</small>` : ''}
      ${d.note ? `<br><small>${esc(d.note)}</small>` : ''}<br><small>${t('since {date}', { date: d.createdDate })}</small>
      ${left > 0 && d.dueDate ? `<br>${dueText(d.dueDate)}` : ''}
    </div><div class="row">
      ${left > 0 ? `<button data-pay="${d.id}" class="primary">${t('Paid')}</button>` : ''}<button data-edit="${d.id}">${t('Edit')}</button>
    </div></li>`;
}

function section(state, dir) {
  const list = state.debts.filter(d => d.direction === dir).map(d => [d, debtRemaining(d, state.entries)]);
  // soonest pay-back date first; debts without a date after them
  const open = list.filter(([, left]) => left > 0).sort(([a], [b]) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const settled = list.filter(([, left]) => left <= 0);
  const total = round2(open.reduce((s, [, left]) => s + left, 0));
  return `<section class="card"><h3>${t(TITLE[dir])} <span>${fmt(total)}</span></h3>
    <ul class="list">${open.map(([d, left]) => row(d, left)).join('') || `<li class="muted">${t('None')}</li>`}</ul>
    ${settled.length ? `<details><summary>${t('Settled ({n})', { n: settled.length })}</summary><ul class="list">${settled.map(([d, left]) => row(d, left)).join('')}</ul></details>` : ''}
    <button data-new="${dir}">${t('+ Add')}</button></section>`;
}

let checkMode = 'lend';
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const checkLabel = () => (checkMode === 'lend' ? t('Someone asks to borrow') : t('I want to borrow'));

const checkCard = () => `<section class="card check">
  <h3>${t('Can I…?')}</h3>
  <div class="seg">
    <button type="button" data-mode="lend" aria-pressed="${checkMode === 'lend'}">${t('Lend')}</button>
    <button type="button" data-mode="borrow" aria-pressed="${checkMode === 'borrow'}">${t('Borrow')}</button>
  </div>
  <label><span class="check-label">${checkLabel()}</span> <input name="checkAmount" inputmode="decimal" autocomplete="off" placeholder="2,000"></label>
  <label ${checkMode === 'lend' ? 'hidden' : ''}>${t('Pay back by')} <input name="checkBy" type="date" value="${inDays(30)}"></label>
  <p class="result" aria-live="polite"></p>
</section>`;

// Updates only the answer line, so typing never loses focus.
function updateCheck(root, state) {
  const out = root.querySelector('.check .result');
  const amount = parseAmount(root.querySelector('[name=checkAmount]').value);
  out.className = 'result';
  if (!amount) { out.textContent = t('Type an amount to check.'); return; }
  if (checkMode === 'lend') {
    const r = lendCheck(state, amount);
    const vars = { after: fmt(r.total - amount), left: fmt(r.left), owe: fmt(r.owe), short: fmt(-r.left) };
    out.classList.add(r.ok ? 'ok' : 'no');
    out.textContent = r.ok
      ? t("Yes. You'd have {after} left, and {left} after paying what you owe ({owe}).", vars)
      : t("Not safe. You'd have {after} left but you owe {owe}. Short by {short}.", vars);
    return;
  }
  const by = root.querySelector('[name=checkBy]').value;
  if (!by) { out.textContent = t('Pick the pay-back date.'); return; }
  const r = borrowCheck(state, amount, by);
  const vars = {
    date: shortDate(by), have: fmt(r.have), need: fmt(r.need), short: fmt(r.short),
    incoming: r.incoming ? t(' (with {n} people owe you by then)', { n: fmt(r.incoming) }) : '',
    owing: r.outgoing ? t(' (with {n} you already owe)', { n: fmt(r.outgoing) }) : '',
  };
  out.classList.add(r.ok ? 'ok' : 'no');
  out.textContent = r.ok
    ? t("Yes. By {date} you'd have {have}{incoming} and need {need}{owing}.", vars)
    : t("Risky. By {date} you'd have {have}{incoming} but need {need}{owing}. Short by {short}.", vars);
}

function newDebt(ctx, direction) {
  const owed = direction === 'owedToMe';
  openForm(owed ? t('Someone owes me') : t('I owe someone'), `
    <label>${t('Person')} <input name="person" required autocomplete="off"></label>
    <label>${t('Amount (birr)')} <input name="amount" inputmode="decimal" required autocomplete="off"></label>
    <label>${t('Note')} <input name="note" autocomplete="off"></label>
    <label class="check"><input type="checkbox" name="move" checked> ${owed ? t('Money left my wallet') : t('Money entered my wallet')}</label>
    <label>${t('Wallet')} <select name="wallet">${walletOptions('cash')}</select></label>
    <label>${t('Date')} <input name="date" type="date" required value="${today()}"></label>
    <label>${owed ? t('They pay me back by (optional)') : t('I pay back by (optional)')} <input name="due" type="date"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return badAmount();
      const person = fd.get('person').trim();
      if (!person) return t('Enter a name.');
      addDebt(ctx.state, { direction, person, amount, note: fd.get('note').trim(), date: fd.get('date'), dueDate: fd.get('due') || null, moveMoney: fd.get('move') === 'on', wallet: fd.get('wallet') });
      warn(ctx.state);
      ctx.commit();
    });
}

function pay(ctx, debt) {
  const left = debtRemaining(debt, ctx.state.entries);
  openForm(debt.direction === 'owedToMe' ? t('{person} paid me back', { person: debt.person }) : t('I paid {person} back', { person: debt.person }), `
    <label>${t('Amount (left: {n})', { n: fmt(left) })} <input name="amount" inputmode="decimal" required value="${left}" autocomplete="off"></label>
    <label>${t('Wallet')} <select name="wallet">${walletOptions('cash')}</select></label>
    <label>${t('Date')} <input name="date" type="date" required value="${today()}"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return badAmount();
      try { repay(ctx.state, debt.id, { amount, wallet: fd.get('wallet'), date: fd.get('date') }); }
      catch (err) { return t('{msg} (left: {n}).', { msg: t(err.message), n: fmt(left) }); }
      warn(ctx.state);
      ctx.commit();
    });
}

// shortcut: changing the amount does not change the opening wallet entry; fix that entry in History if needed.
function edit(ctx, debt) {
  const paid = round2(debt.amount - debtRemaining(debt, ctx.state.entries));
  const form = openForm(t('Edit debt'), `
    <label>${t('Person')} <input name="person" required value="${esc(debt.person)}" autocomplete="off"></label>
    <label>${t('Amount (birr)')} <input name="amount" inputmode="decimal" required value="${debt.amount}" autocomplete="off"></label>
    <label>${t('Note')} <input name="note" value="${esc(debt.note)}" autocomplete="off"></label>
    <label>${t('Pay back by (optional)')} <input name="due" type="date" value="${debt.dueDate || ''}"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return badAmount();
      if (amount < paid) return t("{n} is already paid back, so the amount can't be less.", { n: fmt(paid) });
      const person = fd.get('person').trim();
      if (!person) return t('Enter a name.');
      Object.assign(debt, { person, amount, note: fd.get('note').trim(), dueDate: fd.get('due') || null });
      ctx.commit();
    },
    `<button type="button" class="danger" data-del>${t('Delete')}</button>`);
  $('[data-del]', form).addEventListener('click', async () => {
    const linked = ctx.state.entries.some(e => e.debtId === debt.id);
    if (!(await ask(linked ? t('Delete this debt? Its money entries stay in History.') : t('Delete this debt?')))) return;
    deleteDebt(ctx.state, debt.id);
    $('#dlg').close();
    ctx.commit();
  });
}

export default {
  html: state => checkCard() + section(state, 'owedToMe') + section(state, 'iOwe'),
  bind(root, ctx) {
    updateCheck(root, ctx.state);
    root.querySelector('.check').addEventListener('input', () => updateCheck(root, ctx.state));
    root.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) {
        checkMode = b.dataset.mode;
        root.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b));
        root.querySelector('[name=checkBy]').closest('label').hidden = checkMode === 'lend';
        root.querySelector('.check-label').textContent = checkLabel();
        updateCheck(root, ctx.state);
      }
      const find = id => ctx.state.debts.find(d => d.id === id);
      if (b.dataset.new) newDebt(ctx, b.dataset.new);
      if (b.dataset.pay) pay(ctx, find(b.dataset.pay));
      if (b.dataset.edit) edit(ctx, find(b.dataset.edit));
    });
  },
};

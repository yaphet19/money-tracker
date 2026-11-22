import { addDebt, debtRemaining, deleteDebt, parseAmount, repay, round2 } from '../logic.js';
import { $, ask, dueText, esc, fmt, openForm, today, walletOptions, warnIfNegative } from '../ui.js';

const TITLE = { owedToMe: 'People who owe me', iOwe: 'People I owe' };
const BAD_AMOUNT = 'Enter an amount above 0 (at most 2 decimals).';

function row(d, left) {
  return `<li class="debt"><div>
      <strong>${esc(d.person)}</strong> ${fmt(left)}${left !== d.amount ? ` <small>of ${fmt(d.amount)}</small>` : ''}
      ${d.note ? `<br><small>${esc(d.note)}</small>` : ''}<br><small>since ${d.createdDate}</small>
      ${left > 0 && d.dueDate ? `<br>${dueText(d.dueDate)}` : ''}
    </div><div class="row">
      ${left > 0 ? `<button data-pay="${d.id}" class="primary">Paid</button>` : ''}<button data-edit="${d.id}">Edit</button>
    </div></li>`;
}

function section(state, dir) {
  const list = state.debts.filter(d => d.direction === dir).map(d => [d, debtRemaining(d, state.entries)]);
  // soonest pay-back date first; debts without a date after them
  const open = list.filter(([, left]) => left > 0).sort(([a], [b]) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const settled = list.filter(([, left]) => left <= 0);
  const total = round2(open.reduce((s, [, left]) => s + left, 0));
  return `<section class="card"><h3>${TITLE[dir]} <span>${fmt(total)}</span></h3>
    <ul class="list">${open.map(([d, left]) => row(d, left)).join('') || '<li class="muted">None</li>'}</ul>
    ${settled.length ? `<details><summary>Settled (${settled.length})</summary><ul class="list">${settled.map(([d, left]) => row(d, left)).join('')}</ul></details>` : ''}
    <button data-new="${dir}">+ Add</button></section>`;
}

function newDebt(ctx, direction) {
  const owed = direction === 'owedToMe';
  openForm(owed ? 'Someone owes me' : 'I owe someone', `
    <label>Person <input name="person" required autocomplete="off"></label>
    <label>Amount (birr) <input name="amount" inputmode="decimal" required autocomplete="off"></label>
    <label>Note <input name="note" autocomplete="off"></label>
    <label class="check"><input type="checkbox" name="move" checked> ${owed ? 'Money left my wallet' : 'Money entered my wallet'}</label>
    <label>Wallet <select name="wallet">${walletOptions('cash')}</select></label>
    <label>Date <input name="date" type="date" required value="${today()}"></label>
    <label>${owed ? 'They pay me back by' : 'I pay back by'} (optional) <input name="due" type="date"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return BAD_AMOUNT;
      const person = fd.get('person').trim();
      if (!person) return 'Enter a name.';
      addDebt(ctx.state, { direction, person, amount, note: fd.get('note').trim(), date: fd.get('date'), dueDate: fd.get('due') || null, moveMoney: fd.get('move') === 'on', wallet: fd.get('wallet') });
      warnIfNegative(ctx.state);
      ctx.commit();
    });
}

function pay(ctx, debt) {
  const left = debtRemaining(debt, ctx.state.entries);
  openForm(debt.direction === 'owedToMe' ? `${debt.person} paid me back` : `I paid ${debt.person} back`, `
    <label>Amount (left: ${fmt(left)}) <input name="amount" inputmode="decimal" required value="${left}" autocomplete="off"></label>
    <label>Wallet <select name="wallet">${walletOptions('cash')}</select></label>
    <label>Date <input name="date" type="date" required value="${today()}"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return BAD_AMOUNT;
      try { repay(ctx.state, debt.id, { amount, wallet: fd.get('wallet'), date: fd.get('date') }); }
      catch (err) { return `${err.message} (left: ${fmt(left)}).`; }
      warnIfNegative(ctx.state);
      ctx.commit();
    });
}

// shortcut: changing the amount does not change the opening wallet entry; fix that entry in History if needed.
function edit(ctx, debt) {
  const paid = round2(debt.amount - debtRemaining(debt, ctx.state.entries));
  const form = openForm('Edit debt', `
    <label>Person <input name="person" required value="${esc(debt.person)}" autocomplete="off"></label>
    <label>Amount (birr) <input name="amount" inputmode="decimal" required value="${debt.amount}" autocomplete="off"></label>
    <label>Note <input name="note" value="${esc(debt.note)}" autocomplete="off"></label>
    <label>Pay back by (optional) <input name="due" type="date" value="${debt.dueDate || ''}"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return BAD_AMOUNT;
      if (amount < paid) return `${fmt(paid)} is already paid back, so the amount can't be less.`;
      const person = fd.get('person').trim();
      if (!person) return 'Enter a name.';
      Object.assign(debt, { person, amount, note: fd.get('note').trim(), dueDate: fd.get('due') || null });
      ctx.commit();
    },
    '<button type="button" class="danger" data-del>Delete</button>');
  $('[data-del]', form).addEventListener('click', async () => {
    const linked = ctx.state.entries.some(e => e.debtId === debt.id);
    if (!(await ask(linked ? 'Delete this debt? Its money entries stay in History.' : 'Delete this debt?'))) return;
    deleteDebt(ctx.state, debt.id);
    $('#dlg').close();
    ctx.commit();
  });
}

export default {
  html: state => section(state, 'owedToMe') + section(state, 'iOwe'),
  bind(root, ctx) {
    root.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      const find = id => ctx.state.debts.find(d => d.id === id);
      if (b.dataset.new) newDebt(ctx, b.dataset.new);
      if (b.dataset.pay) pay(ctx, find(b.dataset.pay));
      if (b.dataset.edit) edit(ctx, find(b.dataset.edit));
    });
  },
};

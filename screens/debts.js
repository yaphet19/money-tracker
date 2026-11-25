import { addDebt, borrowCheck, buyCheck, daysUntil, debtRemaining, deleteDebt, lastPaid, lendCheck, parseAmount, repay, round2, uid, ymd } from '../logic.js';
import { t } from '../i18n.js';
import { $, ask, dueText, esc, fmt, notify, openForm, shortDate, today, walletOptions, WALLETS, warn } from '../ui.js';
import { openEntryForm } from './entry-form.js';

const WAIT_DAYS = 3;

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
let pendingFill = null; // a wait-list item to load into the Buy check after the next render
const MODES = { lend: 'Lend', borrow: 'Borrow', buy: 'Buy' };
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const checkLabel = () => (checkMode === 'lend' ? t('Someone asks to borrow') : checkMode === 'borrow' ? t('I want to borrow') : t('Price'));
const shownFor = mode => (checkMode === mode ? '' : 'hidden');

const checkCard = () => `<section class="card check">
  <h3>${t('Can I…?')}</h3>
  <div class="seg">${Object.entries(MODES).map(([k, v]) =>
    `<button type="button" data-mode="${k}" aria-pressed="${checkMode === k}">${t(v)}</button>`).join('')}</div>
  <label data-for="buy" ${shownFor('buy')}>${t('What is it')} <input name="checkName" autocomplete="off" placeholder="${t('Sunglasses')}"></label>
  <label><span class="check-label">${checkLabel()}</span> <input name="checkAmount" inputmode="decimal" autocomplete="off" placeholder="2,000"></label>
  <label data-for="buy" ${shownFor('buy')}>${t('How many times will you use it? (optional)')} <input name="checkUses" inputmode="numeric" autocomplete="off"></label>
  <label data-for="borrow" ${shownFor('borrow')}>${t('Pay back by')} <input name="checkBy" type="date" value="${inDays(30)}"></label>
  <div class="result" aria-live="polite"></div>
</section>`;

// The Buy answer: a verdict, the reasons behind it, and what to do next.
function buyResult(state, name, price, uses) {
  const r = buyCheck(state, price, uses, today());
  const line = (cls, text) => `<li class="${cls}">${cls === 'yes' ? '✓' : cls === 'no' ? '✗' : '•'} ${text}</li>`;
  const check = (good, text) => line(good ? 'yes' : 'no', text);
  const lines = [];
  if (!Number.isFinite(r.pct)) lines.push(line('no', t('You have no money to spend')));
  else lines.push(check(r.pct <= 10, t("It's {pct}% of your money ({total})", { pct: r.pct, total: fmt(r.total) })));
  if (r.afterDebts < 0) lines.push(line('no', t("After it you couldn't pay what you owe ({owe})", { owe: fmt(r.owe) })));
  if (r.limitLeft !== null) {
    lines.push(r.limitLeft >= 0 ? line('yes', t('Still {n} under your monthly limit', { n: fmt(r.limitLeft) }))
      : line('no', t('{n} over your monthly limit', { n: fmt(-r.limitLeft) })));
  }
  if (r.perUse !== null) lines.push(check(r.perUse <= 50, t('About {n} birr each time you use it', { n: fmt(r.perUse) })));
  if (r.soon.length) {
    const list = r.soon.map(d => `${esc(d.person)} ${fmt(d.left)}`).join(', ');
    lines.push(r.total - price >= r.dueSoonTotal ? line('yes', t('You can still pay what is due soon: {list}', { list }))
      : line('no', t('You must pay {list} soon. Pay them first', { list })));
  }
  if (r.goalDays) lines.push(line('no', t('Pushes your {goal} goal back about {n} days', { goal: esc(state.goal.name), n: r.goalDays })));
  if (r.daysOfWork) lines.push(line('info', t('Costs about {n} days of what you earn', { n: r.daysOfWork })));
  const last = lastPaid(state.entries, name);
  if (last) lines.push(line('info', t('Last time you paid {n} ({date})', { n: fmt(last.amount), date: shortDate(last.date) })));
  lines.push(line('info', r.walletEnough ? t('Pay with {w}', { w: t(WALLETS[r.wallet]) }) : t('Neither wallet alone has enough')));
  if (r.verdict === 'no') lines.push(line('info', t('Or save {n} a day for 30 days and buy it then', { n: fmt(r.saveDaily) })));
  const head = { good: t('Good buy'), think: t('Think twice'), no: t('Not now') }[r.verdict];
  return {
    cls: { good: 'ok', think: 'warn', no: 'no' }[r.verdict],
    html: `<strong>${head}</strong><ul>${lines.join('')}</ul>
      <div class="row" style="justify-content:flex-start"><button type="button" data-bought data-wallet="${r.wallet}">${t('I bought it')}</button>
      <button type="button" data-wish>${t('Wait 3 days first')}</button></div>`,
  };
}

function wishCard(state) {
  if (!state.wishlist.length) return '';
  return `<section class="card"><h3>${t('Wait list')}</h3><p class="muted">${t('Still want it after 3 days? Then buy.')}</p>
    <ul class="list">${state.wishlist.map(w => {
      const left = WAIT_DAYS + daysUntil(w.addedDate, today());
      const when = left <= 0 ? t('Ready to decide') : left === 1 ? t('Wait 1 more day') : t('Wait {n} more days', { n: left });
      return `<li class="debt"><div><strong>${esc(w.name)}</strong> ${fmt(w.price)}<br><small class="${left <= 0 ? 'pos' : ''}">${when}</small></div>
        <div class="row"><button data-wish-check="${w.id}">${t('Check')}</button><button data-wish-bought="${w.id}" class="primary">${t('Bought')}</button>
        <button data-wish-del="${w.id}" aria-label="${t('Delete')}">✕</button></div></li>`;
    }).join('')}</ul></section>`;
}

// Updates only the answer, so typing never loses focus.
function updateCheck(root, state) {
  const out = root.querySelector('.check .result');
  const amount = parseAmount(root.querySelector('[name=checkAmount]').value);
  out.className = 'result';
  if (!amount) { out.textContent = t('Type an amount to check.'); return; }
  if (checkMode === 'buy') {
    const name = root.querySelector('[name=checkName]').value.trim();
    const uses = parseInt(root.querySelector('[name=checkUses]').value, 10) || 0;
    const r = buyResult(state, name, amount, uses);
    out.classList.add(r.cls);
    out.innerHTML = r.html;
    return;
  }
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
  html: state => checkCard() + wishCard(state) + section(state, 'owedToMe') + section(state, 'iOwe'),
  bind(root, ctx) {
    const field = name => root.querySelector(`[name=${name}]`);
    if (pendingFill) {
      field('checkName').value = pendingFill.name;
      field('checkAmount').value = pendingFill.price;
      field('checkUses').value = pendingFill.uses || '';
      pendingFill = null;
    }
    updateCheck(root, ctx.state);
    root.querySelector('.check').addEventListener('input', () => updateCheck(root, ctx.state));
    root.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) {
        checkMode = b.dataset.mode;
        root.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b));
        root.querySelectorAll('.check [data-for]').forEach(l => { l.hidden = l.dataset.for !== checkMode; });
        root.querySelector('.check-label').textContent = checkLabel();
        updateCheck(root, ctx.state);
      }

      // Buy check actions
      const price = parseAmount(field('checkAmount').value);
      const name = field('checkName').value.trim();
      if (b.hasAttribute('data-bought') && price) openEntryForm(ctx, 'out', null, { amount: price, person: name, wallet: b.dataset.wallet });
      if (b.hasAttribute('data-wish') && price) {
        if (!name) { notify(t('Type what it is first.')); field('checkName').focus(); return; }
        ctx.state.wishlist.push({ id: uid(), name, price, uses: parseInt(field('checkUses').value, 10) || 0, addedDate: today() });
        ctx.commit();
        notify(t('Saved to your wait list'));
      }

      // Wait list actions
      const wish = id => ctx.state.wishlist.find(w => w.id === id);
      const dropWish = id => { ctx.state.wishlist = ctx.state.wishlist.filter(w => w.id !== id); };
      if (b.dataset.wishCheck) {
        pendingFill = wish(b.dataset.wishCheck);
        checkMode = 'buy';
        ctx.render();
        scrollTo(0, 0);
      }
      if (b.dataset.wishBought) {
        const w = wish(b.dataset.wishBought);
        openEntryForm(ctx, 'out', null, { amount: w.price, person: w.name }, () => dropWish(w.id));
      }
      if (b.dataset.wishDel) { dropWish(b.dataset.wishDel); ctx.commit(); }

      const find = id => ctx.state.debts.find(d => d.id === id);
      if (b.dataset.new) newDebt(ctx, b.dataset.new);
      if (b.dataset.pay) pay(ctx, find(b.dataset.pay));
      if (b.dataset.edit) edit(ctx, find(b.dataset.edit));
    });
  },
};

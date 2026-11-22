// Pure money and to-do logic. No DOM and no storage, so all of it runs under `node --test`.

export const round2 = n => Math.round(n * 100) / 100;

export const ymd = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const emptyState = () => ({
  version: 1,
  start: { cash: 0, telebirr: 0 },
  entries: [],
  debts: [],
  todos: [],
  lastBackup: null,
});

// "1,250.50" -> 1250.5. null unless it is a positive amount (or 0 when allowZero) with at most 2 decimals.
export function parseAmount(text, allowZero = false) {
  const s = String(text ?? '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 || (allowZero && n === 0) ? n : null;
}

// First day of the day/week/month that contains `today` ('YYYY-MM-DD'). Weeks start Monday.
export function periodStart(kind, today) {
  if (kind === 'day') return today;
  if (kind === 'month') return today.slice(0, 8) + '01';
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

export function balances(state) {
  const b = { cash: state.start.cash, telebirr: state.start.telebirr };
  for (const e of state.entries) {
    if (e.type === 'in') b[e.wallet] += e.amount;
    else if (e.type === 'out') b[e.wallet] -= e.amount;
    else { b[e.from] -= e.amount; b[e.to] += e.amount; }
  }
  return { cash: round2(b.cash), telebirr: round2(b.telebirr), total: round2(b.cash + b.telebirr) };
}

// Got and lost between two dates (inclusive). Moves and loan entries (debtId) never count.
export function periodTotals(entries, from, to) {
  const r = { in: 0, out: 0, byPersonIn: {}, byPersonOut: {} };
  for (const e of entries) {
    if (e.type === 'move' || e.debtId || e.date < from || e.date > to) continue;
    const who = (e.person || '').trim() || 'Other';
    const bucket = e.type === 'in' ? r.byPersonIn : r.byPersonOut;
    r[e.type] += e.amount;
    bucket[who] = round2((bucket[who] || 0) + e.amount);
  }
  r.in = round2(r.in);
  r.out = round2(r.out);
  r.net = round2(r.in - r.out);
  return r;
}

// Repayments flow back: 'in' for owedToMe, 'out' for iOwe. The entry that opened the
// loan flows the other way, so it is not counted as paid.
export function debtRemaining(debt, entries) {
  const back = debt.direction === 'owedToMe' ? 'in' : 'out';
  const paid = entries.reduce((s, e) => (e.debtId === debt.id && e.type === back ? s + e.amount : s), 0);
  return round2(debt.amount - paid);
}

export function debtTotals(state) {
  const t = { owedToMe: 0, iOwe: 0 };
  for (const d of state.debts) t[d.direction] += debtRemaining(d, state.entries);
  return { owedToMe: round2(t.owedToMe), iOwe: round2(t.iOwe) };
}

let counter = 0;
export const uid = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

// Whole days from `today` to `due` (both 'YYYY-MM-DD'); negative when late. Rounding absorbs DST hours.
export const daysUntil = (due, today) =>
  Math.round((new Date(due + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5);

// With moveMoney, also records the wallet entry that opened the loan (lend = out, borrow = in).
export function addDebt(state, { direction, person, amount, note = '', date, dueDate = null, moveMoney, wallet }) {
  const debt = { id: uid(), direction, person, amount, note, createdDate: date, dueDate };
  state.debts.push(debt);
  if (moveMoney) {
    state.entries.push({ id: uid(), date, type: direction === 'owedToMe' ? 'out' : 'in', amount, wallet, person, note: 'Loan', debtId: debt.id });
  }
  return debt;
}

export function repay(state, debtId, { amount, wallet, date }) {
  const debt = state.debts.find(d => d.id === debtId);
  if (!debt) throw new Error('Debt not found');
  if (amount > debtRemaining(debt, state.entries)) throw new Error('More than what is left on this debt');
  state.entries.push({ id: uid(), date, type: debt.direction === 'owedToMe' ? 'in' : 'out', amount, wallet, person: debt.person, note: 'Paid back', debtId });
}

// Linked entries stay: they moved real money, and their debtId keeps them out of the totals.
export function deleteDebt(state, debtId) {
  state.debts = state.debts.filter(d => d.id !== debtId);
}

export function isValidBackup(x) {
  return !!x && x.version === 1 && !!x.start
    && typeof x.start.cash === 'number' && typeof x.start.telebirr === 'number'
    && Array.isArray(x.entries) && Array.isArray(x.debts) && Array.isArray(x.todos);
}

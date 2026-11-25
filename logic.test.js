import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

const st = () => L.emptyState();
const e = o => ({ id: L.uid(), date: '2026-11-22', person: '', note: '', ...o });

test('parseAmount', () => {
  assert.equal(L.parseAmount('355'), 355);
  assert.equal(L.parseAmount('1,250.50'), 1250.5);
  assert.equal(L.parseAmount(' 12.5 '), 12.5);
  assert.equal(L.parseAmount('0'), null);
  assert.equal(L.parseAmount('0', true), 0);
  assert.equal(L.parseAmount('-5'), null);
  assert.equal(L.parseAmount('1.234'), null);
  assert.equal(L.parseAmount('abc'), null);
  assert.equal(L.parseAmount(''), null);
});

test('periodStart: day, Monday week, month', () => {
  assert.equal(L.periodStart('day', '2026-11-22'), '2026-11-22');
  assert.equal(L.periodStart('week', '2026-11-22'), '2026-11-16'); // Sunday -> previous Monday
  assert.equal(L.periodStart('week', '2026-11-16'), '2026-11-16'); // Monday -> itself
  assert.equal(L.periodStart('week', '2026-12-02'), '2026-11-30'); // week crosses months
  assert.equal(L.periodStart('month', '2026-11-22'), '2026-11-01');
});

test('balances: in, out, move', () => {
  const s = st(); s.start = { cash: 1000, telebirr: 500 };
  s.entries.push(e({ type: 'in', amount: 355, wallet: 'cash' }));
  s.entries.push(e({ type: 'out', amount: 120.5, wallet: 'telebirr' }));
  s.entries.push(e({ type: 'move', amount: 200, from: 'cash', to: 'telebirr' }));
  assert.deepEqual(L.balances(s), { cash: 1155, telebirr: 579.5, total: 1734.5 });
});

test('periodTotals: sums by person, skips moves, loans and other dates', () => {
  const entries = [
    e({ type: 'in', amount: 200, wallet: 'cash', person: 'Abebe' }),
    e({ type: 'in', amount: 155, wallet: 'telebirr', person: 'Sara' }),
    e({ type: 'in', amount: 45, wallet: 'cash', person: ' Abebe ' }),
    e({ type: 'out', amount: 120, wallet: 'cash' }),
    e({ type: 'move', amount: 999, from: 'cash', to: 'telebirr' }),
    e({ type: 'in', amount: 500, wallet: 'cash', person: 'Kebede', debtId: 'd1' }),
    e({ type: 'in', amount: 77, wallet: 'cash', date: '2026-10-31' }),
  ];
  const t = L.periodTotals(entries, '2026-11-16', '2026-11-22');
  assert.equal(t.in, 400);
  assert.equal(t.out, 120);
  assert.equal(t.net, 280);
  assert.deepEqual(t.byPersonIn, { Abebe: 245, Sara: 155 });
  assert.deepEqual(t.byPersonOut, { Other: 120 });
});

test('periodTotals rounds float sums', () => {
  const t = L.periodTotals([e({ type: 'in', amount: 0.1, wallet: 'cash' }), e({ type: 'in', amount: 0.2, wallet: 'cash' })], '2026-11-22', '2026-11-22');
  assert.equal(t.in, 0.3);
});

test('lending: wallet moves, totals untouched, repay lowers what is left', () => {
  const s = st(); s.start.cash = 1000;
  const d = L.addDebt(s, { direction: 'owedToMe', person: 'Kebede', amount: 500, date: '2026-11-22', moveMoney: true, wallet: 'cash' });
  assert.equal(L.balances(s).cash, 500);
  assert.equal(L.debtRemaining(d, s.entries), 500);
  L.repay(s, d.id, { amount: 200, wallet: 'telebirr', date: '2026-11-22' });
  assert.equal(L.debtRemaining(d, s.entries), 300);
  assert.equal(L.balances(s).telebirr, 200);
  const t = L.periodTotals(s.entries, '2026-11-01', '2026-11-30');
  assert.equal(t.in, 0);
  assert.equal(t.out, 0);
});

test('borrowing: wallet goes up, paying back goes out', () => {
  const s = st();
  const d = L.addDebt(s, { direction: 'iOwe', person: 'Sara', amount: 300, date: '2026-11-22', moveMoney: true, wallet: 'telebirr' });
  assert.equal(L.balances(s).telebirr, 300);
  L.repay(s, d.id, { amount: 300, wallet: 'cash', date: '2026-11-22' });
  assert.equal(L.debtRemaining(d, s.entries), 0);
  assert.equal(L.balances(s).cash, -300);
  assert.deepEqual(L.debtTotals(s), { owedToMe: 0, iOwe: 0 });
});

test('debt without moving money leaves wallets alone', () => {
  const s = st();
  L.addDebt(s, { direction: 'owedToMe', person: 'Shop', amount: 800, date: '2026-11-22', moveMoney: false, wallet: 'cash' });
  assert.equal(s.entries.length, 0);
  assert.deepEqual(L.debtTotals(s), { owedToMe: 800, iOwe: 0 });
});

test('repaying more than what is left is refused', () => {
  const s = st();
  const d = L.addDebt(s, { direction: 'owedToMe', person: 'A', amount: 100, date: '2026-11-22', moveMoney: false });
  assert.throws(() => L.repay(s, d.id, { amount: 101, wallet: 'cash', date: '2026-11-22' }), /More than/);
});

test('deleteDebt keeps its entries, still out of the totals', () => {
  const s = st(); s.start.cash = 1000;
  const d = L.addDebt(s, { direction: 'owedToMe', person: 'A', amount: 400, date: '2026-11-22', moveMoney: true, wallet: 'cash' });
  L.deleteDebt(s, d.id);
  assert.equal(s.debts.length, 0);
  assert.equal(s.entries.length, 1);
  assert.equal(L.balances(s).cash, 600);
  assert.equal(L.periodTotals(s.entries, '2026-11-22', '2026-11-22').out, 0);
});

test('daysUntil: future, today, late, across months', () => {
  assert.equal(L.daysUntil('2026-11-25', '2026-11-22'), 3);
  assert.equal(L.daysUntil('2026-11-22', '2026-11-22'), 0);
  assert.equal(L.daysUntil('2026-11-20', '2026-11-22'), -2);
  assert.equal(L.daysUntil('2026-12-01', '2026-11-30'), 1);
  assert.equal(L.daysUntil('2027-03-29', '2027-03-27'), 2); // a 23-hour DST day in some zones
});

test('addDebt keeps the pay-back date (or null)', () => {
  const s = st();
  const a = L.addDebt(s, { direction: 'iOwe', person: 'A', amount: 10, date: '2026-11-22', dueDate: '2026-12-01', moveMoney: false });
  const b = L.addDebt(s, { direction: 'iOwe', person: 'B', amount: 10, date: '2026-11-22', moveMoney: false });
  assert.equal(a.dueDate, '2026-12-01');
  assert.equal(b.dueDate, null);
});

test('lendCheck: still covers what I owe, or not', () => {
  const s = st(); s.start = { cash: 3000, telebirr: 2000 };
  L.addDebt(s, { direction: 'iOwe', person: 'Dawit', amount: 1000, date: '2026-11-22', moveMoney: false });
  assert.deepEqual(L.lendCheck(s, 3000), { ok: true, total: 5000, owe: 1000, left: 1000 });
  assert.deepEqual(L.lendCheck(s, 4500), { ok: false, total: 5000, owe: 1000, left: -500 });
});

test('borrowCheck: counts money due to me by then, and what I owe by then or with no date', () => {
  const s = st(); s.start = { cash: 4200, telebirr: 0 };
  L.addDebt(s, { direction: 'owedToMe', person: 'Meron', amount: 900, date: '2026-11-22', dueDate: '2026-12-10', moveMoney: false });
  L.addDebt(s, { direction: 'owedToMe', person: 'Late', amount: 700, date: '2026-11-22', dueDate: '2027-01-15', moveMoney: false });
  L.addDebt(s, { direction: 'owedToMe', person: 'Undated', amount: 600, date: '2026-11-22', moveMoney: false });
  L.addDebt(s, { direction: 'iOwe', person: 'Dawit', amount: 300, date: '2026-11-22', moveMoney: false });
  L.addDebt(s, { direction: 'iOwe', person: 'Later', amount: 999, date: '2026-11-22', dueDate: '2027-02-01', moveMoney: false });
  assert.deepEqual(L.borrowCheck(s, 5000, '2026-12-20'),
    { ok: false, have: 5100, need: 5300, incoming: 900, outgoing: 300, short: 200 });
  assert.equal(L.borrowCheck(s, 4800, '2026-12-20').ok, true);
});

test('withDefaults fills new fields for old saves and keeps existing ones', () => {
  const old = { version: 1, start: { cash: 0, telebirr: 0 }, entries: [], debts: [], todos: [], lastBackup: null };
  const s = L.withDefaults(old);
  assert.deepEqual([s.goal, s.limit, s.quick, s.lang], [null, null, [], 'en']);
  assert.equal(L.withDefaults({ ...old, lang: 'am', limit: 5000 }).limit, 5000);
  assert.equal(L.emptyState().lang, 'en');
});

test('dailyTotals: last 7 days oldest first, loans and moves left out', () => {
  const days = L.dailyTotals([
    e({ type: 'in', amount: 355, wallet: 'cash' }),
    e({ type: 'out', amount: 120, wallet: 'cash', date: '2026-11-20' }),
    e({ type: 'in', amount: 500, wallet: 'cash', debtId: 'd1' }),
    e({ type: 'move', amount: 99, from: 'cash', to: 'telebirr' }),
    e({ type: 'in', amount: 1, wallet: 'cash', date: '2026-11-15' }), // 8 days ago: outside
  ], '2026-11-22');
  assert.equal(days.length, 7);
  assert.equal(days[0].date, '2026-11-16');
  assert.deepEqual(days[6], { date: '2026-11-22', in: 355, out: 0 });
  assert.deepEqual(days[4], { date: '2026-11-20', in: 0, out: 120 });
});

test('limitStatus: ok, near (80%+), over', () => {
  assert.deepEqual(L.limitStatus(3000, 10000), { pct: 30, left: 7000, level: 'ok' });
  assert.equal(L.limitStatus(8000, 10000).level, 'near');
  assert.equal(L.limitStatus(10000, 10000).level, 'near');
  assert.deepEqual(L.limitStatus(12000, 10000), { pct: 120, left: -2000, level: 'over' });
});

test('goalProgress: percent, what is left, per day, done', () => {
  assert.deepEqual(L.goalProgress(5000, { name: 'Laptop', amount: 20000, by: '2026-12-22' }, '2026-11-22'),
    { pct: 25, left: 15000, daysLeft: 30, perDay: 500, done: false });
  assert.deepEqual(L.goalProgress(25000, { name: 'x', amount: 20000, by: null }, '2026-11-22'),
    { pct: 100, left: 0, daysLeft: null, perDay: null, done: true });
  assert.equal(L.goalProgress(-500, { name: 'x', amount: 1000, by: null }, '2026-11-22').pct, 0);
});

test('dueSoon: debts I owe that are late or due within N days, soonest first', () => {
  const s = st();
  L.addDebt(s, { direction: 'iOwe', person: 'Dawit', amount: 1000, date: '2026-11-10', dueDate: '2026-11-21', moveMoney: false });
  L.addDebt(s, { direction: 'iOwe', person: 'Sara', amount: 200, date: '2026-11-10', dueDate: '2026-11-24', moveMoney: false });
  L.addDebt(s, { direction: 'iOwe', person: 'Later', amount: 50, date: '2026-11-10', dueDate: '2026-12-30', moveMoney: false });
  L.addDebt(s, { direction: 'owedToMe', person: 'NotMine', amount: 70, date: '2026-11-10', dueDate: '2026-11-23', moveMoney: false });
  assert.deepEqual(L.dueSoon(s, '2026-11-22', 7).map(x => [x.person, x.left, x.days]), [['Dawit', 1000, -1], ['Sara', 200, 2]]);
});

test('lastPaid finds the newest spending with the same name', () => {
  const entries = [
    e({ type: 'out', amount: 1200, wallet: 'cash', person: 'Sunglasses', date: '2026-05-01' }),
    e({ type: 'out', amount: 1300, wallet: 'cash', note: 'sunglasses', date: '2026-08-01' }),
    e({ type: 'in', amount: 9, wallet: 'cash', person: 'Sunglasses', date: '2026-09-01' }),
  ];
  assert.deepEqual(L.lastPaid(entries, ' SUNGLASSES '), { amount: 1300, date: '2026-08-01' });
  assert.equal(L.lastPaid(entries, 'Hat'), null);
  assert.equal(L.lastPaid(entries, ''), null);
});

test('buyCheck: good buy, think twice, not now', () => {
  const s = st(); s.start = { cash: 10000, telebirr: 8000 };
  const good = L.buyCheck(s, 500, 100, '2026-11-22');
  assert.equal(good.verdict, 'good');
  assert.equal(good.pct, 3);
  assert.equal(good.perUse, 5);
  assert.equal(good.wallet, 'cash');
  s.limit = 1000;
  const overLimit = L.buyCheck(s, 1500, 200, '2026-11-22');
  assert.equal(overLimit.verdict, 'think');
  assert.equal(overLimit.limitLeft, -500);
  assert.equal(L.buyCheck(s, 6000, 0, '2026-11-22').verdict, 'no'); // over 30% of 18,000
  s.limit = null;
  assert.equal(L.buyCheck(s, 500, 2, '2026-11-22').verdict, 'think'); // 250 a use
});

test('buyCheck: due-soon debts, days of work, goal delay', () => {
  const s = st(); s.start = { cash: 5000, telebirr: 0 };
  s.entries.push(e({ type: 'in', amount: 9000, wallet: 'cash', date: '2026-10-01' })); // 9,000 in 90 days = 100 a day
  L.addDebt(s, { direction: 'iOwe', person: 'Dawit', amount: 13500, date: '2026-11-01', dueDate: '2026-11-25', moveMoney: false });
  const r = L.buyCheck(s, 600, 0, '2026-11-22');
  assert.equal(r.verdict, 'no'); // 14,000 - 600 = 13,400 can't cover the 13,500 due in 3 days
  assert.equal(r.dueSoonTotal, 13500);
  assert.equal(L.buyCheck(s, 400, 0, '2026-11-22').verdict, 'good'); // 13,600 still covers it
  assert.equal(r.daysOfWork, 6);
  s.goal = { name: 'Laptop', amount: 20000, by: '2026-12-22' }; // 6,000 left over 30 days = 200 a day
  s.debts = [];
  assert.equal(L.buyCheck(s, 600, 0, '2026-11-22').goalDays, 3);
});

test('isValidBackup', () => {
  assert.equal(L.isValidBackup(L.emptyState()), true);
  assert.equal(L.isValidBackup(null), false);
  assert.equal(L.isValidBackup({ version: 1 }), false);
  assert.equal(L.isValidBackup({ hello: 1 }), false);
});

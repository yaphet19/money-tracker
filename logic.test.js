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

test('isValidBackup', () => {
  assert.equal(L.isValidBackup(L.emptyState()), true);
  assert.equal(L.isValidBackup(null), false);
  assert.equal(L.isValidBackup({ version: 1 }), false);
  assert.equal(L.isValidBackup({ hello: 1 }), false);
});

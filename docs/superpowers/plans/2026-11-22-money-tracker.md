# Money Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal iPhone home-screen web app that tracks Cash and Telebirr balances, money in and out with day, week and month totals, debts in both directions, and to-dos.

**Architecture:** Static files with no build step. All money math lives in pure functions in `logic.js`, tested with `node --test`. Each screen is one ES module that exports `{ html(state), bind(root, ctx) }`, and `app.js` wires the tabs and saves the whole state to `localStorage` after every change. A service worker caches the files so the app works offline once it is on the home screen.

**Tech Stack:** Plain HTML, CSS and JS (ES modules); Node 22 `node:test` for the logic tests; Python `http.server` for local preview; GitHub Pages for hosting.

**Spec:** `docs/superpowers/specs/2026-11-22-money-tracker-design.md`

## Global Constraints

- Single user, English only, Gregorian dates as `'YYYY-MM-DD'` strings in local time, weeks start on **Monday**.
- Wallets are exactly `cash` (label "Cash") and `telebirr` (label "Telebirr").
- Amounts are greater than 0 with at most 2 decimals. Commas are allowed when typing ("1,250.50"). Starting balances may be 0.
- **Loans never count in the + got / − lost totals.** Any entry with a `debtId` moves its wallet balance but is left out of the period totals and the per-person breakdown, even after its debt is deleted.
- Transfers (`type: 'move'`) never count as + or −.
- Balances may go negative: the app warns with `alert`, then saves anyway.
- Data lives only in `localStorage` under the key `money-tracker-v1`. Unreadable saved data is never thrown away: it is copied aside first.
- No frameworks, no npm dependencies, no build step.
- Inputs use a 16px font so iOS Safari does not zoom in. Tap targets are at least 44px tall.
- User text (names, notes, to-dos) is always escaped with `esc()` before it goes into HTML.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| `package.json` | `{"type":"module"}`, so Node treats `.js` files as ES modules |
| `logic.js` | Pure state math: dates, parsing, balances, totals, debts, backup check |
| `logic.test.js` | `node --test` tests for `logic.js` |
| `ui.js` | DOM helpers: `$`, `esc`, `fmt`, `signed`, `today`, `WALLETS`, `walletOptions`, `openForm`, `warnIfNegative` |
| `store.js` | `localStorage` load/save, backup export and restore file reading |
| `app.js` | Tab bar, the `ctx` object, render loop, service worker registration |
| `screens/entry-form.js` | Add/edit/delete dialog for in, out and move entries |
| `screens/home.js` | Balances, period totals, per-person breakdown, Loans card, + / − / ⇄ buttons |
| `screens/history.js` | All entries grouped by day; tap one to edit it |
| `screens/debts.js` | Owe-me and I-owe lists, add, Paid, edit, delete |
| `screens/todo.js` | To-do and done lists |
| `screens/settings.js` | Starting balances, Backup, Restore |
| `index.html`, `style.css` | Page shell and styles (light and dark) |
| `manifest.json`, `sw.js`, `icon-*.png`, `tools/make-icons.ps1` | Home-screen install and offline support |
| `.claude/launch.json` | Local preview server config |

Screen module contract (every `screens/*.js` except `entry-form.js` default-exports this):

```js
export default {
  html(state) { return '...'; },   // pure: state -> HTML string
  bind(root, ctx) { /* attach listeners to root, a fresh element on every render */ },
};
// ctx = { state, commit(), go(tabName), render() }
// ctx.state can be replaced (Restore), so always read ctx.state inside handlers.
```

---

### Task 1: Money logic and its tests

**Files:**
- Create: `package.json`
- Create: `logic.test.js`
- Create: `logic.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all named exports of `logic.js`):
  - `round2(n: number): number`
  - `ymd(d: Date): string` gives `'YYYY-MM-DD'` in local time
  - `emptyState(): State`, where `State = { version: 1, start: {cash, telebirr}, entries: Entry[], debts: Debt[], todos: Todo[], lastBackup: string|null }`
  - `Entry = { id, date, type: 'in'|'out'|'move', amount, wallet?, from?, to?, person?, note?, debtId? }`
  - `Debt = { id, direction: 'owedToMe'|'iOwe', person, amount, note, createdDate }`
  - `Todo = { id, text, createdDate, doneDate: string|null }`
  - `parseAmount(text: string, allowZero = false): number|null`
  - `periodStart(kind: 'day'|'week'|'month', today: string): string`
  - `balances(state): { cash, telebirr, total }`
  - `periodTotals(entries, from: string, to: string): { in, out, net, byPersonIn: {[who]: n}, byPersonOut: {[who]: n} }`
  - `debtRemaining(debt, entries): number`
  - `debtTotals(state): { owedToMe, iOwe }`
  - `uid(): string`
  - `addDebt(state, { direction, person, amount, note?, date, moveMoney, wallet }): Debt`
  - `repay(state, debtId, { amount, wallet, date }): void` throws `Error('More than what is left on this debt')`
  - `deleteDebt(state, debtId): void`
  - `isValidBackup(x): boolean`

- [ ] **Step 1: Create `package.json`**

```json
{ "type": "module", "private": true, "scripts": { "test": "node --test" } }
```

- [ ] **Step 2: Write the failing tests in `logic.test.js`**

```js
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
```

- [ ] **Step 3: Run the tests and check they fail**

Run: `node --test`
Expected: FAIL with `Cannot find module ... logic.js`

- [ ] **Step 4: Write `logic.js`**

```js
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

// With moveMoney, also records the wallet entry that opened the loan (lend = out, borrow = in).
export function addDebt(state, { direction, person, amount, note = '', date, moveMoney, wallet }) {
  const debt = { id: uid(), direction, person, amount, note, createdDate: date };
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
```

- [ ] **Step 5: Run the tests and check they pass**

Run: `node --test`
Expected: `# pass 11`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add package.json logic.js logic.test.js
git commit -m "feat: money logic (balances, period totals, debts) with tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: App shell, Home, History and the entry form

**Files:**
- Create: `.claude/launch.json`, `index.html`, `style.css`, `ui.js`, `store.js`, `app.js`, `screens/entry-form.js`, `screens/home.js`, `screens/history.js`

**Interfaces:**
- Consumes: everything from `logic.js` (Task 1).
- Produces:
  - `ui.js`: `$(sel, root?)`, `esc(s)`, `fmt(n)`, `signed(n)`, `today()`, `WALLETS = { cash: 'Cash', telebirr: 'Telebirr' }`, `walletOptions(selected)`, `openForm(title, fieldsHtml, onSubmit(fd) → string|undefined, extraButtonsHtml?) → HTMLFormElement`, `warnIfNegative(state)`
  - `store.js`: `load() → State`, `save(state)`, `exportBackup(state, dateStr) → Promise<boolean>`, `readBackup(file) → Promise<State>`
  - `screens/entry-form.js`: `openEntryForm(ctx, type, entry?)`
  - `app.js`: the `tabs` array of `[key, label, screenModule]`. Later tasks add one import and one row each.

- [ ] **Step 1: Create `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "money-tracker", "runtimeExecutable": "python", "runtimeArgs": ["-m", "http.server", "5173"], "port": 5173 }
  ]
}
```

- [ ] **Step 2: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f766e">
<title>Money</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main id="main"></main>
<nav id="tabs" aria-label="Screens"></nav>
<dialog id="dlg"></dialog>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `style.css`**

```css
:root { --bg:#f4f5f7; --card:#fff; --text:#1c1f24; --muted:#6b7280; --line:#e5e7eb; --accent:#0f766e; --pos:#15803d; --neg:#b91c1c; color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0f1115; --card:#1a1d23; --text:#eef0f3; --muted:#9aa1ac; --line:#2a2f37; --accent:#14b8a6; --pos:#4ade80; --neg:#f87171; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.4 -apple-system, system-ui, sans-serif; }
#main { max-width: 560px; margin: 0 auto; padding: calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 150px); }
#tabs { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: var(--card); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); }
#tabs button { flex: 1; border: 0; border-radius: 0; background: none; color: var(--muted); font-size: 13px; }
#tabs button[aria-current] { color: var(--accent); font-weight: 600; }
button, .button { font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; min-height: 44px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.danger { color: var(--neg); }
input, select { font: inherit; font-size: 16px; width: 100%; padding: 10px; min-height: 44px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--text); }
label { display: block; margin: 10px 0; color: var(--muted); font-size: 14px; }
label input, label select { margin-top: 4px; }
label.check { display: flex; gap: 8px; align-items: center; color: var(--text); }
label.check input { width: auto; min-height: 0; margin: 0; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin: 12px 0; }
h3 { margin: 0 0 8px; font-size: 15px; display: flex; justify-content: space-between; gap: 8px; }
small, .muted { color: var(--muted); }
.center { text-align: center; margin-top: 40px; }
.pos { color: var(--pos); }
.neg { color: var(--neg); }
.balances, .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; }
.balances strong, .totals strong { display: block; font-size: 20px; font-variant-numeric: tabular-nums; }
.seg { display: flex; gap: 6px; }
.seg button { flex: 1; padding: 8px; }
.seg [aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.list li:last-child { border-bottom: 0; }
.entry { width: 100%; justify-content: flex-start; text-align: left; border: 0; padding: 0; background: none; }
.entry.in strong { color: var(--pos); }
.entry.out strong { color: var(--neg); }
.tag { font-style: normal; font-size: 12px; background: var(--line); padding: 1px 6px; border-radius: 6px; }
.loans { width: 100%; justify-content: space-between; gap: 8px; text-align: left; }
.fab { position: fixed; right: 16px; bottom: calc(env(safe-area-inset-bottom) + 68px); display: flex; gap: 10px; }
.fab button { width: 56px; height: 56px; border-radius: 50%; font-size: 26px; background: var(--accent); color: #fff; border: 0; box-shadow: 0 4px 12px #0003; }
.row { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.actions { display: flex; flex-direction: row-reverse; gap: 8px; margin-top: 8px; }
.actions .danger { margin-right: auto; }
.add { display: flex; gap: 8px; }
.todo label { display: flex; gap: 10px; align-items: center; margin: 0; color: var(--text); flex: 1; font-size: 16px; }
.todo label input { width: auto; min-height: 0; margin: 0; }
.debt { align-items: flex-start; }
details summary { color: var(--muted); padding: 8px 0; }
dialog { border: 0; border-radius: 16px; padding: 16px; width: min(92vw, 420px); background: var(--card); color: var(--text); }
dialog::backdrop { background: #0007; }
dialog h2 { margin: 0 0 4px; font-size: 18px; }
.err { color: var(--neg); min-height: 1em; margin: 4px 0; }
```

- [ ] **Step 4: Create `ui.js`**

```js
import { balances, ymd } from './logic.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
export const today = () => ymd(new Date());
export const WALLETS = { cash: 'Cash', telebirr: 'Telebirr' };
export const walletOptions = selected =>
  Object.entries(WALLETS).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${v}</option>`).join('');

// Shows a form in the shared <dialog>. onSubmit(FormData) returns an error message to keep it open.
// Save comes first in the DOM so Enter / "Go" on the iOS keyboard saves; .actions reverses it visually.
export function openForm(title, fieldsHtml, onSubmit, extraButtons = '') {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${fieldsHtml}<p class="err" role="alert"></p>
    <div class="actions"><button value="ok" class="primary">Save</button><button value="cancel" formnovalidate>Cancel</button>${extraButtons}</div></form>`;
  const form = $('form', dlg);
  form.addEventListener('submit', ev => {
    if (ev.submitter?.value === 'cancel') return;
    const err = onSubmit(new FormData(form));
    if (err) { ev.preventDefault(); $('.err', form).textContent = err; }
  });
  dlg.showModal();
  return form;
}

export function warnIfNegative(state) {
  const b = balances(state);
  const low = Object.keys(WALLETS).filter(k => b[k] < 0).map(k => WALLETS[k]);
  if (low.length) alert(`Heads up: ${low.join(' and ')} is now below 0.`);
}
```

- [ ] **Step 5: Create `store.js`**

```js
import { emptyState, isValidBackup } from './logic.js';

const KEY = 'money-tracker-v1';

export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return emptyState();
  try { const s = JSON.parse(raw); if (isValidBackup(s)) return s; } catch {}
  localStorage.setItem(`${KEY}-broken-${Date.now()}`, raw); // never silently drop data we can't read
  alert('Saved data could not be read. It was kept aside. Restore a backup in Settings.');
  return emptyState();
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { alert(`Could not save: ${e.message}. Make a backup now.`); }
}

// iPhone: opens the share sheet (Save to Files / Telegram). Elsewhere: downloads the file.
// Returns false when the user cancels the share sheet.
export async function exportBackup(state, dateStr) {
  const file = new File([JSON.stringify(state)], `money-backup-${dateStr}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); }
    catch (e) { if (e.name === 'AbortError') return false; throw e; }
    return true;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

export async function readBackup(file) {
  let s;
  try { s = JSON.parse(await file.text()); } catch { s = null; }
  if (!isValidBackup(s)) throw new Error('This is not a Money Tracker backup file.');
  return s;
}
```

- [ ] **Step 6: Create `screens/entry-form.js`**

```js
import { parseAmount, uid } from '../logic.js';
import { $, esc, openForm, today, walletOptions, warnIfNegative } from '../ui.js';

const TITLES = { in: 'Got money', out: 'Spent / lost money', move: 'Move money' };

// type: 'in' | 'out' | 'move'. Pass `entry` to edit it (adds a Delete button).
// shortcut: editing a loan entry's amount does not re-check its debt; fine for one careful user.
export function openEntryForm(ctx, type, entry) {
  const e = entry || { type, date: today(), wallet: 'cash', from: 'cash', to: 'telebirr', person: '', note: '' };
  const walletFields = e.type === 'move'
    ? `<label>From <select name="from">${walletOptions(e.from)}</select></label>
       <label>To <select name="to">${walletOptions(e.to)}</select></label>`
    : `<label>Wallet <select name="wallet">${walletOptions(e.wallet)}</select></label>
       <label>${e.type === 'in' ? 'From who' : 'To who / what for'} <input name="person" value="${esc(e.person)}" autocomplete="off"></label>`;
  const form = openForm(TITLES[e.type], `
    <label>Amount (birr) <input name="amount" inputmode="decimal" required value="${e.amount ?? ''}" autocomplete="off"></label>
    ${walletFields}
    <label>Note <input name="note" value="${esc(e.note)}" autocomplete="off"></label>
    <label>Date <input name="date" type="date" required value="${e.date}"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return 'Enter an amount above 0 (at most 2 decimals).';
      if (e.type === 'move' && fd.get('from') === fd.get('to')) return 'Pick two different wallets.';
      const next = { amount, note: fd.get('note').trim(), date: fd.get('date') };
      if (e.type === 'move') Object.assign(next, { from: fd.get('from'), to: fd.get('to') });
      else Object.assign(next, { wallet: fd.get('wallet'), person: fd.get('person').trim() });
      if (entry) Object.assign(entry, next);
      else ctx.state.entries.push({ id: uid(), type: e.type, ...next });
      warnIfNegative(ctx.state);
      ctx.commit();
    },
    entry ? '<button type="button" class="danger" data-del>Delete</button>' : '');
  $('[data-del]', form)?.addEventListener('click', () => {
    if (!confirm('Delete this entry?')) return;
    ctx.state.entries = ctx.state.entries.filter(x => x !== entry);
    $('#dlg').close();
    ctx.commit();
  });
}
```

- [ ] **Step 7: Create `screens/home.js`**

```js
import { balances, debtTotals, periodStart, periodTotals } from '../logic.js';
import { esc, fmt, signed, today, WALLETS } from '../ui.js';
import { openEntryForm } from './entry-form.js';

const PERIODS = { day: 'Today', week: 'This week', month: 'This month' };
let period = 'day';

const people = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])
  .map(([who, n]) => `<li><span>${esc(who)}</span><span>${fmt(n)}</span></li>`).join('')
  || '<li class="muted">Nothing yet</li>';

export default {
  html(state) {
    const b = balances(state);
    const t = periodTotals(state.entries, periodStart(period, today()), today());
    const d = debtTotals(state);
    return `
      <section class="card balances">
        ${Object.entries(WALLETS).map(([k, v]) => `<div><small>${v}</small><strong class="${b[k] < 0 ? 'neg' : ''}">${fmt(b[k])}</strong></div>`).join('')}
        <div><small>Total</small><strong>${fmt(b.total)}</strong></div>
      </section>
      <div class="seg">${Object.entries(PERIODS).map(([k, v]) =>
        `<button data-period="${k}" aria-pressed="${k === period}">${v}</button>`).join('')}</div>
      <section class="card totals">
        <div><small>Got</small><strong class="pos">+${fmt(t.in)}</strong></div>
        <div><small>Lost</small><strong class="neg">−${fmt(t.out)}</strong></div>
        <div><small>Net</small><strong class="${t.net < 0 ? 'neg' : 'pos'}">${signed(t.net)}</strong></div>
      </section>
      <section class="card"><h3>Got from</h3><ul class="list">${people(t.byPersonIn)}</ul></section>
      <section class="card"><h3>Lost to</h3><ul class="list">${people(t.byPersonOut)}</ul></section>
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
      if (b.dataset.period) { period = b.dataset.period; ctx.render(); }
      if (b.dataset.add) openEntryForm(ctx, b.dataset.add);
      if (b.dataset.go) ctx.go(b.dataset.go);
    });
  },
};
```

- [ ] **Step 8: Create `screens/history.js`**

```js
import { esc, fmt, WALLETS } from '../ui.js';
import { openEntryForm } from './entry-form.js';

const SIGN = { in: '+', out: '−', move: '⇄ ' };

const line = e => {
  const where = e.type === 'move' ? `${WALLETS[e.from]} → ${WALLETS[e.to]}` : WALLETS[e.wallet];
  const extra = [e.person, e.note].filter(Boolean).map(esc).join(' · ');
  return `<li><button data-id="${e.id}" class="entry ${e.type}"><span>
    <strong>${SIGN[e.type]}${fmt(e.amount)}</strong> ${e.debtId ? '<em class="tag">Loan</em>' : ''}
    <br><small>${where}${extra ? ' · ' + extra : ''}</small></span></button></li>`;
};

export default {
  html(state) {
    if (!state.entries.length) return '<p class="muted center">No entries yet. Add one from Home.</p>';
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
```

- [ ] **Step 9: Create `app.js`**

```js
import { load, save } from './store.js';
import { $ } from './ui.js';
import home from './screens/home.js';
import history from './screens/history.js';

const tabs = [
  ['home', 'Home', home],
  ['history', 'History', history],
];
let current = 'home';

// shortcut: every change re-saves and re-renders everything; fine for years of one person's entries.
const ctx = {
  state: load(),
  commit() { save(ctx.state); render(); },
  go(name) { if (tabs.some(t => t[0] === name)) { current = name; render(); scrollTo(0, 0); } },
  render,
};

function render() {
  $('#tabs').innerHTML = tabs.map(([k, label]) =>
    `<button data-tab="${k}" ${k === current ? 'aria-current="page"' : ''}>${label}</button>`).join('');
  const screen = tabs.find(t => t[0] === current)[2];
  const main = $('#main');
  main.innerHTML = `<div>${screen.html(ctx.state)}</div>`; // a fresh wrapper each render drops old listeners
  screen.bind?.(main.firstElementChild, ctx);
}

$('#tabs').addEventListener('click', ev => {
  const t = ev.target.closest('[data-tab]');
  if (t) ctx.go(t.dataset.tab);
});
render();
```

- [ ] **Step 10: Check it in the browser**

Start the preview with `preview_start {name: "money-tracker"}`, resize to the `mobile` preset, and reload. Then check:
1. `read_console_messages` with `onlyErrors: true` shows no errors.
2. Home shows Cash 0, Telebirr 0, Total 0 and "Today" pressed.
3. Tap **+**, enter amount `355`, person `Abebe`, then Save. Home shows Got `+355`, Net `+355`, Cash `355`, and "Got from: Abebe 355".
4. Tap **−**, enter `120`, wallet Telebirr, then Save. A "Telebirr is now below 0" alert appears and is accepted; Telebirr shows `-120` in red and Lost `−120`.
5. Tap **⇄**, enter Cash → Cash, `10`. It shows "Pick two different wallets." Change To to Telebirr and Save. The balances change, Got/Lost do not.
6. Type `abc` as an amount. It shows "Enter an amount above 0" and the dialog stays open.
7. History lists the 3 entries under today's date, newest on top. Tap the 355 entry, change it to 300 and Save; Home shows `+300`. Open it again, tap Delete and confirm; it disappears.
8. Reload the page: the data is still there.
9. Take a screenshot as proof.

- [ ] **Step 11: Commit**

```bash
git add .claude/launch.json index.html style.css ui.js store.js app.js screens/
git commit -m "feat: app shell with Home, History and entry form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Debts screen

**Files:**
- Create: `screens/debts.js`
- Modify: `app.js` (one import and one `tabs` row)

**Interfaces:**
- Consumes: `addDebt`, `debtRemaining`, `deleteDebt`, `parseAmount`, `repay`, `round2` from `logic.js`; `$`, `esc`, `fmt`, `openForm`, `today`, `walletOptions`, `warnIfNegative` from `ui.js`.
- Produces: the `debts` tab. The Home Loans card already calls `ctx.go('debts')`.

- [ ] **Step 1: Create `screens/debts.js`**

```js
import { addDebt, debtRemaining, deleteDebt, parseAmount, repay, round2 } from '../logic.js';
import { $, esc, fmt, openForm, today, walletOptions, warnIfNegative } from '../ui.js';

const TITLE = { owedToMe: 'People who owe me', iOwe: 'People I owe' };
const BAD_AMOUNT = 'Enter an amount above 0 (at most 2 decimals).';

function row(d, left) {
  return `<li class="debt"><div>
      <strong>${esc(d.person)}</strong> ${fmt(left)}${left !== d.amount ? ` <small>of ${fmt(d.amount)}</small>` : ''}
      ${d.note ? `<br><small>${esc(d.note)}</small>` : ''}<br><small>since ${d.createdDate}</small>
    </div><div class="row">
      ${left > 0 ? `<button data-pay="${d.id}" class="primary">Paid</button>` : ''}<button data-edit="${d.id}">Edit</button>
    </div></li>`;
}

function section(state, dir) {
  const list = state.debts.filter(d => d.direction === dir).map(d => [d, debtRemaining(d, state.entries)]);
  const open = list.filter(([, left]) => left > 0);
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
    <label>Date <input name="date" type="date" required value="${today()}"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return BAD_AMOUNT;
      const person = fd.get('person').trim();
      if (!person) return 'Enter a name.';
      addDebt(ctx.state, { direction, person, amount, note: fd.get('note').trim(), date: fd.get('date'), moveMoney: fd.get('move') === 'on', wallet: fd.get('wallet') });
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
    <label>Note <input name="note" value="${esc(debt.note)}" autocomplete="off"></label>`,
    fd => {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) return BAD_AMOUNT;
      if (amount < paid) return `${fmt(paid)} is already paid back, so the amount can't be less.`;
      const person = fd.get('person').trim();
      if (!person) return 'Enter a name.';
      Object.assign(debt, { person, amount, note: fd.get('note').trim() });
      ctx.commit();
    },
    '<button type="button" class="danger" data-del>Delete</button>');
  $('[data-del]', form).addEventListener('click', () => {
    const linked = ctx.state.entries.some(e => e.debtId === debt.id);
    if (!confirm(linked ? 'Delete this debt? Its money entries stay in History.' : 'Delete this debt?')) return;
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
```

- [ ] **Step 2: Register the tab in `app.js`**

Add the import under the other screen imports:

```js
import debts from './screens/debts.js';
```

and the row to `tabs`, so it reads:

```js
const tabs = [
  ['home', 'Home', home],
  ['history', 'History', history],
  ['debts', 'Debts', debts],
];
```

- [ ] **Step 3: Check it in the browser**

Reload the preview (mobile preset). Then:
1. Starting from Cash 1000 (add a +1000 entry first if needed), go to Debts, "People who owe me", tap **+ Add**: person `Kebede`, amount `500`, "Money left my wallet" ticked, Cash, then Save. The list shows Kebede 500 and the section total is 500.
2. On Home, Cash went down by 500 and Got/Lost **did not change**. The Loans card shows "People owe you 500". Tapping it opens Debts.
3. Tap **Paid**, enter `600`. It shows "More than what is left on this debt (left: 500)." Enter `200` with Telebirr and Save. The row shows "300 of 500" and Telebirr went up by 200. Home Got is still unchanged.
4. Tap **Paid** again with `300`. Kebede moves to "Settled (1)".
5. "People I owe", **+ Add**: `Sara`, `800`, untick the wallet box, then Save. No wallet changes; Home shows "You owe 800".
6. Tap **Edit** on Sara, change the amount to `700` and Save. Then Edit → Delete → confirm; Sara disappears.
7. History shows the Kebede entries with the "Loan" tag.
8. `read_console_messages` with `onlyErrors: true` shows no errors. Take a screenshot.

- [ ] **Step 4: Commit**

```bash
git add screens/debts.js app.js
git commit -m "feat: debts screen (owe me / I owe, paid back, settled)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: To-do screen

**Files:**
- Create: `screens/todo.js`
- Modify: `app.js` (one import and one `tabs` row)

**Interfaces:**
- Consumes: `uid` from `logic.js`; `esc`, `today` from `ui.js`.
- Produces: the `todo` tab.

- [ ] **Step 1: Create `screens/todo.js`**

```js
import { uid } from '../logic.js';
import { esc, today } from '../ui.js';

const item = t => `<li class="todo">
  <label><input type="checkbox" data-toggle="${t.id}" ${t.doneDate ? 'checked' : ''}>
    <span>${esc(t.text)}${t.doneDate ? `<br><small>done ${t.doneDate}</small>` : ''}</span></label>
  <button data-del="${t.id}" aria-label="Delete">✕</button></li>`;

export default {
  html(state) {
    const open = state.todos.filter(t => !t.doneDate);
    const done = state.todos.filter(t => t.doneDate).sort((a, b) => b.doneDate.localeCompare(a.doneDate));
    return `<form class="card add"><input name="text" placeholder="Something to do…" required autocomplete="off" aria-label="New to-do"><button class="primary">Add</button></form>
      <section class="card"><h3>To do <span>${open.length}</span></h3><ul class="list">${open.map(item).join('') || '<li class="muted">All done</li>'}</ul></section>
      <section class="card"><h3>Done <span>${done.length}</span></h3><ul class="list">${done.map(item).join('') || '<li class="muted">Nothing yet</li>'}</ul></section>`;
  },
  bind(root, ctx) {
    root.querySelector('form.add').addEventListener('submit', ev => {
      ev.preventDefault();
      const text = new FormData(ev.target).get('text').trim();
      if (!text) return;
      ctx.state.todos.push({ id: uid(), text, createdDate: today(), doneDate: null });
      ctx.commit();
      root.ownerDocument.querySelector('form.add input').focus(); // keep the keyboard up for the next one
    });
    root.addEventListener('change', ev => {
      const t = ctx.state.todos.find(x => x.id === ev.target.dataset.toggle);
      if (!t) return;
      t.doneDate = t.doneDate ? null : today();
      ctx.commit();
    });
    root.addEventListener('click', ev => {
      const id = ev.target.closest('[data-del]')?.dataset.del;
      if (!id || !confirm('Delete this to-do?')) return;
      ctx.state.todos = ctx.state.todos.filter(x => x.id !== id);
      ctx.commit();
    });
  },
};
```

- [ ] **Step 2: Register the tab in `app.js`**

Add `import todo from './screens/todo.js';` under the other screen imports, and make `tabs` read:

```js
const tabs = [
  ['home', 'Home', home],
  ['history', 'History', history],
  ['debts', 'Debts', debts],
  ['todo', 'To-do', todo],
];
```

- [ ] **Step 3: Check it in the browser**

Reload the preview. Then:
1. On the To-do tab, add `Call the cargo agent` and `Pay rent`. Both show under "To do 2".
2. Tick "Pay rent". It moves to "Done 1" with "done <today>".
3. Untick it. It moves back.
4. Tap ✕ and confirm. It disappears.
5. Reload: the list is unchanged. No console errors. Take a screenshot.

- [ ] **Step 4: Commit**

```bash
git add screens/todo.js app.js
git commit -m "feat: to-do screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Settings (starting balances, backup, restore)

**Files:**
- Create: `screens/settings.js`
- Modify: `app.js` (one import and one `tabs` row)

**Interfaces:**
- Consumes: `parseAmount` from `logic.js`; `today`, `WALLETS` from `ui.js`; `exportBackup`, `readBackup` from `store.js`.
- Produces: the `settings` tab.

- [ ] **Step 1: Create `screens/settings.js`**

```js
import { parseAmount } from '../logic.js';
import { today, WALLETS } from '../ui.js';
import { exportBackup, readBackup } from '../store.js';

export default {
  html(state) {
    return `<form class="card start"><h3>Starting balances</h3>
        <p class="muted">What you had before your first entry.</p>
        ${Object.entries(WALLETS).map(([k, v]) =>
          `<label>${v} <input name="${k}" inputmode="decimal" value="${state.start[k]}" autocomplete="off"></label>`).join('')}
        <p class="err" role="alert"></p><button class="primary">Save balances</button></form>
      <section class="card"><h3>Backup</h3>
        <p>Last backup: <strong>${state.lastBackup || 'never'}</strong></p>
        <p class="muted">Your data lives only on this phone. Back up weekly to iCloud Drive or Telegram.</p>
        <div class="row" style="justify-content:flex-start">
          <button data-backup class="primary">Backup now</button>
          <label class="button" style="margin:0">Restore from file<input type="file" accept=".json,application/json" hidden data-restore></label>
        </div></section>`;
  },
  bind(root, ctx) {
    root.querySelector('form.start').addEventListener('submit', ev => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const start = Object.fromEntries(Object.keys(WALLETS).map(k => [k, parseAmount(fd.get(k), true)]));
      if (Object.values(start).some(v => v === null)) {
        root.querySelector('.err').textContent = 'Use 0 or a positive amount (at most 2 decimals).';
        return;
      }
      ctx.state.start = start;
      ctx.commit();
    });
    root.querySelector('[data-backup]').addEventListener('click', async () => {
      try {
        if (await exportBackup(ctx.state, today())) { ctx.state.lastBackup = today(); ctx.commit(); }
      } catch (err) { alert(`Backup failed: ${err.message}`); }
    });
    root.querySelector('[data-restore]').addEventListener('change', async ev => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const s = await readBackup(file);
        if (!confirm(`Replace ALL current data with this backup (${s.entries.length} entries, ${s.debts.length} debts, ${s.todos.length} to-dos)?`)) return;
        ctx.state = s;
        ctx.commit();
      } catch (err) { alert(err.message); }
    });
  },
};
```

- [ ] **Step 2: Register the tab in `app.js`**

Add `import settings from './screens/settings.js';` under the other screen imports, and make `tabs` read:

```js
const tabs = [
  ['home', 'Home', home],
  ['history', 'History', history],
  ['debts', 'Debts', debts],
  ['todo', 'To-do', todo],
  ['settings', 'Settings', settings],
];
```

- [ ] **Step 3: Check it in the browser**

Reload the preview. Then:
1. Set Cash `-5`. It shows "Use 0 or a positive amount". Set Cash `1000`, Telebirr `250.50` and Save. Home balances go up by those amounts.
2. Tap **Backup now**. In the desktop preview it downloads `money-backup-<today>.json` (or the share sheet appears), and "Last backup" shows today.
3. Check the restore check without the file picker. In `javascript_tool`, run: `const m = await import('/store.js'); await m.readBackup(new File(['{"x":1}'], 'bad.json')).catch(e => e.message)`. Expected: `"This is not a Money Tracker backup file."`
4. Check a good restore: `await m.readBackup(new File([localStorage.getItem('money-tracker-v1')], 'ok.json')).then(s => s.version)`. Expected: `1`.
5. No console errors. Take a screenshot.

- [ ] **Step 4: Commit**

```bash
git add screens/settings.js app.js
git commit -m "feat: settings with starting balances, backup and restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Home-screen install and offline support

**Files:**
- Create: `tools/make-icons.ps1`, `icon-180.png`, `icon-192.png`, `icon-512.png` (generated), `manifest.json`, `sw.js`
- Modify: `index.html` (head tags), `app.js` (service worker registration)

**Interfaces:**
- Consumes: every file from Tasks 1–5 (they are listed in the `sw.js` cache).
- Produces: an installable, offline-capable app.

- [ ] **Step 1: Create `tools/make-icons.ps1` and run it**

```powershell
# Draws the app icon ("Br" on teal) at the sizes iOS and the manifest need.
Add-Type -AssemblyName System.Drawing
foreach ($size in 180, 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(15, 118, 110))
  $font = New-Object System.Drawing.Font 'Segoe UI', ([float]($size * 0.42)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = 'Center'
  $sf.LineAlignment = 'Center'
  $g.DrawString('Br', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 0, $size, $size), $sf)
  $bmp.Save((Join-Path $PSScriptRoot "..\icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
```

Run: `powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1`
Expected: `icon-180.png`, `icon-192.png` and `icon-512.png` appear in the project root. Open `icon-192.png` with Read to check it shows white "Br" on teal.

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "name": "Money Tracker",
  "short_name": "Money",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f4f5f7",
  "theme_color": "#0f766e",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 3: Create `sw.js`**

```js
// shortcut: cache-first; bump CACHE on every deploy or phones keep the old version.
const CACHE = 'money-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'ui.js', 'store.js', 'logic.js',
  'screens/entry-form.js', 'screens/home.js', 'screens/history.js', 'screens/debts.js', 'screens/todo.js', 'screens/settings.js',
  'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', e =>
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request))));
```

- [ ] **Step 4: Add the install tags to `index.html`**

Replace the line `<link rel="stylesheet" href="style.css">` with:

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Money">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="stylesheet" href="style.css">
```

- [ ] **Step 5: Register the service worker in `app.js`**

Append at the end of `app.js`:

```js
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
```

- [ ] **Step 6: Check it in the browser**

Reload the preview twice. Then:
1. In `javascript_tool`, run `(await navigator.serviceWorker.ready).active.state`. Expected: `"activated"`.
2. Run `(await caches.open('money-v1').then(c => c.keys())).length`. Expected: `17`.
3. `read_network_requests` shows no 404s (manifest and icons load).
4. Run `node --test`: still `# pass 11`.

- [ ] **Step 7: Commit**

```bash
git add tools/make-icons.ps1 icon-180.png icon-192.png icon-512.png manifest.json sw.js index.html app.js
git commit -m "feat: home-screen install and offline cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Publish on GitHub Pages and install on the iPhone

**Files:** none (repo settings only)

**Interfaces:**
- Consumes: the finished app from Tasks 1–6.
- Produces: a public URL `https://yaphet19.github.io/money-tracker/`.

> **Ask the owner first.** This creates a **public** GitHub repo, because Pages on a free account needs one. The code becomes public; the owner's money data does not, since it lives only on the phone. Go ahead only after a clear yes in chat.

- [ ] **Step 1: Create the repo and push**

```bash
gh repo create yaphet19/money-tracker --public --source . --push
```

Expected: the URL `https://github.com/yaphet19/money-tracker` is printed.

- [ ] **Step 2: Turn on Pages from the default branch**

```bash
gh api -X POST repos/yaphet19/money-tracker/pages -f "source[branch]=$(git branch --show-current)" -f "source[path]=/"
```

Expected: JSON containing `"html_url": "https://yaphet19.github.io/money-tracker/"`.

- [ ] **Step 3: Check the live site**

Wait for the build: re-run `gh api repos/yaphet19/money-tracker/pages --jq .status` until it prints `built` (usually 1–2 minutes). Then open `https://yaphet19.github.io/money-tracker/` with `preview_start {url}`, check that Home renders with no console errors, and take a screenshot.

- [ ] **Step 4: Give the owner the iPhone install steps**

1. On the iPhone, open **Safari** (not Chrome) and go to `https://yaphet19.github.io/money-tracker/`.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open **Money** from the home screen. Go to **Settings**, enter your current Cash and Telebirr balances, and Save.
4. Once a week: Settings → **Backup now** → Save to Files (iCloud Drive) or send to yourself on Telegram.

---

## Updating later

After any change: bump `CACHE` in `sw.js` (`money-v2`, `money-v3`, …), add any new file to `FILES`, run `node --test`, commit, and `git push`. The phone picks up the new version the second time the app is opened after the deploy.

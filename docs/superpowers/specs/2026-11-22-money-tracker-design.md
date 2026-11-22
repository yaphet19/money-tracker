# Money Tracker — design

Date: 2026-11-22 · Status: approved in chat, awaiting spec review · Working name: "money-tracker"

## Purpose

A personal app on the owner's iPhone that records:

- how much money they have in **Cash** and **Telebirr**
- money they **got** (and from whom) and money they **lost/spent** (and to whom)
- **people who owe them** and **people they owe**
- **to-dos**: things not done yet, and things done

It answers at a glance: "today I got +355 birr, lost −120", for today, this week and this month, with the people behind each number.

Single user, English only, Gregorian dates, week starts Monday.

## Platform

- **Home-screen web app (PWA)** on iPhone: open once in Safari, Share → Add to Home Screen. Opens full-screen with its own icon, works offline.
- Hosted free on **GitHub Pages** (HTTPS, needed for offline support).
- Built from a Windows PC with no Mac and no Apple developer account, so no native app.

## Data

- Stored **only on the phone** (browser `localStorage`, one JSON document).
- **Backup**: a button exports one `.json` file through the iPhone share sheet (save to iCloud Drive or send to yourself on Telegram).
- **Restore**: pick a backup file. It replaces all current data after a confirmation.
- Settings shows the date of the last backup, so the owner knows when to make a new one.

### Records

- **Wallets**: `cash`, `telebirr`. Each has a starting balance set once in Settings. The current balance = the starting balance + every entry since.
- **Entry**: `{ id, date, type, amount, wallet, person, note, debtId? }`
  - `in`: got money (+)
  - `out`: lost or spent money (−)
  - `move`: Cash ↔ Telebirr. It has `from` and `to` wallets instead of `wallet`, and **never** counts as + or −.
- **Debt**: `{ id, direction: "owedToMe" | "iOwe", person, amount, note, createdDate }`. What is left = `amount` − the repayments linked to it.
- **To-do**: `{ id, text, createdDate, doneDate? }`

## Loans count in the totals

At the owner's request, lending and borrowing show up as gains and losses:

| What happens | Wallet | Counts as |
|---|---|---|
| I lend someone money | goes down | **−** (out, linked to a new "owes me" debt) |
| They pay me back (all or part) | goes up | **+** (in, linked to that debt) |
| I borrow from someone | goes up | **+** (in, linked to a new "I owe" debt) |
| I pay them back (all or part) | goes down | **−** (out, linked to that debt) |

A debt can also be recorded **without moving money**, for example when someone owes for goods given on credit. A "Money left / entered my wallet" toggle, on by default, controls this. With the toggle off, only the debt is saved, with no entry and no effect on the totals.

## Screens

1. **Home**
   - Cash and Telebirr balances, and their total.
   - **Today / This week / This month** tabs, each showing **+ got**, **− lost** and **net**.
   - A breakdown by person under + and −, for example "Abebe +200, Sara +155". Entries with no person are grouped as "Other".
   - Big **+** and **−** buttons to add an entry quickly.
2. **History**: every entry, newest first, grouped by day. Tap an entry to edit or delete it.
3. **Debts**: two lists, *owe me* and *I owe*, each with its total. Each debt shows what is left and has **Paid** (with an amount, partial allowed, and a wallet) and **Edit/Delete** buttons. Paid-off debts move to a collapsed "settled" section.
4. **To-do**: an add box, the not-done list (tap to mark done), and a done list with the finish date (tap to undo). Delete with a swipe or a button.
5. **Settings**: starting balances, Backup, Restore, and the last backup date.

## Rules and edge cases

- Amounts are whole birr or have 2 decimals at most. They must be greater than 0, and the app checks this before saving.
- A balance may go negative (the app warns but still allows it), so a mistake never blocks entering the real situation.
- A repayment larger than what is left on the debt is refused.
- Deleting a debt that has repayments asks first. Its linked entries are kept, but they lose the link.
- Editing an entry's date moves it to the right day, week and month.
- Restore checks that the file is a valid backup before it replaces anything.

## Tech

- Plain HTML, CSS and JS with no framework and no build step: `index.html`, `app.js`, `style.css`, `manifest.json`, `sw.js` (offline cache) and an icon.
- The totals logic (balances, period sums, debt remaining) lives in pure functions, covered by a small assert-based self-test page (`test.html`).

## Not in v1

CBE or other banks, spending categories, charts, Amharic, reminders or notifications, cloud sync, multiple users, the Ethiopian calendar.

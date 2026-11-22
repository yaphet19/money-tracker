import { load, save } from './store.js';
import { $ } from './ui.js';
import home from './screens/home.js';
import history from './screens/history.js';
import debts from './screens/debts.js';

const tabs = [
  ['home', 'Home', home],
  ['history', 'History', history],
  ['debts', 'Debts', debts],
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

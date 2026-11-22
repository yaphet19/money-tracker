import { uid } from '../logic.js';
import { ask, esc, today } from '../ui.js';

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
    root.addEventListener('click', async ev => {
      const id = ev.target.closest('[data-del]')?.dataset.del;
      if (!id || !(await ask('Delete this to-do?'))) return;
      ctx.state.todos = ctx.state.todos.filter(x => x.id !== id);
      ctx.commit();
    });
  },
};

import { uid } from '../logic.js';
import { t } from '../i18n.js';
import { ask, esc, today } from '../ui.js';

const item = x => `<li class="todo">
  <label><input type="checkbox" data-toggle="${x.id}" ${x.doneDate ? 'checked' : ''}>
    <span>${esc(x.text)}${x.doneDate ? `<br><small>${t('done {date}', { date: x.doneDate })}</small>` : ''}</span></label>
  <button data-del="${x.id}" aria-label="${t('Delete')}">✕</button></li>`;

export default {
  html(state) {
    const open = state.todos.filter(x => !x.doneDate);
    const done = state.todos.filter(x => x.doneDate).sort((a, b) => b.doneDate.localeCompare(a.doneDate));
    return `<form class="card add"><input name="text" placeholder="${t('Something to do…')}" required autocomplete="off" aria-label="${t('New to-do')}"><button class="primary">${t('Add')}</button></form>
      <section class="card"><h3>${t('To do')} <span>${open.length}</span></h3><ul class="list">${open.map(item).join('') || `<li class="muted">${t('All done')}</li>`}</ul></section>
      <section class="card"><h3>${t('Done')} <span>${done.length}</span></h3><ul class="list">${done.map(item).join('') || `<li class="muted">${t('Nothing yet')}</li>`}</ul></section>`;
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
      const x = ctx.state.todos.find(y => y.id === ev.target.dataset.toggle);
      if (!x) return;
      x.doneDate = x.doneDate ? null : today();
      ctx.commit();
    });
    root.addEventListener('click', async ev => {
      const id = ev.target.closest('[data-del]')?.dataset.del;
      if (!id || !(await ask(t('Delete this to-do?')))) return;
      ctx.state.todos = ctx.state.todos.filter(x => x.id !== id);
      ctx.commit();
    });
  },
};

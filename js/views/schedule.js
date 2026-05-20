window.App = window.App || {};
App.views = App.views || {};

App.views.schedule = (() => {
  const SYS_SCOPES = [
    { id: 'today',    label: '今天' },
    { id: 'inbox',    label: '收件箱' },
    { id: 'upcoming', label: '即将到来' },
    { id: 'done',     label: '已完成' },
  ];

  let currentScope = 'today';
  let query = '';
  let unsubscribe = null;
  let _root, _header;

  function scopeFromHash() {
    const m = location.hash.match(/^#\/schedule(?:\/(.+))?$/);
    const sub = m && m[1];
    if (!sub) return 'today';
    if (sub.startsWith('list/')) return 'list:' + sub.slice(5);
    if (['today','inbox','upcoming','done'].includes(sub)) return sub;
    return 'today';
  }

  function scopeToHashSub(scope) {
    if (scope.startsWith('list:')) return 'list/' + scope.slice(5);
    if (scope === 'today') return '';
    return scope;
  }

  function syncHashSilently() {
    const sub = scopeToHashSub(currentScope);
    const target = sub ? `#/schedule/${sub}` : '#/schedule';
    if (location.hash !== target) {
      history.replaceState({}, '', target);
    }
  }

  function setScope(scope) {
    // also validates that list still exists
    if (scope.startsWith('list:')) {
      const id = scope.slice(5);
      const exists = App.store.get().lists.some((l) => l.id === id);
      if (!exists) scope = 'today';
    }
    currentScope = scope;
    syncHashSilently();
    redraw();
    App.refreshNav?.();
  }

  function scopeListId() {
    return currentScope.startsWith('list:') ? currentScope.slice(5) : null;
  }

  function filterTasks(tasks) {
    const u = App.utils;
    let list;
    if (currentScope.startsWith('list:')) {
      const lid = scopeListId();
      list = tasks.filter((t) => !t.completed && t.listId === lid);
    } else {
      switch (currentScope) {
        case 'today':
          list = tasks.filter((t) => !t.completed && t.dueAt && u.isSameDay(t.dueAt, new Date()));
          break;
        case 'inbox':
          list = tasks.filter((t) => !t.completed && !t.listId && !t.dueAt);
          break;
        case 'upcoming':
          list = tasks.filter((t) => !t.completed && t.dueAt && new Date(t.dueAt) > new Date() && !u.isSameDay(t.dueAt, new Date()));
          break;
        case 'done':
          list = tasks.filter((t) => t.completed);
          break;
        default:
          list = tasks;
      }
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.detail || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  function sortTasks(list) {
    return list.slice().sort((a, b) => {
      const qa = (a.importance * 2 + a.urgency);
      const qb = (b.importance * 2 + b.urgency);
      if (qa !== qb) return qb - qa;
      if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function quadrantDot(t) {
    if (t.importance && t.urgency)   return '<span class="w-1.5 h-1.5 rounded-full bg-q1 inline-block"></span>';
    if (t.importance && !t.urgency)  return '<span class="w-1.5 h-1.5 rounded-full bg-q2 inline-block"></span>';
    if (!t.importance && t.urgency)  return '<span class="w-1.5 h-1.5 rounded-full bg-q3 inline-block"></span>';
    return '';
  }

  function listBadge(list) {
    if (!list) return '';
    return `<span class="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              <span class="w-1.5 h-1.5 rounded-full" style="background:${list.color}"></span>${App.utils.escapeHtml(list.name)}
            </span>`;
  }

  function dueChip(t) {
    if (!t.dueAt) return '';
    const u = App.utils;
    const overdue = !t.completed && u.isOverdue(t.dueAt);
    const cls = overdue ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500';
    return `<span class="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded ${cls}">${u.formatDateTime(t.dueAt)}</span>`;
  }

  function taskRow(t, listMap, showListBadge) {
    const esc = App.utils.escapeHtml;
    const list = t.listId ? listMap.get(t.listId) : null;
    return `
      <div class="group flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition border-b border-slate-100 last:border-0" data-task-id="${t.id}">
        <input type="checkbox" class="task-check mt-1" ${t.completed ? 'checked' : ''} data-action="toggle">
        <div class="flex-1 min-w-0 cursor-pointer" data-action="edit">
          <div class="flex items-center gap-2 flex-wrap">
            ${quadrantDot(t)}
            <div class="text-sm ${t.completed ? 'line-through text-slate-400' : 'text-slate-800'} truncate">${esc(t.title)}</div>
          </div>
          ${t.detail ? `<div class="text-xs text-slate-400 mt-0.5 line-clamp-2">${esc(t.detail)}</div>` : ''}
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            ${dueChip(t)}
            ${showListBadge && list ? listBadge(list) : ''}
          </div>
        </div>
        <button class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition px-2" data-action="delete" title="删除">
          ${App.icons.trash(16)}
        </button>
      </div>
    `;
  }

  function chipBar(state) {
    const esc = App.utils.escapeHtml;
    // pre-compute counts via temp scope mutation
    const prev = currentScope;
    const counts = {};
    for (const s of SYS_SCOPES) { currentScope = s.id; counts[s.id] = filterTasks(state.tasks).length; }
    for (const l of state.lists) { currentScope = 'list:' + l.id; counts['list:' + l.id] = filterTasks(state.tasks).length; }
    currentScope = prev;

    const renderChip = (scopeId, label, dot) => {
      const active = scopeId === currentScope;
      const c = counts[scopeId] || 0;
      return `
        <button data-scope="${scopeId}" class="relative shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition
          ${active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-500 hover:text-slate-800'}">
          ${dot || ''}
          ${label}
          ${c > 0 ? `<span class="text-[11px] ${active ? 'text-brand-500' : 'text-slate-400'}">${c}</span>` : ''}
        </button>
      `;
    };

    const sys = SYS_SCOPES.map((s) => renderChip(s.id, s.label)).join('');
    const lists = state.lists.map((l) =>
      renderChip('list:' + l.id, esc(l.name), `<span class="w-2 h-2 rounded-full shrink-0" style="background:${l.color}"></span>`)
    ).join('');

    return `
      <div class="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
        ${sys}
        ${state.lists.length > 0 ? '<span class="shrink-0 w-px h-5 bg-slate-200 mx-1"></span>' : ''}
        ${lists}
        <button id="new-list" class="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 text-xs text-slate-400 hover:text-brand-600 hover:bg-slate-50 rounded-lg whitespace-nowrap" title="新建清单">
          ${App.icons.plus(14)} 新建清单
        </button>
      </div>
    `;
  }

  function emptyState(state) {
    const esc = App.utils.escapeHtml;
    if (query) return `🔍|没有匹配"${esc(query)}"的任务`;
    if (currentScope.startsWith('list:')) {
      const l = state.lists.find((x) => x.id === scopeListId());
      return `📋|清单「${esc(l?.name || '')}」还没有任务`;
    }
    if (currentScope === 'today')    return '✨|今天没有任务，享受空闲';
    if (currentScope === 'inbox')    return '📥|收件箱为空，添加点想法吧';
    if (currentScope === 'upcoming') return '📅|没有即将到来的任务';
    if (currentScope === 'done')     return '🎉|尚未完成任何任务';
    return '|';
  }

  function render(root) {
    const state = App.store.get();
    const listMap = new Map(state.lists.map((l) => [l.id, l]));
    const list = sortTasks(filterTasks(state.tasks));
    const esc = App.utils.escapeHtml;
    const showListBadge = !currentScope.startsWith('list:'); // hide badge if already filtering by list
    const [emoji, emptyMsg] = emptyState(state).split('|');

    root.innerHTML = `
      <div class="max-w-3xl mx-auto">
        <div class="flex items-center gap-2 mb-3 bg-white rounded-xl border border-slate-200 px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition">
          <span class="text-slate-300 shrink-0">${App.icons.search(16)}</span>
          <input id="task-search" type="text" value="${esc(query)}" placeholder="搜索任务..." class="flex-1 outline-none text-sm bg-transparent">
          ${query ? `<button id="task-search-clear" class="text-slate-300 hover:text-slate-500" aria-label="清除">${App.icons.close(14)}</button>` : ''}
        </div>

        ${chipBar(state)}

        <form id="quick-add" class="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2.5 mb-4 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition">
          <span class="text-slate-300 shrink-0">${App.icons.plus(18)}</span>
          <input id="quick-add-title" type="text" placeholder="添加任务，回车保存" class="flex-1 min-w-0 basis-32 outline-none text-sm bg-transparent" maxlength="120">
          <input id="quick-add-date" type="date" class="shrink-0 w-32 text-xs text-slate-500 outline-none bg-transparent" title="截止日期">
          <button type="button" data-toggle="importance" class="shrink-0 text-xs px-2 py-1 rounded text-slate-400 hover:text-q2 hover:bg-slate-50" title="重要">重</button>
          <button type="button" data-toggle="urgency"    class="shrink-0 text-xs px-2 py-1 rounded text-slate-400 hover:text-q1 hover:bg-slate-50" title="紧急">急</button>
        </form>

        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          ${list.length === 0
            ? `<div class="text-center text-slate-400 text-sm py-16">
                 <div class="text-3xl mb-2">${emoji}</div>
                 ${emptyMsg}
               </div>`
            : list.map((t) => taskRow(t, listMap, showListBadge)).join('')}
        </div>
      </div>
    `;
  }

  function renderHeader(headerEl) {
    const state = App.store.get();
    const esc = App.utils.escapeHtml;
    let title = '日程';
    let subtitle = `${App.utils.formatDateLabel(new Date().toISOString())} · ${new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}`;
    let actions = '';
    if (currentScope.startsWith('list:')) {
      const l = state.lists.find((x) => x.id === scopeListId());
      if (l) {
        title = `<span class="inline-flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${l.color}"></span>${esc(l.name)}</span>`;
        const taskCount = state.tasks.filter((t) => t.listId === l.id && !t.completed).length;
        subtitle = `${taskCount} 个未完成任务`;
        actions = `
          <button id="rename-list" class="text-xs px-2 py-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100 inline-flex items-center gap-1">${App.icons.edit(14)} 重命名</button>
          <button id="delete-list" class="text-xs px-2 py-1 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 inline-flex items-center gap-1">${App.icons.trash(14)} 删除</button>
        `;
      }
    }
    headerEl.innerHTML = `
      <div class="max-w-3xl mx-auto flex items-end justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl md:text-2xl font-semibold text-slate-900 truncate">${title}</h1>
          <p class="text-xs text-slate-400 mt-0.5">${subtitle}</p>
        </div>
        <div class="flex items-center gap-1 shrink-0">${actions}</div>
      </div>
    `;
    headerEl.querySelector('#rename-list')?.addEventListener('click', openRenameModal);
    headerEl.querySelector('#delete-list')?.addEventListener('click', confirmDeleteList);
  }

  function bind(root) {
    // search
    const searchEl = root.querySelector('#task-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        query = searchEl.value;
        const pos = searchEl.selectionStart;
        redraw();
        const next = _root.querySelector('#task-search');
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      });
    }
    root.querySelector('#task-search-clear')?.addEventListener('click', () => {
      query = '';
      redraw();
      _root.querySelector('#task-search')?.focus();
    });

    // scope chips
    root.querySelectorAll('[data-scope]').forEach((btn) => {
      btn.addEventListener('click', () => setScope(btn.dataset.scope));
    });

    // new list
    root.querySelector('#new-list')?.addEventListener('click', openNewListModal);

    // task interactions
    root.querySelectorAll('[data-task-id]').forEach((row) => {
      const id = row.dataset.taskId;
      row.querySelector('[data-action="toggle"]').addEventListener('change', () => App.store.toggleTask(id));
      row.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(id));
      row.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const snapshot = App.store.deleteTask(id);
        if (snapshot) {
          App.toast.show({
            message: `已删除「${snapshot.task.title}」`,
            actionLabel: '撤销',
            onAction: () => App.store.restoreTask(snapshot),
          });
        }
      });
    });

    // quick add
    const form = root.querySelector('#quick-add');
    const titleEl = root.querySelector('#quick-add-title');
    const dateEl = root.querySelector('#quick-add-date');
    let flags = { importance: 0, urgency: 0 };

    root.querySelectorAll('[data-toggle]').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.toggle;
        flags[k] = flags[k] ? 0 : 1;
        if (flags[k]) {
          if (k === 'importance') b.classList.add('bg-blue-50', 'text-q2'); else b.classList.add('bg-red-50', 'text-q1');
        } else {
          b.classList.remove('bg-blue-50', 'text-q2', 'bg-red-50', 'text-q1');
        }
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = titleEl.value.trim();
      if (!title) return;
      let dueAt = null;
      if (dateEl.value) {
        const d = App.utils.fromDateKey(dateEl.value);
        d.setHours(9, 0, 0, 0);
        dueAt = d.toISOString();
      } else if (currentScope === 'today') {
        const d = new Date();
        d.setHours(9, 0, 0, 0);
        dueAt = d.toISOString();
      }
      const listId = scopeListId();
      App.store.addTask({ title, dueAt, listId, importance: flags.importance, urgency: flags.urgency });
      titleEl.value = '';
      dateEl.value = '';
      flags = { importance: 0, urgency: 0 };
      root.querySelectorAll('[data-toggle]').forEach((b) => b.classList.remove('bg-blue-50', 'text-q2', 'bg-red-50', 'text-q1'));
      titleEl.focus();
    });
  }

  function openEditModal(id) {
    const t = App.store.get().tasks.find((x) => x.id === id);
    if (!t) return;
    const lists = App.store.get().lists;
    const dueDate = t.dueAt ? App.utils.toDateKey(t.dueAt) : '';
    const dueTime = t.dueAt ? App.utils.formatTime(t.dueAt) : '';
    const esc = App.utils.escapeHtml;
    const listOptions = `
      <option value="" ${!t.listId ? 'selected' : ''}>无（收件箱）</option>
      ${lists.map((l) => `<option value="${l.id}" ${t.listId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
    `;
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">编辑任务</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <div class="space-y-3">
          <input id="m-title" value="${esc(t.title)}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400" placeholder="任务标题">
          <textarea id="m-detail" rows="3" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 resize-none" placeholder="备注">${esc(t.detail)}</textarea>
          <div>
            <label class="text-xs text-slate-500 mb-1 block">清单</label>
            <select id="m-list" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 bg-white">${listOptions}</select>
          </div>
          <div class="flex items-center gap-2">
            <input id="m-date" type="date" value="${dueDate}" class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400">
            <input id="m-time" type="time" value="${dueTime}" class="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400">
          </div>
          <div class="flex items-center gap-3 text-sm">
            <label class="inline-flex items-center gap-1.5 cursor-pointer">
              <input id="m-imp" type="checkbox" ${t.importance ? 'checked' : ''} class="rounded"> 重要
            </label>
            <label class="inline-flex items-center gap-1.5 cursor-pointer">
              <input id="m-urg" type="checkbox" ${t.urgency ? 'checked' : ''} class="rounded"> 紧急
            </label>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="m-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">保存</button>
        </div>
      </div>
    `);
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelector('#m-save').addEventListener('click', () => {
      const title = panel.querySelector('#m-title').value.trim() || '未命名任务';
      const detail = panel.querySelector('#m-detail').value;
      const date = panel.querySelector('#m-date').value;
      const time = panel.querySelector('#m-time').value;
      const listIdVal = panel.querySelector('#m-list').value || null;
      let dueAt = null;
      if (date) {
        const d = App.utils.fromDateKey(date);
        if (time) {
          const [hh, mm] = time.split(':').map(Number);
          d.setHours(hh, mm, 0, 0);
        } else {
          d.setHours(9, 0, 0, 0);
        }
        dueAt = d.toISOString();
      }
      App.store.updateTask(t.id, {
        title,
        detail,
        listId: listIdVal,
        dueAt,
        importance: panel.querySelector('#m-imp').checked ? 1 : 0,
        urgency: panel.querySelector('#m-urg').checked ? 1 : 0,
      });
      App.modal.close();
    });
    setTimeout(() => panel.querySelector('#m-title').focus(), 30);
  }

  function openNewListModal() {
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">新建清单</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <input id="nl-name" placeholder="清单名称（如：阅读、家务）" maxlength="20"
               class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 mb-3">
        <div class="text-xs text-slate-500 mb-1.5">颜色</div>
        <div id="nl-colors" class="flex items-center gap-2 flex-wrap">
          ${['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#a855f7','#ec4899','#64748b']
            .map((c, i) => `<button type="button" data-color="${c}" class="w-7 h-7 rounded-full border-2 ${i===0?'border-slate-800':'border-transparent'}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="nl-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">创建</button>
        </div>
      </div>
    `);
    let pickedColor = '#6366f1';
    panel.querySelectorAll('[data-color]').forEach((b) => {
      b.addEventListener('click', () => {
        pickedColor = b.dataset.color;
        panel.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('border-slate-800', x === b));
        panel.querySelectorAll('[data-color]').forEach((x) => { if (x !== b) x.classList.add('border-transparent'); });
      });
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    const save = () => {
      const name = panel.querySelector('#nl-name').value.trim();
      if (!name) { App.modal.close(); return; }
      const l = App.store.addList({ name, color: pickedColor });
      App.modal.close();
      setScope('list:' + l.id);
    };
    panel.querySelector('#nl-save').addEventListener('click', save);
    panel.querySelector('#nl-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    setTimeout(() => panel.querySelector('#nl-name').focus(), 30);
  }

  function openRenameModal() {
    const id = scopeListId();
    const l = App.store.get().lists.find((x) => x.id === id);
    if (!l) return;
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">重命名清单</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <input id="rl-name" value="${App.utils.escapeHtml(l.name)}" maxlength="20"
               class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 mb-3">
        <div class="text-xs text-slate-500 mb-1.5">颜色</div>
        <div id="rl-colors" class="flex items-center gap-2 flex-wrap">
          ${['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#a855f7','#ec4899','#64748b']
            .map((c) => `<button type="button" data-color="${c}" class="w-7 h-7 rounded-full border-2 ${c===l.color?'border-slate-800':'border-transparent'}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="rl-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">保存</button>
        </div>
      </div>
    `);
    let pickedColor = l.color;
    panel.querySelectorAll('[data-color]').forEach((b) => {
      b.addEventListener('click', () => {
        pickedColor = b.dataset.color;
        panel.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('border-slate-800', x === b));
        panel.querySelectorAll('[data-color]').forEach((x) => { if (x !== b) x.classList.add('border-transparent'); });
      });
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelector('#rl-save').addEventListener('click', () => {
      const name = panel.querySelector('#rl-name').value.trim() || l.name;
      App.store.updateList(l.id, { name, color: pickedColor });
      App.modal.close();
    });
  }

  function confirmDeleteList() {
    const id = scopeListId();
    const l = App.store.get().lists.find((x) => x.id === id);
    if (!l) return;
    const taskCount = App.store.get().tasks.filter((t) => t.listId === l.id).length;
    const msg = taskCount > 0
      ? `删除清单「${l.name}」？其下 ${taskCount} 个任务将移动到收件箱。`
      : `删除清单「${l.name}」？`;
    if (!confirm(msg)) return;
    const snapshot = App.store.deleteList(l.id);
    setScope('today');
    if (snapshot) {
      App.toast.show({
        message: `已删除清单「${snapshot.list.name}」`,
        actionLabel: '撤销',
        onAction: () => {
          App.store.restoreList(snapshot);
          setScope('list:' + snapshot.list.id);
        },
      });
    }
  }

  function redraw() {
    render(_root);
    renderHeader(_header);
    bind(_root);
  }

  function mount(root, header) {
    _root = root; _header = header;
    currentScope = scopeFromHash();
    // validate list exists
    if (currentScope.startsWith('list:')) {
      const id = currentScope.slice(5);
      if (!App.store.get().lists.some((l) => l.id === id)) currentScope = 'today';
    }
    syncHashSilently();
    redraw();
    unsubscribe = App.store.subscribe(redraw);
    return () => { if (unsubscribe) unsubscribe(); };
  }

  return { mount, openEditModal, setScope, openNewListModal };
})();

window.App = window.App || {};
App.views = App.views || {};

App.views.schedule = (() => {
  // Time window filter — orthogonal to group selection.
  const TIME_WINDOWS = [
    { id: 'all',      label: '全部' },
    { id: 'today',    label: '今天' },
    { id: 'tomorrow', label: '明天' },
    { id: 'week',     label: '近一周' },
  ];

  // Group / scope — chosen via group nav (desktop) or mobile sheet.
  // Values: 'all' | 'inbox' | 'list:<id>'
  let currentGroup = 'all';
  let currentWindow = 'all';
  let query = '';
  let showCompleted = false; // folded by default
  let unsubscribe = null;
  let _root, _header;

  function groupFromHash() {
    const m = location.hash.match(/^#\/schedule(?:\/(.+))?$/);
    const sub = m && m[1];
    if (!sub) return 'all';
    if (sub === 'inbox') return 'inbox';
    if (sub.startsWith('list/')) return 'list:' + sub.slice(5);
    return 'all';
  }

  function groupToHashSub(g) {
    if (g === 'all') return '';
    if (g === 'inbox') return 'inbox';
    if (g.startsWith('list:')) return 'list/' + g.slice(5);
    return '';
  }

  function syncHashSilently() {
    const sub = groupToHashSub(currentGroup);
    const target = sub ? `#/schedule/${sub}` : '#/schedule';
    if (location.hash !== target) history.replaceState({}, '', target);
  }

  function setGroup(g) {
    if (g.startsWith('list:')) {
      const id = g.slice(5);
      if (!App.store.get().lists.some((l) => l.id === id)) g = 'all';
    }
    currentGroup = g;
    syncHashSilently();
    redraw();
    App.refreshNav?.();
  }

  function setTimeWindow(w) {
    currentWindow = w;
    redraw();
  }

  function groupListId() {
    return currentGroup.startsWith('list:') ? currentGroup.slice(5) : null;
  }

  function groupLabel(state) {
    if (currentGroup === 'all') return '全部分组';
    if (currentGroup === 'inbox') return '任务箱';
    const l = state.lists.find((x) => x.id === groupListId());
    return l?.name || '清单';
  }

  function groupColor(state) {
    if (currentGroup.startsWith('list:')) {
      const l = state.lists.find((x) => x.id === groupListId());
      return l?.color || null;
    }
    return null;
  }

  // ---------- Filtering ----------
  function matchesGroup(t) {
    if (currentGroup === 'all') return true;
    if (currentGroup === 'inbox') return !t.listId;
    if (currentGroup.startsWith('list:')) return t.listId === groupListId();
    return true;
  }

  function matchesWindow(t) {
    const u = App.utils;
    if (currentWindow === 'all') return true;
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    const today0 = u.startOfDay(new Date());
    if (currentWindow === 'today') return u.isSameDay(d, new Date());
    if (currentWindow === 'tomorrow') {
      const tom = new Date(today0); tom.setDate(tom.getDate() + 1);
      return u.isSameDay(d, tom);
    }
    if (currentWindow === 'week') {
      const day7 = new Date(today0); day7.setDate(day7.getDate() + 7);
      return d >= today0 && d < day7;
    }
    return true;
  }

  function matchesQuery(t) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (t.title || '').toLowerCase().includes(q) ||
           (t.detail || '').toLowerCase().includes(q);
  }

  function activeTasks(tasks) {
    return tasks.filter((t) => !t.completed && matchesGroup(t) && matchesWindow(t) && matchesQuery(t));
  }

  function completedTasks(tasks) {
    return tasks.filter((t) => t.completed && matchesGroup(t) && matchesWindow(t) && matchesQuery(t));
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

  // ---------- Priority flag (4-state cycle via importance × urgency) ----------
  const FLAG_STATES = [
    { imp: 0, urg: 0, color: '#cbd5e1', label: '无' },        // gray
    { imp: 1, urg: 1, color: '#ef4444', label: '重要紧急' },   // red
    { imp: 1, urg: 0, color: '#f59e0b', label: '重要' },       // orange
    { imp: 0, urg: 1, color: '#3b82f6', label: '紧急' },       // blue
  ];

  function currentFlagIndex(t) {
    return FLAG_STATES.findIndex((s) => s.imp === t.importance && s.urg === t.urgency);
  }

  function flagOf(t) {
    const idx = Math.max(0, currentFlagIndex(t));
    return FLAG_STATES[idx];
  }

  function cycleFlag(t) {
    const cur = currentFlagIndex(t);
    const next = FLAG_STATES[(cur + 1) % FLAG_STATES.length];
    App.store.updateTask(t.id, { importance: next.imp, urgency: next.urg });
  }

  // ---------- Date chip ----------
  function dueChip(t) {
    if (!t.dueAt) return '';
    const u = App.utils;
    const d = new Date(t.dueAt);
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const overdue = !t.completed && u.isOverdue(t.dueAt);
    const isToday = u.isSameDay(d, today);
    const isTomorrow = u.isSameDay(d, tomorrow);
    const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0);
    let label;
    if (isToday) label = hasTime ? u.formatTime(t.dueAt) : '今天';
    else if (isTomorrow) label = '明天';
    else label = `${d.getMonth() + 1 < 10 ? '0' : ''}${d.getMonth() + 1}-${d.getDate() < 10 ? '0' : ''}${d.getDate()}`;
    const cls = overdue ? 'text-red-500' : 'text-slate-400';
    return `<span class="inline-flex items-center gap-1 text-xs ${cls}">${App.icons.clock(13)}<span class="tabular-nums">${label}</span></span>`;
  }

  // ---------- Task row ----------
  function taskRow(t, listMap, showListBadge) {
    const esc = App.utils.escapeHtml;
    const list = t.listId ? listMap.get(t.listId) : null;
    const flag = flagOf(t);
    const flagHtml = `<button data-action="flag" class="text-slate-300 hover:opacity-80 transition shrink-0" title="${flag.label}" style="color:${flag.color}">${App.icons.flagFill(15)}</button>`;
    return `
      <div class="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition border-b border-slate-100 last:border-0" data-task-id="${t.id}">
        <input type="checkbox" class="task-check shrink-0" ${t.completed ? 'checked' : ''} data-action="toggle">
        <div class="flex-1 min-w-0 cursor-pointer" data-action="edit">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="text-sm ${t.completed ? 'line-through text-slate-400' : 'text-slate-800'} truncate">${esc(t.title)}</div>
            ${showListBadge && list ? `<span class="inline-flex items-center gap-1 text-[10px] text-slate-400"><span class="w-1.5 h-1.5 rounded-full" style="background:${list.color}"></span>${esc(list.name)}</span>` : ''}
          </div>
          ${t.detail ? `<div class="text-xs text-slate-400 mt-0.5 truncate">${esc(t.detail)}</div>` : ''}
        </div>
        <button data-action="subtask" class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-brand-600 transition shrink-0" title="子任务（即将上线）">${App.icons.plus(15)}</button>
        ${flagHtml}
        <div class="shrink-0 w-16 text-right">${dueChip(t)}</div>
      </div>
    `;
  }

  // ---------- Render ----------
  function emptyState(state) {
    const esc = App.utils.escapeHtml;
    if (query) return ['🔍', `没有匹配"${esc(query)}"的任务`];
    if (currentWindow === 'today')    return ['✨', '今天没有任务，享受空闲'];
    if (currentWindow === 'tomorrow') return ['🌤', '明天还没安排'];
    if (currentWindow === 'week')     return ['📅', '近一周没有任务'];
    if (currentGroup === 'inbox')     return ['📥', '任务箱为空，添加点想法吧'];
    if (currentGroup.startsWith('list:')) {
      const l = state.lists.find((x) => x.id === groupListId());
      return ['📋', `清单「${esc(l?.name || '')}」还没有任务`];
    }
    return ['✨', '所有任务都做完了'];
  }

  function timeTabRow() {
    return `
      <div class="flex items-center gap-1 mb-3 border-b border-slate-200">
        ${TIME_WINDOWS.map((w) => {
          const active = w.id === currentWindow;
          return `
            <button data-window="${w.id}"
                    class="relative px-3 md:px-4 py-2.5 text-sm whitespace-nowrap transition
                           ${active ? 'text-brand-700 font-medium' : 'text-slate-500 hover:text-slate-800'}">
              ${w.label}
              ${active ? '<span class="absolute left-2 right-2 -bottom-px h-0.5 bg-brand-600 rounded-full"></span>' : ''}
            </button>
          `;
        }).join('')}
        <div class="flex-1"></div>
        <div class="hidden md:flex items-center gap-2 pr-2">
          <div class="relative">
            <input id="task-search" type="text" value="${App.utils.escapeHtml(query)}" placeholder="搜索"
                   class="w-40 lg:w-48 pl-8 pr-2 py-1.5 text-sm bg-slate-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-brand-100">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">${App.icons.search(14)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function render(root) {
    const state = App.store.get();
    const listMap = new Map(state.lists.map((l) => [l.id, l]));
    const active = sortTasks(activeTasks(state.tasks));
    const done = completedTasks(state.tasks);
    const showListBadge = currentGroup === 'all';
    const groupName = groupLabel(state);
    const esc = App.utils.escapeHtml;
    const [emoji, emptyMsg] = emptyState(state);

    root.innerHTML = `
      <div class="max-w-4xl mx-auto pt-1">
        ${timeTabRow()}

        <!-- Mobile search -->
        <div class="md:hidden flex items-center gap-2 mb-3 bg-white rounded-xl border border-slate-200 px-3 py-2">
          <span class="text-slate-300 shrink-0">${App.icons.search(15)}</span>
          <input id="task-search-mobile" type="text" value="${esc(query)}" placeholder="搜索任务..." class="flex-1 outline-none text-sm bg-transparent">
        </div>

        <!-- Quick add -->
        <form id="quick-add" class="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2.5 mb-3 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition">
          <span class="text-slate-300 shrink-0">${App.icons.plus(18)}</span>
          <input id="quick-add-title" type="text" placeholder="添加任务到「${esc(groupName)}」" class="flex-1 min-w-0 outline-none text-sm bg-transparent" maxlength="120">
          <input id="quick-add-date" type="date" class="shrink-0 w-32 text-xs text-slate-500 outline-none bg-transparent" title="截止日期">
          <button id="quick-submit" type="submit" class="shrink-0 w-7 h-7 rounded-full bg-brand-600 hover:bg-brand-700 text-white inline-flex items-center justify-center" title="保存（回车）">
            ${App.icons.chevronR(16)}
          </button>
        </form>

        <!-- Active tasks -->
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          ${active.length === 0
            ? `<div class="text-center text-slate-400 text-sm py-12">
                 <div class="text-3xl mb-2">${emoji}</div>
                 ${emptyMsg}
               </div>`
            : active.map((t) => taskRow(t, listMap, showListBadge)).join('')}
        </div>

        <!-- Completed section -->
        ${done.length > 0 ? `
          <button id="toggle-done" class="mt-4 mb-2 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
            <span class="${showCompleted ? 'rotate-90' : ''} transition-transform inline-block">${App.icons.chevronR(14)}</span>
            已完成
            <span class="text-xs text-slate-400 tabular-nums">${done.length}</span>
          </button>
          ${showCompleted ? `
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
              ${done.map((t) => taskRow(t, listMap, showListBadge)).join('')}
            </div>
          ` : ''}
        ` : ''}
      </div>
    `;
  }

  // ---------- Header ----------
  function renderHeader(headerEl) {
    const state = App.store.get();
    const esc = App.utils.escapeHtml;
    const name = groupLabel(state);
    const color = groupColor(state);
    const dot = color ? `<span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${color}"></span>` : '';
    const subtitle = currentWindow === 'all'
      ? `${state.tasks.filter((t) => !t.completed && matchesGroup(t)).length} 个未完成`
      : (TIME_WINDOWS.find((w) => w.id === currentWindow)?.label || '');

    headerEl.innerHTML = `
      <div class="max-w-4xl mx-auto flex items-end justify-between gap-3">
        <div class="min-w-0 flex items-end gap-2">
          <button id="scope-picker" class="md:hidden text-slate-500 hover:bg-slate-100 rounded-lg p-1 -ml-1" title="切换清单">${App.icons.chevronD ? App.icons.chevronD(20) : App.icons.chevronR(20)}</button>
          <div class="min-w-0">
            <h1 class="text-xl md:text-2xl font-semibold text-slate-900 truncate inline-flex items-center gap-2">${dot}${esc(name)}</h1>
            <p class="text-xs text-slate-400 mt-0.5">${esc(subtitle)}</p>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${currentGroup.startsWith('list:') ? `
            <button id="rename-list" class="text-xs px-2 py-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100 inline-flex items-center gap-1">${App.icons.edit(14)} 重命名</button>
            <button id="delete-list" class="text-xs px-2 py-1 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 inline-flex items-center gap-1">${App.icons.trash(14)} 删除</button>
          ` : ''}
        </div>
      </div>
    `;
    headerEl.querySelector('#rename-list')?.addEventListener('click', openRenameModal);
    headerEl.querySelector('#delete-list')?.addEventListener('click', confirmDeleteList);
    headerEl.querySelector('#scope-picker')?.addEventListener('click', openGroupSheet);
  }

  // ---------- Mobile group sheet ----------
  function openGroupSheet() {
    const state = App.store.get();
    const esc = App.utils.escapeHtml;
    const allCount   = state.tasks.filter((t) => !t.completed).length;
    const inboxCount = state.tasks.filter((t) => !t.completed && !t.listId).length;
    const row = (id, leading, label, count, active) => `
      <button data-pick="${id}" class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg
        ${active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}">
        <span class="w-5 inline-flex justify-center ${active ? 'text-brand-600' : 'text-slate-400'}">${leading}</span>
        <span class="flex-1">${label}</span>
        ${count > 0 ? `<span class="text-xs text-slate-400 tabular-nums">${count}</span>` : ''}
      </button>
    `;
    const listsHtml = state.lists.map((l) => {
      const c = state.tasks.filter((t) => t.listId === l.id && !t.completed).length;
      return row('list:' + l.id,
        `<span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${l.color}"></span>`,
        esc(l.name), c, currentGroup === 'list:' + l.id);
    }).join('');

    const panel = App.modal.open(`
      <div class="p-3">
        <div class="flex items-center justify-between px-2 pt-1 pb-2">
          <h3 class="text-sm font-semibold text-slate-900">选择清单</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        ${row('all',   App.icons.list(16),  '全部分组', allCount,   currentGroup === 'all')}
        ${row('inbox', App.icons.inbox(16), '任务箱',   inboxCount, currentGroup === 'inbox')}
        ${state.lists.length > 0 ? `
          <div class="mt-3 mb-1 px-3 text-[11px] text-slate-400 uppercase tracking-wider">我的清单</div>
          ${listsHtml}
        ` : ''}
        <button id="sheet-new-list" class="w-full mt-2 px-4 py-3 text-left text-sm text-slate-500 hover:bg-slate-50 rounded-lg inline-flex items-center gap-3">
          <span class="w-5 inline-flex justify-center text-slate-400">${App.icons.plus(16)}</span>
          新建清单
        </button>
      </div>
    `);
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelectorAll('[data-pick]').forEach((b) => {
      b.addEventListener('click', () => { App.modal.close(); setGroup(b.dataset.pick); });
    });
    panel.querySelector('#sheet-new-list')?.addEventListener('click', () => { App.modal.close(); openNewListModal(); });
  }

  // ---------- Bind handlers ----------
  function bind(root) {
    // Time window tabs
    root.querySelectorAll('[data-window]').forEach((btn) => {
      btn.addEventListener('click', () => setTimeWindow(btn.dataset.window));
    });

    // Desktop search
    const search = root.querySelector('#task-search');
    if (search) {
      search.addEventListener('input', () => {
        query = search.value;
        const pos = search.selectionStart;
        redraw();
        const next = _root.querySelector('#task-search');
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      });
    }
    // Mobile search
    const searchM = root.querySelector('#task-search-mobile');
    if (searchM) {
      searchM.addEventListener('input', () => {
        query = searchM.value;
        const pos = searchM.selectionStart;
        redraw();
        const next = _root.querySelector('#task-search-mobile');
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      });
    }

    // Toggle completed section
    root.querySelector('#toggle-done')?.addEventListener('click', () => {
      showCompleted = !showCompleted;
      redraw();
    });

    // Task interactions
    root.querySelectorAll('[data-task-id]').forEach((row) => {
      const id = row.dataset.taskId;
      row.querySelector('[data-action="toggle"]').addEventListener('change', () => App.store.toggleTask(id));
      row.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(id));
      row.querySelector('[data-action="flag"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = App.store.get().tasks.find((x) => x.id === id);
        if (t) cycleFlag(t);
      });
      row.querySelector('[data-action="subtask"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        App.toast.show({ message: '子任务即将上线', duration: 1800 });
      });
    });

    // Quick add
    const form = root.querySelector('#quick-add');
    const titleEl = root.querySelector('#quick-add-title');
    const dateEl = root.querySelector('#quick-add-date');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = titleEl.value.trim();
      if (!title) return;
      let dueAt = null;
      if (dateEl.value) {
        const d = App.utils.fromDateKey(dateEl.value);
        d.setHours(9, 0, 0, 0);
        dueAt = d.toISOString();
      } else if (currentWindow === 'today') {
        const d = new Date();
        d.setHours(9, 0, 0, 0);
        dueAt = d.toISOString();
      } else if (currentWindow === 'tomorrow') {
        const d = new Date(); d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        dueAt = d.toISOString();
      }
      const listId = groupListId();
      App.store.addTask({ title, dueAt, listId, importance: 0, urgency: 0 });
      titleEl.value = '';
      dateEl.value = '';
      titleEl.focus();
    });
  }

  // ---------- Edit modal ----------
  function openEditModal(id) {
    const t = App.store.get().tasks.find((x) => x.id === id);
    if (!t) return;
    const lists = App.store.get().lists;
    const dueDate = t.dueAt ? App.utils.toDateKey(t.dueAt) : '';
    const dueTime = t.dueAt ? App.utils.formatTime(t.dueAt) : '';
    const esc = App.utils.escapeHtml;
    const listOptions = `
      <option value="" ${!t.listId ? 'selected' : ''}>任务箱（无清单）</option>
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
          <div>
            <label class="text-xs text-slate-500 mb-1.5 block">优先级</label>
            <div id="m-flags" class="flex items-center gap-2">
              ${FLAG_STATES.map((s, i) => `
                <button type="button" data-flag-idx="${i}" class="w-9 h-9 rounded-lg border-2 ${s.imp === t.importance && s.urg === t.urgency ? 'border-slate-700' : 'border-transparent'} inline-flex items-center justify-center hover:bg-slate-50" title="${s.label}">
                  <span style="color:${s.color}">${App.icons.flagFill(16)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="m-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">保存</button>
        </div>
      </div>
    `);
    let picked = { imp: t.importance, urg: t.urgency };
    panel.querySelectorAll('[data-flag-idx]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.flagIdx);
        picked = { imp: FLAG_STATES[i].imp, urg: FLAG_STATES[i].urg };
        panel.querySelectorAll('[data-flag-idx]').forEach((x) => x.classList.toggle('border-slate-700', x === b));
        panel.querySelectorAll('[data-flag-idx]').forEach((x) => { if (x !== b) x.classList.add('border-transparent'); });
      });
    });
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
        title, detail, listId: listIdVal, dueAt,
        importance: picked.imp, urgency: picked.urg,
      });
      App.modal.close();
    });
    setTimeout(() => panel.querySelector('#m-title').focus(), 30);
  }

  // ---------- List CRUD modals ----------
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
      setGroup('list:' + l.id);
    };
    panel.querySelector('#nl-save').addEventListener('click', save);
    panel.querySelector('#nl-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    setTimeout(() => panel.querySelector('#nl-name').focus(), 30);
  }

  function openRenameModal() {
    const id = groupListId();
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
    const id = groupListId();
    const l = App.store.get().lists.find((x) => x.id === id);
    if (!l) return;
    const taskCount = App.store.get().tasks.filter((t) => t.listId === l.id).length;
    const msg = taskCount > 0
      ? `删除清单「${l.name}」？其下 ${taskCount} 个任务将移动到任务箱。`
      : `删除清单「${l.name}」？`;
    if (!confirm(msg)) return;
    const snapshot = App.store.deleteList(l.id);
    setGroup('all');
    if (snapshot) {
      App.toast.show({
        message: `已删除清单「${snapshot.list.name}」`,
        actionLabel: '撤销',
        onAction: () => {
          App.store.restoreList(snapshot);
          setGroup('list:' + snapshot.list.id);
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
    currentGroup = groupFromHash();
    if (currentGroup.startsWith('list:')) {
      const id = currentGroup.slice(5);
      if (!App.store.get().lists.some((l) => l.id === id)) currentGroup = 'all';
    }
    syncHashSilently();
    redraw();
    unsubscribe = App.store.subscribe(redraw);
    return () => { if (unsubscribe) unsubscribe(); };
  }

  return { mount, openEditModal, setGroup, openNewListModal };
})();

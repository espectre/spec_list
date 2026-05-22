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

  // Sort options for the 优先级 ▼ toolbar dropdown.
  const SORT_OPTIONS = [
    { id: 'default',   label: '默认（优先级 + 时间）' },
    { id: 'priority',  label: '优先级' },
    { id: 'dueAt',     label: '截止时间' },
    { id: 'createdAt', label: '创建时间（最近）' },
    { id: 'title',     label: '标题（A→Z）' },
  ];

  // Group / scope — chosen via group nav (desktop) or mobile sheet.
  // Values: 'all' | 'inbox' | 'list:<id>' | 'tag:<id>'
  let currentGroup = 'all';
  let currentWindow = 'all';
  let query = '';
  let sortBy = 'default';
  let filterTagIds = [];          // multi-tag filter applied on top of group
  let showCompleted = false;      // folded by default
  // Quick-add transient state (lives until submit or group change)
  let qa = { dueAt: null, listId: null, importance: 0, urgency: 0, tagIds: [] };
  let qaTitle = '';   // preserved across redraws so chip pickers don't clobber what user is typing
  let unsubscribe = null;
  let _root, _header;

  function resetQA() {
    qa = { dueAt: null, listId: groupListId(), importance: 0, urgency: 0, tagIds: [] };
  }

  function groupFromHash() {
    const m = location.hash.match(/^#\/schedule(?:\/(.+))?$/);
    const sub = m && m[1];
    if (!sub) return 'all';
    if (sub === 'inbox') return 'inbox';
    if (sub.startsWith('list/')) return 'list:' + sub.slice(5);
    if (sub.startsWith('tag/'))  return 'tag:'  + sub.slice(4);
    return 'all';
  }

  function groupToHashSub(g) {
    if (g === 'all') return '';
    if (g === 'inbox') return 'inbox';
    if (g.startsWith('list:')) return 'list/' + g.slice(5);
    if (g.startsWith('tag:'))  return 'tag/'  + g.slice(4);
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
    } else if (g.startsWith('tag:')) {
      const id = g.slice(4);
      if (!App.store.get().tags.some((tg) => tg.id === id)) g = 'all';
    }
    currentGroup = g;
    resetQA();
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

  function groupTagId() {
    return currentGroup.startsWith('tag:') ? currentGroup.slice(4) : null;
  }

  function groupLabel(state) {
    if (currentGroup === 'all') return '全部分组';
    if (currentGroup === 'inbox') return '任务箱';
    if (currentGroup.startsWith('list:')) {
      const l = state.lists.find((x) => x.id === groupListId());
      return l?.name || '清单';
    }
    if (currentGroup.startsWith('tag:')) {
      const tg = state.tags.find((x) => x.id === groupTagId());
      return tg ? `#${tg.name}` : '标签';
    }
    return '清单';
  }

  function groupColor(state) {
    if (currentGroup.startsWith('list:')) {
      const l = state.lists.find((x) => x.id === groupListId());
      return l?.color || null;
    }
    if (currentGroup.startsWith('tag:')) {
      const tg = state.tags.find((x) => x.id === groupTagId());
      return tg?.color || null;
    }
    return null;
  }

  // ---------- Filtering ----------
  function matchesGroup(t) {
    if (currentGroup === 'all') return true;
    if (currentGroup === 'inbox') return !t.listId;
    if (currentGroup.startsWith('list:')) return t.listId === groupListId();
    if (currentGroup.startsWith('tag:')) {
      const tid = groupTagId();
      return Array.isArray(t.tagIds) && t.tagIds.includes(tid);
    }
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

  function matchesFilterTags(t) {
    if (filterTagIds.length === 0) return true;
    const set = new Set(t.tagIds || []);
    // OR semantics: task must have at least one of the selected tags
    return filterTagIds.some((id) => set.has(id));
  }

  function activeTasks(tasks) {
    return tasks.filter((t) => !t.completed && matchesGroup(t) && matchesWindow(t) && matchesQuery(t) && matchesFilterTags(t));
  }

  function completedTasks(tasks) {
    return tasks.filter((t) => t.completed && matchesGroup(t) && matchesWindow(t) && matchesQuery(t) && matchesFilterTags(t));
  }

  function sortTasks(list) {
    const arr = list.slice();
    switch (sortBy) {
      case 'priority':
        return arr.sort((a, b) => (b.importance * 2 + b.urgency) - (a.importance * 2 + a.urgency));
      case 'dueAt':
        return arr.sort((a, b) => {
          if (!a.dueAt && !b.dueAt) return 0;
          if (!a.dueAt) return 1;
          if (!b.dueAt) return -1;
          return new Date(a.dueAt) - new Date(b.dueAt);
        });
      case 'createdAt':
        return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'title':
        return arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN'));
      default:
        return arr.sort((a, b) => {
          const qa_ = (a.importance * 2 + a.urgency);
          const qb_ = (b.importance * 2 + b.urgency);
          if (qa_ !== qb_) return qb_ - qa_;
          if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
          if (a.dueAt) return -1;
          if (b.dueAt) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }
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
    const repeatIcon = (t.repeat && t.repeat.rule)
      ? `<span class="text-slate-400 inline-flex items-center" title="重复任务">${App.icons.repeat(11)}</span>`
      : '';
    const bellIcon = (t.reminder && Number.isFinite(t.reminder.offsetMinutes))
      ? `<span class="text-slate-400 inline-flex items-center" title="有提醒">${App.icons.bell(11)}</span>`
      : '';
    return `<span class="inline-flex items-center gap-1 text-xs ${cls}">${repeatIcon}${bellIcon}${App.icons.clock(13)}<span class="tabular-nums">${label}</span></span>`;
  }

  // ---------- Task row ----------
  function tagChips(t, tagMap, max = 3) {
    if (!Array.isArray(t.tagIds) || t.tagIds.length === 0) return '';
    const esc = App.utils.escapeHtml;
    const items = t.tagIds.slice(0, max).map((id) => {
      const tg = tagMap.get(id);
      if (!tg) return '';
      return `<span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded" style="background:${tg.color}1a;color:${tg.color}">#${esc(tg.name)}</span>`;
    }).filter(Boolean).join('');
    const more = t.tagIds.length > max ? `<span class="text-[10px] text-slate-400">+${t.tagIds.length - max}</span>` : '';
    return items + more;
  }

  function taskRow(t, listMap, tagMap, showListBadge) {
    const esc = App.utils.escapeHtml;
    const list = t.listId ? listMap.get(t.listId) : null;
    const flag = flagOf(t);
    const flagHtml = `<button data-action="flag" class="text-slate-300 hover:opacity-80 transition shrink-0" title="${flag.label}" style="color:${flag.color}">${App.icons.flagFill(15)}</button>`;
    const tags = tagChips(t, tagMap);
    return `
      <div class="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition border-b border-slate-100 last:border-0" data-task-id="${t.id}">
        <input type="checkbox" class="task-check shrink-0" ${t.completed ? 'checked' : ''} data-action="toggle">
        <div class="flex-1 min-w-0 cursor-pointer" data-action="edit">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="text-sm ${t.completed ? 'line-through text-slate-400' : 'text-slate-800'} truncate">${esc(t.title)}</div>
            ${showListBadge && list ? `<span class="inline-flex items-center gap-1 text-[10px] text-slate-400"><span class="w-1.5 h-1.5 rounded-full" style="background:${list.color}"></span>${esc(list.name)}</span>` : ''}
            ${tags ? `<span class="inline-flex items-center gap-1">${tags}</span>` : ''}
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
    if (currentGroup.startsWith('tag:')) {
      const tg = state.tags.find((x) => x.id === groupTagId());
      return ['🏷', `标签「${esc(tg?.name || '')}」下还没有任务`];
    }
    return ['✨', '所有任务都做完了'];
  }

  function timeTabRow() {
    const sortActive = sortBy !== 'default';
    const sortLabel = sortActive ? (SORT_OPTIONS.find((o) => o.id === sortBy)?.label.split('（')[0] || '排序') : '优先级';
    const filterActive = filterTagIds.length > 0;
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
        <div class="hidden md:flex items-center gap-2 pr-2 pb-1.5">
          <div class="relative">
            <input id="task-search" type="text" value="${App.utils.escapeHtml(query)}" placeholder="搜索"
                   class="w-32 lg:w-40 pl-7 pr-2 py-1 text-xs bg-slate-100 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-brand-100">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">${App.icons.search(12)}</span>
          </div>
          <button id="sort-btn" class="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border ${sortActive ? 'border-brand-300 text-brand-700 bg-brand-50' : 'border-slate-200 text-slate-600 hover:border-slate-300'}">
            ${sortLabel} ${App.icons.chevronD(11)}
          </button>
          <button id="filter-tag-btn" class="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border ${filterActive ? 'border-brand-300 text-brand-700 bg-brand-50' : 'border-slate-200 text-slate-600 hover:border-slate-300'}">
            标签${filterActive ? ` (${filterTagIds.length})` : ''} ${App.icons.chevronD(11)}
          </button>
        </div>
      </div>
    `;
  }

  function render(root) {
    const state = App.store.get();
    const listMap = new Map(state.lists.map((l) => [l.id, l]));
    const tagMap = new Map(state.tags.map((tg) => [tg.id, tg]));
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
        <div class="bg-white rounded-xl border border-slate-200 mb-3 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition">
          <form id="quick-add" class="flex items-center gap-2 px-3 py-2.5">
            <span class="text-slate-300 shrink-0">${App.icons.plus(18)}</span>
            <input id="quick-add-title" type="text" value="${esc(qaTitle)}" placeholder="添加任务到「${esc(groupName)}」" class="flex-1 min-w-0 outline-none text-sm bg-transparent" maxlength="120">
            <button id="quick-submit" type="submit" class="shrink-0 w-7 h-7 rounded-full bg-brand-600 hover:bg-brand-700 text-white inline-flex items-center justify-center" title="保存（回车）">
              ${App.icons.chevronR(16)}
            </button>
          </form>
          <div id="qa-chips" class="px-3 pb-2.5 flex-wrap items-center gap-2 ${qaTitle.trim() ? 'flex' : 'hidden'}">
            ${qaChip('time', App.icons.clock(12), qaTimeLabel(), !!qa.dueAt)}
            ${qaChip('list', App.icons.list(12),  qaListLabel(state), !!qa.listId)}
            ${qaChip('flag', App.icons.flagFill(12), qaFlagLabel(), !!(qa.importance || qa.urgency))}
            ${qaChip('tags', App.icons.tags(12), qaTagsLabel(), qa.tagIds.length > 0)}
          </div>
        </div>

        <!-- Active tasks -->
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          ${active.length === 0
            ? `<div class="text-center text-slate-400 text-sm py-12">
                 <div class="text-3xl mb-2">${emoji}</div>
                 ${emptyMsg}
               </div>`
            : active.map((t) => taskRow(t, listMap, tagMap, showListBadge)).join('')}
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
              ${done.map((t) => taskRow(t, listMap, tagMap, showListBadge)).join('')}
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
          ${currentGroup.startsWith('tag:') ? `
            <button id="rename-tag" class="text-xs px-2 py-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100 inline-flex items-center gap-1">${App.icons.edit(14)} 重命名</button>
            <button id="delete-tag" class="text-xs px-2 py-1 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 inline-flex items-center gap-1">${App.icons.trash(14)} 删除</button>
          ` : ''}
        </div>
      </div>
    `;
    headerEl.querySelector('#rename-list')?.addEventListener('click', openRenameModal);
    headerEl.querySelector('#delete-list')?.addEventListener('click', confirmDeleteList);
    headerEl.querySelector('#rename-tag')?.addEventListener('click', openRenameTagModal);
    headerEl.querySelector('#delete-tag')?.addEventListener('click', confirmDeleteTag);
    headerEl.querySelector('#scope-picker')?.addEventListener('click', openGroupSheet);
  }

  // ---------- Quick-add chip helpers ----------
  function qaChip(kind, icon, label, active) {
    const cls = active
      ? 'inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100'
      : 'inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100';
    return `<button type="button" data-qa-chip="${kind}" class="${cls}">${icon} ${App.utils.escapeHtml(label)}</button>`;
  }

  function qaTimeLabel() {
    if (!qa.dueAt) return '时间';
    return App.utils.formatDateTime(qa.dueAt);
  }
  function qaListLabel(state) {
    if (!qa.listId) return '任务箱';
    const l = state.lists.find((x) => x.id === qa.listId);
    return l?.name || '任务箱';
  }
  function qaFlagLabel() {
    if (!qa.importance && !qa.urgency) return '优先级';
    if (qa.importance && qa.urgency) return '重要紧急';
    if (qa.importance) return '重要';
    return '紧急';
  }
  function qaTagsLabel() {
    return qa.tagIds.length > 0 ? `标签 ${qa.tagIds.length}` : '标签';
  }

  function openQATimeModal() {
    const dueDate = qa.dueAt ? App.utils.toDateKey(qa.dueAt) : '';
    const dueTime = qa.dueAt ? App.utils.formatTime(qa.dueAt) : '';
    const panel = App.modal.open(`
      <div class="p-5 w-72">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-slate-900">设置截止时间</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <div class="grid grid-cols-2 gap-2 mb-3">
          <button data-quick-due="today"    class="px-3 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">今天 9:00</button>
          <button data-quick-due="tomorrow" class="px-3 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">明天 9:00</button>
        </div>
        <div class="flex items-center gap-2 mb-3">
          <input id="qa-date" type="date" value="${dueDate}" class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400">
          <input id="qa-time" type="time" value="${dueTime}" class="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400">
        </div>
        <div class="flex items-center justify-between">
          <button id="qa-time-clear" class="text-xs text-slate-400 hover:text-red-500">清除</button>
          <button id="qa-time-save"  class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg">确定</button>
        </div>
      </div>
    `);
    panel.querySelector('[data-quick-due="today"]').addEventListener('click', () => {
      const d = new Date(); d.setHours(9, 0, 0, 0);
      qa.dueAt = d.toISOString(); App.modal.close(); redraw();
    });
    panel.querySelector('[data-quick-due="tomorrow"]').addEventListener('click', () => {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
      qa.dueAt = d.toISOString(); App.modal.close(); redraw();
    });
    panel.querySelector('#qa-time-clear').addEventListener('click', () => { qa.dueAt = null; App.modal.close(); redraw(); });
    panel.querySelector('#qa-time-save').addEventListener('click', () => {
      const date = panel.querySelector('#qa-date').value;
      const time = panel.querySelector('#qa-time').value;
      if (!date) { qa.dueAt = null; }
      else {
        const d = App.utils.fromDateKey(date);
        if (time) { const [hh, mm] = time.split(':').map(Number); d.setHours(hh, mm, 0, 0); }
        else d.setHours(9, 0, 0, 0);
        qa.dueAt = d.toISOString();
      }
      App.modal.close();
      redraw();
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
  }

  function openQAListModal() {
    const state = App.store.get();
    const esc = App.utils.escapeHtml;
    const opt = (id, leading, label, active) => `
      <button data-qa-list="${id || ''}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}">
        <span class="w-4 inline-flex justify-center ${active ? 'text-brand-600' : 'text-slate-400'}">${leading}</span>
        <span class="text-sm">${label}</span>
      </button>
    `;
    const panel = App.modal.open(`
      <div class="p-3 w-64">
        <div class="flex items-center justify-between px-2 pt-1 pb-2">
          <h3 class="text-sm font-semibold text-slate-900">选择清单</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        ${opt('', App.icons.inbox(14), '任务箱', !qa.listId)}
        ${state.lists.map((l) => opt(l.id, `<span class="w-2 h-2 rounded-full inline-block" style="background:${l.color}"></span>`, esc(l.name), qa.listId === l.id)).join('')}
      </div>
    `);
    panel.querySelectorAll('[data-qa-list]').forEach((b) => {
      b.addEventListener('click', () => { qa.listId = b.dataset.qaList || null; App.modal.close(); redraw(); });
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
  }

  function openQAFlagModal() {
    const panel = App.modal.open(`
      <div class="p-3 w-64">
        <div class="flex items-center justify-between px-2 pt-1 pb-2">
          <h3 class="text-sm font-semibold text-slate-900">优先级</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        ${FLAG_STATES.map((s, i) => {
          const active = s.imp === qa.importance && s.urg === qa.urgency;
          return `
            <button data-qa-flag="${i}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}">
              <span style="color:${s.color}">${App.icons.flagFill(16)}</span>
              <span class="text-sm ${active ? 'text-brand-700 font-medium' : 'text-slate-700'}">${s.label}</span>
            </button>
          `;
        }).join('')}
      </div>
    `);
    panel.querySelectorAll('[data-qa-flag]').forEach((b) => {
      b.addEventListener('click', () => {
        const s = FLAG_STATES[Number(b.dataset.qaFlag)];
        qa.importance = s.imp; qa.urgency = s.urg;
        App.modal.close(); redraw();
      });
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
  }

  function openQATagsModal() {
    const state = App.store.get();
    const esc = App.utils.escapeHtml;
    const tagsHtml = state.tags.length === 0
      ? '<div class="text-center text-slate-400 text-sm py-6">还没有标签，先去新建</div>'
      : state.tags.map((tg) => {
          const checked = qa.tagIds.includes(tg.id);
          return `
            <label class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" data-qa-tag="${tg.id}" ${checked ? 'checked' : ''}>
              <span style="color:${tg.color}">#</span>
              <span class="text-sm flex-1">${esc(tg.name)}</span>
            </label>
          `;
        }).join('');
    const panel = App.modal.open(`
      <div class="p-3 w-72">
        <div class="flex items-center justify-between px-2 pt-1 pb-2">
          <h3 class="text-sm font-semibold text-slate-900">标签</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <div class="max-h-72 overflow-y-auto">${tagsHtml}</div>
        <div class="flex items-center justify-end mt-2">
          <button id="qa-tags-done" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg">完成</button>
        </div>
      </div>
    `);
    panel.querySelectorAll('[data-qa-tag]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.qaTag;
        if (cb.checked) { if (!qa.tagIds.includes(id)) qa.tagIds.push(id); }
        else qa.tagIds = qa.tagIds.filter((x) => x !== id);
      });
    });
    panel.querySelector('#qa-tags-done').addEventListener('click', () => { App.modal.close(); redraw(); });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
  }

  // ---------- Sort / Filter dropdowns ----------
  function openSortMenu() {
    const panel = App.modal.open(`
      <div class="p-2 w-64">
        <div class="text-xs text-slate-500 px-3 pt-2 pb-1">排序方式</div>
        ${SORT_OPTIONS.map((o) => `
          <button data-sort="${o.id}" class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition
            ${o.id === sortBy ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}">
            ${o.label}
          </button>
        `).join('')}
      </div>
    `);
    panel.querySelectorAll('[data-sort]').forEach((b) => {
      b.addEventListener('click', () => {
        sortBy = b.dataset.sort;
        App.modal.close();
        redraw();
      });
    });
  }

  function openTagFilter() {
    const state = App.store.get();
    const esc = App.utils.escapeHtml;
    const tagsHtml = state.tags.length === 0
      ? '<div class="text-center text-slate-400 text-sm py-6">还没有标签</div>'
      : state.tags.map((tg) => {
          const checked = filterTagIds.includes(tg.id);
          return `
            <label class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" data-tag-filter="${tg.id}" ${checked ? 'checked' : ''}>
              <span class="text-sm" style="color:${tg.color}">#</span>
              <span class="text-sm flex-1">${esc(tg.name)}</span>
            </label>
          `;
        }).join('');
    const panel = App.modal.open(`
      <div class="p-3 w-72">
        <div class="flex items-center justify-between px-2 pt-1 pb-2">
          <h3 class="text-sm font-semibold text-slate-900">按标签筛选</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <div class="max-h-72 overflow-y-auto">${tagsHtml}</div>
        <div class="flex items-center justify-between mt-3 px-2">
          <button id="clear-tag-filter" class="text-xs text-slate-400 hover:text-slate-700">清除</button>
          <button id="apply-tag-filter" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg">完成</button>
        </div>
      </div>
    `);
    panel.querySelectorAll('[data-tag-filter]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.tagFilter;
        if (cb.checked) {
          if (!filterTagIds.includes(id)) filterTagIds.push(id);
        } else {
          filterTagIds = filterTagIds.filter((x) => x !== id);
        }
      });
    });
    panel.querySelector('#clear-tag-filter').addEventListener('click', () => {
      filterTagIds = [];
      App.modal.close();
      redraw();
    });
    panel.querySelector('#apply-tag-filter').addEventListener('click', () => {
      App.modal.close();
      redraw();
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
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
    const tagsHtml = state.tags.map((tg) => {
      const c = state.tasks.filter((t) => !t.completed && Array.isArray(t.tagIds) && t.tagIds.includes(tg.id)).length;
      return row('tag:' + tg.id,
        `<span class="text-sm" style="color:${tg.color}">#</span>`,
        esc(tg.name), c, currentGroup === 'tag:' + tg.id);
    }).join('');

    const panel = App.modal.open(`
      <div class="p-3 max-h-[80vh] overflow-y-auto">
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
        ${state.tags.length > 0 ? `
          <div class="mt-3 mb-1 px-3 text-[11px] text-slate-400 uppercase tracking-wider">标签</div>
          ${tagsHtml}
        ` : ''}
        <div class="grid grid-cols-2 gap-2 mt-3">
          <button id="sheet-new-list" class="px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50 rounded-lg inline-flex items-center justify-center gap-2">
            ${App.icons.plus(14)} 清单
          </button>
          <button id="sheet-new-tag" class="px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50 rounded-lg inline-flex items-center justify-center gap-2">
            ${App.icons.plus(14)} 标签
          </button>
        </div>
      </div>
    `);
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelectorAll('[data-pick]').forEach((b) => {
      b.addEventListener('click', () => { App.modal.close(); setGroup(b.dataset.pick); });
    });
    panel.querySelector('#sheet-new-list')?.addEventListener('click', () => { App.modal.close(); openNewListModal(); });
    panel.querySelector('#sheet-new-tag')?.addEventListener('click', () => {
      App.modal.close();
      openNewTagModal((tg) => setGroup('tag:' + tg.id));
    });
  }

  // ---------- Bind handlers ----------
  function bind(root) {
    // Time window tabs
    root.querySelectorAll('[data-window]').forEach((btn) => {
      btn.addEventListener('click', () => setTimeWindow(btn.dataset.window));
    });

    // Sort / tag-filter toolbar buttons
    root.querySelector('#sort-btn')?.addEventListener('click', openSortMenu);
    root.querySelector('#filter-tag-btn')?.addEventListener('click', openTagFilter);

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
      row.querySelector('[data-action="edit"]').addEventListener('click', () => App.detail.open(id));
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
    const chipsEl = root.querySelector('#qa-chips');

    const refreshChips = () => {
      if (!chipsEl) return;
      if (titleEl.value.trim()) {
        chipsEl.classList.remove('hidden');
        chipsEl.classList.add('flex');
      } else {
        chipsEl.classList.add('hidden');
        chipsEl.classList.remove('flex');
      }
    };

    titleEl.addEventListener('input', () => {
      qaTitle = titleEl.value;
      refreshChips();
    });

    root.querySelectorAll('[data-qa-chip]').forEach((b) => {
      b.addEventListener('click', () => {
        qaTitle = titleEl.value;
        switch (b.dataset.qaChip) {
          case 'time': openQATimeModal(); break;
          case 'list': openQAListModal(); break;
          case 'flag': openQAFlagModal(); break;
          case 'tags': openQATagsModal(); break;
        }
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = titleEl.value.trim();
      if (!title) return;
      let dueAt = qa.dueAt;
      if (!dueAt) {
        if (currentWindow === 'today') {
          const d = new Date(); d.setHours(9, 0, 0, 0); dueAt = d.toISOString();
        } else if (currentWindow === 'tomorrow') {
          const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); dueAt = d.toISOString();
        }
      }
      const listId = qa.listId !== null ? qa.listId : groupListId();
      const taskPayload = {
        title, dueAt, listId,
        importance: qa.importance,
        urgency: qa.urgency,
        tagIds: qa.tagIds.slice(),
      };
      // Clear qa state BEFORE addTask so the redraw triggered by store.emit
      // renders an empty input + hidden chips.
      qaTitle = '';
      resetQA();
      App.store.addTask(taskPayload);
      setTimeout(() => _root.querySelector('#quick-add-title')?.focus(), 30);
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

  function openRenameTagModal() {
    const id = groupTagId();
    const tg = App.store.get().tags.find((x) => x.id === id);
    if (!tg) return;
    const esc = App.utils.escapeHtml;
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">编辑标签</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <input id="rt-name" value="${esc(tg.name)}" maxlength="20"
               class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 mb-3">
        <div class="text-xs text-slate-500 mb-1.5">颜色</div>
        <div class="flex items-center gap-2 flex-wrap">
          ${['#ef4444','#f59e0b','#10b981','#0ea5e9','#6366f1','#a855f7','#ec4899','#64748b']
            .map((c) => `<button type="button" data-color="${c}" class="w-7 h-7 rounded-full border-2 ${c===tg.color?'border-slate-800':'border-transparent'}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="rt-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">保存</button>
        </div>
      </div>
    `);
    let pickedColor = tg.color;
    panel.querySelectorAll('[data-color]').forEach((b) => {
      b.addEventListener('click', () => {
        pickedColor = b.dataset.color;
        panel.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('border-slate-800', x === b));
        panel.querySelectorAll('[data-color]').forEach((x) => { if (x !== b) x.classList.add('border-transparent'); });
      });
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelector('#rt-save').addEventListener('click', () => {
      const name = panel.querySelector('#rt-name').value.trim() || tg.name;
      App.store.updateTag(tg.id, { name, color: pickedColor });
      App.modal.close();
    });
  }

  function confirmDeleteTag() {
    const id = groupTagId();
    const tg = App.store.get().tags.find((x) => x.id === id);
    if (!tg) return;
    const affected = App.store.get().tasks.filter((t) => Array.isArray(t.tagIds) && t.tagIds.includes(tg.id)).length;
    const msg = affected > 0
      ? `删除标签「${tg.name}」？${affected} 个任务将失去该标签（任务本身不会被删）。`
      : `删除标签「${tg.name}」？`;
    if (!confirm(msg)) return;
    const snapshot = App.store.deleteTag(tg.id);
    setGroup('all');
    if (snapshot) {
      App.toast.show({
        message: `已删除标签「${snapshot.tag.name}」`,
        actionLabel: '撤销',
        onAction: () => {
          App.store.restoreTag(snapshot);
          setGroup('tag:' + snapshot.tag.id);
        },
      });
    }
  }

  function openNewTagModal(onCreated) {
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">新建标签</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <input id="nt-name" placeholder="标签名（如：电话、等回复、外出）" maxlength="20"
               class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 mb-3">
        <div class="text-xs text-slate-500 mb-1.5">颜色</div>
        <div class="flex items-center gap-2 flex-wrap">
          ${['#ef4444','#f59e0b','#10b981','#0ea5e9','#6366f1','#a855f7','#ec4899','#64748b']
            .map((c, i) => `<button type="button" data-color="${c}" class="w-7 h-7 rounded-full border-2 ${i===0?'border-slate-800':'border-transparent'}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="nt-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">创建</button>
        </div>
      </div>
    `);
    let pickedColor = '#ef4444';
    panel.querySelectorAll('[data-color]').forEach((b) => {
      b.addEventListener('click', () => {
        pickedColor = b.dataset.color;
        panel.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('border-slate-800', x === b));
        panel.querySelectorAll('[data-color]').forEach((x) => { if (x !== b) x.classList.add('border-transparent'); });
      });
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    const save = () => {
      const name = panel.querySelector('#nt-name').value.trim();
      if (!name) { App.modal.close(); return; }
      const tg = App.store.addTag({ name, color: pickedColor });
      App.modal.close();
      onCreated && onCreated(tg);
    };
    panel.querySelector('#nt-save').addEventListener('click', save);
    panel.querySelector('#nt-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    setTimeout(() => panel.querySelector('#nt-name').focus(), 30);
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
    } else if (currentGroup.startsWith('tag:')) {
      const id = currentGroup.slice(4);
      if (!App.store.get().tags.some((tg) => tg.id === id)) currentGroup = 'all';
    }
    resetQA();
    syncHashSilently();
    redraw();
    unsubscribe = App.store.subscribe(redraw);
    return () => { if (unsubscribe) unsubscribe(); };
  }

  return { mount, openEditModal, setGroup, openNewListModal, openNewTagModal };
})();

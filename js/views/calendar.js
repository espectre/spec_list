window.App = window.App || {};
App.views = App.views || {};

App.views.calendar = (() => {
  const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];
  let cursor = { year: new Date().getFullYear(), month: new Date().getMonth() };
  let selectedKey = App.utils.todayKey();
  let unsubscribe = null;
  let _root, _header;

  function tasksByDay(tasks) {
    const map = new Map();
    tasks.forEach((t) => {
      if (!t.dueAt) return;
      const k = App.utils.toDateKey(t.dueAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    return map;
  }

  function quadrantColor(t) {
    if (t.importance && t.urgency) return 'bg-q1';
    if (t.importance && !t.urgency) return 'bg-q2';
    if (!t.importance && t.urgency) return 'bg-q3';
    return 'bg-q4';
  }

  function renderHeader(headerEl) {
    headerEl.innerHTML = `
      <div class="max-w-5xl mx-auto flex items-center justify-between">
        <div>
          <h1 class="text-xl md:text-2xl font-semibold text-slate-900">${cursor.year} 年 ${cursor.month + 1} 月</h1>
          <p class="text-xs text-slate-400 mt-0.5">点击日期查看或添加任务</p>
        </div>
        <div class="flex items-center gap-1">
          <button data-nav="prev" class="p-2 rounded-lg hover:bg-slate-100 text-slate-500">${App.icons.chevronL(18)}</button>
          <button data-nav="today" class="px-3 py-1.5 text-xs rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200">今天</button>
          <button data-nav="next" class="p-2 rounded-lg hover:bg-slate-100 text-slate-500">${App.icons.chevronR(18)}</button>
        </div>
      </div>
    `;
    headerEl.querySelector('[data-nav="prev"]').addEventListener('click', () => {
      let m = cursor.month - 1, y = cursor.year;
      if (m < 0) { m = 11; y -= 1; }
      cursor = { year: y, month: m };
      redraw();
    });
    headerEl.querySelector('[data-nav="next"]').addEventListener('click', () => {
      let m = cursor.month + 1, y = cursor.year;
      if (m > 11) { m = 0; y += 1; }
      cursor = { year: y, month: m };
      redraw();
    });
    headerEl.querySelector('[data-nav="today"]').addEventListener('click', () => {
      const n = new Date();
      cursor = { year: n.getFullYear(), month: n.getMonth() };
      selectedKey = App.utils.todayKey();
      redraw();
    });
  }

  function render(root) {
    const state = App.store.get();
    const cells = App.utils.monthMatrix(cursor.year, cursor.month);
    const byDay = tasksByDay(state.tasks);

    const grid = cells.map((d) => {
      const key = App.utils.toDateKey(d);
      const inMonth = d.getMonth() === cursor.month;
      const isToday = App.utils.isSameDay(d, new Date());
      const isSelected = key === selectedKey;
      const tasks = byDay.get(key) || [];
      const dots = tasks.slice(0, 3).map((t) => `<span class="w-1.5 h-1.5 rounded-full ${quadrantColor(t)} ${t.completed ? 'opacity-40' : ''}"></span>`).join('');
      const more = tasks.length > 3 ? `<span class="text-[9px] text-slate-400 ml-0.5">+${tasks.length - 3}</span>` : '';

      const base = 'cal-day p-1 md:p-2 flex flex-col items-stretch text-left rounded-lg transition border';
      const tone = !inMonth
        ? 'text-slate-300 border-transparent hover:bg-slate-50'
        : isSelected
          ? 'border-brand-500 bg-brand-50/40 text-slate-800'
          : isToday
            ? 'border-brand-200 text-slate-800 hover:bg-slate-50'
            : 'border-transparent text-slate-700 hover:bg-slate-50';

      return `
        <button data-day="${key}" class="${base} ${tone}">
          <div class="flex items-center justify-between">
            <span class="text-xs md:text-sm font-medium ${isToday ? 'text-brand-600' : ''}">${d.getDate()}</span>
            ${isToday ? '<span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>' : ''}
          </div>
          <div class="flex items-center gap-0.5 mt-auto pt-1">${dots}${more}</div>
        </button>
      `;
    }).join('');

    const dayTasks = (byDay.get(selectedKey) || []).slice().sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.dueAt) - new Date(b.dueAt);
    });

    root.innerHTML = `
      <div class="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4">
        <div class="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
          <div class="grid grid-cols-7 text-center text-[11px] text-slate-400 mb-1">
            ${WEEK_DAYS.map((w) => `<div class="py-1">周${w}</div>`).join('')}
          </div>
          <div class="grid grid-cols-7 gap-1">
            ${grid}
          </div>
          <div class="flex items-center gap-3 mt-3 text-[11px] text-slate-400">
            <span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-q1"></span>重要紧急</span>
            <span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-q2"></span>重要</span>
            <span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-q3"></span>紧急</span>
            <span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-q4"></span>一般</span>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-4 flex flex-col">
          <div class="flex items-center justify-between mb-3">
            <div>
              <div class="text-sm font-semibold text-slate-900">${selectedLabel()}</div>
              <div class="text-xs text-slate-400">${dayTasks.length} 个任务</div>
            </div>
            <button id="cal-add" class="text-xs px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg inline-flex items-center gap-1">${App.icons.plus(14)} 添加</button>
          </div>
          <div class="flex-1 space-y-2 overflow-y-auto">
            ${dayTasks.length === 0
              ? '<div class="text-center text-slate-400 text-sm py-10">这一天还没有安排</div>'
              : dayTasks.map(dayTaskRow).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function selectedLabel() {
    const d = App.utils.fromDateKey(selectedKey);
    return `${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEK_DAYS[d.getDay()]}`;
  }

  function dayTaskRow(t) {
    const esc = App.utils.escapeHtml;
    return `
      <div class="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 group" data-task-id="${t.id}">
        <input type="checkbox" class="task-check mt-0.5" ${t.completed ? 'checked' : ''} data-action="toggle">
        <div class="flex-1 min-w-0 cursor-pointer" data-action="edit">
          <div class="text-sm ${t.completed ? 'line-through text-slate-400' : 'text-slate-800'} truncate">${esc(t.title)}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">${App.utils.formatTime(t.dueAt)}</div>
        </div>
      </div>
    `;
  }

  function bind(root) {
    root.querySelectorAll('[data-day]').forEach((c) => {
      c.addEventListener('click', () => {
        selectedKey = c.dataset.day;
        // if clicked outside current month, also navigate
        const d = App.utils.fromDateKey(selectedKey);
        if (d.getMonth() !== cursor.month) {
          cursor = { year: d.getFullYear(), month: d.getMonth() };
        }
        redraw();
      });
    });

    root.querySelectorAll('[data-task-id]').forEach((row) => {
      const id = row.dataset.taskId;
      row.querySelector('[data-action="toggle"]').addEventListener('change', () => App.store.toggleTask(id));
      row.querySelector('[data-action="edit"]').addEventListener('click', () => App.views.schedule.openEditModal(id));
    });

    root.querySelector('#cal-add')?.addEventListener('click', () => openAddModalForDay(selectedKey));
  }

  function openAddModalForDay(dateKey) {
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">添加到 ${App.utils.fromDateKey(dateKey).getMonth() + 1}月${App.utils.fromDateKey(dateKey).getDate()}日</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <div class="space-y-3">
          <input id="a-title" autofocus class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400" placeholder="任务标题">
          <input id="a-time" type="time" value="09:00" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400">
          <div class="flex items-center gap-3 text-sm">
            <label class="inline-flex items-center gap-1.5"><input id="a-imp" type="checkbox"> 重要</label>
            <label class="inline-flex items-center gap-1.5"><input id="a-urg" type="checkbox"> 紧急</label>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="a-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">添加</button>
        </div>
      </div>
    `);
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelector('#a-save').addEventListener('click', () => {
      const title = panel.querySelector('#a-title').value.trim();
      if (!title) { App.modal.close(); return; }
      const time = panel.querySelector('#a-time').value || '09:00';
      const d = App.utils.fromDateKey(dateKey);
      const [hh, mm] = time.split(':').map(Number);
      d.setHours(hh, mm, 0, 0);
      App.store.addTask({
        title,
        dueAt: d.toISOString(),
        importance: panel.querySelector('#a-imp').checked ? 1 : 0,
        urgency: panel.querySelector('#a-urg').checked ? 1 : 0,
      });
      App.modal.close();
    });
    setTimeout(() => panel.querySelector('#a-title').focus(), 30);
  }

  function redraw() {
    render(_root);
    renderHeader(_header);
    bind(_root);
  }

  function mount(root, header) {
    _root = root; _header = header;
    redraw();
    unsubscribe = App.store.subscribe(redraw);
    return () => { if (unsubscribe) unsubscribe(); };
  }

  return { mount };
})();

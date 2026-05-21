window.App = window.App || {};
App.views = App.views || {};

App.views.matrix = (() => {
  const QUADRANTS = [
    { id: 'q1', label: '重要 · 紧急',     hint: '立即去做',   imp: 1, urg: 1, color: 'q1', bg: 'bg-red-50',    text: 'text-q1' },
    { id: 'q2', label: '重要 · 不紧急',   hint: '专注规划',   imp: 1, urg: 0, color: 'q2', bg: 'bg-blue-50',   text: 'text-q2' },
    { id: 'q3', label: '不重要 · 紧急',   hint: '尽量委派',   imp: 0, urg: 1, color: 'q3', bg: 'bg-amber-50',  text: 'text-q3' },
    { id: 'q4', label: '不重要 · 不紧急', hint: '少做或不做', imp: 0, urg: 0, color: 'q4', bg: 'bg-slate-100', text: 'text-slate-500' },
  ];

  let unsubscribe = null;
  let _root, _header;

  function renderHeader(headerEl) {
    headerEl.innerHTML = `
      <div class="max-w-6xl mx-auto">
        <h1 class="text-xl md:text-2xl font-semibold text-slate-900">四象限</h1>
        <p class="text-xs text-slate-400 mt-0.5">拖动任务在象限之间移动，或点击任务编辑</p>
      </div>
    `;
  }

  function taskCard(t) {
    const esc = App.utils.escapeHtml;
    const due = t.dueAt ? `<div class="text-[11px] text-slate-400 mt-1">${App.utils.formatDateTime(t.dueAt)}</div>` : '';
    return `
      <div draggable="true" data-task-id="${t.id}"
           class="bg-white rounded-lg border border-slate-200 px-3 py-2 hover:shadow-sm transition cursor-grab group">
        <div class="flex items-start gap-2">
          <input type="checkbox" class="task-check mt-0.5" ${t.completed ? 'checked' : ''} data-action="toggle">
          <div class="flex-1 min-w-0" data-action="edit">
            <div class="text-sm ${t.completed ? 'line-through text-slate-400' : 'text-slate-800'} break-words">${esc(t.title)}</div>
            ${due}
          </div>
        </div>
      </div>
    `;
  }

  function render(root) {
    const state = App.store.get();
    const active = state.tasks.filter((t) => !t.completed);
    const byQuadrant = { q1: [], q2: [], q3: [], q4: [] };
    active.forEach((t) => byQuadrant[App.store.quadrantOf(t)].push(t));
    Object.values(byQuadrant).forEach((arr) => arr.sort((a, b) => (a.dueAt ? new Date(a.dueAt) : Infinity) - (b.dueAt ? new Date(b.dueAt) : Infinity)));

    root.innerHTML = `
      <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        ${QUADRANTS.map((q) => `
          <section class="quad-card ${q.bg} rounded-xl p-3 md:p-4 ${q.text}" data-quad="${q.id}" data-imp="${q.imp}" data-urg="${q.urg}">
            <div class="flex items-center justify-between mb-2">
              <div>
                <div class="text-sm font-semibold">${q.label}</div>
                <div class="text-[11px] opacity-70">${q.hint}</div>
              </div>
              <div class="text-xs opacity-70">${byQuadrant[q.id].length} 项</div>
            </div>
            <div class="space-y-2 flex-1 min-h-[160px]">
              ${byQuadrant[q.id].length === 0
                ? `<div class="text-center text-xs opacity-60 py-8 border border-dashed border-current rounded-lg">拖到这里</div>`
                : byQuadrant[q.id].map(taskCard).join('')}
            </div>
            <button data-quick-add class="mt-3 text-xs opacity-70 hover:opacity-100 inline-flex items-center gap-1">${App.icons.plus(14)} 添加任务</button>
          </section>
        `).join('')}
      </div>
    `;
  }

  function bind(root) {
    // checkbox + edit
    root.querySelectorAll('[data-task-id]').forEach((card) => {
      const id = card.dataset.taskId;
      card.querySelector('[data-action="toggle"]').addEventListener('change', () => App.store.toggleTask(id));
      card.querySelector('[data-action="edit"]').addEventListener('click', () => App.detail.open(id));

      // DnD
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/task-id', id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    root.querySelectorAll('[data-quad]').forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/task-id');
        if (!id) return;
        App.store.setQuadrant(id, Number(zone.dataset.imp), Number(zone.dataset.urg));
      });
    });

    root.querySelectorAll('[data-quick-add]').forEach((btn) => {
      const zone = btn.closest('[data-quad]');
      btn.addEventListener('click', () => openQuickAdd(Number(zone.dataset.imp), Number(zone.dataset.urg)));
    });
  }

  function openQuickAdd(imp, urg) {
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">添加到 ${imp && urg ? '重要紧急' : imp ? '重要' : urg ? '紧急' : '一般'}</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <input id="q-title" autofocus class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400" placeholder="任务标题">
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="q-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">添加</button>
        </div>
      </div>
    `);
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    const save = () => {
      const title = panel.querySelector('#q-title').value.trim();
      if (title) App.store.addTask({ title, importance: imp, urgency: urg });
      App.modal.close();
    };
    panel.querySelector('#q-save').addEventListener('click', save);
    panel.querySelector('#q-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    setTimeout(() => panel.querySelector('#q-title').focus(), 30);
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

(() => {
  // Top-level modules. Order in icon-nav and bottom-nav follows this list.
  const ROUTES = [
    { id: 'schedule',  label: '清单',   icon: 'schedule',  mount: () => App.views.schedule.mount(els.viewRoot, els.viewHeader) },
    { id: 'calendar',  label: '日历',   icon: 'calendar',  mount: () => App.views.calendar.mount(els.viewRoot, els.viewHeader) },
    { id: 'notes',     label: '笔记',   icon: 'notes',     mount: () => App.views.notes.mount(els.viewRoot, els.viewHeader) },
    { id: 'matrix',    label: '四象限', icon: 'matrix',    mount: () => App.views.matrix.mount(els.viewRoot, els.viewHeader) },
    { id: 'focus',     label: '番茄',   icon: 'focus',     mount: () => App.views.focus.mount(els.viewRoot, els.viewHeader) },
    { id: 'habits',    label: '习惯',   icon: 'habit',     mount: () => App.views.habits.mount(els.viewRoot, els.viewHeader) },
    { id: 'countdown', label: '倒数日', icon: 'countdown', mount: () => App.views.countdown.mount(els.viewRoot, els.viewHeader) },
  ];

  const BOTTOM = ['schedule', 'calendar', 'focus', 'notes'];

  const els = {
    viewRoot:   document.getElementById('view-root'),
    viewHeader: document.getElementById('view-header'),
    iconNav:    document.getElementById('icon-nav'),
    groupNav:   document.getElementById('group-nav'),
    bottomNav:  document.getElementById('bottom-nav'),
    modalRoot:  document.getElementById('modal-root'),
  };

  let currentRoute = null;
  let cleanup = null;

  function currentRouteId() {
    const m = location.hash.match(/^#\/([^/]+)/);
    const seg = m && m[1];
    return ROUTES.find((r) => r.id === seg)?.id || 'schedule';
  }

  function currentScheduleSub() {
    const m = location.hash.match(/^#\/schedule(?:\/(.+))?$/);
    const sub = m && m[1];
    if (!sub) return 'all';
    if (sub === 'inbox') return 'inbox';
    if (sub.startsWith('list/')) return 'list:' + sub.slice(5);
    return 'all';
  }

  function renderIconNav() {
    // Logo is already in the DOM; we replace the rest.
    const logo = els.iconNav.querySelector('div'); // first child = logo
    els.iconNav.innerHTML = '';
    if (logo) els.iconNav.appendChild(logo);

    ROUTES.forEach((r) => {
      const active = r.id === currentRoute;
      const a = document.createElement('a');
      a.href = `#/${r.id}`;
      a.dataset.route = r.id;
      a.className = `w-full px-1 py-2 flex flex-col items-center gap-0.5 transition cursor-pointer
                     ${active ? 'text-white' : 'text-slate-400 hover:text-white'}`;
      a.innerHTML = `
        <span class="${active ? 'bg-brand-600/30 ring-1 ring-brand-500' : ''} rounded-lg p-1.5 inline-flex items-center justify-center">${App.icons[r.icon](20)}</span>
        <span class="text-[10px] leading-tight">${r.label}</span>
      `;
      els.iconNav.appendChild(a);
    });

    // Reset link at the bottom
    const spacer = document.createElement('div'); spacer.className = 'flex-1';
    els.iconNav.appendChild(spacer);
    const reset = document.createElement('button');
    reset.id = 'icon-reset';
    reset.className = 'w-full px-1 py-2 flex flex-col items-center gap-0.5 text-slate-500 hover:text-white transition text-[10px]';
    reset.innerHTML = `<span class="rounded-lg p-1.5 inline-flex">${App.icons.trash(16)}</span><span class="leading-tight">重置</span>`;
    reset.addEventListener('click', () => {
      if (confirm('重置所有数据为示例内容？此操作不可撤销。')) App.store.reset();
    });
    els.iconNav.appendChild(reset);
  }

  function renderGroupNav() {
    // group-nav: shown only on schedule route AND on md+ (never on mobile)
    if (currentRoute !== 'schedule') {
      els.groupNav.className = 'hidden flex-col bg-white border-r border-slate-200 shrink-0';
      return;
    }
    els.groupNav.className = 'hidden md:flex md:w-56 lg:w-64 flex-col bg-white border-r border-slate-200 shrink-0';

    const state = App.store.get();
    const sub = currentScheduleSub();
    const esc = App.utils.escapeHtml;

    const allCount    = state.tasks.filter((t) => !t.completed).length;
    const inboxCount  = state.tasks.filter((t) => !t.completed && !t.listId).length;

    const row = (id, leading, label, count, active) => `
      <a href="#/schedule${id === 'all' ? '' : '/' + id}" data-group="${id}"
         class="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition
                ${active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}">
        <span class="w-4 inline-flex justify-center ${active ? 'text-brand-600' : 'text-slate-400'}">${leading}</span>
        <span class="flex-1 truncate">${label}</span>
        ${count > 0 ? `<span class="text-xs text-slate-400 tabular-nums">${count}</span>` : ''}
      </a>
    `;

    const listRow = (l) => {
      const active = sub === 'list:' + l.id;
      const count = state.tasks.filter((t) => t.listId === l.id && !t.completed).length;
      return row('list/' + l.id,
        `<span class="w-2 h-2 rounded-full inline-block" style="background:${l.color}"></span>`,
        esc(l.name), count, active);
    };

    els.groupNav.innerHTML = `
      <div class="px-5 py-4 border-b border-slate-100">
        <div class="text-base font-semibold text-slate-900">清单</div>
      </div>
      <div class="flex-1 overflow-y-auto py-2">
        ${row('all',   App.icons.list(16),   '全部分组', allCount,   sub === 'all')}
        ${row('inbox', App.icons.inbox(16),  '任务箱',   inboxCount, sub === 'inbox')}
        ${state.lists.length > 0 ? `
          <div class="mt-3 mb-1 px-5 text-[11px] text-slate-400">我的清单</div>
          ${state.lists.map(listRow).join('')}
        ` : ''}
        <button id="gn-new-list" class="w-full mt-2 flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition">
          <span class="w-4 inline-flex justify-center text-slate-400">${App.icons.plus(16)}</span>
          <span class="flex-1 text-left">添加清单</span>
        </button>
      </div>
      <div class="px-3 py-2 border-t border-slate-100">
        <button class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition" disabled>
          <span class="w-4 inline-flex justify-center text-slate-400">${App.icons.tags(16)}</span>
          <span class="flex-1 text-left">标签管理</span>
          <span class="text-[10px] text-slate-300">v2</span>
        </button>
      </div>
    `;

    els.groupNav.querySelector('#gn-new-list')?.addEventListener('click', () => {
      App.views.schedule?.openNewListModal?.();
    });
  }

  function renderBottomNav() {
    els.bottomNav.innerHTML = `
      <div class="grid grid-cols-4">
        ${BOTTOM.map((id) => {
          const r = ROUTES.find((x) => x.id === id);
          const active = r.id === currentRoute;
          return `
            <a href="#/${r.id}" data-route="${r.id}"
               class="flex flex-col items-center gap-1 py-2.5 text-xs transition
                      ${active ? 'text-brand-600' : 'text-slate-400'}">
              ${App.icons[r.icon](22)}
              <span>${r.label}</span>
            </a>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderNav() {
    renderIconNav();
    renderGroupNav();
    renderBottomNav();
  }

  App.refreshNav = renderNav;

  function render() {
    const id = currentRouteId();
    currentRoute = id;

    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    els.viewRoot.innerHTML = '';
    els.viewHeader.innerHTML = '';

    renderNav();

    const route = ROUTES.find((r) => r.id === id);
    cleanup = route.mount() || null;
    els.viewRoot.scrollTop = 0;
  }

  // ---------- Toast helper (shared) ----------
  const toastRoot = document.getElementById('toast-root');
  App.toast = {
    show({ message, actionLabel, onAction, duration = 5000 } = {}) {
      const node = document.createElement('div');
      node.className = 'toast';
      node.innerHTML = `
        <span class="flex-1">${App.utils.escapeHtml(message || '')}</span>
        ${actionLabel ? `<button type="button" data-action>${App.utils.escapeHtml(actionLabel)}</button>` : ''}
        <button type="button" data-dismiss class="text-slate-400 hover:text-white" aria-label="关闭">${App.icons.close(14)}</button>
      `;
      toastRoot.appendChild(node);

      let dismissed = false;
      const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        node.classList.add('leaving');
        setTimeout(() => node.remove(), 200);
      };

      if (actionLabel) {
        node.querySelector('[data-action]').addEventListener('click', () => {
          try { onAction && onAction(); } finally { dismiss(); }
        });
      }
      node.querySelector('[data-dismiss]').addEventListener('click', dismiss);
      if (duration > 0) setTimeout(dismiss, duration);
      return { dismiss };
    },
  };

  // ---------- Modal helper (shared) ----------
  App.modal = {
    open(html) {
      els.modalRoot.innerHTML = `
        <div class="modal-backdrop" data-modal-backdrop>
          <div class="modal-panel" data-modal-panel>${html}</div>
        </div>
      `;
      const backdrop = els.modalRoot.querySelector('[data-modal-backdrop]');
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) App.modal.close();
      });
      document.addEventListener('keydown', App.modal._onKey);
      return els.modalRoot.querySelector('[data-modal-panel]');
    },
    close() {
      els.modalRoot.innerHTML = '';
      document.removeEventListener('keydown', App.modal._onKey);
    },
    _onKey(e) {
      if (e.key === 'Escape') App.modal.close();
    },
  };

  // ---------- Wire up ----------
  window.addEventListener('hashchange', render);

  App.store.subscribe(() => renderNav());

  if (!location.hash) location.hash = '#/schedule';
  render();
})();

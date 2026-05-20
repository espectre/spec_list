(() => {
  const ROUTES = [
    { id: 'schedule', label: '日程',   icon: 'schedule', mount: () => App.views.schedule.mount(els.viewRoot, els.viewHeader) },
    { id: 'calendar', label: '日历',   icon: 'calendar', mount: () => App.views.calendar.mount(els.viewRoot, els.viewHeader) },
    { id: 'matrix',   label: '四象限', icon: 'matrix',   mount: () => App.views.matrix.mount(els.viewRoot, els.viewHeader) },
    { id: 'notes',    label: '笔记',   icon: 'notes',    mount: () => App.views.notes.mount(els.viewRoot, els.viewHeader) },
  ];

  const els = {
    viewRoot:    document.getElementById('view-root'),
    viewHeader:  document.getElementById('view-header'),
    sideNav:     document.getElementById('side-nav'),
    bottomNav:   document.getElementById('bottom-nav'),
    resetBtn:    document.getElementById('reset-btn'),
    modalRoot:   document.getElementById('modal-root'),
  };

  let currentRoute = null;
  let cleanup = null;

  function currentId() {
    const m = location.hash.match(/^#\/([^/]+)/);
    const seg = m && m[1];
    return ROUTES.find((r) => r.id === seg)?.id || 'schedule';
  }

  function activeListId() {
    const m = location.hash.match(/^#\/schedule\/list\/([^/]+)/);
    return m && m[1];
  }

  function renderNav() {
    const state = App.store.get();
    const activeList = activeListId();
    const esc = App.utils.escapeHtml;

    const navItems = ROUTES.map((r) => {
      const active = r.id === currentRoute && !(r.id === 'schedule' && activeList);
      return `
        <a href="#/${r.id}" data-route="${r.id}"
           class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition
                  ${active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}">
          <span class="${active ? 'text-brand-600' : 'text-slate-400'}">${App.icons[r.icon](20)}</span>
          ${r.label}
        </a>
      `;
    }).join('');

    const listSection = `
      <div class="mt-6">
        <div class="px-3 mb-1.5 text-[11px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>我的清单</span>
          <button id="sb-new-list" class="text-slate-400 hover:text-brand-600" title="新建清单">${App.icons.plus(14)}</button>
        </div>
        ${state.lists.length === 0
          ? `<div class="px-3 py-2 text-xs text-slate-300">还没有清单</div>`
          : state.lists.map((l) => {
              const active = activeList === l.id;
              const count = state.tasks.filter((t) => t.listId === l.id && !t.completed).length;
              return `
                <a href="#/schedule/list/${l.id}" data-list="${l.id}"
                   class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition
                          ${active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}">
                  <span class="w-2 h-2 rounded-full shrink-0" style="background:${l.color}"></span>
                  <span class="truncate flex-1">${esc(l.name)}</span>
                  ${count > 0 ? `<span class="text-[11px] ${active ? 'text-brand-500' : 'text-slate-400'}">${count}</span>` : ''}
                </a>
              `;
            }).join('')}
      </div>
    `;

    els.sideNav.innerHTML = navItems + listSection;
    els.sideNav.querySelector('#sb-new-list')?.addEventListener('click', (e) => {
      e.preventDefault();
      // ensure we're on schedule view so new list opens its modal
      if (currentRoute !== 'schedule') location.hash = '#/schedule';
      // openNewListModal lives in schedule view; expose via App.views.schedule
      setTimeout(() => App.views.schedule?.openNewListModal?.(), 30);
    });

    // Bottom nav (mobile) — unchanged
    els.bottomNav.innerHTML = `
      <div class="grid grid-cols-4">
        ${ROUTES.map((r) => {
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

  App.refreshNav = renderNav;

  function render() {
    const id = currentId();
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

  els.resetBtn?.addEventListener('click', () => {
    if (confirm('重置所有数据为示例内容？此操作不可撤销。')) {
      App.store.reset();
    }
  });

  // Re-render sidebar when store data changes (counts + list names)
  App.store.subscribe(() => renderNav());

  // ensure starting hash
  if (!location.hash) location.hash = '#/schedule';
  render();
})();

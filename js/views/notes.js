window.App = window.App || {};
App.views = App.views || {};

App.views.notes = (() => {
  // Scope: 'all' | 'pinned' | 'uncat' | 'notebook:<id>'
  let currentScope = 'all';
  let currentId = null;
  let query = '';
  let mobileView = 'list'; // 'list' | 'editor', only used when viewport is mobile
  let unsubscribe = null;
  let _root, _header, _onResize, _onHash;

  function isMobile() { return window.innerWidth < 768; }

  // ---------- Hash routing ----------
  function scopeFromHash() {
    const m = location.hash.match(/^#\/notes(?:\/(.+))?$/);
    const sub = m && m[1];
    if (!sub) return 'all';
    if (sub === 'pinned') return 'pinned';
    if (sub === 'uncat')  return 'uncat';
    if (sub.startsWith('notebook/')) return 'notebook:' + sub.slice(9);
    return 'all';
  }

  function scopeToHashSub(s) {
    if (s === 'all') return '';
    if (s === 'pinned') return 'pinned';
    if (s === 'uncat')  return 'uncat';
    if (s.startsWith('notebook:')) return 'notebook/' + s.slice(9);
    return '';
  }

  function syncHashSilently() {
    const sub = scopeToHashSub(currentScope);
    const target = sub ? `#/notes/${sub}` : '#/notes';
    if (location.hash !== target) history.replaceState({}, '', target);
  }

  function setScope(s) {
    // Validate notebook exists
    if (s.startsWith('notebook:')) {
      const id = s.slice(9);
      if (!App.store.get().notebooks.some((nb) => nb.id === id)) s = 'all';
    }
    currentScope = s;
    currentId = null; // reset selection on scope change
    syncHashSilently();
    redraw();
    App.refreshNav?.();
  }

  function scopeNotebookId() {
    return currentScope.startsWith('notebook:') ? currentScope.slice(9) : null;
  }

  // ---------- Filtering & sort ----------
  function matchesScope(n) {
    if (currentScope === 'all')    return true;
    if (currentScope === 'pinned') return !!n.pinned;
    if (currentScope === 'uncat')  return !n.notebookId;
    if (currentScope.startsWith('notebook:')) return n.notebookId === scopeNotebookId();
    return true;
  }

  function getList() {
    const state = App.store.get();
    const q = query.trim().toLowerCase();
    let list = state.notes.filter(matchesScope);
    if (q) {
      list = list.filter((n) =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q)
      );
    }
    return list.slice().sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  function ensureCurrent() {
    const list = getList();
    if (!list.find((n) => n.id === currentId)) {
      currentId = list[0]?.id || null;
    }
  }

  function preview(content) {
    return (content || '').replace(/\s+/g, ' ').slice(0, 80);
  }

  // ---------- Header ----------
  function scopeTitleAndDot(state) {
    const esc = App.utils.escapeHtml;
    if (currentScope.startsWith('notebook:')) {
      const nb = state.notebooks.find((x) => x.id === scopeNotebookId());
      if (nb) return { title: nb.name, color: nb.color, kind: 'notebook', notebook: nb };
    }
    if (currentScope === 'pinned') return { title: '置顶笔记', kind: 'pinned' };
    if (currentScope === 'uncat')  return { title: '未分类笔记', kind: 'uncat' };
    return { title: '全部笔记', kind: 'all' };
  }

  function renderHeader(headerEl) {
    const state = App.store.get();
    const sc = scopeTitleAndDot(state);
    const esc = App.utils.escapeHtml;
    const showBack = isMobile() && mobileView === 'editor';
    const dot = sc.color ? `<span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${sc.color}"></span>` : '';
    const count = state.notes.filter(matchesScope).length;
    const actions = sc.kind === 'notebook' ? `
      <button id="rename-nb" class="text-xs px-2 py-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100 inline-flex items-center gap-1">${App.icons.edit(14)} 重命名</button>
      <button id="delete-nb" class="text-xs px-2 py-1 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 inline-flex items-center gap-1">${App.icons.trash(14)} 删除</button>
    ` : '';

    headerEl.innerHTML = `
      <div class="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          ${showBack ? `<button id="back-to-list" class="md:hidden p-1.5 -ml-1.5 rounded hover:bg-slate-100 text-slate-500" aria-label="返回">${App.icons.chevronL(20)}</button>` : ''}
          ${!showBack ? `<button id="scope-picker" class="md:hidden text-slate-500 hover:bg-slate-100 rounded-lg p-1 -ml-1" title="切换笔记本">${App.icons.chevronD ? App.icons.chevronD(20) : App.icons.chevronR(20)}</button>` : ''}
          <div class="min-w-0">
            <h1 class="text-xl md:text-2xl font-semibold text-slate-900 truncate inline-flex items-center gap-2">${dot}${esc(sc.title)}</h1>
            <p class="text-xs text-slate-400 mt-0.5">${count} 条笔记</p>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${actions}
          <button id="new-note" class="px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg inline-flex items-center gap-1">${App.icons.plus(16)} 新建</button>
        </div>
      </div>
    `;
    headerEl.querySelector('#back-to-list')?.addEventListener('click', () => { mobileView = 'list'; redraw(); });
    headerEl.querySelector('#scope-picker')?.addEventListener('click', openScopeSheet);
    headerEl.querySelector('#rename-nb')?.addEventListener('click', openRenameNotebookModal);
    headerEl.querySelector('#delete-nb')?.addEventListener('click', confirmDeleteNotebook);
    headerEl.querySelector('#new-note').addEventListener('click', () => {
      // New notes default to the currently-selected notebook (if any).
      const defaultNotebookId = scopeNotebookId();
      const n = App.store.addNote({ title: '新建笔记', content: '', notebookId: defaultNotebookId });
      currentId = n.id;
      mobileView = 'editor';
      redraw();
      setTimeout(() => _root.querySelector('.note-title')?.focus(), 50);
    });
  }

  // ---------- Mobile scope sheet ----------
  function openScopeSheet() {
    const state = App.store.get();
    const esc = App.utils.escapeHtml;
    const row = (id, leading, label, count, active) => `
      <button data-pick="${id}" class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg
        ${active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}">
        <span class="w-5 inline-flex justify-center ${active ? 'text-brand-600' : 'text-slate-400'}">${leading}</span>
        <span class="flex-1">${label}</span>
        ${count > 0 ? `<span class="text-xs text-slate-400 tabular-nums">${count}</span>` : ''}
      </button>
    `;
    const allCount    = state.notes.length;
    const pinnedCount = state.notes.filter((n) => n.pinned).length;
    const uncatCount  = state.notes.filter((n) => !n.notebookId).length;
    const nbsHtml = state.notebooks.map((nb) => {
      const c = state.notes.filter((n) => n.notebookId === nb.id).length;
      return row('notebook:' + nb.id,
        `<span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${nb.color}"></span>`,
        esc(nb.name), c, currentScope === 'notebook:' + nb.id);
    }).join('');

    const panel = App.modal.open(`
      <div class="p-3 max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between px-2 pt-1 pb-2">
          <h3 class="text-sm font-semibold text-slate-900">选择笔记本</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        ${row('all',    App.icons.notes(16), '全部笔记', allCount,    currentScope === 'all')}
        ${row('pinned', App.icons.pin(16),   '置顶',     pinnedCount, currentScope === 'pinned')}
        ${uncatCount > 0 ? row('uncat', App.icons.inbox(16), '未分类', uncatCount, currentScope === 'uncat') : ''}
        ${state.notebooks.length > 0 ? `
          <div class="mt-3 mb-1 px-3 text-[11px] text-slate-400 uppercase tracking-wider">我的笔记本</div>
          ${nbsHtml}
        ` : ''}
        <button id="sheet-new-notebook" class="w-full mt-2 px-4 py-3 text-left text-sm text-slate-500 hover:bg-slate-50 rounded-lg inline-flex items-center gap-3">
          <span class="w-5 inline-flex justify-center text-slate-400">${App.icons.plus(16)}</span>
          新建笔记本
        </button>
      </div>
    `);
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelectorAll('[data-pick]').forEach((b) => {
      b.addEventListener('click', () => { App.modal.close(); setScope(b.dataset.pick); });
    });
    panel.querySelector('#sheet-new-notebook')?.addEventListener('click', () => { App.modal.close(); openNewNotebookModal(); });
  }

  // ---------- Notebook CRUD modals (mirrors list CRUD pattern) ----------
  function openNewNotebookModal() {
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">新建笔记本</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <input id="nb-name" placeholder="笔记本名称（如：项目 X、读书）" maxlength="20"
               class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 mb-3">
        <div class="text-xs text-slate-500 mb-1.5">颜色</div>
        <div class="flex items-center gap-2 flex-wrap">
          ${['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#a855f7','#ec4899','#64748b']
            .map((c, i) => `<button type="button" data-color="${c}" class="w-7 h-7 rounded-full border-2 ${i===0?'border-slate-800':'border-transparent'}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="nb-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">创建</button>
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
      const name = panel.querySelector('#nb-name').value.trim();
      if (!name) { App.modal.close(); return; }
      const nb = App.store.addNotebook({ name, color: pickedColor });
      App.modal.close();
      setScope('notebook:' + nb.id);
    };
    panel.querySelector('#nb-save').addEventListener('click', save);
    panel.querySelector('#nb-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    setTimeout(() => panel.querySelector('#nb-name').focus(), 30);
  }

  function openRenameNotebookModal() {
    const id = scopeNotebookId();
    const nb = App.store.get().notebooks.find((x) => x.id === id);
    if (!nb) return;
    const panel = App.modal.open(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">编辑笔记本</h3>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <input id="nbr-name" value="${App.utils.escapeHtml(nb.name)}" maxlength="20"
               class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 mb-3">
        <div class="text-xs text-slate-500 mb-1.5">颜色</div>
        <div class="flex items-center gap-2 flex-wrap">
          ${['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#a855f7','#ec4899','#64748b']
            .map((c) => `<button type="button" data-color="${c}" class="w-7 h-7 rounded-full border-2 ${c===nb.color?'border-slate-800':'border-transparent'}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="flex items-center justify-end gap-2 mt-5">
          <button data-modal-close class="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">取消</button>
          <button id="nbr-save" class="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">保存</button>
        </div>
      </div>
    `);
    let pickedColor = nb.color;
    panel.querySelectorAll('[data-color]').forEach((b) => {
      b.addEventListener('click', () => {
        pickedColor = b.dataset.color;
        panel.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('border-slate-800', x === b));
        panel.querySelectorAll('[data-color]').forEach((x) => { if (x !== b) x.classList.add('border-transparent'); });
      });
    });
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelector('#nbr-save').addEventListener('click', () => {
      const name = panel.querySelector('#nbr-name').value.trim() || nb.name;
      App.store.updateNotebook(nb.id, { name, color: pickedColor });
      App.modal.close();
    });
  }

  function confirmDeleteNotebook() {
    const id = scopeNotebookId();
    const nb = App.store.get().notebooks.find((x) => x.id === id);
    if (!nb) return;
    const count = App.store.get().notes.filter((n) => n.notebookId === nb.id).length;
    const msg = count > 0
      ? `删除笔记本「${nb.name}」？其下 ${count} 条笔记会移到"未分类"。`
      : `删除笔记本「${nb.name}」？`;
    if (!confirm(msg)) return;
    const snapshot = App.store.deleteNotebook(nb.id);
    setScope('all');
    if (snapshot) {
      App.toast.show({
        message: `已删除笔记本「${snapshot.notebook.name}」`,
        actionLabel: '撤销',
        onAction: () => {
          App.store.restoreNotebook(snapshot);
          setScope('notebook:' + snapshot.notebook.id);
        },
      });
    }
  }

  // ---------- Main render ----------
  function render(root) {
    ensureCurrent();
    const list = getList();
    const state = App.store.get();
    const current = list.find((n) => n.id === currentId) || null;
    const esc = App.utils.escapeHtml;
    const mobile = isMobile();
    const showList   = !mobile || mobileView === 'list';
    const showEditor = !mobile || mobileView === 'editor';
    const notebookMap = new Map(state.notebooks.map((nb) => [nb.id, nb]));

    const nbBadgeFor = (n) => {
      if (!n.notebookId) return '';
      const nb = notebookMap.get(n.notebookId);
      if (!nb) return '';
      // Only show notebook badge in the all/pinned/uncat scopes (i.e. not when already filtering by it)
      if (currentScope.startsWith('notebook:')) return '';
      return `<span class="inline-flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                <span class="w-1.5 h-1.5 rounded-full" style="background:${nb.color}"></span>${esc(nb.name)}
              </span>`;
    };

    root.innerHTML = `
      <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-4 h-[calc(100vh-180px)] min-h-[480px]">
        <aside class="${showList ? 'flex' : 'hidden'} md:flex bg-white rounded-xl border border-slate-200 flex-col overflow-hidden">
          <div class="p-3 border-b border-slate-100 flex items-center gap-2">
            <span class="text-slate-300">${App.icons.search(16)}</span>
            <input id="n-search" value="${esc(query)}" placeholder="搜索笔记..." class="flex-1 text-sm outline-none bg-transparent">
          </div>
          <div class="flex-1 overflow-y-auto">
            ${list.length === 0
              ? `<div class="text-center text-slate-400 text-sm py-10">${query ? '没有匹配的笔记' : '这里还没有笔记，点右上角新建'}</div>`
              : list.map((n) => {
                const active = n.id === currentId;
                return `
                  <button data-note-id="${n.id}"
                          class="w-full text-left px-3 py-3 border-b border-slate-100 last:border-0 transition
                                 ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}">
                    <div class="flex items-center gap-1.5">
                      ${n.pinned ? `<span class="text-q3">${App.icons.pin(12)}</span>` : ''}
                      <span class="text-sm font-medium truncate ${active ? 'text-brand-700' : 'text-slate-800'}">${esc(n.title || '无标题')}</span>
                    </div>
                    <div class="text-xs text-slate-400 mt-1 line-clamp-2">${esc(preview(n.content)) || '<span class="italic">空笔记</span>'}</div>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-[10px] text-slate-300">${App.utils.formatDateLabel(n.updatedAt)} ${App.utils.formatTime(n.updatedAt)}</span>
                      ${nbBadgeFor(n)}
                    </div>
                  </button>
                `;
              }).join('')}
          </div>
        </aside>

        <section class="${showEditor ? 'flex' : 'hidden'} md:flex bg-white rounded-xl border border-slate-200 flex-col overflow-hidden">
          ${current ? `
            <div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <input class="note-title" id="n-title" value="${esc(current.title)}" placeholder="无标题">
                <div class="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                  <span>最后编辑 ${App.utils.formatDateLabel(current.updatedAt)} ${App.utils.formatTime(current.updatedAt)}</span>
                  <span class="text-slate-200">·</span>
                  <select id="n-notebook" class="text-[11px] bg-transparent border border-slate-200 rounded px-1.5 py-0.5 outline-none focus:border-brand-400">
                    <option value="" ${!current.notebookId ? 'selected' : ''}>未分类</option>
                    ${state.notebooks.map((nb) => `<option value="${nb.id}" ${current.notebookId === nb.id ? 'selected' : ''}>${esc(nb.name)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button id="n-pin" class="p-2 rounded hover:bg-slate-100 ${current.pinned ? 'text-q3' : 'text-slate-400'}" title="${current.pinned ? '取消置顶' : '置顶'}">${App.icons.pin(16)}</button>
                <button id="n-delete" class="p-2 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="删除">${App.icons.trash(16)}</button>
              </div>
            </div>
            <div class="flex-1 p-5 overflow-y-auto">
              <textarea id="n-content" class="note-editor" placeholder="开始写...">${esc(current.content)}</textarea>
            </div>
            <div class="px-5 py-2 border-t border-slate-100 text-[11px] text-slate-300" id="n-status">已保存</div>
          ` : `
            <div class="flex-1 flex items-center justify-center text-slate-400 text-sm">
              选择左侧笔记，或点击右上角新建一个
            </div>
          `}
        </section>
      </div>
    `;
  }

  function bind(root) {
    // search
    const search = root.querySelector('#n-search');
    if (search) {
      search.addEventListener('input', () => {
        query = search.value;
        const focusPos = search.selectionStart;
        redraw();
        const next = _root.querySelector('#n-search');
        if (next) { next.focus(); next.setSelectionRange(focusPos, focusPos); }
      });
    }

    // list items
    root.querySelectorAll('[data-note-id]').forEach((b) => {
      b.addEventListener('click', () => {
        currentId = b.dataset.noteId;
        if (isMobile()) mobileView = 'editor';
        redraw();
      });
    });

    // pin / delete
    root.querySelector('#n-pin')?.addEventListener('click', () => {
      App.store.togglePinNote(currentId);
    });
    root.querySelector('#n-delete')?.addEventListener('click', () => {
      const snapshot = App.store.deleteNote(currentId);
      currentId = null;
      if (isMobile()) mobileView = 'list';
      if (snapshot) {
        App.toast.show({
          message: `已删除「${snapshot.note.title || '无标题'}」`,
          actionLabel: '撤销',
          onAction: () => {
            App.store.restoreNote(snapshot);
            currentId = snapshot.note.id;
            if (isMobile()) mobileView = 'editor';
          },
        });
      }
    });

    // notebook select (editor header)
    root.querySelector('#n-notebook')?.addEventListener('change', (e) => {
      App.store.updateNote(currentId, { notebookId: e.target.value || null });
    });

    // editor — auto-save on input (debounced) and on blur
    const titleEl = root.querySelector('#n-title');
    const contentEl = root.querySelector('#n-content');
    const statusEl = root.querySelector('#n-status');

    const showStatus = (txt) => { if (statusEl) statusEl.textContent = txt; };
    const save = App.utils.debounce(() => {
      if (!currentId) return;
      App.store.updateNote(currentId, {
        title: titleEl.value.trim() || '无标题',
        content: contentEl.value,
      });
      showStatus('已保存');
    }, 400);

    if (titleEl) {
      titleEl.addEventListener('input', () => { showStatus('编辑中...'); save(); });
    }
    if (contentEl) {
      contentEl.addEventListener('input', () => { showStatus('编辑中...'); save(); });
    }
  }

  function redraw() {
    // preserve scroll positions of editor and list before re-render
    const editorScroll = _root?.querySelector('#n-content')?.scrollTop;
    const listScroll = _root?.querySelector('aside .overflow-y-auto')?.scrollTop;
    const editorSel = (() => {
      const el = _root?.querySelector('#n-content');
      return el ? { start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el } : null;
    })();
    const titleSel = (() => {
      const el = _root?.querySelector('#n-title');
      return el ? { start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el } : null;
    })();

    render(_root);
    renderHeader(_header);
    bind(_root);

    if (editorScroll != null) {
      const ne = _root.querySelector('#n-content');
      if (ne) ne.scrollTop = editorScroll;
    }
    if (listScroll != null) {
      const nl = _root.querySelector('aside .overflow-y-auto');
      if (nl) nl.scrollTop = listScroll;
    }
    if (editorSel?.focused) {
      const ne = _root.querySelector('#n-content');
      if (ne) { ne.focus(); ne.setSelectionRange(editorSel.start, editorSel.end); }
    } else if (titleSel?.focused) {
      const tl = _root.querySelector('#n-title');
      if (tl) { tl.focus(); tl.setSelectionRange(titleSel.start, titleSel.end); }
    }
  }

  function mount(root, header) {
    _root = root; _header = header;
    currentScope = scopeFromHash();
    // validate notebook
    if (currentScope.startsWith('notebook:')) {
      const id = currentScope.slice(9);
      if (!App.store.get().notebooks.some((nb) => nb.id === id)) currentScope = 'all';
    }
    syncHashSilently();
    if (isMobile()) mobileView = 'list';
    redraw();
    unsubscribe = App.store.subscribe(redraw);
    _onResize = App.utils.debounce(redraw, 120);
    window.addEventListener('resize', _onResize);
    _onHash = () => {
      const newScope = scopeFromHash();
      if (newScope !== currentScope) {
        currentScope = newScope;
        currentId = null;
        redraw();
      }
    };
    window.addEventListener('hashchange', _onHash);
    return () => {
      if (unsubscribe) unsubscribe();
      if (_onResize) window.removeEventListener('resize', _onResize);
      if (_onHash) window.removeEventListener('hashchange', _onHash);
    };
  }

  return { mount, openNewNotebookModal, setScope };
})();

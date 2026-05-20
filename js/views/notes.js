window.App = window.App || {};
App.views = App.views || {};

App.views.notes = (() => {
  let currentId = null;
  let query = '';
  let mobileView = 'list'; // 'list' | 'editor', only used when viewport is mobile
  let unsubscribe = null;
  let _root, _header, _onResize;

  function isMobile() {
    return window.innerWidth < 768;
  }

  function getList() {
    const state = App.store.get();
    const q = query.trim().toLowerCase();
    let list = state.notes;
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

  function renderHeader(headerEl) {
    const showBack = isMobile() && mobileView === 'editor';
    headerEl.innerHTML = `
      <div class="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          ${showBack ? `<button id="back-to-list" class="md:hidden p-1.5 -ml-1.5 rounded hover:bg-slate-100 text-slate-500" aria-label="返回">${App.icons.chevronL(20)}</button>` : ''}
          <div class="min-w-0">
            <h1 class="text-xl md:text-2xl font-semibold text-slate-900">笔记</h1>
            <p class="text-xs text-slate-400 mt-0.5">想到什么就记下来</p>
          </div>
        </div>
        <button id="new-note" class="px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg inline-flex items-center gap-1 shrink-0">${App.icons.plus(16)} 新建</button>
      </div>
    `;
    headerEl.querySelector('#back-to-list')?.addEventListener('click', () => {
      mobileView = 'list';
      redraw();
    });
    headerEl.querySelector('#new-note').addEventListener('click', () => {
      const n = App.store.addNote({ title: '新建笔记', content: '' });
      currentId = n.id;
      mobileView = 'editor';
      redraw();
      setTimeout(() => _root.querySelector('.note-title')?.focus(), 50);
    });
  }

  function render(root) {
    ensureCurrent();
    const list = getList();
    const current = list.find((n) => n.id === currentId) || null;
    const esc = App.utils.escapeHtml;
    const mobile = isMobile();
    const showList   = !mobile || mobileView === 'list';
    const showEditor = !mobile || mobileView === 'editor';

    root.innerHTML = `
      <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-4 h-[calc(100vh-180px)] min-h-[480px]">
        <aside class="${showList ? 'flex' : 'hidden'} md:flex bg-white rounded-xl border border-slate-200 flex-col overflow-hidden">
          <div class="p-3 border-b border-slate-100 flex items-center gap-2">
            <span class="text-slate-300">${App.icons.search(16)}</span>
            <input id="n-search" value="${esc(query)}" placeholder="搜索笔记..." class="flex-1 text-sm outline-none bg-transparent">
          </div>
          <div class="flex-1 overflow-y-auto">
            ${list.length === 0
              ? `<div class="text-center text-slate-400 text-sm py-10">${query ? '没有匹配的笔记' : '还没有笔记，点右上角新建'}</div>`
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
                    <div class="text-[10px] text-slate-300 mt-1">${App.utils.formatDateLabel(n.updatedAt)} ${App.utils.formatTime(n.updatedAt)}</div>
                  </button>
                `;
              }).join('')}
          </div>
        </aside>

        <section class="${showEditor ? 'flex' : 'hidden'} md:flex bg-white rounded-xl border border-slate-200 flex-col overflow-hidden">
          ${current ? `
            <div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div class="flex-1">
                <input class="note-title" id="n-title" value="${esc(current.title)}" placeholder="无标题">
                <div class="text-[11px] text-slate-400 mt-1">最后编辑 ${App.utils.formatDateLabel(current.updatedAt)} ${App.utils.formatTime(current.updatedAt)}</div>
              </div>
              <div class="flex items-center gap-1">
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
        // re-focus search
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
      // adjust height to fill — handled by CSS already
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
    // default mobile to list view on fresh mount
    if (isMobile()) mobileView = 'list';
    redraw();
    unsubscribe = App.store.subscribe(redraw);
    _onResize = App.utils.debounce(redraw, 120);
    window.addEventListener('resize', _onResize);
    return () => {
      if (unsubscribe) unsubscribe();
      if (_onResize) window.removeEventListener('resize', _onResize);
    };
  }

  return { mount };
})();

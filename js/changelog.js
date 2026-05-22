window.App = window.App || {};

// Curated changelog. Newest entries on top.
// Each entry: {id, date, title, summary, highlights[{label, route?, openTask?, openNewTag?, selector?}]}
// "openTask: 'first'" means: navigate to schedule, pick first task, open its detail panel.
App.CHANGELOG = [
  {
    id: 'sort-filter-quickadd-2026-05-22',
    date: '2026-05-22',
    title: '排序 / 标签筛选 / 快速添加增强',
    summary: '顶部加"优先级 ▼"按 5 种维度排序；"标签 ▼"多选筛当前列表；输入任务标题后下方出现 4 个 chip（时间/清单/优先级/标签），不用进详情就能一次填好。',
    highlights: [
      { label: '排序按钮',     route: '#/schedule', selector: '#sort-btn' },
      { label: '标签筛选按钮', route: '#/schedule', selector: '#filter-tag-btn' },
      { label: '快速添加 chip', route: '#/schedule', selectorFn: () => {
          const inp = document.querySelector('#quick-add-title');
          if (inp) { inp.value = '试一下'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
          return document.querySelector('#qa-chips');
        }
      },
    ],
  },
  {
    id: 'repeat-2026-05-22',
    date: '2026-05-22',
    title: '重复任务',
    summary: '任务可设每天/每周/每月/每年循环。完成时不会消失，自动推进到下个截止日，子任务也会重置。',
    highlights: [
      { label: '行内重复图标', route: '#/schedule', selectorFn: () => document.querySelector('[data-task-id] svg[viewBox="0 0 24 24"] polyline[points="17 1 21 5 17 9"]')?.closest('[data-task-id]') },
      { label: '详情面板重复', route: '#/schedule', openTask: 'recurring', selector: '#d-repeat' },
    ],
  },
  {
    id: 'tags-2026-05-21',
    date: '2026-05-21',
    title: '标签系统',
    summary: '跨清单的横向归类。给任务打 # 标签，可在侧栏点标签筛选所有带它的任务；详情面板里点 chip 即切换。',
    highlights: [
      { label: '侧栏标签区', route: '#/schedule', selector: '#group-nav [data-group^="tag/"]' },
      { label: '任务行 chip', route: '#/schedule', selectorFn: () => document.querySelector('[data-task-id] [style*="background:#ef4444"]')?.closest('[data-task-id]') },
      { label: '详情面板编辑', route: '#/schedule', openTask: 'first', selector: '#d-tag-new' },
    ],
  },
  {
    id: 'detail-panel-2026-05-20',
    date: '2026-05-20',
    title: '任务详情面板',
    summary: '点任意任务从右侧滑出详情面板（移动端全屏），编辑标题/备注、子任务、优先级、清单、截止时间，所有改动自动保存。',
    highlights: [
      { label: '打开任意任务', route: '#/schedule', openTask: 'first' },
    ],
  },
  {
    id: 'sparkbox-layout-2026-05-20',
    date: '2026-05-20',
    title: '三栏布局（参考闪点电脑版）',
    summary: '极窄 icon 条 + 清单/分组列 + 任务区。顶部全部/今天/明天/近一周时间窗 tab；任务行优先级旗子 4 色循环；已完成下沉到底部折叠。',
    highlights: [
      { label: '时间窗 tab',    route: '#/schedule', selector: '[data-window="all"]' },
      { label: '优先级旗子',    route: '#/schedule', selector: '[data-task-id] [data-action="flag"]' },
      { label: '已完成折叠',    route: '#/schedule', selector: '#toggle-done' },
    ],
  },
];

App.changelog = (() => {
  const KEY = 'shandian.changelog.lastSeen';

  function lastSeen() { return localStorage.getItem(KEY) || ''; }
  function markSeen() {
    const latest = App.CHANGELOG[0]?.date || '';
    if (latest) localStorage.setItem(KEY, latest);
  }

  function hasUnread() {
    const seen = lastSeen();
    return App.CHANGELOG.some((e) => e.date > seen);
  }

  function isUnread(entry) {
    return entry.date > lastSeen();
  }

  function open() {
    const esc = App.utils.escapeHtml;
    const items = App.CHANGELOG.map((e, idx) => {
      const newBadge = isUnread(e) ? `<span class="ml-2 inline-block text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded">NEW</span>` : '';
      const hls = (e.highlights || []).map((h, hi) => `
        <button data-entry="${idx}" data-hl="${hi}"
                class="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 transition">
          ${esc(h.label)} ${App.icons.arrowR(11)}
        </button>
      `).join('');
      return `
        <div class="border-b border-slate-100 last:border-0 py-3">
          <div class="flex items-baseline justify-between gap-2">
            <div class="text-sm font-medium text-slate-900">${esc(e.title)}${newBadge}</div>
            <div class="text-[11px] text-slate-400 tabular-nums shrink-0">${esc(e.date)}</div>
          </div>
          <div class="text-xs text-slate-500 mt-1 leading-relaxed">${esc(e.summary)}</div>
          ${hls ? `<div class="mt-2 flex flex-wrap gap-1.5">${hls}</div>` : ''}
        </div>
      `;
    }).join('');

    const panel = App.modal.open(`
      <div class="p-5 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h3 class="font-semibold text-slate-900 inline-flex items-center gap-2">${App.icons.bell(16)} 更新日志</h3>
            <p class="text-[11px] text-slate-400 mt-0.5">点"查看"按钮可跳到对应位置看效果</p>
          </div>
          <button data-modal-close class="text-slate-400 hover:text-slate-600">${App.icons.close(18)}</button>
        </div>
        <div class="flex-1 overflow-y-auto -mx-2 px-2">${items}</div>
      </div>
    `);
    panel.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', App.modal.close));
    panel.querySelectorAll('[data-entry]').forEach((b) => {
      b.addEventListener('click', () => {
        const e = App.CHANGELOG[Number(b.dataset.entry)];
        const h = e.highlights[Number(b.dataset.hl)];
        App.modal.close();
        // small delay to let modal close before navigating + highlighting
        setTimeout(() => playHighlight(h), 80);
      });
    });
    markSeen();
    App.refreshNav?.();
  }

  function playHighlight(h) {
    if (h.route && location.hash !== h.route) location.hash = h.route;
    setTimeout(() => {
      if (h.openTask === 'first') {
        const state = App.store.get();
        const t = state.tasks.find((x) => !x.completed);
        if (t) App.detail.open(t.id);
      } else if (h.openTask === 'recurring') {
        const state = App.store.get();
        const t = state.tasks.find((x) => !x.completed && x.repeat && x.repeat.rule);
        if (t) App.detail.open(t.id);
      }
      setTimeout(() => doHighlight(h), 60);
    }, 80);
  }

  function doHighlight(h) {
    let target = null;
    if (h.selectorFn) target = h.selectorFn();
    else if (h.selector) target = document.querySelector(h.selector);
    if (!target) {
      App.toast.show({ message: '没找到对应元素，可能这个版本里它还没出现在当前视图', duration: 2400 });
      return;
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('feature-highlight');
    setTimeout(() => target.classList.remove('feature-highlight'), 3000);
  }

  return { open, hasUnread, markSeen };
})();

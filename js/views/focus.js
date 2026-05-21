window.App = window.App || {};
App.views = App.views || {};

App.views.focus = (() => {
  // Lightweight placeholder: shows a static 25:00 timer dial and selected-task slot.
  // Real timer logic + statistics belong to v2.
  let _root, _header;

  function renderHeader(headerEl) {
    headerEl.innerHTML = `
      <div class="max-w-3xl mx-auto">
        <h1 class="text-xl md:text-2xl font-semibold text-slate-900">专注</h1>
        <p class="text-xs text-slate-400 mt-0.5">挑一个任务，开个番茄。v2 上线后会真正计时与统计。</p>
      </div>
    `;
  }

  function render(root) {
    const state = App.store.get();
    const candidates = state.tasks
      .filter((t) => !t.completed && t.dueAt && App.utils.isSameDay(t.dueAt, new Date()))
      .slice(0, 5);
    const esc = App.utils.escapeHtml;

    root.innerHTML = `
      <div class="max-w-3xl mx-auto flex flex-col items-center justify-center pt-6 pb-8">
        <div class="relative w-60 h-60 md:w-72 md:h-72 rounded-full bg-gradient-to-br from-brand-50 to-indigo-100 shadow-inner flex items-center justify-center">
          <svg class="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(99,102,241,0.15)" stroke-width="4"/>
            <circle cx="50" cy="50" r="46" fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round"
                    stroke-dasharray="289" stroke-dashoffset="72" />
          </svg>
          <div class="relative text-center">
            <div class="text-5xl md:text-6xl font-semibold text-slate-800 tabular-nums">25:00</div>
            <div class="text-xs text-slate-400 mt-2">25 分钟 · 一个番茄</div>
          </div>
        </div>

        <button disabled class="mt-8 px-8 py-3 rounded-full bg-brand-600 text-white text-sm font-medium opacity-70 cursor-not-allowed inline-flex items-center gap-2">
          ▶ 开始专注
          <span class="ml-1 text-[10px] bg-white/20 px-1.5 py-0.5 rounded">即将上线</span>
        </button>

        <div class="w-full mt-10 bg-white rounded-xl border border-slate-200 p-4">
          <div class="text-sm font-medium text-slate-700 mb-2">今日候选任务</div>
          ${candidates.length === 0
            ? `<div class="text-sm text-slate-400 py-4 text-center">今天没有带时间的任务，先去日程添加</div>`
            : candidates.map((t) => `
                <div class="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                  <span class="text-xs text-slate-400 tabular-nums w-12">${App.utils.formatTime(t.dueAt)}</span>
                  <span class="text-sm text-slate-700 truncate flex-1">${esc(t.title)}</span>
                  <button disabled class="text-xs text-slate-300 px-2 py-1 rounded border border-slate-200">选为本轮</button>
                </div>
              `).join('')}
        </div>

        <div class="mt-6 grid grid-cols-3 gap-3 w-full text-center">
          <div class="bg-white rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-400">今日专注</div>
            <div class="text-lg font-semibold text-slate-700 mt-1 tabular-nums">— 分</div>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-400">连续天数</div>
            <div class="text-lg font-semibold text-slate-700 mt-1 tabular-nums">—</div>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-400">本周番茄</div>
            <div class="text-lg font-semibold text-slate-700 mt-1 tabular-nums">—</div>
          </div>
        </div>
      </div>
    `;
  }

  function mount(root, header) {
    _root = root; _header = header;
    render(root);
    renderHeader(header);
    const unsubscribe = App.store.subscribe(() => render(root));
    return () => unsubscribe();
  }

  return { mount };
})();

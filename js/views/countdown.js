window.App = window.App || {};
App.views = App.views || {};

App.views.countdown = (() => {
  const SAMPLE = [
    { name: '春节',     date: '2027-02-17', emoji: '🧧', color: '#ef4444' },
    { name: '生日',     date: '2026-09-12', emoji: '🎂', color: '#6366f1' },
    { name: '项目上线', date: '2026-06-30', emoji: '🚀', color: '#10b981' },
  ];

  function daysTo(iso) {
    const today = App.utils.startOfDay(new Date()).getTime();
    const target = App.utils.startOfDay(new Date(iso)).getTime();
    return Math.round((target - today) / 86400000);
  }

  function renderHeader(headerEl) {
    headerEl.innerHTML = `
      <div class="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div>
          <h1 class="text-xl md:text-2xl font-semibold text-slate-900">倒数日</h1>
          <p class="text-xs text-slate-400 mt-0.5">看着重要的日子一天天临近 · v2 上线后真正能新建</p>
        </div>
        <button disabled class="px-3 py-1.5 text-sm bg-slate-200 text-slate-400 rounded-lg inline-flex items-center gap-1 cursor-not-allowed">+ 新建</button>
      </div>
    `;
  }

  function render(root) {
    root.innerHTML = `
      <div class="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${SAMPLE.map((c) => {
          const n = daysTo(c.date);
          const big = n === 0 ? '今天' : (n > 0 ? `${n}` : `${-n}`);
          const label = n === 0 ? '就是今天' : (n > 0 ? '天后' : '天前');
          return `
            <div class="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
              <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0" style="background:${c.color}1a">${c.emoji}</div>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-slate-500">${c.name}</div>
                <div class="flex items-baseline gap-1 mt-1">
                  <span class="text-3xl font-semibold tabular-nums" style="color:${c.color}">${big}</span>
                  <span class="text-xs text-slate-400">${label}</span>
                </div>
                <div class="text-[11px] text-slate-300 mt-0.5">${c.date}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="max-w-3xl mx-auto mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <div class="font-medium mb-1">这是示意界面</div>
        <div class="text-amber-700 text-xs">v2 会接通新建/编辑、农历换算、生日重复、桌面挂件。</div>
      </div>
    `;
  }

  function mount(root, header) {
    render(root);
    renderHeader(header);
    return () => {};
  }

  return { mount };
})();

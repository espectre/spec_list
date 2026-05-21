window.App = window.App || {};
App.views = App.views || {};

App.views.habits = (() => {
  // Placeholder habits view — shows the intended UI shape so the rest of the app
  // feels finished. Actual streak tracking, heatmap, edit/CRUD belong to v2.
  const SAMPLE = [
    { name: '每天阅读 30 分钟', emoji: '📚', streak: 4, color: '#6366f1' },
    { name: '喝水 8 杯',       emoji: '💧', streak: 2, color: '#0ea5e9' },
    { name: '走 7000 步',      emoji: '🚶', streak: 0, color: '#10b981' },
  ];

  function renderHeader(headerEl) {
    headerEl.innerHTML = `
      <div class="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div>
          <h1 class="text-xl md:text-2xl font-semibold text-slate-900">习惯</h1>
          <p class="text-xs text-slate-400 mt-0.5">每天点一下就完成 · v2 上线后真正记数据</p>
        </div>
        <button disabled class="px-3 py-1.5 text-sm bg-slate-200 text-slate-400 rounded-lg inline-flex items-center gap-1 cursor-not-allowed">+ 新建习惯</button>
      </div>
    `;
  }

  function dayDots(streak) {
    // 7 dots representing past week, filled based on a fake pattern derived from streak.
    const filled = Math.min(streak, 7);
    return Array.from({ length: 7 }).map((_, i) => {
      const isFilled = i >= 7 - filled;
      return `<span class="w-3.5 h-3.5 rounded-full ${isFilled ? 'bg-brand-500' : 'bg-slate-200'}"></span>`;
    }).join('');
  }

  function render(root) {
    root.innerHTML = `
      <div class="max-w-3xl mx-auto">
        <div class="space-y-2.5">
          ${SAMPLE.map((h) => `
            <div class="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-4 py-3">
              <div class="w-10 h-10 rounded-full flex items-center justify-center text-xl" style="background:${h.color}1a">${h.emoji}</div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-slate-800 truncate">${h.name}</div>
                <div class="text-xs text-slate-400 mt-0.5">连续 ${h.streak} 天</div>
              </div>
              <div class="hidden sm:flex items-center gap-1">${dayDots(h.streak)}</div>
              <button disabled class="w-9 h-9 rounded-full border-2 border-slate-200 text-slate-300 cursor-not-allowed" title="今日打卡">✓</button>
            </div>
          `).join('')}
        </div>

        <div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <div class="font-medium mb-1">这是示意界面</div>
          <div class="text-amber-700 text-xs">v2 会接通：自建习惯、连续天数与热力图、补打、提醒、按周/月报表。要不要这一项作为下一轮的优先级？告诉我。</div>
        </div>
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

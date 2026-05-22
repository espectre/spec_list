window.App = window.App || {};

// Task detail panel. Slides in from the right on desktop (4th column);
// covers full-screen on mobile.
App.detail = (() => {
  const panel = document.getElementById('detail-panel');
  let currentId = null;
  let unsubscribe = null;
  let _onResize = null;

  function isMobile() { return window.innerWidth < 768; }

  function applyClasses() {
    if (currentId == null) {
      panel.className = 'hidden';
      document.body.classList.remove('detail-open');
      return;
    }
    if (isMobile()) {
      panel.className = 'fixed inset-0 z-40 bg-white flex flex-col overflow-y-auto';
    } else {
      panel.className = 'shrink-0 w-96 bg-white border-l border-slate-200 flex flex-col overflow-hidden';
    }
    document.body.classList.add('detail-open');
  }

  function open(taskId) {
    currentId = taskId;
    applyClasses();
    render();
    if (!unsubscribe) unsubscribe = App.store.subscribe(refreshIfOpen);
    if (!_onResize) {
      _onResize = App.utils.debounce(() => { if (currentId) { applyClasses(); render(); } }, 100);
      window.addEventListener('resize', _onResize);
    }
  }

  function close() {
    currentId = null;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (_onResize) { window.removeEventListener('resize', _onResize); _onResize = null; }
    panel.innerHTML = '';
    applyClasses();
  }

  function refreshIfOpen() {
    if (currentId) render();
  }

  const FLAG_STATES = [
    { imp: 0, urg: 0, color: '#cbd5e1', label: '无' },
    { imp: 1, urg: 1, color: '#ef4444', label: '重要紧急' },
    { imp: 1, urg: 0, color: '#f59e0b', label: '重要' },
    { imp: 0, urg: 1, color: '#3b82f6', label: '紧急' },
  ];

  function render() {
    const state = App.store.get();
    const t = state.tasks.find((x) => x.id === currentId);
    if (!t) { close(); return; }
    const esc = App.utils.escapeHtml;

    const dueDate = t.dueAt ? App.utils.toDateKey(t.dueAt) : '';
    const dueTime = t.dueAt ? App.utils.formatTime(t.dueAt) : '';
    const listOptions = `
      <option value="" ${!t.listId ? 'selected' : ''}>任务箱（无清单）</option>
      ${state.lists.map((l) => `<option value="${l.id}" ${t.listId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
    `;

    // Preserve focus/selection state across re-renders for inputs that user is editing
    const focused = document.activeElement;
    const focusId = focused && panel.contains(focused) ? focused.id || focused.dataset?.subId : null;
    const focusSelStart = focused?.selectionStart;
    const focusSelEnd = focused?.selectionEnd;

    panel.innerHTML = `
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <div class="flex items-center gap-2">
          <button id="d-close" class="text-slate-400 hover:text-slate-800 p-1.5 rounded hover:bg-slate-100" title="关闭">${App.icons.close(18)}</button>
        </div>
        <div class="flex items-center gap-1">
          <button id="d-delete" class="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50" title="删除任务">${App.icons.trash(16)}</button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4">
        <!-- Title row with checkbox -->
        <div class="flex items-start gap-3">
          <input type="checkbox" class="task-check mt-1.5 shrink-0" ${t.completed ? 'checked' : ''} id="d-complete">
          <input id="d-title" value="${esc(t.title)}" placeholder="任务标题"
                 class="flex-1 text-lg font-medium outline-none bg-transparent border-0 ${t.completed ? 'line-through text-slate-400' : 'text-slate-900'}">
        </div>

        <!-- Detail / notes -->
        <textarea id="d-detail" placeholder="备注..." rows="3"
                  class="w-full bg-slate-50 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-brand-100 border border-transparent focus:border-brand-400 rounded-lg px-3 py-2 text-sm outline-none resize-none transition">${esc(t.detail)}</textarea>

        <!-- Meta rows -->
        <div class="border-t border-slate-100 pt-3 space-y-2">
          ${metaRow('优先级', 'flag', `
            <div class="flex items-center gap-1.5">
              ${FLAG_STATES.map((s, i) => `
                <button data-flag-idx="${i}" title="${s.label}"
                        class="w-8 h-8 rounded-lg ${s.imp === t.importance && s.urg === t.urgency ? 'bg-slate-100 ring-1 ring-slate-300' : 'hover:bg-slate-50'} inline-flex items-center justify-center">
                  <span style="color:${s.color}">${App.icons.flagFill(15)}</span>
                </button>
              `).join('')}
            </div>
          `)}
          ${metaRow('截止时间', 'clock', `
            <div class="flex items-center gap-1.5">
              <input id="d-date" type="date" value="${dueDate}" class="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-brand-400">
              <input id="d-time" type="time" value="${dueTime}" class="w-24 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-brand-400">
              ${t.dueAt ? `<button id="d-clear-due" class="text-xs text-slate-400 hover:text-red-500 ml-1" title="清除">${App.icons.close(14)}</button>` : ''}
            </div>
          `)}
          ${metaRow('清单', 'list', `
            <select id="d-list" class="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-brand-400 bg-white">${listOptions}</select>
          `)}
          ${repeatRow(t)}
          ${reminderRow(t)}
          ${tagsRow(t, state)}
        </div>

        <!-- Subtasks -->
        <div class="border-t border-slate-100 pt-3">
          <div class="text-xs text-slate-500 mb-2 flex items-center gap-2">
            <span>子任务</span>
            ${t.subtasks?.length > 0 ? `<span class="text-slate-400">${t.subtasks.filter(s => s.completed).length} / ${t.subtasks.length}</span>` : ''}
          </div>
          <div class="space-y-1">
            ${(t.subtasks || []).map((s) => subtaskRow(s)).join('')}
          </div>
          <form id="d-add-sub" class="flex items-center gap-2 mt-2">
            <span class="w-4 h-4 rounded-full border border-slate-300 inline-flex items-center justify-center text-slate-300 shrink-0">${App.icons.plus(10)}</span>
            <input id="d-sub-new" placeholder="添加子任务" maxlength="100"
                   class="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400">
          </form>
        </div>

        <!-- Timestamps -->
        <div class="border-t border-slate-100 pt-3 text-[11px] text-slate-400 space-y-0.5">
          <div>创建 ${App.utils.formatDateLabel(t.createdAt)} ${App.utils.formatTime(t.createdAt)}</div>
          <div>更新 ${App.utils.formatDateLabel(t.updatedAt)} ${App.utils.formatTime(t.updatedAt)}</div>
          ${t.completedAt ? `<div>完成 ${App.utils.formatDateLabel(t.completedAt)} ${App.utils.formatTime(t.completedAt)}</div>` : ''}
        </div>
      </div>
    `;

    bind(t);

    // Restore focus + selection
    if (focusId) {
      const el = panel.querySelector(`#${focusId}`) || panel.querySelector(`[data-sub-id="${focusId}"]`);
      if (el) {
        el.focus();
        if (focusSelStart != null && el.setSelectionRange) {
          try { el.setSelectionRange(focusSelStart, focusSelEnd); } catch (e) {}
        }
      }
    }
  }

  function repeatRow(t) {
    const rule = (t.repeat && t.repeat.rule) || '';
    const hasDue = !!t.dueAt;
    const options = [
      { v: '',        l: '不重复' },
      { v: 'daily',   l: '每天' },
      { v: 'weekly',  l: '每周' },
      { v: 'monthly', l: '每月' },
      { v: 'yearly',  l: '每年' },
    ];
    let nextLabel = '';
    if (rule && hasDue) {
      const next = App.store.nextOccurrence(t.dueAt, rule);
      if (next) nextLabel = App.utils.formatDateLabel(next);
    }
    return `
      <div class="flex items-center gap-3 px-1 py-1">
        <span class="text-slate-400 w-4 shrink-0">${App.icons.repeat(14)}</span>
        <span class="text-xs text-slate-500 w-14 shrink-0">重复</span>
        <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <select id="d-repeat" ${!hasDue ? 'disabled' : ''} class="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-brand-400 bg-white ${!hasDue ? 'opacity-50' : ''}">
            ${options.map(o => `<option value="${o.v}" ${o.v === rule ? 'selected' : ''}>${o.l}</option>`).join('')}
          </select>
          ${rule && nextLabel ? `<span class="text-[11px] text-slate-400">下次 ${nextLabel}</span>` : ''}
          ${!hasDue ? '<span class="text-[11px] text-slate-400">需先设截止时间</span>' : ''}
        </div>
      </div>
    `;
  }

  function reminderRow(t) {
    const hasDue = !!t.dueAt;
    const minutes = t.reminder && Number.isFinite(t.reminder.offsetMinutes) ? t.reminder.offsetMinutes : null;
    const options = [
      { v: '',     l: '不提醒' },
      { v: '0',    l: '准点' },
      { v: '5',    l: '提前 5 分钟' },
      { v: '10',   l: '提前 10 分钟' },
      { v: '30',   l: '提前 30 分钟' },
      { v: '60',   l: '提前 1 小时' },
      { v: '1440', l: '提前 1 天' },
    ];
    const current = minutes == null ? '' : String(minutes);
    const perm = App.reminder?.permission?.() || 'unsupported';
    let permWarn = '';
    if (minutes != null && hasDue) {
      if (perm === 'denied') permWarn = '<span class="text-[11px] text-red-500">浏览器已拒绝通知</span>';
      else if (perm === 'default') permWarn = '<button id="d-reminder-enable" class="text-[11px] text-amber-600 underline">未开启通知，点此开启</button>';
      else if (perm === 'unsupported') permWarn = '<span class="text-[11px] text-slate-400">当前浏览器不支持通知</span>';
    }
    return `
      <div class="flex items-center gap-3 px-1 py-1">
        <span class="text-slate-400 w-4 shrink-0">${App.icons.bell(14)}</span>
        <span class="text-xs text-slate-500 w-14 shrink-0">提醒</span>
        <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <select id="d-reminder" ${!hasDue ? 'disabled' : ''} class="text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-brand-400 bg-white ${!hasDue ? 'opacity-50' : ''}">
            ${options.map((o) => `<option value="${o.v}" ${o.v === current ? 'selected' : ''}>${o.l}</option>`).join('')}
          </select>
          ${!hasDue ? '<span class="text-[11px] text-slate-400">需先设截止时间</span>' : ''}
          ${permWarn}
        </div>
      </div>
    `;
  }

  function tagsRow(t, state) {
    const esc = App.utils.escapeHtml;
    const selected = new Set(t.tagIds || []);
    const chips = state.tags.map((tg) => {
      const on = selected.has(tg.id);
      const style = on
        ? `background:${tg.color};color:white;border-color:${tg.color}`
        : `color:${tg.color};border-color:${tg.color}66`;
      return `<button data-tag-toggle="${tg.id}" class="text-[11px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 transition hover:opacity-80" style="${style}">#${esc(tg.name)}</button>`;
    }).join('');
    return `
      <div class="flex items-start gap-3 px-1 py-1.5">
        <span class="text-slate-400 w-4 shrink-0 mt-0.5">${App.icons.tags(14)}</span>
        <span class="text-xs text-slate-500 w-14 shrink-0 mt-1">标签</span>
        <div class="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
          ${chips || '<span class="text-xs text-slate-400">暂无标签</span>'}
          <button id="d-tag-new" class="text-[11px] text-slate-400 hover:text-brand-600 inline-flex items-center gap-0.5 px-1 py-0.5">${App.icons.plus(12)} 新建</button>
        </div>
      </div>
    `;
  }

  function metaRow(label, iconName, body) {
    return `
      <div class="flex items-center gap-3 px-1 py-1">
        <span class="text-slate-400 w-4 shrink-0">${App.icons[iconName]?.(14) || ''}</span>
        <span class="text-xs text-slate-500 w-14 shrink-0">${label}</span>
        <div class="flex-1 min-w-0">${body}</div>
      </div>
    `;
  }

  function disabledMetaRow(label, value) {
    return `
      <div class="flex items-center gap-3 px-1 py-1 opacity-50">
        <span class="text-slate-400 w-4 shrink-0">·</span>
        <span class="text-xs text-slate-500 w-14 shrink-0">${label}</span>
        <div class="flex-1 text-sm text-slate-400 flex items-center gap-2">${value} <span class="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">v2</span></div>
      </div>
    `;
  }

  function subtaskRow(s) {
    const esc = App.utils.escapeHtml;
    return `
      <div class="group flex items-center gap-2 py-1" data-sub-row="${s.id}">
        <input type="checkbox" class="task-check shrink-0" ${s.completed ? 'checked' : ''} data-sub-toggle="${s.id}">
        <input data-sub-id="${s.id}" data-sub-edit value="${esc(s.title)}"
               class="flex-1 text-sm bg-transparent outline-none px-1 py-0.5 rounded hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-200
                      ${s.completed ? 'line-through text-slate-400' : 'text-slate-700'}">
        <button data-sub-delete="${s.id}" class="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 px-1 transition" title="删除子任务">${App.icons.close(14)}</button>
      </div>
    `;
  }

  function bind(t) {
    panel.querySelector('#d-close').addEventListener('click', close);
    panel.querySelector('#d-delete').addEventListener('click', () => {
      const snapshot = App.store.deleteTask(t.id);
      close();
      if (snapshot) {
        App.toast.show({
          message: `已删除「${snapshot.task.title}」`,
          actionLabel: '撤销',
          onAction: () => App.store.restoreTask(snapshot),
        });
      }
    });

    panel.querySelector('#d-complete').addEventListener('change', () => App.store.toggleTask(t.id));

    // Title (debounced auto-save)
    const titleEl = panel.querySelector('#d-title');
    const detailEl = panel.querySelector('#d-detail');
    const saveTitle = App.utils.debounce(() => {
      App.store.updateTask(t.id, { title: titleEl.value.trim() || '未命名任务' });
    }, 400);
    titleEl.addEventListener('input', saveTitle);
    titleEl.addEventListener('blur', () => {
      App.store.updateTask(t.id, { title: titleEl.value.trim() || '未命名任务' });
    });

    const saveDetail = App.utils.debounce(() => {
      App.store.updateTask(t.id, { detail: detailEl.value });
    }, 400);
    detailEl.addEventListener('input', saveDetail);
    detailEl.addEventListener('blur', () => App.store.updateTask(t.id, { detail: detailEl.value }));

    // Priority flag
    panel.querySelectorAll('[data-flag-idx]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.flagIdx);
        const s = FLAG_STATES[i];
        App.store.updateTask(t.id, { importance: s.imp, urgency: s.urg });
      });
    });

    // Due date / time
    const dateEl = panel.querySelector('#d-date');
    const timeEl = panel.querySelector('#d-time');
    const saveDue = () => {
      const date = dateEl.value;
      const time = timeEl.value;
      if (!date) {
        App.store.updateTask(t.id, { dueAt: null });
        return;
      }
      const d = App.utils.fromDateKey(date);
      if (time) {
        const [hh, mm] = time.split(':').map(Number);
        d.setHours(hh, mm, 0, 0);
      } else {
        d.setHours(0, 0, 0, 0);
      }
      App.store.updateTask(t.id, { dueAt: d.toISOString() });
    };
    dateEl.addEventListener('change', saveDue);
    timeEl.addEventListener('change', saveDue);
    panel.querySelector('#d-clear-due')?.addEventListener('click', () => {
      App.store.updateTask(t.id, { dueAt: null });
    });

    // List
    panel.querySelector('#d-list').addEventListener('change', (e) => {
      App.store.updateTask(t.id, { listId: e.target.value || null });
    });

    // Repeat
    panel.querySelector('#d-repeat')?.addEventListener('change', (e) => {
      const v = e.target.value;
      App.store.updateTask(t.id, { repeat: v ? { rule: v } : null });
    });

    // Reminder
    panel.querySelector('#d-reminder')?.addEventListener('change', (e) => {
      const v = e.target.value;
      const reminder = v === '' ? null : { offsetMinutes: Number(v) };
      App.store.updateTask(t.id, { reminder, reminderFiredAt: null });
    });
    panel.querySelector('#d-reminder-enable')?.addEventListener('click', async () => {
      const res = await App.reminder.request();
      if (res === 'granted') App.toast.show({ message: '通知已开启', duration: 1500 });
      // Trigger re-render so the warning hint updates
      App.detail.refresh?.();
    });

    // Subtasks: toggle / edit / delete
    panel.querySelectorAll('[data-sub-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => App.store.toggleSubtask(t.id, cb.dataset.subToggle));
    });
    panel.querySelectorAll('[data-sub-edit]').forEach((inp) => {
      inp.addEventListener('blur', () => {
        const title = inp.value.trim();
        if (!title) return; // ignore empty blur, don't delete via empty
        App.store.updateSubtask(t.id, inp.dataset.subId, { title });
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); panel.querySelector('#d-sub-new')?.focus(); }
      });
    });
    panel.querySelectorAll('[data-sub-delete]').forEach((b) => {
      b.addEventListener('click', () => App.store.deleteSubtask(t.id, b.dataset.subDelete));
    });

    // Tags
    panel.querySelectorAll('[data-tag-toggle]').forEach((b) => {
      b.addEventListener('click', () => {
        const tagId = b.dataset.tagToggle;
        const cur = App.store.get().tasks.find((x) => x.id === t.id);
        if (!cur) return;
        const next = (cur.tagIds || []).includes(tagId)
          ? cur.tagIds.filter((x) => x !== tagId)
          : [...(cur.tagIds || []), tagId];
        App.store.setTaskTags(t.id, next);
      });
    });
    panel.querySelector('#d-tag-new')?.addEventListener('click', () => {
      App.views.schedule.openNewTagModal((tg) => {
        const cur = App.store.get().tasks.find((x) => x.id === t.id);
        if (cur) {
          const next = [...(cur.tagIds || [])];
          if (!next.includes(tg.id)) next.push(tg.id);
          App.store.setTaskTags(t.id, next);
        }
      });
    });

    // Add subtask
    const addForm = panel.querySelector('#d-add-sub');
    const addInput = panel.querySelector('#d-sub-new');
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = addInput.value.trim();
      if (!title) return;
      App.store.addSubtask(t.id, title);
      addInput.value = '';
      setTimeout(() => panel.querySelector('#d-sub-new')?.focus(), 30);
    });
  }

  return { open, close, refresh: refreshIfOpen };
})();

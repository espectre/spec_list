window.App = window.App || {};

/**
 * Storage abstraction. Today it persists to localStorage; later a SyncedStore
 * can replace this with a remote backend without touching views.
 *
 * Data shape:
 *   {
 *     tasks: Task[],
 *     notes: Note[],
 *     lists: List[],
 *     meta:  { seededAt, version }
 *   }
 *
 * Task: {
 *   id, title, detail,
 *   listId (string | null),  // null = no list / inbox
 *   dueAt (ISO string | null),
 *   importance (0|1), urgency (0|1),   // 1 = high
 *   completed, completedAt,
 *   createdAt, updatedAt,
 * }
 * List: { id, name, color, order, createdAt }
 * Note: { id, title, content, pinned, createdAt, updatedAt }
 */
App.store = (() => {
  const KEY = 'shandian.v1';
  const listeners = new Set();
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const parsed = JSON.parse(raw);
      // forward-compat: backfill missing collections
      parsed.tasks = parsed.tasks || [];
      parsed.notes = parsed.notes || [];
      parsed.lists = parsed.lists || [];
      parsed.meta = parsed.meta || { version: 1 };
      // backfill listId on tasks loaded from older versions
      parsed.tasks.forEach((t) => { if (!('listId' in t)) t.listId = null; });
      return parsed;
    } catch (e) {
      console.warn('store: load failed, reseeding', e);
      return seed();
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('store: persist failed', e);
    }
  }

  function emit() {
    persist();
    listeners.forEach((fn) => {
      try { fn(state); } catch (e) { console.error(e); }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function get() {
    return state;
  }

  // ---------- Tasks ----------
  function addTask(partial) {
    const now = new Date().toISOString();
    const task = {
      id: App.utils.uid(),
      title: (partial.title || '').trim() || '未命名任务',
      detail: partial.detail || '',
      listId: partial.listId || null,
      dueAt: partial.dueAt || null,
      importance: partial.importance ? 1 : 0,
      urgency: partial.urgency ? 1 : 0,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    state.tasks.unshift(task);
    emit();
    return task;
  }

  function updateTask(id, patch) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    emit();
    return t;
  }

  function toggleTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    t.completedAt = t.completed ? new Date().toISOString() : null;
    t.updatedAt = new Date().toISOString();
    emit();
  }

  function deleteTask(id) {
    const idx = state.tasks.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    const [removed] = state.tasks.splice(idx, 1);
    emit();
    return { task: removed, index: idx };
  }

  function restoreTask(snapshot) {
    if (!snapshot || !snapshot.task) return;
    const at = Math.min(snapshot.index, state.tasks.length);
    state.tasks.splice(at, 0, snapshot.task);
    emit();
  }

  function setQuadrant(id, importance, urgency) {
    return updateTask(id, { importance: importance ? 1 : 0, urgency: urgency ? 1 : 0 });
  }

  function quadrantOf(t) {
    if (t.importance && t.urgency) return 'q1';
    if (t.importance && !t.urgency) return 'q2';
    if (!t.importance && t.urgency) return 'q3';
    return 'q4';
  }

  // ---------- Lists ----------
  function addList(partial = {}) {
    const now = new Date().toISOString();
    const list = {
      id: App.utils.uid(),
      name: (partial.name || '').trim() || '新建清单',
      color: partial.color || '#6366f1',
      order: state.lists.length,
      createdAt: now,
    };
    state.lists.push(list);
    emit();
    return list;
  }

  function updateList(id, patch) {
    const l = state.lists.find((x) => x.id === id);
    if (!l) return null;
    Object.assign(l, patch);
    emit();
    return l;
  }

  function deleteList(id) {
    const idx = state.lists.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    const [removed] = state.lists.splice(idx, 1);
    // detach tasks (move to inbox / no list)
    const movedIds = [];
    state.tasks.forEach((t) => {
      if (t.listId === id) {
        movedIds.push(t.id);
        t.listId = null;
        t.updatedAt = new Date().toISOString();
      }
    });
    emit();
    return { list: removed, index: idx, movedTaskIds: movedIds };
  }

  function restoreList(snapshot) {
    if (!snapshot || !snapshot.list) return;
    const at = Math.min(snapshot.index, state.lists.length);
    state.lists.splice(at, 0, snapshot.list);
    (snapshot.movedTaskIds || []).forEach((tid) => {
      const t = state.tasks.find((x) => x.id === tid);
      if (t) {
        t.listId = snapshot.list.id;
        t.updatedAt = new Date().toISOString();
      }
    });
    emit();
  }

  // ---------- Notes ----------
  function addNote(partial = {}) {
    const now = new Date().toISOString();
    const note = {
      id: App.utils.uid(),
      title: partial.title || '新建笔记',
      content: partial.content || '',
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    state.notes.unshift(note);
    emit();
    return note;
  }

  function updateNote(id, patch) {
    const n = state.notes.find((x) => x.id === id);
    if (!n) return null;
    Object.assign(n, patch, { updatedAt: new Date().toISOString() });
    emit();
    return n;
  }

  function deleteNote(id) {
    const idx = state.notes.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    const [removed] = state.notes.splice(idx, 1);
    emit();
    return { note: removed, index: idx };
  }

  function restoreNote(snapshot) {
    if (!snapshot || !snapshot.note) return;
    const at = Math.min(snapshot.index, state.notes.length);
    state.notes.splice(at, 0, snapshot.note);
    emit();
  }

  function togglePinNote(id) {
    const n = state.notes.find((x) => x.id === id);
    if (!n) return;
    n.pinned = !n.pinned;
    n.updatedAt = new Date().toISOString();
    emit();
  }

  // ---------- Seed ----------
  function seed() {
    const now = new Date();
    const isoIn = (h) => {
      const d = new Date(now);
      d.setHours(d.getHours() + h);
      return d.toISOString();
    };
    const todayAt = (hh, mm = 0) => {
      const d = new Date(now);
      d.setHours(hh, mm, 0, 0);
      return d.toISOString();
    };
    const dayOffset = (days, hh = 9, mm = 0) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      d.setHours(hh, mm, 0, 0);
      return d.toISOString();
    };

    const work    = { id: App.utils.uid(), name: '工作', color: '#6366f1', order: 0, createdAt: isoIn(-72) };
    const life    = { id: App.utils.uid(), name: '生活', color: '#10b981', order: 1, createdAt: isoIn(-72) };
    const reading = { id: App.utils.uid(), name: '学习', color: '#f59e0b', order: 2, createdAt: isoIn(-72) };

    const data = {
      lists: [work, life, reading],
      tasks: [
        { id: App.utils.uid(), title: '准备项目周会汇报', detail: '梳理本周进展与下周计划', listId: work.id,    dueAt: todayAt(15, 30),     importance: 1, urgency: 1, completed: false, completedAt: null,       createdAt: isoIn(-2),  updatedAt: isoIn(-2) },
        { id: App.utils.uid(), title: '回复客户邮件',     detail: '',                     listId: work.id,    dueAt: todayAt(11, 0),      importance: 0, urgency: 1, completed: false, completedAt: null,       createdAt: isoIn(-3),  updatedAt: isoIn(-3) },
        { id: App.utils.uid(), title: '阅读《深度工作》第三章', detail: '记录三条要点',    listId: reading.id, dueAt: dayOffset(2, 21),    importance: 1, urgency: 0, completed: false, completedAt: null,       createdAt: isoIn(-5),  updatedAt: isoIn(-5) },
        { id: App.utils.uid(), title: '清理桌面文件',     detail: '',                     listId: null,       dueAt: null,                importance: 0, urgency: 0, completed: false, completedAt: null,       createdAt: isoIn(-10), updatedAt: isoIn(-10) },
        { id: App.utils.uid(), title: '体检预约',         detail: '上午空腹',              listId: life.id,    dueAt: dayOffset(5, 8, 30), importance: 1, urgency: 0, completed: false, completedAt: null,       createdAt: isoIn(-12), updatedAt: isoIn(-12) },
        { id: App.utils.uid(), title: '提交月度报销',     detail: '',                     listId: work.id,    dueAt: dayOffset(-1, 18),   importance: 0, urgency: 1, completed: true,  completedAt: isoIn(-20), createdAt: isoIn(-30), updatedAt: isoIn(-20) },
      ],
      notes: [
        {
          id: App.utils.uid(),
          title: '欢迎使用闪点',
          content: '这是你的第一条笔记。\n\n你可以在这里随手记录想法、会议要点、灵感。\n\n左侧选中笔记，右侧编辑，自动保存。',
          pinned: true,
          createdAt: isoIn(-48),
          updatedAt: isoIn(-1),
        },
        {
          id: App.utils.uid(),
          title: '本周复盘',
          content: '做得好的：\n- 完成了 OKR 初稿\n- 健身 3 次\n\n可以改进：\n- 早睡\n- 减少切换上下文',
          pinned: false,
          createdAt: isoIn(-24),
          updatedAt: isoIn(-2),
        },
      ],
      meta: { version: 1, seededAt: now.toISOString() },
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    return data;
  }

  function reset() {
    localStorage.removeItem(KEY);
    state = seed();
    emit();
  }

  return {
    subscribe,
    get,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    restoreTask,
    setQuadrant,
    quadrantOf,
    addList,
    updateList,
    deleteList,
    restoreList,
    addNote,
    updateNote,
    deleteNote,
    restoreNote,
    togglePinNote,
    reset,
  };
})();

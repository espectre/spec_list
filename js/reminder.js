window.App = window.App || {};

// Reminder engine. Scans tasks once a minute; uses the Notification API to
// fire desktop/mobile notifications when a task's reminder time elapses.
//
// Limitations (acceptable for MVP):
// - Only works while the app's tab is open. Closed tab = no notification.
// - Once permission is denied by the browser the user has to re-enable it in
//   browser settings; we don't nag.
App.reminder = (() => {
  const SCAN_INTERVAL_MS = 30 * 1000;
  const ASKED_KEY = 'shandian.notif.asked';

  let intervalId = null;

  function supported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  function permission() {
    if (!supported()) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  async function request() {
    if (!supported()) return 'unsupported';
    localStorage.setItem(ASKED_KEY, '1');
    try {
      const result = await Notification.requestPermission();
      // After granting, do an immediate scan so any due-but-not-yet-fired
      // notifications fire right away.
      if (result === 'granted') checkOnce();
      return result;
    } catch (e) {
      return permission();
    }
  }

  function asked() {
    return !!localStorage.getItem(ASKED_KEY);
  }

  function maybePromptOnStart() {
    if (!supported()) return;
    if (permission() !== 'default') return;
    if (asked()) return;
    // Show a one-shot toast asking to enable notifications.
    setTimeout(() => {
      App.toast?.show({
        message: '开启浏览器通知，到点提醒你做事',
        actionLabel: '开启',
        onAction: () => request(),
        duration: 8000,
      });
      localStorage.setItem(ASKED_KEY, '1');
    }, 1500);
  }

  function fireAtForTask(t) {
    if (!t.dueAt || !t.reminder) return null;
    const due = new Date(t.dueAt).getTime();
    return due - (t.reminder.offsetMinutes || 0) * 60 * 1000;
  }

  function shouldFire(t, now) {
    if (t.completed) return false;
    const fireAt = fireAtForTask(t);
    if (fireAt == null) return false;
    if (fireAt > now) return false;
    // Don't fire for tasks whose fire time is more than 1 hour in the past.
    // (Either the user just opened the app, or the task is way overdue and
    // a stale "5 minutes before" alert is noise rather than signal.)
    if (now - fireAt > 60 * 60 * 1000) return false;
    if (t.reminderFiredAt && new Date(t.reminderFiredAt).getTime() >= fireAt) {
      return false;
    }
    return true;
  }

  function offsetLabel(minutes) {
    if (!minutes) return '已到截止时间';
    if (minutes < 60)   return `${minutes} 分钟后到截止`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} 小时后到截止`;
    return `${Math.round(minutes / 1440)} 天后到截止`;
  }

  function fire(t) {
    try {
      const n = new Notification(t.title || '任务提醒', {
        body: offsetLabel(t.reminder?.offsetMinutes || 0),
        tag: 'shandian-' + t.id,
        requireInteraction: false,
      });
      n.onclick = () => {
        try { window.focus(); } catch (e) {}
        if (location.hash !== '#/schedule') location.hash = '#/schedule';
        setTimeout(() => App.detail?.open?.(t.id), 50);
        n.close();
      };
    } catch (e) {
      console.warn('reminder: failed to fire', e);
    }
    App.store.updateTask(t.id, { reminderFiredAt: new Date().toISOString() });
  }

  function checkOnce() {
    if (permission() !== 'granted') return;
    const now = Date.now();
    const tasks = App.store.get().tasks;
    for (const t of tasks) {
      if (shouldFire(t, now)) fire(t);
    }
  }

  function start() {
    if (intervalId) return;
    checkOnce();
    intervalId = setInterval(checkOnce, SCAN_INTERVAL_MS);
  }

  function stop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  return { supported, permission, request, start, stop, checkOnce, maybePromptOnStart };
})();

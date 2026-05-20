window.App = window.App || {};

App.utils = (() => {
  const pad = (n) => String(n).padStart(2, '0');

  const uid = () => {
    const r = Math.random().toString(36).slice(2, 8);
    return Date.now().toString(36) + r;
  };

  const toDateKey = (d) => {
    const dt = (d instanceof Date) ? d : new Date(d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };

  const fromDateKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const todayKey = () => toDateKey(new Date());

  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const isSameDay = (a, b) => toDateKey(a) === toDateKey(b);

  const isToday = (d) => isSameDay(new Date(d), new Date());

  const isOverdue = (d) => {
    if (!d) return false;
    return startOfDay(d).getTime() < startOfDay(new Date()).getTime();
  };

  const daysBetween = (a, b) => {
    const ms = startOfDay(b) - startOfDay(a);
    return Math.round(ms / 86400000);
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const formatDateLabel = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = daysBetween(new Date(), d);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === -1) return '昨天';
    if (diff > 1 && diff < 7) return `${diff} 天后`;
    if (diff < -1 && diff > -7) return `${-diff} 天前`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const formatDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const dateLabel = formatDateLabel(iso);
    const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0);
    return hasTime ? `${dateLabel} ${formatTime(iso)}` : dateLabel;
  };

  const debounce = (fn, ms = 300) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const escapeHtml = (s) => {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const monthMatrix = (year, month) => {
    // returns 6 weeks * 7 days of Date objects covering the given month
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay()); // align to Sunday
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  };

  return {
    uid,
    pad,
    toDateKey,
    fromDateKey,
    todayKey,
    startOfDay,
    isSameDay,
    isToday,
    isOverdue,
    daysBetween,
    formatTime,
    formatDateLabel,
    formatDateTime,
    debounce,
    escapeHtml,
    monthMatrix,
  };
})();

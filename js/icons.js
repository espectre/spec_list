window.App = window.App || {};

App.icons = (() => {
  const wrap = (path, size = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

  return {
    schedule: (s) => wrap('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', s),
    calendar: (s) => wrap('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', s),
    matrix:   (s) => wrap('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>', s),
    notes:    (s) => wrap('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/>', s),
    plus:     (s) => wrap('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', s),
    chevronL: (s) => wrap('<polyline points="15 18 9 12 15 6"/>', s),
    chevronR: (s) => wrap('<polyline points="9 18 15 12 9 6"/>', s),
    trash:    (s) => wrap('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>', s),
    pin:      (s) => wrap('<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79L6 14h12l-1.89-1.45A2 2 0 0 1 15 10.76V5h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1z"/>', s),
    search:   (s) => wrap('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', s),
    clock:    (s) => wrap('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', s),
    flag:     (s) => wrap('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>', s),
    close:    (s) => wrap('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', s),
    edit:     (s) => wrap('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>', s),
    today:    (s) => wrap('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>', s),
  };
})();

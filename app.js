const $ = id => document.getElementById(id);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULTS = { hours: 7.5, lunch: 30, start: '08:30', finish: '16:30', lunchAt: '12:30', commute: 30 };
const store = JSON.parse(localStorage.getItem('worktime') || '{}');
store.settings = Object.assign({}, DEFAULTS, store.settings);
store.weeks = store.weeks || {};
store.view = store.view || 'work';
const tStep = () => store.exact ? 60 : 900;
function applyStep() { document.querySelectorAll('input[type=time]').forEach(i => i.step = tStep()); }
const save = () => localStorage.setItem('worktime', JSON.stringify(store));

let monday = getMonday(new Date());
let selDay = new Date();

function getMonday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const fmtDur = m => {
  const s = m < 0 ? '-' : '', a = Math.abs(Math.round(m));
  return `${s}${Math.floor(a / 60)}h ${String(a % 60).padStart(2, '0')}m`;
};

function defaultDay(i = 0) {
  const s = store.settings;
  return { off: i >= 5, tasks: [], mode: 'start', time: s.start, lunchAt: s.lunchAt, cut: 0, tFrom: '', tTo: '', use: 0 };
}
function weekData(key) {
  const wk = store.weeks[key] = store.weeks[key] || [];
  DAYS.forEach((_, i) => { if (!wk[i]) wk[i] = defaultDay(i); wk[i].tasks = wk[i].tasks || []; });
  return wk;
}

function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function taskBlock(d) {
  return `    <ul class="tasks">
      ${d.tasks.map((t, k) => `<li class="${t.done ? 'done' : ''}">
        <input type="checkbox" style="width:auto" data-tdone="${k}" ${t.done ? 'checked' : ''}>
        <span>${t.time ? `<b>${t.time}</b> ` : ''}${esc(t.text)}</span>
        <button class="chip" data-del="${k}" aria-label="Delete">&times;</button></li>`).join('')}
    </ul>
    <div class="row">
      <label>Goal / project <input type="text" class="newtext" placeholder="e.g. Build habit-tracker app"></label>
      <label style="flex:0 0 110px">Time (optional) <input type="time" step="${tStep()}" class="newtime"></label>
      <button class="primary" data-add="1">Add</button>
    </div>`;
}

function planRows(d) {
  return `<div class="row">
        <label>Plan by
          <select data-f="mode"><option value="start" ${d.mode === 'start' ? 'selected' : ''}>I start at…</option><option value="finish" ${d.mode === 'finish' ? 'selected' : ''}>I finish at…</option></select></label>
        <label>${d.mode === 'start' ? 'Start' : 'Finish'} time <input type="time" step="${tStep()}" data-f="time" value="${d.time}"></label>
        <label>Lunch starts <input type="time" step="${tStep()}" data-f="lunchAt" value="${d.lunchAt}"></label>
      </div>`;
}
function optRows(d, cuts = [0, 15, 20, 30].filter(c => c <= store.settings.lunch)) {
  return `<div class="chips">Eat into lunch:
        ${cuts.map(c => `<button class="chip ${d.cut === c ? 'on' : ''}" data-cut="${c}">${c ? '-' + c : 'none'}</button>`).join('')}
      </div>
      <div class="row">
        <label>Commute started <input type="time" step="${tStep()}" data-f="tFrom" value="${d.tFrom}"></label>
        <label>Arrived office <input type="time" step="${tStep()}" data-f="tTo" value="${d.tTo}"></label>
        <label>Use banked (min) <input type="number" data-f="use" min="0" step="5" value="${d.use || 0}"></label>
      </div>`;
}

const NOW_MIN = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
function dayView(d, i, date, isToday) {
  const head = `<h2>${date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
    <label style="flex-direction:row;align-items:center;gap:5px"><input type="checkbox" style="width:auto" data-f="off" ${d.off ? 'checked' : ''}> Off</label></h2>`;
  if (d.off) return `<section class="day off" data-i="${i}">${head}<p class="hint">Day off.</p>${taskBlock(d)}</section>`;
  const r = calc(d);
  const LO = 360, HI = 1320, C = 100, R = 82;
  const ang = m => (Math.min(Math.max(m, LO), HI) - LO) / (HI - LO) * 2 * Math.PI;
  const pt = (a, rad) => [C + rad * Math.sin(a), C - rad * Math.cos(a)];
  const arc = (m1, m2, cls) => {
    if (m2 - m1 <= 0) return '';
    const a1 = ang(m1), a2 = ang(m2), [x1, y1] = pt(a1, R), [x2, y2] = pt(a2, R);
    return `<path class="${cls}" d="M${x1} ${y1} A${R} ${R} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke-width="22"/>`;
  };
  const ls = Math.min(Math.max(toMin(d.lunchAt), r.start), r.finish - r.lunch);
  let svg = `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#e5e9f2" stroke-width="22"/>`;
  svg += arc(r.start - r.travel, r.start, 'seg-commute') + arc(r.start, ls, 'seg-work') + arc(ls, ls + r.lunch, 'seg-lunch') + arc(ls + r.lunch, r.finish, 'seg-work');
  for (let h = 6; h < 22; h += 3) {
    const [x, y] = pt(ang(h * 60), R + 20), [x2, y2] = pt(ang(h * 60), R - 14);
    svg += `<text x="${x}" y="${y + 3}" text-anchor="middle" class="tick">${h}</text>`;
  }
  d.tasks.forEach(t => {
    if (!t.time) return;
    const [x, y] = pt(ang(toMin(t.time)), R + 13);
    svg += `<circle cx="${x}" cy="${y}" r="4" class="${t.done ? 'dot done' : 'dot'}"><title>${esc(t.time + ' ' + t.text)}</title></circle>`;
  });
  let msg = '';
  if (isToday) {
    const n = NOW_MIN(), [x, y] = pt(ang(n), R + 11), [x0, y0] = pt(ang(n), R - 14);
    svg += `<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}" class="now"/>`;
    const lines = [];
    if (n < r.start) lines.push(`Starts in ${fmtDur(r.start - n)}`);
    else if (n >= r.finish) lines.push('Finished for the day');
    else {
      if (n < ls) lines.push(`Lunch in ${fmtDur(ls - n)}`);
      else if (n < ls + r.lunch) lines.push(`Lunch ends in ${fmtDur(ls + r.lunch - n)}`);
      lines.push(`Finish in ${fmtDur(r.finish - n)}`);
    }
    msg = lines.map(l => `<div>${l}</div>`).join('');
  }
  return `<section class="day ${isToday ? 'today' : ''}" data-i="${i}">${head}
    <div class="clock"><svg viewBox="0 0 200 200" role="img" aria-label="Day clock">${svg}</svg>
      <div class="clock-mid"><b>${toTime(r.start)}–${toTime(r.finish)}</b>${msg}</div></div>
    <div class="legend" style="justify-content:center"><i class="commute"></i>Commute <i class="work"></i>Work <i class="lunch"></i>Lunch <i class="task"></i>Task</div>
    <details class="more"><summary>Edit times</summary>${planRows(d)}${optRows(d)}</details>
    ${taskBlock(d)}</section>`;
}

function personalCard(d, i, date, todayKey) {
  const done = d.tasks.filter(t => t.done).length;
  return `<section class="day ${iso(date) === todayKey ? 'today' : ''}" data-i="${i}">
    <h2>${DAYS[i]} ${date.getDate()}/${date.getMonth() + 1} <span class="hint">${done}/${d.tasks.length}</span></h2>
    ${taskBlock(d)}
  </section>`;
}
// Core calculations for one day
function calc(d) {
  const s = store.settings;
  const required = Math.max(0, s.hours * 60 - (d.use || 0));
  const lunch = Math.max(0, s.lunch - d.cut);
  const total = required + lunch;
  const t = toMin(d.time);
  let start, finish;
  if (d.mode === 'start') { start = t; finish = t + total; }
  else { finish = t; start = t - total; }
  let travel = 0, earned = 0;
  const a = toMin(d.tFrom), b = toMin(d.tTo);
  if (a !== null && b !== null) {
    travel = (b - a + 1440) % 1440;
    earned = Math.max(0, travel - s.commute);
  }
  return { required, lunch, total, start, finish, travel, earned };
}

function statusBar(d, r) {
  const ls = Math.min(Math.max(toMin(d.lunchAt), r.start), r.finish - r.lunch);
  const seg = [['commute', r.travel], ['work', ls - r.start], ['lunch', r.lunch], ['work', r.finish - ls - r.lunch]]
    .filter(x => x[1] > 0);
  return `<div class="bar">${seg.map(([c, m]) => `<div class="${c}" style="flex:${m}" title="${c} ${fmtDur(m)}"></div>`).join('')}</div>
    <div class="legend"><i class="commute"></i>Commute <i class="work"></i>Work <i class="lunch"></i>Lunch</div>`;
}

function bankTotal(before) {
  let earned = 0, used = 0;
  for (const [k, wk] of Object.entries(store.weeks)) {
    if (before && k >= before) continue;
    wk.forEach(d => { if (!d.off) { earned += calc(d).earned; used += d.use || 0; } });
  }
  return earned - used;
}

function render() {
  const s = store.settings;
  const dayMode = store.view === 'day';
  const personal = store.view === 'personal';
  if (dayMode) monday = getMonday(selDay);
  const key = iso(monday);
  const wk = weekData(key);
  const fri = new Date(monday); fri.setDate(fri.getDate() + 6);
  $('weekLabel').textContent = dayMode
    ? selDay.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : `${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${fri.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.view === store.view));
  $('ics').textContent = personal ? 'Export timed tasks to calendar (.ics)' : 'Export lunches to calendar (.ics)';
  $('bank').style.display = personal ? 'none' : '';
  const todayKey = iso(new Date());
  if (dayMode) {
    const i = (selDay.getDay() + 6) % 7;
    $('days').innerHTML = dayView(wk[i], i, selDay, iso(selDay) === todayKey);
    $('summary').innerHTML = '';
    return updateBank();
  }
  $('days').innerHTML = wk.map((d, i) => {
    const date = new Date(monday); date.setDate(date.getDate() + i);
    const r = calc(d);
    const lunchStart = toMin(d.lunchAt);
    const wPct = r.total ? (r.required / r.total * 100) : 100;
    if (personal) return personalCard(d, i, date, todayKey);
    const cuts = [0, 15, 20, 30].filter(c => c <= s.lunch);
    return `<section class="day ${d.off ? 'off' : ''} ${iso(date) === todayKey ? 'today' : ''}" data-i="${i}">
      <h2>${DAYS[i]} ${date.getDate()}/${date.getMonth() + 1}
        <label style="flex-direction:row;align-items:center;gap:5px"><input type="checkbox" style="width:auto" data-f="off" ${d.off ? 'checked' : ''}> Off</label></h2>
      ${d.off ? '' : `
      ${planRows(d)}
      <details class="more" ${(d.cut || d.tFrom || d.tTo || d.use) ? 'open' : ''}><summary>Lunch &amp; travel options</summary>${optRows(d, cuts)}</details>
      ${statusBar(d, r)}
      <div class="result">
        ${toTime(r.start)} → <b>${toTime(r.finish)}</b> · work ${fmtDur(r.required)} · lunch ${toTime(lunchStart)}–${toTime(lunchStart + r.lunch)} (${r.lunch}m)
        ${r.travel ? `<div>Travel ${fmtDur(r.travel)} · <span class="earn">+${fmtDur(r.earned)} banked</span></div>` : ''}
      </div>`}
      ${taskBlock(d)}
    </section>`;
  }).join('');

  if (personal) {
    const all = wk.flatMap(d => d.tasks);
    $('summary').innerHTML = `This week: <b>${all.filter(t => t.done).length}/${all.length}</b> tasks done`;
    return;
  }
  const active = wk.filter(d => !d.off);
  const weekEarned = active.reduce((n, d) => n + calc(d).earned, 0);
  const weekUsed = active.reduce((n, d) => n + (d.use || 0), 0);
  const weekWork = active.reduce((n, d) => n + calc(d).required, 0);
  const target = active.length * s.hours * 60;
  const net = weekEarned - weekUsed;
  const bf = bankTotal(key);
  const diff = weekWork + weekUsed - target;
  $('summary').innerHTML = `<b>Week check</b>
    <div>Target ${fmtDur(target)} (${active.length} days) · to work <b>${fmtDur(weekWork)}</b> + banked time used ${fmtDur(weekUsed)}
      · <span class="${diff ? 'warn' : 'earn'}">${diff ? (diff > 0 ? 'over by ' : 'short by ') + fmtDur(Math.abs(diff)) : 'on target'}</span></div>
    <div>Bank: ${fmtDur(bf)} brought forward · this week <span class="${net < 0 ? 'warn' : 'earn'}">${net >= 0 ? '+' : ''}${fmtDur(net)}</span> · carried forward <b>${fmtDur(bf + net)}</b></div>`;

  updateBank();
}
function updateBank() {
  const bank = bankTotal();
  $('bank').textContent = `Time bank: ${fmtDur(bank)}`;
  $('bank').classList.toggle('neg', bank < 0);
}

// Day interactions (event delegation)
function addTask(day, d) {
  const text = day.querySelector('.newtext').value.trim();
  if (!text) return;
  d.tasks.push({ text, time: day.querySelector('.newtime').value, done: false });
  d.tasks.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  save(); render();
}
$('days').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('newtext')) {
    const day = e.target.closest('.day');
    addTask(day, weekData(iso(monday))[day.dataset.i]);
  }
});
$('days').addEventListener('change', e => {
  if (e.target.dataset.tdone !== undefined) {
    const d = weekData(iso(monday))[e.target.closest('.day').dataset.i];
    d.tasks[Number(e.target.dataset.tdone)].done = e.target.checked;
    save(); return render();
  }
  const f = e.target.dataset.f; if (!f) return;
  const i = e.target.closest('.day').dataset.i;
  const d = weekData(iso(monday))[i];
  if (f === 'off') d.off = e.target.checked;
  else if (f === 'use') d.use = Math.max(0, Number(e.target.value) || 0);
  else d[f] = e.target.value;
  if (f === 'mode') d.time = e.target.value === 'start' ? store.settings.start : store.settings.finish;
  save(); render();
});
$('days').addEventListener('click', e => {
  const day = e.target.closest('.day');
  if (day) {
    const d = weekData(iso(monday))[day.dataset.i];
    if (e.target.dataset.add) return addTask(day, d);
    if (e.target.dataset.del) { d.tasks.splice(Number(e.target.dataset.del), 1); save(); return render(); }
  }
  const c = e.target.closest('[data-cut]'); if (!c) return;
  weekData(iso(monday))[c.closest('.day').dataset.i].cut = Number(c.dataset.cut);
  save(); render();
});

// Settings
$('exact').checked = !!store.exact;
$('exact').addEventListener('change', () => { store.exact = $('exact').checked; save(); applyStep(); render(); });
applyStep();
for (const k of Object.keys(DEFAULTS)) {
  $(k).value = store.settings[k];
  $(k).addEventListener('change', () => {
    store.settings[k] = $(k).type === 'number' ? Number($(k).value) || 0 : $(k).value;
    save(); render();
  });
}

// Week nav
const shift = n => {
  if (store.view === 'day') selDay = new Date(selDay.getFullYear(), selDay.getMonth(), selDay.getDate() + n);
  else monday.setDate(monday.getDate() + 7 * n);
  render();
};
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('today').onclick = () => { monday = getMonday(new Date()); selDay = new Date(); render(); };

// Swipe between days, and tap a day heading to open it
let touchX = null;
$('days').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
$('days').addEventListener('touchend', e => {
  if (touchX === null || store.view !== 'day') return;
  const dx = e.changedTouches[0].clientX - touchX; touchX = null;
  if (Math.abs(dx) > 70) shift(dx < 0 ? 1 : -1);
});
$('days').addEventListener('click', e => {
  const h = e.target.closest('h2');
  if (!h || store.view === 'day' || e.target.closest('label')) return;
  selDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + Number(h.closest('.day').dataset.i));
  store.view = 'day'; save(); render();
});
setInterval(() => {
  if (store.view === 'day' && !document.activeElement.matches('input, select')) render();
}, 60000);
$('reset').onclick = () => {
  if (confirm('Clear this week?')) { delete store.weeks[iso(monday)]; save(); render(); }
};

document.querySelectorAll('.modes button').forEach(b => b.onclick = () => { store.view = b.dataset.view; save(); render(); });

function exportPersonal() {
  const wk = weekData(iso(monday));
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const ev = [];
  wk.forEach((d, i) => d.tasks.forEach((t, k) => {
    if (!t.time) return;
    const date = new Date(monday); date.setDate(date.getDate() + i);
    const ymd = iso(date).replace(/-/g, '');
    const m = toMin(t.time);
    const f = x => ymd + 'T' + toTime(x).replace(':', '') + '00';
    ev.push(`BEGIN:VEVENT\r\nUID:task-${ymd}-${k}@worktime\r\nDTSTAMP:${stamp}\r\nDTSTART:${f(m)}\r\nDTEND:${f(m + 60)}\r\nSUMMARY:${t.text.replace(/[\r\n,;]/g, ' ')}\r\nEND:VEVENT`);
  }));
  return ev;
}

// Calendar export: floating local times
$('ics').onclick = () => {
  if (store.view === 'personal') return download(exportPersonal(), 'tasks');
  const wk = weekData(iso(monday));
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const ev = [];
  wk.forEach((d, i) => {
    if (d.off) return;
    const r = calc(d);
    if (!r.lunch) return;
    const date = new Date(monday); date.setDate(date.getDate() + i);
    const ymd = iso(date).replace(/-/g, '');
    const ls = toMin(d.lunchAt);
    const t = m => ymd + 'T' + toTime(m).replace(':', '') + '00';
    ev.push(`BEGIN:VEVENT\r\nUID:lunch-${ymd}@worktime\r\nDTSTAMP:${stamp}\r\nDTSTART:${t(ls)}\r\nDTEND:${t(ls + r.lunch)}\r\nSUMMARY:Lunch\r\nDESCRIPTION:Finish ${toTime(r.finish)}\r\nEND:VEVENT`);
  });
  download(ev, 'lunch');
};

function download(ev, name) {
  if (!ev.length) return alert('Nothing to export.');
  const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//worktime//EN\r\n${ev.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  a.download = `${name}-${iso(monday)}.ics`;
  a.click();
}

render();
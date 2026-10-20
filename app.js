const $ = id => document.getElementById(id);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULTS = { hours: 7.5, lunch: 30, start: '08:30', finish: '16:30', lunchAt: '12:30', commute: 30, sleepAt: '22:30', wakeAt: '06:30' };
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
  DAYS.forEach((_, i) => {
    if (!wk[i]) wk[i] = defaultDay(i);
    wk[i].tasks = wk[i].tasks || [];
    // Weekends default to off unless the user has chosen otherwise
    if (i >= 5 && wk[i].offV !== 2) { wk[i].offV = 2; wk[i].off = true; }
  });
  return wk;
}

function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const DURS = [15, 30, 45, 60, 90, 120, 180];
let findDur = 60, findText = '', selTask = null;

function taskBlock(d) {
  return `    <ul class="tasks">
      ${d.tasks.map((t, k) => `<li class="${t.done ? 'done' : ''}">
        <input type="checkbox" style="width:auto" data-tdone="${k}" ${t.done ? 'checked' : ''}>
        <span>${t.time ? `<b>${t.time}</b> ` : ''}${esc(t.text)}${t.time ? ` <small class="hint">${fmtDur(t.dur || 60)}</small>` : ''}</span>
        ${t.time ? `<button class="chip" data-share="${k}" aria-label="Share">Share</button>` : ''}<button class="chip" data-del="${k}" aria-label="Delete">&times;</button></li>`).join('')}
    </ul>
    <div class="row">
      <label>Goal / project <input type="text" class="newtext" placeholder="e.g. Build habit-tracker app"></label>
      <label style="flex:0 0 110px">Time (optional) <input type="time" step="${tStep()}" class="newtime"></label>
      <label style="flex:0 0 90px">Length <select class="newdur">${DURS.map(m => `<option value="${m}" ${m === 60 ? 'selected' : ''}>${fmtDur(m)}</option>`).join('')}</select></label>
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

function sleepCheck(r) {
  const st = store.settings, sl = toMin(st.sleepAt), wk = toMin(st.wakeAt);
  const hrs = (wk - sl + 1440) % 1440;
  const bed = (sl - r.finish + 1440) % 1440;
  const prep = (r.start - r.travel - wk + 1440) % 1440;
  const ok = hrs >= 420;
  return `<div class="result">Sleep ${st.sleepAt}–${st.wakeAt} · <span class="${ok ? 'earn' : 'warn'}">${fmtDur(hrs)}${ok ? '' : ' (under 7h)'}</span>
    <div class="hint">${fmtDur(bed)} between finishing and bed · ${fmtDur(prep)} from waking to leaving/starting</div></div>`;
}

// Free time: everything not covered by sleep, work (incl. commute and lunch) or timed tasks
function busyOf(d) {
  const st = store.settings, out = [];
  const sl = toMin(st.sleepAt), wk = toMin(st.wakeAt);
  if (sl > wk) out.push([sl, 1440], [0, wk]); else out.push([sl, wk]);
  if (!d.off) {
    const r = calc(d), a = r.start - r.travel, b = r.finish;
    const lo = ((a % 1440) + 1440) % 1440, hi = lo + (b - a);
    if (hi > 1440) out.push([lo, 1440], [0, hi - 1440]); else out.push([lo, hi]);
  }
  d.tasks.forEach(t => { if (t.time && !t.done) { const a = toMin(t.time); out.push([a, Math.min(1440, a + (t.dur || 60))]); } });
  return out;
}
function freeSlots(d, from = 0) {
  const busy = busyOf(d).sort((x, y) => x[0] - y[0]);
  const free = []; let cur = from;
  for (const [a, b] of busy) { if (a > cur) free.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < 1440) free.push([cur, 1440]);
  return free.filter(([a, b]) => b - a >= 15);
}
function ideas(m) {
  if (m < 30) return 'Quick reset: stretch, tea, tidy up, a short call';
  if (m < 60) return 'A walk, a short workout, cook something, admin';
  if (m < 120) return 'Gym or a run, a hobby session, see a friend';
  if (m < 240) return 'Deep work on a project, a long outing, a big chore';
  return 'A proper block: day-trip, big project, time with family';
}
function freeSection(d, i, isToday) {
  const from = isToday ? NOW_MIN() : 0;
  const slots = freeSlots(d, from);
  const total = slots.reduce((n, [a, b]) => n + b - a, 0);
  const list = slots.map(([a, b]) => `<li><b>${toTime(a)}–${toTime(b)}</b> · ${fmtDur(b - a)}<div class="idea">${ideas(b - a)}</div></li>`).join('');
  const week = weekData(iso(monday));
  const hits = [];
  week.forEach((wd, k) => {
    const isT = iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + k)) === iso(new Date());
    freeSlots(wd, isT ? NOW_MIN() : 0).forEach(([a, b]) => { if (b - a >= findDur) hits.push([k, a, b]); });
  });
  return `<div class="result"><b>${fmtDur(total)}</b> free ${isToday ? 'for the rest of today' : 'this day'}
      <ul class="slots">${list || '<li class="hint">No free slots.</li>'}</ul></div>
    <button class="chip" data-sharefree="1">Share my free time this week</button>
    <div class="card finder">
      <b>Find time for something</b>
      <div class="row">
        <label>What <input type="text" id="findText" value="${esc(findText)}" placeholder="e.g. Gym"></label>
        <label style="flex:0 0 100px">How long <select id="findDur">${DURS.map(m => `<option value="${m}" ${m === findDur ? 'selected' : ''}>${fmtDur(m)}</option>`).join('')}</select></label>
      </div>
      <ul class="slots">${hits.map(([k, a, b]) => `<li>${DAYS[k]} <b>${toTime(a)}–${toTime(b)}</b> <span class="hint">(${fmtDur(b - a)} free)</span>
        <button class="chip" data-book="${k}|${a}">Book ${toTime(a)}</button></li>`).join('') || '<li class="hint">Nothing that long free this week.</li>'}</ul>
    </div>
    <details class="more"><summary>Edit times</summary>${planRows(d)}${optRows(d)}</details>
    ${taskBlock(d)}`;
}

function taskEditor(d, date) {
  if (!selTask || selTask.day !== iso(date)) return '';
  const t = d.tasks[selTask.k]; if (!t || !t.time) return '';
  const a = toMin(t.time), dur = t.dur || 60;
  return `<div class="result taskedit"><b>${esc(t.text)}</b> · ${t.time}–${toTime(a + dur)} · ${fmtDur(dur)}
    <div class="row"><button class="chip" data-tdur="-15">−15 min</button><button class="chip" data-tdur="15">+15 min</button><button class="chip" data-tdur="60">+1 h</button><button class="primary" data-tdone-sel="1">Done</button></div>
    <div class="hint">Drag the white dots on the wheel to change the start or end</div></div>`;
}

const NOW_MIN = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
function dayView(d, i, date, isToday, free) {
  const head = `<h2>${date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
    <label style="flex-direction:row;align-items:center;gap:5px"><input type="checkbox" style="width:auto" data-f="off" ${d.off ? 'checked' : ''}> Off</label></h2>`;
  const r = calc(d);
  const LO = 0, HI = 1440, C = 100, R = 82;
  const ang = m => (Math.min(Math.max(m, LO), HI) - LO) / (HI - LO) * 2 * Math.PI;
  const pt = (a, rad) => [C + rad * Math.sin(a), C - rad * Math.cos(a)];
  const arc = (m1, m2, cls, drag) => {
    if (m2 - m1 <= 0) return '';
    const a1 = ang(m1), a2 = ang(m2), [x1, y1] = pt(a1, R), [x2, y2] = pt(a2, R);
    return `<path class="${cls}${drag ? ' grab' : ''}"${drag ? ` data-drag="${drag}"` : ''} d="M${x1} ${y1} A${R} ${R} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke-width="22"/>`;
  };
  const ls = Math.min(Math.max(toMin(d.lunchAt), r.start), r.finish - r.lunch);
  let svg = `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#e5e9f2" stroke-width="22"/>`;
  const sl = toMin(store.settings.sleepAt), wk = toMin(store.settings.wakeAt);
  svg += sl > wk ? arc(sl, HI, 'seg-sleep', 'sleep') + arc(LO, wk, 'seg-sleep', 'sleep') : arc(sl, wk, 'seg-sleep', 'sleep');
  if (!d.off) svg += arc(r.start - r.travel, r.start, 'seg-commute') + arc(r.start, ls, 'seg-work', 'work') + arc(ls, ls + r.lunch, 'seg-lunch', 'lunch') + arc(ls + r.lunch, r.finish, 'seg-work', 'work');
  if (free) {
    const ir = R - 33;
    freeSlots(d, isToday ? NOW_MIN() : 0).forEach(([a, b]) => {
      const a1 = ang(a), a2 = ang(b), [x1, y1] = pt(a1, ir), [x2, y2] = pt(a2, ir);
      svg += `<path class="seg-free" d="M${x1} ${y1} A${ir} ${ir} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke-width="10"><title>${toTime(a)}–${toTime(b)} free</title></path>`;
    });
  }
  [['sleepStart', sl], ['sleepEnd', wk]].forEach(([k, m]) => {
    const [hx, hy] = pt(ang(m), R);
    svg += `<circle cx="${hx}" cy="${hy}" r="9" class="handle grab" data-drag="${k}"><title>${k === 'sleepStart' ? 'Bedtime' : 'Wake up'}</title></circle>`;
  });
  for (let h = 0; h < 24; h += 3) {
    const [x, y] = pt(ang(h * 60), R + 20), [x2, y2] = pt(ang(h * 60), R - 14);
    svg += `<text x="${x}" y="${y + 3}" text-anchor="middle" class="tick">${h}</text>`;
  }
  for (let m = LO; m < HI; m += 60) {
    const [x1, y1] = pt(ang(m), R + 11), [x2, y2] = pt(ang(m), R + 15);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="notch"/>`;
  }
  d.tasks.forEach((t, k) => {
    if (!t.time) return;
    const ir = R - 19, a = toMin(t.time), e = Math.min(1440, a + (t.dur || 60));
    if (e <= a) return;
    const a1 = ang(a), a2 = ang(e), [x1, y1] = pt(a1, ir), [x2, y2] = pt(a2, ir);
    const sel = selTask && selTask.day === iso(date) && selTask.k === k;
    svg += `<path class="seg-task${t.done ? ' done' : ''}${sel ? ' sel' : ''} grab" data-drag="task" data-k="${k}" d="M${x1} ${y1} A${ir} ${ir} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke-width="14"><title>${esc(t.time + ' ' + t.text)}</title></path>`;
    if (sel) svg += [['taskStart', x1, y1], ['taskEnd', x2, y2]].map(([kind, hx, hy]) => `<circle cx="${hx}" cy="${hy}" r="8" class="handle task grab" data-drag="${kind}" data-k="${k}"/>`).join('');
  });
  let msg = '';
  if (isToday) {
    const n = NOW_MIN(), [x, y] = pt(ang(n), R + 11), [x0, y0] = pt(ang(n), R - 14);
    if (n >= LO && n < HI) {
      const e = Math.min(n + 60, HI);
      const [ax, ay] = pt(ang(n), R - 11), [bx, by] = pt(ang(e), R - 11);
      svg += `<path class="ahead" d="M${C} ${C} L${ax} ${ay} A${R - 11} ${R - 11} 0 0 1 ${bx} ${by} Z"/>`;
      const [nx, ny] = pt(ang(e), R + 15), [nx0, ny0] = pt(ang(e), R - 14), [lx, ly] = pt(ang(e), R + 24);
      svg += `<line x1="${nx0}" y1="${ny0}" x2="${nx}" y2="${ny}" class="now plus"/>`
        + `<text x="${lx}" y="${ly + 3}" text-anchor="middle" class="tick plus">${toTime(e)}</text>`;
    }
    const [tx, ty] = pt(ang(n), R + 24);
    svg += `<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}" class="now"/>`
      + `<text x="${tx}" y="${ty + 3}" text-anchor="middle" class="tick nowlbl">${toTime(n)}</text>`;
    const lines = [];
    if (d.off) lines.push('Day off');
    else if (n < r.start) lines.push(`Starts in ${fmtDur(r.start - n)}`);
    else if (n >= r.finish) lines.push('Finished for the day');
    else {
      if (n < ls) lines.push(`Lunch in ${fmtDur(ls - n)}`);
      else if (n < ls + r.lunch) lines.push(`Lunch ends in ${fmtDur(ls + r.lunch - n)}`);
      lines.push(`Finish in ${fmtDur(r.finish - n)}`);
    }
    msg = lines.map(l => `<div>${l}</div>`).join('');
  }
  const mid = free ? `<b>${fmtDur(freeSlots(d, isToday ? NOW_MIN() : 0).reduce((n, [a, b]) => n + b - a, 0))}</b><div>free</div>` : (d.off ? `<b>Day off</b>` : `<b>${toTime(r.start)}–${toTime(r.finish)}</b>${msg}`);
  return `<section class="day ${isToday ? 'today' : ''}" data-i="${i}">${head}
    <div class="clock"><svg viewBox="-14 -14 228 228" role="img" aria-label="Day clock">${svg}</svg>
      <div class="clock-mid">${mid}</div></div>
    <div class="hint" style="text-align:center">Drag work, lunch, sleep or tasks to move them · tap a task to resize it · drag the white dots to resize sleep</div>
    <div class="legend" style="justify-content:center"><i class="commute"></i>Commute <i class="work"></i>Work <i class="lunch"></i>Lunch <i class="sleep"></i>Sleep <i class="task"></i>Task${free ? ' <i class="free"></i>Free' : ''}</div>
    ${taskEditor(d, date)}
    ${free ? freeSection(d, i, isToday) : `${sleepCheck(r)}
    ${d.off ? '' : `<details class="more"><summary>Edit times</summary>${planRows(d)}${optRows(d)}</details>`}
    ${taskBlock(d)}`}</section>`;
}

function personalCard(d, i, date, todayKey) {
  const done = d.tasks.filter(t => t.done).length;
  return `<section class="day ${iso(date) === todayKey ? 'today' : ''}" data-i="${i}">
    <h2>${DAYS[i]} ${date.getDate()}/${date.getMonth() + 1} <span class="hint">${done}/${d.tasks.length}</span></h2>
    ${taskBlock(d)}
  </section>`;
}
// Core calculations for one day
function fmtAdj(m) { return (m > 0 ? '+' : m < 0 ? '−' : '') + fmtDur(Math.abs(m)); }
function calc(d) {
  const s = store.settings;
  const required = Math.max(0, s.hours * 60 + (d.adj || 0) - (d.use || 0));
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
  return { adj: d.adj || 0, required, lunch, total, start, finish, travel, earned };
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
    wk.forEach(d => { if (!d.off) { earned += calc(d).earned + (d.adj || 0); used += d.use || 0; } });
  }
  return earned - used;
}

function render() {
  const s = store.settings;
  const dayMode = store.view === 'day' || store.view === 'free';
  const personal = store.view === 'personal';
  if (dayMode) monday = getMonday(selDay);
  const key = iso(monday);
  const wk = weekData(key);
  const fri = new Date(monday); fri.setDate(fri.getDate() + 6);
  $('weekLabel').textContent = dayMode
    ? selDay.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : `${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${fri.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.view === store.view));
  $('bank').style.display = personal ? 'none' : '';
  const todayKey = iso(new Date());
  if (dayMode) {
    const i = (selDay.getDay() + 6) % 7;
    $('days').innerHTML = dayView(wk[i], i, selDay, iso(selDay) === todayKey, store.view === 'free');
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
      <div class="row"><label style="flex:1">Work ${fmtAdj(d.adj || 0)} vs usual
        <input type="range" data-f="adj" min="-240" max="240" step="15" value="${d.adj || 0}"></label></div>
      <details class="more" ${(d.cut || d.tFrom || d.tTo || d.use) ? 'open' : ''}><summary>Lunch &amp; travel options</summary>${optRows(d, cuts)}</details>
      ${statusBar(d, r)}
      <div class="result">
        ${toTime(r.start)} → <b>${toTime(r.finish)}</b> · work ${fmtDur(r.required)} · lunch ${toTime(lunchStart)}–${toTime(lunchStart + r.lunch)} (${r.lunch}m)
        ${r.adj ? `<div class="${r.adj < 0 ? 'warn' : 'earn'}">${r.adj > 0 ? `+${fmtDur(r.adj)} banked` : `${fmtDur(-r.adj)} owed — stay ${fmtDur(-r.adj)} longer another day`}</div>` : ''}
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
  const weekAdj = active.reduce((n, d) => n + (d.adj || 0), 0);
  const net = weekEarned + weekAdj - weekUsed;
  const bf = bankTotal(key);
  const diff = weekWork + weekUsed - weekAdj - target;
  $('summary').innerHTML = `<b>Week check</b>
    <div>Target ${fmtDur(target)} (${active.length} days) · to work <b>${fmtDur(weekWork)}</b> + banked time used ${fmtDur(weekUsed)}
      · <span class="${diff ? 'warn' : 'earn'}">${diff ? (diff > 0 ? 'over by ' : 'short by ') + fmtDur(Math.abs(diff)) : 'on target'}</span></div>
    <div>Bank: ${fmtDur(bf)} brought forward · this week <span class="${net < 0 ? 'warn' : 'earn'}">${net >= 0 ? '+' : ''}${fmtDur(net)}</span> · carried forward <b>${fmtDur(bf + net)}</b></div>
    ${bf + net < 0 ? `<div class="warn">You owe ${fmtDur(-(bf + net))} — stay ${fmtDur(-(bf + net))} longer to make it up.</div>` : ''}`;

  updateBank();
}
function updateBank() {
  const bank = bankTotal();
  $('bank').textContent = `Time bank: ${fmtDur(bank)}`;
  $('bank').textContent = bank < 0 ? `Time owed: ${fmtDur(-bank)} — stay ${fmtDur(-bank)} longer` : `Time bank: ${fmtDur(bank)}`;
  $('bank').classList.toggle('neg', bank < 0);
}

// Day interactions (event delegation)
function addTask(day, d) {
  const text = day.querySelector('.newtext').value.trim();
  if (!text) return;
  d.tasks.push({ text, time: day.querySelector('.newtime').value, dur: Number(day.querySelector('.newdur').value) || 60, done: false });
  d.tasks.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  selTask = null; save(); render();
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
  if (f === 'off') { d.off = e.target.checked; d.offV = 2; }
  else if (f === 'adj') d.adj = Number(e.target.value) || 0;
  else if (f === 'use') d.use = Math.max(0, Number(e.target.value) || 0);
  else d[f] = e.target.value;
  if (f === 'mode') d.time = e.target.value === 'start' ? store.settings.start : store.settings.finish;
  save(); render();
});
$('days').addEventListener('input', e => { if (e.target.id === 'findText') findText = e.target.value; });
$('days').addEventListener('change', e => { if (e.target.id === 'findDur') { findDur = Number(e.target.value); render(); } });
$('days').addEventListener('click', e => {
  if (e.target.dataset.share !== undefined) return shareTask(Number(e.target.closest('.day').dataset.i), Number(e.target.dataset.share));
  if (e.target.dataset.sharefree) return shareFree();
  if (e.target.dataset.tdoneSel) { selTask = null; return render(); }
  if (e.target.dataset.tdur && selTask) {
    const t = weekData(iso(monday))[(selDay.getDay() + 6) % 7].tasks[selTask.k];
    const a = toMin(t.time), step = store.exact ? 1 : 15;
    t.dur = Math.max(step, Math.min(1440 - a, (t.dur || 60) + Number(e.target.dataset.tdur)));
    save(); return render();
  }
  const bk = e.target.dataset.book;
  if (bk) {
    const [k, a] = bk.split('|').map(Number);
    const d = weekData(iso(monday))[k];
    d.tasks.push({ text: findText.trim() || 'Free-time plan', time: toTime(a), dur: findDur, done: false });
    d.tasks.sort((x, y) => (x.time || '99:99').localeCompare(y.time || '99:99'));
    selTask = null; findText = ''; save(); return render();
  }
  const day = e.target.closest('.day');
  if (day) {
    const d = weekData(iso(monday))[day.dataset.i];
    if (e.target.dataset.add) return addTask(day, d);
    if (e.target.dataset.del) { d.tasks.splice(Number(e.target.dataset.del), 1); selTask = null; save(); return render(); }
  }
  const c = e.target.closest('[data-cut]'); if (!c) return;
  weekData(iso(monday))[c.closest('.day').dataset.i].cut = Number(c.dataset.cut);
  save(); render();
});

// Drag work / lunch / sleep around the dial
let drag = null;
const dialMin = (e, box) => {
  const a = Math.atan2(e.clientX - (box.left + box.width / 2), -(e.clientY - (box.top + box.height / 2)));
  return ((a + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 1440;
};
$('days').addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-drag]'); if (!el) return;
  const box = el.closest('svg').getBoundingClientRect();
  const day = weekData(iso(monday))[(selDay.getDay() + 6) % 7];
  const st = store.settings, kind = el.dataset.drag;
  const task = el.dataset.k !== undefined ? day.tasks[Number(el.dataset.k)] : null;
  drag = { kind, task, moved: false, box, day, from: dialMin(e, box), a: toMin(kind === 'work' ? day.time : kind === 'lunch' ? day.lunchAt : task ? task.time : st.sleepAt), dur: task ? (task.dur || 60) : 0, b: toMin(st.wakeAt) };
  $('days').setPointerCapture(e.pointerId);
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const step = store.exact ? 1 : 15;
  const delta = Math.round((((dialMin(e, drag.box) - drag.from + 2160) % 1440) - 720) / step) * step;
  const mv = m => toTime(m + delta);
  if (delta) drag.moved = true;
  if (drag.kind === 'work') drag.day.time = mv(drag.a);
  else if (drag.kind === 'taskEnd') drag.task.dur = Math.max(step, Math.min(1440 - drag.a, drag.dur + delta));
  else if (drag.kind === 'taskStart') {
    const ns = Math.max(0, Math.min(drag.a + drag.dur - step, drag.a + delta));
    drag.task.time = toTime(ns); drag.task.dur = drag.a + drag.dur - ns;
  }
  else if (drag.kind === 'task') drag.task.time = toTime(Math.min(1440 - (drag.task.dur || 60), Math.max(0, drag.a + delta)));
  else if (drag.kind === 'lunch') drag.day.lunchAt = mv(drag.a);
  else if (drag.kind === 'sleepStart') { store.settings.sleepAt = mv(drag.a); $('sleepAt').value = store.settings.sleepAt; }
  else if (drag.kind === 'sleepEnd') { store.settings.wakeAt = mv(drag.b); $('wakeAt').value = store.settings.wakeAt; }
  else { store.settings.sleepAt = mv(drag.a); store.settings.wakeAt = mv(drag.b); $('sleepAt').value = store.settings.sleepAt; $('wakeAt').value = store.settings.wakeAt; }
  save(); render();
});
window.addEventListener('pointerup', () => {
  const d = drag; drag = null;
  if (d && d.kind === 'task' && !d.moved) {
    const k = d.day.tasks.indexOf(d.task), day = iso(selDay);
    selTask = selTask && selTask.day === day && selTask.k === k ? null : { day, k };
    render();
  }
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
  if (store.view === 'day' || store.view === 'free') selDay = new Date(selDay.getFullYear(), selDay.getMonth(), selDay.getDate() + n);
  else monday.setDate(monday.getDate() + 7 * n);
  render();
};
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('today').onclick = () => { monday = getMonday(new Date()); selDay = new Date(); render(); };

// Swipe between days, and tap a day heading to open it
let touchX = null;
$('days').addEventListener('touchstart', e => { touchX = e.target.closest('[data-drag]') ? null : e.touches[0].clientX; }, { passive: true });
$('days').addEventListener('touchend', e => {
  if (touchX === null || (store.view !== 'day' && store.view !== 'free')) return;
  const dx = e.changedTouches[0].clientX - touchX; touchX = null;
  if (Math.abs(dx) > 70) shift(dx < 0 ? 1 : -1);
});
$('days').addEventListener('click', e => {
  const h = e.target.closest('h2');
  if (!h || store.view === 'day' || store.view === 'free' || e.target.closest('label')) return;
  selDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + Number(h.closest('.day').dataset.i));
  store.view = 'day'; save(); render();
});
setInterval(() => {
  if ((store.view === 'day' || store.view === 'free') && !document.activeElement.matches('input, select')) render();
}, 60000);
$('reset').onclick = () => {
  if (confirm('Clear this week?')) { delete store.weeks[iso(monday)]; save(); render(); }
};

document.querySelectorAll('.modes button').forEach(b => b.onclick = () => { store.view = b.dataset.view; save(); render(); });

// Calendar export: floating local times, only the selected kinds of event
const EXPORTS = [['work', 'Work'], ['commute', 'Commute'], ['lunch', 'Lunch'], ['tasks', 'Tasks'], ['sleep', 'Sleep']];
store.export = store.export || { work: true, commute: true, lunch: true, tasks: true, sleep: false };
$('exportOpts').innerHTML = EXPORTS.map(([k, n]) => `<label class="chk"><input type="checkbox" data-exp="${k}" ${store.export[k] ? 'checked' : ''}> ${n}</label>`).join('');
$('exportOpts').addEventListener('change', e => {
  if (e.target.dataset.exp) { store.export[e.target.dataset.exp] = e.target.checked; save(); }
});
const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');

function buildEvents() {
  const sel = store.export, st = store.settings, wk = weekData(iso(monday));
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const ev = [];
  const add = (uid, date, from, to, title, desc) => {
    if (to <= from) return;
    const f = m => {
      const x = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, Math.round(m));
      return iso(x).replace(/-/g, '') + 'T' + toTime(x.getHours() * 60 + x.getMinutes()).replace(':', '') + '00';
    };
    ev.push(`BEGIN:VEVENT\r\nUID:${uid}@worktime\r\nDTSTAMP:${stamp}\r\nDTSTART:${f(from)}\r\nDTEND:${f(to)}\r\nSUMMARY:${icsText(title)}${desc ? `\r\nDESCRIPTION:${icsText(desc)}` : ''}\r\nEND:VEVENT`);
  };
  wk.forEach((d, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const id = iso(date).replace(/-/g, '');
    if (!d.off) {
      const r = calc(d), ls = Math.min(Math.max(toMin(d.lunchAt), r.start), r.finish - r.lunch);
      if (sel.commute && r.travel) add(`commute-${id}`, date, r.start - r.travel, r.start, 'Commute');
      if (sel.work) {
        add(`work-${id}-a`, date, r.start, ls, 'Work');
        add(`work-${id}-b`, date, ls + r.lunch, r.finish, 'Work', `Finish ${toTime(r.finish)}`);
      }
      if (sel.lunch) add(`lunch-${id}`, date, ls, ls + r.lunch, 'Lunch', `Finish ${toTime(r.finish)}`);
    }
    if (sel.tasks) d.tasks.forEach((t, k) => { if (t.time) add(`task-${id}-${k}`, date, toMin(t.time), toMin(t.time) + (t.dur || 60), t.text); });
    if (sel.sleep) {
      const sl = toMin(st.sleepAt), w = toMin(st.wakeAt);
      add(`sleep-${id}`, date, sl, sl < w ? w : w + 1440, 'Sleep');
    }
  });
  return ev;
}
$('ics').onclick = () => download(buildEvents(), 'week');

// Sharing: no accounts, just the phone's share sheet (falls back to a download / clipboard)
async function shareOut({ title, text, file }) {
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ title, files: [file] });
    if (!file && navigator.share) return await navigator.share({ title, text });
  } catch (err) { if (err.name === 'AbortError') return; }
  if (file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text); alert('Copied to clipboard.');
  } else prompt('Copy this:', text);
}
function shareTask(dayIdx, k) {
  const t = weekData(iso(monday))[dayIdx].tasks[k];
  const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayIdx);
  const ymd = iso(date).replace(/-/g, ''), a = toMin(t.time), e = a + (t.dur || 60);
  const f = m => ymd + 'T' + toTime(m).replace(':', '') + '00';
  const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//worktime//EN\r\nBEGIN:VEVENT\r\nUID:share-${ymd}-${k}-${Date.now()}@worktime\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}\r\nDTSTART:${f(a)}\r\nDTEND:${f(Math.min(e, 1439))}\r\nSUMMARY:${icsText(t.text)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  shareOut({ title: t.text, file: new File([text], 'invite.ics', { type: 'text/calendar' }) });
}
function shareFree() {
  const lines = weekData(iso(monday)).map((d, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const isT = iso(date) === iso(new Date());
    if (iso(date) < iso(new Date())) return null;
    const slots = freeSlots(d, isT ? NOW_MIN() : 0).filter(([a, b]) => b - a >= 60);
    return slots.length ? `${DAYS[i]} ${date.getDate()}/${date.getMonth() + 1}: ${slots.map(([a, b]) => toTime(a) + '–' + toTime(b)).join(', ')}` : null;
  }).filter(Boolean);
  shareOut({ title: 'My free time', text: `I'm free (1h+ gaps):\n${lines.join('\n') || 'Nothing free this week'}` });
}

function download(ev, name) {
  if (!ev.length) return alert('Nothing to export. Tick at least one item with something planned.');
  const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//worktime//EN\r\n${ev.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  a.download = `${name}-${iso(monday)}.ics`;
  a.click();
}

render();
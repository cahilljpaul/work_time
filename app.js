const $ = id => document.getElementById(id);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULTS = { hours: 7.5, lunch: 60, start: '08:00', finish: '16:30', lunchAt: '13:00', commute: 30, sleepAt: '22:30', wakeAt: '06:30' };
const store = JSON.parse(localStorage.getItem('worktime') || '{}');
store.settings = Object.assign({}, DEFAULTS, store.settings);
store.weeks = store.weeks || {};
// One-time move to the new standard day (08:00-16:30, 1h lunch at 13:00); untouched days follow
if (store.defaultsV !== 2) {
  const old = store.settings;
  Object.values(store.weeks).forEach(wk => wk.forEach(d => {
    if (d && d.mode === 'start' && d.time === old.start && !d.adj && !d.use) d.time = DEFAULTS.start;
    if (d && d.lunchAt === old.lunchAt && !d.cut) d.lunchAt = DEFAULTS.lunchAt;
  }));
  Object.assign(store.settings, { hours: DEFAULTS.hours, lunch: DEFAULTS.lunch, start: DEFAULTS.start, finish: DEFAULTS.finish, lunchAt: DEFAULTS.lunchAt, commute: DEFAULTS.commute });
  store.defaultsV = 2;
}
store.view = ({ day: 'work', personal: 'free' })[store.view] || store.view || 'work';
const tStep = () => store.exact ? 60 : 900;
function applyStep() { document.querySelectorAll('input[type=time]').forEach(i => i.step = tStep()); }
const save = () => {
  store.updatedAt = Date.now();
  localStorage.setItem('worktime', JSON.stringify(store));
  try { if (window.cloudChanged) window.cloudChanged(); } catch (err) { console.error(err); }
};

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
        ${t.time ? `<button class="chip" data-share="${k}" aria-label="Share">Share</button><button class="chip" data-sendto="${k}" aria-label="Send to a user">Send</button>` : ''}<button class="chip" data-del="${k}" aria-label="Delete">&times;</button></li>`).join('')}
    </ul>
    <div class="row">
      <label>Goal / project <input type="text" class="newtext" placeholder="e.g. Build habit-tracker app"></label>
      <label style="flex:0 0 110px">Time (auto if blank) <input type="time" step="${tStep()}" class="newtime"></label>
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
        ${d.loc === 'wfh' ? '' : `<label>Commute started <input type="time" step="${tStep()}" data-f="tFrom" value="${d.tFrom}"></label>
        <label>Arrived office <input type="time" step="${tStep()}" data-f="tTo" value="${d.tTo}"></label>`}
        <label>Use banked (min) <input type="number" data-f="use" min="0" step="5" value="${d.use || 0}"></label>
      </div>`;
}

function sleepCheck(r) {
  const st = store.settings, sl = toMin(st.sleepAt), wk = toMin(st.wakeAt);
  const hrs = (wk - sl + 1440) % 1440;
  const bed = (sl - r.finish - r.cOut + 1440) % 1440;
  const prep = (r.start - r.cIn - wk + 1440) % 1440;
  const ok = hrs >= 420;
  return `<div class="big">${st.sleepAt}–${st.wakeAt} · <span class="${ok ? 'earn' : 'warn'}">${fmtDur(hrs)}${ok ? '' : ' (under 7h)'}</span></div>
    <ul class="facts">
      <li><span>Finish to bed</span><b>${fmtDur(bed)}</b></li>
      <li><span>Wake to leaving</span><b>${fmtDur(prep)}</b></li>
    </ul>`;
}

// Free time: everything not covered by sleep, work (incl. commute and lunch) or timed tasks
function busyOf(d) {
  const st = store.settings, out = [];
  const sl = toMin(st.sleepAt), wk = toMin(st.wakeAt);
  if (sl > wk) out.push([sl, 1440], [0, wk]); else out.push([sl, wk]);
  if (!d.off) {
    const r = calc(d), a = r.start - r.cIn, b = r.finish + r.cOut;
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
  return `<div class="stats">${stat('Free', fmtDur(total))}${stat('Gaps', slots.length)}${stat('Longest', fmtDur(Math.max(0, ...slots.map(([a, b]) => b - a))))}</div>
    <div class="panels">
    ${panel(isToday ? 'Free for the rest of today' : 'Free this day', `<ul class="slots">${list || '<li class="hint">No free slots.</li>'}</ul>
      <button class="chip" data-sharefree="1">Share my free time this week</button>`)}
    ${panel('Find time for something', `<div class="finder">
      <div class="row">
        <label>What <input type="text" id="findText" value="${esc(findText)}" placeholder="e.g. Gym"></label>
        <label style="flex:0 0 100px">How long <select id="findDur">${DURS.map(m => `<option value="${m}" ${m === findDur ? 'selected' : ''}>${fmtDur(m)}</option>`).join('')}</select></label>
      </div>
      <ul class="slots">${hits.map(([k, a, b]) => `<li>${DAYS[k]} <b>${toTime(a)}–${toTime(b)}</b> <span class="hint">(${fmtDur(b - a)} free)</span>
        <button class="chip" data-book="${k}|${a}">Book ${toTime(a)}</button></li>`).join('') || '<li class="hint">Nothing that long free this week.</li>'}</ul>
    </div>`)}
    </div>
    ${panel('Tasks', taskBlock(d), 'wide')}
    <details class="panel more wide"><summary>Edit times &amp; travel</summary>${planRows(d)}${optRows(d)}</details>`;
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
  if (!d.off) svg += arc(r.start - r.cIn, r.start, 'seg-commute') + arc(r.start, ls, 'seg-work', 'work') + arc(ls, ls + r.lunch, 'seg-lunch', 'lunch') + arc(ls + r.lunch, r.finish, 'seg-work', 'work') + arc(r.finish, r.finish + r.cOut, 'seg-commute');
  if (!d.off) [['workStart', r.start], ['workEnd', r.finish]].forEach(([k, m]) => {
    const [hx, hy] = pt(ang(m), R);
    svg += `<circle cx="${hx}" cy="${hy}" r="9" class="handle grab" data-drag="${k}"><title>Drag to change work ${k === 'workStart' ? 'start' : 'finish'}</title></circle>`;
  });
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
  return `<section class="day day-main ${isToday ? 'today' : ''}" data-i="${i}">${head}
    <div class="clock"><svg viewBox="-14 -14 228 228" role="img" aria-label="Day clock">${svg}</svg>
      <div class="clock-mid">${mid}</div></div>
    <div class="legend"><i class="commute"></i>Commute <i class="work"></i>Work <i class="lunch"></i>Lunch <i class="sleep"></i>Sleep <i class="task"></i>Task${free ? ' <i class="free"></i>Free' : ''}</div>
    <div class="hint wheelhint">Drag a block to move it · drag the white dots to resize · tap a task to adjust it</div>
    ${taskEditor(d, date)}
    ${free ? freeSection(d, i, isToday) : workSections(d, r)}</section>`;
}

const panel = (title, body, cls = '') => `<div class="panel ${cls}"><h3>${title}</h3>${body}</div>`;
const stat = (label, value, cls = '') => `<div class="stat ${cls}"><small>${label}</small><b>${value}</b></div>`;

function workSections(d, r) {
  const ls = Math.min(Math.max(toMin(d.lunchAt), r.start), r.finish - r.lunch);
  const stats = d.off ? '' : `<div class="stats">
      ${stat('Start', toTime(r.start))}
      ${stat('Finish', toTime(r.finish))}
      ${stat('Work', fmtDur(r.required))}
      ${stat('Lunch', `${toTime(ls)}<span>${r.lunch}m</span>`)}
      ${r.wfh ? '' : stat('Commute', `${fmtDur(r.cIn)}<span>each way</span>`, 'commute')}
    </div>`;
  return `${d.off ? '' : locRow(d)}
    ${stats}
    <div class="panels">
      ${d.off ? '' : panel('Work hours', workExtras(d, r))}
      ${panel('Sleep', sleepCheck(r))}
    </div>
    ${panel('Tasks', taskBlock(d), 'wide')}
    ${d.off ? '' : `<details class="panel more wide"><summary>Edit times &amp; travel</summary>${planRows(d)}${optRows(d)}</details>`}`;
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
  const a = toMin(d.tFrom), b = toMin(d.tTo), wfh = d.loc === 'wfh';
  if (!wfh && a !== null && b !== null) {
    travel = (b - a + 1440) % 1440;
    earned = Math.max(0, travel - s.commute);
  }
  // Office days get a commute buffer either side of work (actual travel if logged, else the normal commute)
  const buffer = wfh ? 0 : (travel || s.commute);
  return { adj: d.adj || 0, required, lunch, total, start, finish, travel, earned, wfh, cIn: buffer, cOut: buffer };
}

function locRow(d) {
  return `<div class="seg" role="group" aria-label="Where are you working?">
      <button class="${d.loc === 'wfh' ? '' : 'on'}" data-loc="office">Office</button>
      <button class="${d.loc === 'wfh' ? 'on' : ''}" data-loc="wfh">WFH</button>
    </div>`;
}

function workExtras(d, r) {
  return `<div class="big">${fmtDur(r.required)} <span class="hint">${r.adj ? `(${fmtAdj(r.adj)} vs usual)` : 'usual hours'}</span></div>
    <input type="range" data-f="adj" min="-240" max="240" step="15" value="${r.adj}" aria-label="Work hours compared with usual">
    ${r.adj ? `<div class="${r.adj < 0 ? 'warn' : 'earn'}">${r.adj > 0 ? `+${fmtDur(r.adj)} banked` : `${fmtDur(-r.adj)} owed — stay ${fmtDur(-r.adj)} longer another day`}</div>` : ''}
    ${r.travel ? `<div>Travel ${fmtDur(r.travel)} · <span class="earn">+${fmtDur(r.earned)} banked</span></div>` : ''}`;
}

function bankTotal(before) {
  let earned = 0, used = 0;
  for (const [k, wk] of Object.entries(store.weeks)) {
    if (before && k >= before) continue;
    wk.forEach(d => { if (!d.off) { earned += calc(d).earned + (d.adj || 0); used += d.use || 0; } });
  }
  return earned - used;
}

const weekdaySnap = d => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x;
};

function weekStrip(wk, todayKey) {
  return `<div class="weekstrip">${wk.slice(0, 5).map((d, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return `<button class="daypick ${iso(date) === iso(selDay) ? 'on' : ''} ${iso(date) === todayKey ? 'today' : ''} ${d.off ? 'off' : ''}" data-pick="${i}">
      <b>${DAYS[i]}</b><span>${date.getDate()}</span><small>${d.off ? 'Off' : d.loc === 'wfh' ? 'WFH' : 'Office'}</small></button>`;
  }).join('')}</div>`;
}

function weekSummary(wk, key) {
  const s = store.settings;
  const active = wk.filter(d => !d.off);
  const weekEarned = active.reduce((n, d) => n + calc(d).earned, 0);
  const weekUsed = active.reduce((n, d) => n + (d.use || 0), 0);
  const weekWork = active.reduce((n, d) => n + calc(d).required, 0);
  const target = active.length * s.hours * 60;
  const weekAdj = active.reduce((n, d) => n + (d.adj || 0), 0);
  const net = weekEarned + weekAdj - weekUsed;
  const bf = bankTotal(key);
  const diff = weekWork + weekUsed - weekAdj - target;
  const signed = m => (m > 0 ? '+' : m < 0 ? '−' : '') + fmtDur(Math.abs(m));
  const cls = m => m < 0 ? 'warn' : m > 0 ? 'earn' : '';
  const status = diff ? `${diff > 0 ? 'Over' : 'Short'} by ${fmtDur(Math.abs(diff))}` : 'On target';
  const rows = wk.map((d, i) => {
    if (d.off) return '';
    const c = calc(d), chg = c.earned + (d.adj || 0) - (d.use || 0);
    return `<tr><td>${DAYS[i]}</td><td>${d.loc === 'wfh' ? 'WFH' : 'Office'}</td><td>${fmtDur(c.required)}</td><td class="${cls(chg)}">${chg ? signed(chg) : '–'}</td></tr>`;
  }).join('');
  return `<div class="wc-head"><h3>Week check</h3><span class="pill ${diff ? 'warn' : 'ok'}">${status}</span></div>
    <div class="wc-tiles">
      <div><small>Target</small><b>${fmtDur(target)}</b><i>${active.length} days</i></div>
      <div><small>To work</small><b>${fmtDur(weekWork)}</b><i>+ ${fmtDur(weekUsed)} banked used</i></div>
      <div><small>Bank carried</small><b class="${cls(bf + net)}">${fmtDur(bf + net)}</b><i>${fmtDur(bf)} brought, ${net ? signed(net) : 'no change'} this week</i></div>
    </div>
    <table class="wc-table"><thead><tr><th>Day</th><th>Where</th><th>Work</th><th>Bank</th></tr></thead><tbody>${rows}</tbody></table>
    ${bf + net < 0 ? `<div class="warn wc-note">You owe ${fmtDur(-(bf + net))} — stay ${fmtDur(-(bf + net))} longer to make it up.</div>` : ''}`;
}

function planAhead(wk, selIdx, todayKey) {
  const cards = wk.map((d, i) => i === selIdx ? '' : personalCard(d, i, new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i), todayKey)).join('');
  return `<h3 class="planhead">Plan ahead this week</h3>${cards}`;
}

function render() {
  const free = store.view === 'free';
  // Work is Monday to Friday; free time covers every day
  if (!free) selDay = weekdaySnap(selDay);
  monday = getMonday(selDay);
  const key = iso(monday);
  const wk = weekData(key);
  const todayKey = iso(new Date());
  $('weekLabel').textContent = selDay.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.view === store.view));
  $('bank').style.display = free ? 'none' : '';
  const i = (selDay.getDay() + 6) % 7;
  const dayHtml = dayView(wk[i], i, selDay, iso(selDay) === todayKey, free);
  if (free) {
    $('days').innerHTML = dayHtml + planAhead(wk, i, todayKey);
    const all = wk.flatMap(d => d.tasks);
    $('summary').innerHTML = `This week: <b>${all.filter(t => t.done).length}/${all.length}</b> tasks done`;
  } else {
    $('days').innerHTML = weekStrip(wk, todayKey) + dayHtml;
    $('summary').innerHTML = weekSummary(wk, key);
  }
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
  const dur = Number(day.querySelector('.newdur').value) || 60;
  let time = day.querySelector('.newtime').value;
  if (!time) {
    // No time given: put it in the first free gap that fits so it shows on the wheel
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + Number(day.dataset.i));
    const slot = freeSlots(d, iso(date) === iso(new Date()) ? NOW_MIN() : 0).find(([a, b]) => b - a >= dur);
    if (slot) time = toTime(slot[0]);
  }
  d.tasks.push({ text, time, dur, done: false });
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
  const pk = e.target.closest('[data-pick]');
  if (pk) {
    selDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + Number(pk.dataset.pick));
    selTask = null; return render();
  }
  if (e.target.dataset.sendto !== undefined) return window.sendShare && window.sendShare(Number(e.target.closest('.day').dataset.i), Number(e.target.dataset.sendto));
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
  const lc = e.target.closest('[data-loc]');
  if (lc) {
    weekData(iso(monday))[lc.closest('.day').dataset.i].loc = lc.dataset.loc;
    save(); return render();
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
  drag = { kind, task, moved: false, box, day, last: dialMin(e, box), totalDelta: 0, work: calc(day), adj: day.adj || 0, a: toMin(kind === 'work' ? day.time : kind === 'lunch' ? day.lunchAt : task ? task.time : st.sleepAt), dur: task ? (task.dur || 60) : 0, b: toMin(st.wakeAt) };
  $('days').setPointerCapture(e.pointerId);
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const step = store.exact ? 1 : 15;
  const current = dialMin(e, drag.box);
  drag.totalDelta += ((current - drag.last + 2160) % 1440) - 720;
  drag.last = current;
  const delta = Math.round(drag.totalDelta / step) * step;
  const mv = m => toTime(m + delta);
  if (delta) drag.moved = true;
  if (drag.kind === 'work') drag.day.time = mv(drag.a);
  else if (drag.kind === 'workStart') {
    const change = Math.max(-drag.work.start, Math.min(drag.work.required, 1440 - step - drag.work.start, delta));
    drag.day.adj = drag.adj - change;
    if (drag.day.mode === 'start') drag.day.time = toTime(drag.work.start + change);
  }
  else if (drag.kind === 'workEnd') {
    const change = Math.max(-drag.work.required, Math.min(1440 - step - drag.work.finish, delta));
    drag.day.adj = drag.adj + change;
    if (drag.day.mode === 'finish') drag.day.time = toTime(drag.work.finish + change);
  }
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
  const d = new Date(selDay.getFullYear(), selDay.getMonth(), selDay.getDate() + n);
  while (store.view !== 'free' && (d.getDay() === 0 || d.getDay() === 6)) d.setDate(d.getDate() + n);
  selDay = d; render();
};
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('today').onclick = () => { monday = getMonday(new Date()); selDay = new Date(); render(); };

// Swipe between days, and tap a day heading to open it
let touchX = null;
$('days').addEventListener('touchstart', e => { touchX = e.target.closest('[data-drag]') ? null : e.touches[0].clientX; }, { passive: true });
$('days').addEventListener('touchend', e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX; touchX = null;
  if (Math.abs(dx) > 70) shift(dx < 0 ? 1 : -1);
});
$('days').addEventListener('click', e => {
  const h = e.target.closest('h2');
  if (!h || store.view !== 'free' || e.target.closest('label')) return;
  selDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + Number(h.closest('.day').dataset.i));
  selTask = null; render();
});
// Keep the clock live: refresh on each minute boundary and when the tab or app returns to the foreground
const liveTick = () => { if (!drag && !document.activeElement.matches('input, select')) render(); };
const scheduleTick = () => setTimeout(() => { liveTick(); scheduleTick(); }, 60000 - (Date.now() % 60000) + 50);
scheduleTick();
document.addEventListener('visibilitychange', () => { if (!document.hidden) liveTick(); });
window.addEventListener('focus', liveTick);
window.addEventListener('pageshow', liveTick);
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
      if (sel.commute) {
        add(`commute-${id}-in`, date, r.start - r.cIn, r.start, 'Commute');
        add(`commute-${id}-out`, date, r.finish, r.finish + r.cOut, 'Commute');
      }
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
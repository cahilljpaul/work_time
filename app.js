const $ = id => document.getElementById(id);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULTS = { hours: 7.5, lunch: 30, start: '08:30', finish: '16:30', lunchAt: '12:30', commute: 30 };
const store = JSON.parse(localStorage.getItem('worktime') || '{}');
store.settings = Object.assign({}, DEFAULTS, store.settings);
store.weeks = store.weeks || {};
store.view = store.view || 'work';
const save = () => localStorage.setItem('worktime', JSON.stringify(store));

let monday = getMonday(new Date());

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

function personalCard(d, i, date, todayKey) {
  const done = d.tasks.filter(t => t.done).length;
  return `<section class="day ${iso(date) === todayKey ? 'today' : ''}" data-i="${i}">
    <h2>${DAYS[i]} ${date.getDate()}/${date.getMonth() + 1} <span class="hint">${done}/${d.tasks.length}</span></h2>
    <ul class="tasks">
      ${d.tasks.map((t, k) => `<li class="${t.done ? 'done' : ''}">
        <input type="checkbox" style="width:auto" data-tdone="${k}" ${t.done ? 'checked' : ''}>
        <span>${t.time ? `<b>${t.time}</b> ` : ''}${esc(t.text)}</span>
        <button class="chip" data-del="${k}" aria-label="Delete">&times;</button></li>`).join('')}
    </ul>
    <div class="row">
      <label>Goal / project <input type="text" class="newtext" placeholder="e.g. Build habit-tracker app"></label>
      <label style="flex:0 0 110px">Time (optional) <input type="time" class="newtime"></label>
      <button class="primary" data-add="1">Add</button>
    </div>
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

function bankTotal() {
  let earned = 0, used = 0;
  for (const wk of Object.values(store.weeks)) {
    wk.forEach(d => { if (!d.off) { earned += calc(d).earned; used += d.use || 0; } });
  }
  return earned - used;
}

function render() {
  const s = store.settings;
  const key = iso(monday);
  const wk = weekData(key);
  const fri = new Date(monday); fri.setDate(fri.getDate() + 6);
  $('weekLabel').textContent = `${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${fri.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.view === store.view));
  const personal = store.view === 'personal';
  $('ics').textContent = personal ? 'Export timed tasks to calendar (.ics)' : 'Export lunches to calendar (.ics)';
  $('bank').style.display = personal ? 'none' : '';
  const todayKey = iso(new Date());
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
      <div class="row">
        <label>Plan by
          <select data-f="mode"><option value="start" ${d.mode === 'start' ? 'selected' : ''}>I start at…</option><option value="finish" ${d.mode === 'finish' ? 'selected' : ''}>I finish at…</option></select></label>
        <label>${d.mode === 'start' ? 'Start' : 'Finish'} time <input type="time" data-f="time" value="${d.time}"></label>
        <label>Lunch starts <input type="time" data-f="lunchAt" value="${d.lunchAt}"></label>
      </div>
      <div class="chips">Eat into lunch:
        ${cuts.map(c => `<button class="chip ${d.cut === c ? 'on' : ''}" data-cut="${c}">${c ? '-' + c : 'none'}</button>`).join('')}
      </div>
      <div class="row">
        <label>Commute started <input type="time" data-f="tFrom" value="${d.tFrom}"></label>
        <label>Arrived office <input type="time" data-f="tTo" value="${d.tTo}"></label>
        <label>Use banked (min) <input type="number" data-f="use" min="0" step="5" value="${d.use || 0}"></label>
      </div>
      <div class="result">
        ${toTime(r.start)} → <b>${toTime(r.finish)}</b> · work ${fmtDur(r.required)} · lunch ${toTime(lunchStart)}–${toTime(lunchStart + r.lunch)} (${r.lunch}m)
        <div class="bar"><div class="w" style="width:${wPct}%"></div><div class="l" style="flex:1"></div></div>
        ${r.travel ? `<div>Travel ${fmtDur(r.travel)} · <span class="earn">+${fmtDur(r.earned)} banked</span></div>` : ''}
      </div>`}
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
  $('summary').innerHTML = `This week: <b>${fmtDur(weekWork)}</b> to work · banked <span class="earn">+${fmtDur(weekEarned)}</span> · used ${fmtDur(weekUsed)}`;

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
for (const k of Object.keys(DEFAULTS)) {
  $(k).value = store.settings[k];
  $(k).addEventListener('change', () => {
    store.settings[k] = $(k).type === 'number' ? Number($(k).value) || 0 : $(k).value;
    save(); render();
  });
}

// Week nav
const shift = n => { monday.setDate(monday.getDate() + n); render(); };
$('prev').onclick = () => shift(-7);
$('next').onclick = () => shift(7);
$('today').onclick = () => { monday = getMonday(new Date()); render(); };
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
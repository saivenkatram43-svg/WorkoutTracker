// MyWorkouts PWA v4
// Tabs: Home, Train, Measure, Photos, Compare

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = 'mw4';
const plan = await fetch('./plan.json').then(r => r.json());

let state = loadState();

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try { return JSON.parse(raw); } catch {}
  }
  const base = {
    sessions: {},
    measurements: { dailyWeight: {}, weeklyBody: {} },
    photos: {},
    lastAssignedDayIndex: 0,
    _photoWeek: null,
    _compareDayIndex: 1
  };
  saveState(base);
  return base;
}

function saveState(s=state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// date helpers
function isoDate(d){ return d.toISOString().slice(0,10); }
function parseISO(s){ const [y,m,dd]=s.split('-').map(Number); return new Date(y,m-1,dd); }
function startOfWeek(d=new Date()){
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(0,0,0,0);
  return x;
}
function weekKey(d){ return isoDate(startOfWeek(d)); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); x.setHours(0,0,0,0); return x; }

// sequencing
function nextDayIndex(){ return (state.lastAssignedDayIndex % 5) + 1; }

function assignSessionIfMissing(dateKey){
  if(state.sessions[dateKey]) return state.sessions[dateKey];
  const di = nextDayIndex();
  state.lastAssignedDayIndex = di;
  state.sessions[dateKey] = { dayIndex: di, done: false, exercises: {} };
  const day = plan.cycle.find(x => x.dayIndex === di);
  day.exercises.forEach(ex => {
    state.sessions[dateKey].exercises[ex.name] = [{set:1, reps: ex.reps, weight: null}];
  });
  saveState();
  return state.sessions[dateKey];
}

// UI
const app = $('#app');
let currentTab = 'home';
let selectedDateKey = isoDate(new Date());

function setActiveTab(tab){
  currentTab = tab;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  render();
}
$$('.tab').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

function render(){
  if(currentTab==='home') return renderHome();
  if(currentTab==='train') return renderTrain();
  if(currentTab==='measure') return renderMeasure();
  if(currentTab==='photos') return renderPhotos();
  if(currentTab==='compare') return renderCompare();
}

function renderHome(){
  app.innerHTML = `
    <div class='grid'>
      <div class='tile' id='goTrain'>🏋️ Train<small>Calendar + log weights</small></div>
      <div class='tile' id='goMeasure'>📏 Measurement<small>Daily weight + weekly body</small></div>
      <div class='tile' id='goPhotos'>📸 Photos<small>Weekly photo stories</small></div>
      <div class='tile' id='goCompare'>📊 Compare<small>Graphs</small></div>
    </div>
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div>
          <div style='font-weight:900'>Cycle tracker</div>
          <div class='small'>Next workout in your 5-day plan:</div>
        </div>
        <span class='badge'>Day ${nextDayIndex()}</span>
      </div>
      <div class='note' style='margin-top:10px'>
        If you skip a day and train later, the next workout still opens in order.
      </div>
    </div>
  `;
  $('#goTrain').onclick = () => setActiveTab('train');
  $('#goMeasure').onclick = () => setActiveTab('measure');
  $('#goPhotos').onclick = () => setActiveTab('photos');
  $('#goCompare').onclick = () => setActiveTab('compare');
}

function renderTrain(){
  const wkStart = startOfWeek(parseISO(selectedDateKey));
  const days = Array.from({length:7}, (_,i)=> addDays(wkStart,i));
  const cells = days.map(d => {
    const dk = isoDate(d);
    const session = state.sessions[dk];
    const done = session?.done;
    const di = session?.dayIndex;
    const isSel = dk===selectedDateKey;
    return `
      <div class='day ${done?'done':''} ${isSel?'selected':''}' data-date='${dk}'>
        <div class='d'>${d.toLocaleDateString(undefined,{weekday:'short'})}</div>
        <div class='s'>${d.getDate()}</div>
        <div class='s'>${di?`Day ${di} ${plan.cycle.find(x=>x.dayIndex===di).emoji}`:'Tap'}</div>
      </div>
    `;
  }).join('');

  const selSession = assignSessionIfMissing(selectedDateKey);
  const selDay = plan.cycle.find(x=>x.dayIndex===selSession.dayIndex);

  app.innerHTML = `
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div>
          <div style='font-weight:900'>Week of ${isoDate(wkStart)}</div>
          <div class='small'>Tap a day to log the next workout</div>
        </div>
        <div>
          <button class='btn secondary' id='prevWeek'>←</button>
          <button class='btn secondary' id='nextWeek'>→</button>
        </div>
      </div>
      <div class='calendar7' style='margin-top:12px'>${cells}</div>
    </div>

    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div>
          <div style='font-weight:900'>Day ${selDay.dayIndex}: ${selDay.title}</div>
          <div class='small'>${selectedDateKey}</div>
        </div>
        <span class='badge'>${selSession.done?'Done ✅':'Not done'}</span>
      </div>

      <div class='note' style='margin-top:10px'>GIF/animation per exercise can be plugged in later. For now, log weights.</div>

      <div style='margin-top:12px'>
        ${selDay.exercises.map(ex => renderExerciseRow(selectedDateKey, ex)).join('')}
      </div>

      <div style='display:flex;gap:10px;margin-top:12px'>
        <button class='btn' id='markDone'>Mark Workout Done</button>
        <button class='btn danger' id='clearDay'>Clear This Day</button>
      </div>
    </div>
  `;

  $$('.day[data-date]').forEach(el => {
    el.onclick = () => { selectedDateKey = el.dataset.date; renderTrain(); };
  });
  $('#prevWeek').onclick = () => { selectedDateKey = isoDate(addDays(wkStart,-7)); renderTrain(); };
  $('#nextWeek').onclick = () => { selectedDateKey = isoDate(addDays(wkStart, 7)); renderTrain(); };
  $('#markDone').onclick = () => { const s = assignSessionIfMissing(selectedDateKey); s.done=true; saveState(); renderTrain(); };
  $('#clearDay').onclick = () => { if(!confirm('Clear this day log?')) return; delete state.sessions[selectedDateKey]; saveState(); renderTrain(); };
}

function renderExerciseRow(dateKey, ex){
  const s = assignSessionIfMissing(dateKey);
  const arr = s.exercises[ex.name] || [{set:1, reps: ex.reps, weight: null}];
  const v = arr[0]?.weight ?? '';
  return `
    <div class='item'>
      <div>
        <div style='font-weight:900'>${ex.name}</div>
        <div class='small'>${ex.sets} sets × ${ex.reps} reps</div>
      </div>
      <input class='input' style='width:90px' inputmode='decimal' placeholder='kg' value='${v}' data-ex='${escapeAttr(ex.name)}' data-date='${dateKey}' />
    </div>
  `;
}

app.addEventListener('input', (e) => {
  const t = e.target;
  if(!(t instanceof HTMLInputElement)) return;
  if(!t.dataset.ex || !t.dataset.date) return;
  const dateKey = t.dataset.date;
  const exName = unescapeAttr(t.dataset.ex);
  const s = assignSessionIfMissing(dateKey);
  const w = parseFloat(t.value);
  if(!s.exercises[exName]) s.exercises[exName] = [{set:1, reps:null, weight:null}];
  s.exercises[exName][0].weight = isNaN(w) ? null : w;
  saveState();
});

function renderMeasure(){
  const dk = selectedDateKey || isoDate(new Date());
  const dw = state.measurements.dailyWeight[dk] ?? '';
  const wk = weekKey(parseISO(dk));
  const wb = state.measurements.weeklyBody[wk] || {chest:'', bicep:'', waist:'', thigh:''};

  app.innerHTML = `
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div>
          <div style='font-weight:900'>Daily Weight</div>
          <div class='small'>${dk}</div>
        </div>
        <button class='btn secondary' id='pickToday'>Today</button>
      </div>
      <div class='label'>Weight (kg)</div>
      <input class='input' id='dailyWeight' inputmode='decimal' value='${dw}' placeholder='e.g., 61.0' />
    </div>

    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div>
          <div style='font-weight:900'>Weekly Body Measurements</div>
          <div class='small'>Week of ${wk}</div>
        </div>
        <span class='badge'>Weekly</span>
      </div>
      ${measureField('Chest', 'chest', wb.chest)}
      ${measureField('Bicep', 'bicep', wb.bicep)}
      ${measureField('Waist', 'waist', wb.waist)}
      ${measureField('Thigh', 'thigh', wb.thigh)}
      <div style='display:flex;gap:10px;margin-top:12px'>
        <button class='btn' id='saveMeasure'>Save</button>
        <button class='btn danger' id='clearMeasure'>Clear Week</button>
      </div>
    </div>
  `;

  $('#pickToday').onclick = () => { selectedDateKey = isoDate(new Date()); renderMeasure(); };

  $('#dailyWeight').oninput = () => {
    const v = parseFloat($('#dailyWeight').value);
    if(isNaN(v)) delete state.measurements.dailyWeight[dk];
    else state.measurements.dailyWeight[dk] = v;
    saveState();
  };

  $('#saveMeasure').onclick = () => {
    state.measurements.weeklyBody[wk] = {
      chest: parseFloat($('#m_chest').value) || null,
      bicep: parseFloat($('#m_bicep').value) || null,
      waist: parseFloat($('#m_waist').value) || null,
      thigh: parseFloat($('#m_thigh').value) || null
    };
    saveState();
    alert('Saved');
  };

  $('#clearMeasure').onclick = () => {
    if(!confirm('Clear weekly measurements for this week?')) return;
    delete state.measurements.weeklyBody[wk];
    saveState();
    renderMeasure();
  };
}

function measureField(label, key, val){
  const v = (val ?? '') === null ? '' : (val ?? '');
  return `
    <div class='label'>${label} (cm)</div>
    <input class='input' id='m_${key}' inputmode='decimal' value='${v}' placeholder='e.g., 95' />
  `;
}

function renderPhotos(){
  const allWeeks = Object.keys(state.photos || {}).sort().reverse();
  const currentWeek = weekKey(parseISO(selectedDateKey));
  const chosenWeek = state._photoWeek || currentWeek;
  const items = state.photos[chosenWeek] || [];

  const stories = allWeeks.length ? allWeeks.map(wk => {
    const first = (state.photos[wk] || [])[0];
    const stamp = wk.slice(5);
    const isSel = wk === chosenWeek;
    return `
      <div class='story' data-week='${wk}'>
        <div class='storyRing' style='filter:${isSel?'none':'grayscale(.25)'}'>
          <div class='storyInner'>
            ${first ? `<img src='${first}' alt='week ${wk}'/>` : `<div style='font-weight:900'>📸</div>`}
            <div class='storyStamp'>${stamp}</div>
          </div>
        </div>
        <div class='storyLabel'>Week ${stamp}</div>
      </div>
    `;
  }).join('') : `<div class='note'>No weekly photos yet. Upload your first week below.</div>`;

  app.innerHTML = `
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div>
          <div style='font-weight:900'>Weekly Photo Stories</div>
          <div class='small'>Tap a circle = open that week</div>
        </div>
        <span class='badge'>Stories</span>
      </div>
      <div class='storyBar' style='margin-top:10px'>${stories}</div>
    </div>

    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div>
          <div style='font-weight:900'>Selected Week</div>
          <div class='small'>${chosenWeek}</div>
        </div>
        <div style='display:flex;gap:8px'>
          <button class='btn secondary' id='useCurrentWeek'>This Week</button>
          <button class='btn danger' id='clearPhotos'>Clear</button>
        </div>
      </div>
      <div class='label'>Upload photos for this week</div>
      <input class='input' style='padding:10px' id='photoInput' type='file' accept='image/*' multiple />
      <div class='note' style='margin-top:10px'>Collage editing is not included — this story row is the Instagram-style alternative you suggested.</div>
    </div>

    <div class='card'>
      <div style='font-weight:900;margin-bottom:10px'>Photos in ${chosenWeek}</div>
      <div class='grid'>
        ${items.length ? items.map(src => `<div class='card' style='padding:8px;margin:0'><img src='${src}' style='width:100%;border-radius:12px'/></div>`).join('') : `<div class='note'>No photos for this week yet</div>`}
      </div>
    </div>
  `;

  $$('.story[data-week]').forEach(el => {
    el.onclick = () => { state._photoWeek = el.dataset.week; saveState(); renderPhotos(); };
  });

  $('#useCurrentWeek').onclick = () => { state._photoWeek = currentWeek; saveState(); renderPhotos(); };

  $('#photoInput').onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    if(!files.length) return;
    const wk = state._photoWeek || currentWeek;
    const arr = state.photos[wk] || [];
    for(const f of files){
      const dataUrl = await fileToDataURL(f);
      arr.push(dataUrl);
    }
    state.photos[wk] = arr;
    saveState();
    renderPhotos();
  };

  $('#clearPhotos').onclick = () => {
    const wk = state._photoWeek || currentWeek;
    if(!confirm(`Clear photos for week ${wk}?`)) return;
    delete state.photos[wk];
    saveState();
    renderPhotos();
  };
}

function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function renderCompare(){
  app.innerHTML = `
    <div class='card'>
      <div style='font-weight:900'>Compare</div>
      <div class='note'>Graphs come from Measure + Train logs.</div>
    </div>

    <div class='card'>
      <div style='font-weight:900'>Daily Weight (kg)</div>
      <div class='chartWrap'><div id='chartDaily'></div></div>
    </div>

    <div class='card'>
      <div style='font-weight:900'>Weekly Body Measurements (cm)</div>
      <div class='small'>One combined graph (chest, bicep, waist, thigh)</div>
      <div class='chartWrap'><div id='chartBody'></div></div>
    </div>

    <div class='card'>
      <div style='font-weight:900'>Workout Day-by-Day Compare</div>
      <div class='small'>Compare Week 1 Day X vs Week 2 Day X (all exercises)</div>
      <div style='display:flex;gap:10px;align-items:center;margin-top:10px'>
        <span class='badge'>Day</span>
        <select id='compareDay' class='input' style='max-width:160px;padding:10px 12px'>
          <option value='1'>Day 1</option>
          <option value='2'>Day 2</option>
          <option value='3'>Day 3</option>
          <option value='4'>Day 4</option>
          <option value='5'>Day 5</option>
        </select>
      </div>
      <div class='chartWrap'><div id='chartDayExercises'></div></div>
      <div class='note' style='margin-top:10px'>Each line is one exercise from that day, plotted week by week.</div>
    </div>

    <div class='card'>
      <div style='font-weight:900'>Workout Weights by Week</div>
      <div class='small'>Avg logged weight per workout day (Day 1..5)</div>
      <div class='chartWrap'><div id='chartWorkout'></div></div>
      <div class='note' style='margin-top:10px'>Uses average of all exercise weights you entered for that workout day in that week.</div>
    </div>
  `;

  const daily = buildDailyWeightSeries();
  const body = buildWeeklyBodySeries();
  const work = buildWorkoutWeeklySeries();
  const dayIdx = state._compareDayIndex || 1;
  const daySeries = buildWorkoutDayExerciseSeries(dayIdx);

  renderLineChart('#chartDaily', daily);
  renderLineChart('#chartBody', body);
  renderLineChart('#chartWorkout', work);
  renderLineChart('#chartDayExercises', daySeries);

  const sel = $('#compareDay');
  if(sel){
    sel.value = String(dayIdx);
    sel.onchange = () => { state._compareDayIndex = Number(sel.value); saveState(); renderCompare(); };
  }
}

function buildDailyWeightSeries(){
  const entries = Object.entries(state.measurements.dailyWeight)
    .map(([date,val]) => ({date, val:Number(val)}))
    .filter(x => !isNaN(x.val))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const labels = entries.map(x=>x.date);
  const values = entries.map(x=>x.val);
  return [{name:'Weight', color:'#60a5fa', labels, values}];
}

function buildWeeklyBodySeries(){
  const entries = Object.entries(state.measurements.weeklyBody)
    .map(([wk,o]) => ({wk,o}))
    .sort((a,b)=>a.wk.localeCompare(b.wk));
  const labels = entries.map(x=>x.wk);
  const chest = entries.map(x=>numOrNull(x.o.chest));
  const bicep = entries.map(x=>numOrNull(x.o.bicep));
  const waist = entries.map(x=>numOrNull(x.o.waist));
  const thigh = entries.map(x=>numOrNull(x.o.thigh));
  return [
    {name:'Chest', color:'#f97316', labels, values: chest},
    {name:'Bicep', color:'#a78bfa', labels, values: bicep},
    {name:'Waist', color:'#22c55e', labels, values: waist},
    {name:'Thigh', color:'#eab308', labels, values: thigh}
  ];
}

function buildWorkoutDayExerciseSeries(dayIndex){
  const day = plan.cycle.find(x => x.dayIndex === dayIndex);
  if(!day) return [];

  const buckets = {}; // wk -> exName -> [weights]
  Object.entries(state.sessions).forEach(([dateKey, sess]) => {
    if(sess.dayIndex !== dayIndex) return;
    const wk = weekKey(parseISO(dateKey));
    if(!buckets[wk]) buckets[wk] = {};

    Object.entries(sess.exercises || {}).forEach(([exName, arr]) => {
      const w = arr?.[0]?.weight;
      if(typeof w !== 'number' || isNaN(w)) return;
      if(!buckets[wk][exName]) buckets[wk][exName] = [];
      buckets[wk][exName].push(w);
    });
  });

  const weekLabels = Object.keys(buckets).sort();
  if(!weekLabels.length) return [{name:'No data', color:'#60a5fa', labels:[], values:[]}];

  const palette = ['#60a5fa','#f97316','#22c55e','#a78bfa','#eab308','#fb7185','#34d399','#38bdf8'];

  return day.exercises.map((ex, idx) => {
    const vals = weekLabels.map(wk => {
      const arr = buckets[wk]?.[ex.name] || [];
      if(!arr.length) return null;
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
      return round1(avg);
    });
    return {name: ex.name, color: palette[idx % palette.length], labels: weekLabels, values: vals};
  });
}

function buildWorkoutWeeklySeries(){
  const buckets = {}; // wk -> dayIndex -> [weights]
  Object.entries(state.sessions).forEach(([dateKey, sess]) => {
    const wk = weekKey(parseISO(dateKey));
    if(!buckets[wk]) buckets[wk] = {};
    if(!buckets[wk][sess.dayIndex]) buckets[wk][sess.dayIndex] = [];
    Object.values(sess.exercises || {}).forEach(arr => {
      const w = arr?.[0]?.weight;
      if(typeof w === 'number' && !isNaN(w)) buckets[wk][sess.dayIndex].push(w);
    });
  });
  const labels = Object.keys(buckets).sort();
  const colors = ['#60a5fa','#f97316','#22c55e','#a78bfa','#eab308'];
  const out = [];
  for(let di=1; di<=5; di++){
    const vals = labels.map(wk => {
      const arr = buckets[wk]?.[di] || [];
      if(!arr.length) return null;
      return round1(arr.reduce((a,b)=>a+b,0)/arr.length);
    });
    out.push({name:`Day ${di}`, color: colors[di-1], labels, values: vals});
  }
  return out;
}

function renderLineChart(containerSelector, seriesList){
  const el = $(containerSelector);
  if(!el) return;
  const labels = seriesList[0]?.labels || [];
  if(!labels.length){ el.innerHTML = `<div class='note'>No data yet. Log some values first.</div>`; return; }

  let all = [];
  seriesList.forEach(s => s.values.forEach(v => { if(v!==null && v!==undefined && !isNaN(v)) all.push(v); }));
  if(!all.length){ el.innerHTML = `<div class='note'>No numeric data yet.</div>`; return; }

  const minV = Math.min(...all);
  const maxV = Math.max(...all);
  const pad = (maxV-minV)*0.1 || 1;
  const yMin = minV - pad;
  const yMax = maxV + pad;

  const W = 900, H = 260;
  const margin = {l:50, r:20, t:20, b:48};
  const innerW = W - margin.l - margin.r;
  const innerH = H - margin.t - margin.b;

  const x = (i) => margin.l + (labels.length===1 ? innerW/2 : (i*(innerW/(labels.length-1))));
  const y = (v) => margin.t + (innerH * (1 - ((v - yMin) / (yMax - yMin))));

  const ticks = 3;
  let grid = '';
  for(let i=0;i<=ticks;i++){
    const tv = yMin + (i*(yMax-yMin)/ticks);
    const yy = y(tv);
    grid += `<line x1='${margin.l}' y1='${yy}' x2='${W-margin.r}' y2='${yy}' stroke='rgba(255,255,255,.08)' />`;
    grid += `<text x='${margin.l-8}' y='${yy+4}' fill='rgba(255,255,255,.6)' font-size='11' text-anchor='end'>${round1(tv)}</text>`;
  }

  const maxXL = 6;
  const step = Math.max(1, Math.ceil(labels.length/maxXL));
  let xlabels = '';
  labels.forEach((lab, i) => {
    if(i % step !== 0 && i !== labels.length-1) return;
    const xx = x(i);
    const txt = lab.length>10 ? lab.slice(5) : lab;
    xlabels += `<text x='${xx}' y='${H-18}' fill='rgba(255,255,255,.6)' font-size='11' text-anchor='middle'>${escapeHTML(txt)}</text>`;
  });

  let paths = '';
  let points = '';
  seriesList.forEach((s) => {
    let d = '';
    let started = false;
    for(let i=0;i<labels.length;i++){
      const v = s.values[i];
      if(v===null || v===undefined || isNaN(v)) { started = false; continue; }
      const xx = x(i);
      const yy = y(v);
      if(!started){ d += `M ${xx} ${yy}`; started = true; }
      else { d += ` L ${xx} ${yy}`; }
      points += `<circle cx='${xx}' cy='${yy}' r='3' fill='${s.color}' />`;
    }
    paths += `<path d='${d}' fill='none' stroke='${s.color}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' />`;
  });

  const svg = `
    <svg class='chart' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'>
      ${grid}
      <line x1='${margin.l}' y1='${H-margin.b}' x2='${W-margin.r}' y2='${H-margin.b}' stroke='rgba(255,255,255,.10)' />
      ${paths}
      ${points}
      ${xlabels}
    </svg>
  `;

  const legend = `
    <div class='legend'>
      ${seriesList.map(s => `<span><i class='dot' style='background:${s.color}'></i>${escapeHTML(s.name)}</span>`).join('')}
    </div>
  `;

  el.innerHTML = svg + legend;
}

function numOrNull(v){ const n = Number(v); return isNaN(n) ? null : n; }
function round1(n){ return Math.round(n*10)/10; }
function escapeHTML(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return escapeHTML(s).replace(/\"/g,'&quot;'); }
function unescapeAttr(s){ return String(s).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'\"'); }

// Service worker
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js'); }

setActiveTab('home');

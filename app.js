// MyWorkouts PWA v7
// Full functionality + multi-set logging + watermark + 2-week progressive overload check

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = 'mw7';
let plan = null;

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
    _compareDayIndex: 1,
    _pendingPhotos: []
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
function daysBetween(aISO, bISO){
  const a = parseISO(aISO).getTime();
  const b = parseISO(bISO).getTime();
  return Math.round((b-a)/(1000*60*60*24));
}

// sequencing
function nextDayIndex(){ return (state.lastAssignedDayIndex % 5) + 1; }

function ensureExerciseSets(exTemplate){
  // Create array of set objects length = prescribed sets
  return Array.from({length: exTemplate.sets}, (_,i)=>({
    set: i+1,
    reps: exTemplate.reps,
    weight: null
  }));
}

function assignSessionIfMissing(dateKey){
  if(state.sessions[dateKey]) return state.sessions[dateKey];
  const di = nextDayIndex();
  state.lastAssignedDayIndex = di;

  const session = { dayIndex: di, done: false, exercises: {} };
  const day = plan.cycle.find(x => x.dayIndex === di);
  day.exercises.forEach(ex => {
    session.exercises[ex.name] = { sets: ensureExerciseSets(ex) };
  });
  state.sessions[dateKey] = session;
  saveState();
  return session;
}

// UI
const app = $('#app');
let currentTab = 'train';
let selectedDateKey = isoDate(new Date());

function setActiveTab(tab){
  currentTab = tab;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  render();
}
function wireTabs(){
  $$('.tab').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
}

function render(){
  if(!plan){
    app.innerHTML = `<div class='card'><div style='font-weight:900'>Loading…</div><div class='note'>Fetching workout plan.</div></div>`;
    return;
  }
  if(currentTab==='train') return renderTrain();
  if(currentTab==='measure') return renderMeasure();
  if(currentTab==='photos') return renderPhotos();
  if(currentTab==='compare') return renderCompare();
}

// ---------- Watermark & progressive overload helpers ----------
function getPreviousWeights(dateKey, dayIndex, exName, setNum){
  // Find the most recent previous session BEFORE dateKey with same dayIndex and exercise
  const keys = Object.keys(state.sessions).sort();
  const idx = keys.indexOf(dateKey);
  if(idx <= 0) return { last:null, twoWeeks:null };

  let last = null;
  let twoWeeks = null;

  // walk backwards
  for(let i=idx-1; i>=0; i--){
    const k = keys[i];
    const s = state.sessions[k];
    if(!s || s.dayIndex !== dayIndex) continue;
    const ex = s.exercises?.[exName];
    const w = ex?.sets?.find(x => x.set === setNum)?.weight;
    if(typeof w === 'number' && !isNaN(w)){
      last = { date: k, weight: w };
      break;
    }
  }

  // two-week baseline: find a session at least 14 days earlier than dateKey
  for(let i=idx-1; i>=0; i--){
    const k = keys[i];
    const diff = daysBetween(k, dateKey);
    if(diff < 14) continue;
    const s = state.sessions[k];
    if(!s || s.dayIndex !== dayIndex) continue;
    const ex = s.exercises?.[exName];
    const w = ex?.sets?.find(x => x.set === setNum)?.weight;
    if(typeof w === 'number' && !isNaN(w)){
      twoWeeks = { date: k, weight: w };
      break;
    }
  }

  return { last, twoWeeks };
}

function overloadWarningsForDay(dateKey){
  const session = assignSessionIfMissing(dateKey);
  const dayIndex = session.dayIndex;
  const day = plan.cycle.find(x=>x.dayIndex===dayIndex);
  const warnings = [];

  day.exercises.forEach(ex => {
    const exState = session.exercises[ex.name];
    exState.sets.forEach(setObj => {
      const cur = setObj.weight;
      if(typeof cur !== 'number' || isNaN(cur)) return;
      const prev = getPreviousWeights(dateKey, dayIndex, ex.name, setObj.set);
      if(prev.twoWeeks){
        if(cur < (prev.twoWeeks.weight + 1.5)){
          warnings.push({
            ex: ex.name,
            set: setObj.set,
            baseline: prev.twoWeeks.weight,
            current: cur,
            from: prev.twoWeeks.date
          });
        }
      }
    });
  });

  return warnings;
}

// ---------- Train ----------
function renderTrain(){
  const wkStart = startOfWeek(parseISO(selectedDateKey));
  const days = Array.from({length:7}, (_,i)=> addDays(wkStart,i));

  const cells = days.map(d => {
    const dk = isoDate(d);
    const session = state.sessions[dk];
    const done = session?.done;
    const di = session?.dayIndex;
    const isSel = dk===selectedDateKey;
    const emoji = di ? plan.cycle.find(x=>x.dayIndex===di).emoji : '';
    return `
      <div class='day ${done?'done':''} ${isSel?'selected':''}' data-date='${dk}'>
        <div class='d'>${d.toLocaleDateString(undefined,{weekday:'short'})}</div>
        <div class='s'>${d.getDate()}</div>
        <div class='s'>${di?`Day ${di} ${emoji}`:'Tap'}</div>
      </div>
    `;
  }).join('');

  const selSession = assignSessionIfMissing(selectedDateKey);
  const selDay = plan.cycle.find(x=>x.dayIndex===selSession.dayIndex);

  const warnings = overloadWarningsForDay(selectedDateKey);
  const warnHtml = warnings.length ? `
    <div class='alert'>
      Progressive overload check: ${warnings.length} set(s) are not +1.5kg vs 2 weeks ago. Push the weight up! 💪
    </div>
  ` : '';

  app.innerHTML = `
    ${warnHtml}
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div>
          <div style='font-weight:900'>Week of ${isoDate(wkStart)}</div>
          <div class='small'>Tap a day to log the next workout</div>
        </div>
        <div style='display:flex;gap:8px'>
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

      <div class='note' style='margin-top:10px'>Enter weight + reps for each set. Placeholders show last time’s weight (watermark).</div>

      <div style='margin-top:12px'>
        ${selDay.exercises.map(ex => renderExerciseBlock(selectedDateKey, ex)).join('')}
      </div>

      <div style='display:flex;gap:10px;margin-top:12px'>
        <button class='btn' id='markDone'>Mark Workout Done</button>
        <button class='btn danger' id='clearDay'>Clear This Day</button>
      </div>
    </div>
  `;

  // calendar clicks
  $$('.day[data-date]').forEach(el => {
    el.onclick = () => { selectedDateKey = el.dataset.date; renderTrain(); };
  });

  $('#prevWeek').onclick = () => { selectedDateKey = isoDate(addDays(wkStart,-7)); renderTrain(); };
  $('#nextWeek').onclick = () => { selectedDateKey = isoDate(addDays(wkStart, 7)); renderTrain(); };

  $('#markDone').onclick = () => { const s = assignSessionIfMissing(selectedDateKey); s.done=true; saveState(); renderTrain(); };
  $('#clearDay').onclick = () => { if(!confirm('Clear this day log?')) return; delete state.sessions[selectedDateKey]; saveState(); renderTrain(); };
}

function renderExerciseBlock(dateKey, ex){
  const session = assignSessionIfMissing(dateKey);
  const dayIndex = session.dayIndex;
  const exState = session.exercises[ex.name] || { sets: ensureExerciseSets(ex) };
  session.exercises[ex.name] = exState;

  // build rows
  const rows = exState.sets.map(setObj => {
    const prev = getPreviousWeights(dateKey, dayIndex, ex.name, setObj.set);
    const watermark = prev.last ? `${prev.last.weight} kg` : '';
    const wVal = (typeof setObj.weight === 'number' && !isNaN(setObj.weight)) ? setObj.weight : '';
    const rVal = (typeof setObj.reps === 'number' && !isNaN(setObj.reps)) ? setObj.reps : '';

    return `
      <tr>
        <td><span class='badge'>Set ${setObj.set}</span></td>
        <td>
          <input class='setInput' inputmode='decimal' placeholder='${watermark || "kg"}' value='${wVal}'
            data-kind='weight' data-date='${dateKey}' data-ex='${escapeAttr(ex.name)}' data-set='${setObj.set}' />
        </td>
        <td>
          <input class='setInput' inputmode='numeric' placeholder='reps' value='${rVal}'
            data-kind='reps' data-date='${dateKey}' data-ex='${escapeAttr(ex.name)}' data-set='${setObj.set}' />
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class='exercise'>
      <div class='exTop'>
        <div>
          <div class='exName'>${ex.name}</div>
          <div class='small'>${ex.sets} sets × ${ex.reps} reps</div>
        </div>
        <span class='badge'>${ex.emoji || '🏋️'}</span>
      </div>

      <table class='setTable'>
        <thead>
          <tr>
            <th>Set</th>
            <th>Weight (kg)</th>
            <th>Reps</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// Save set inputs
app.addEventListener('input', (e) => {
  const t = e.target;
  if(!(t instanceof HTMLInputElement)) return;
  if(!t.dataset.kind || !t.dataset.date || !t.dataset.ex || !t.dataset.set) return;

  const dateKey = t.dataset.date;
  const exName = unescapeAttr(t.dataset.ex);
  const setNum = Number(t.dataset.set);
  const kind = t.dataset.kind;

  const session = assignSessionIfMissing(dateKey);
  const exObj = session.exercises[exName];
  if(!exObj) return;
  const setObj = exObj.sets.find(x => x.set === setNum);
  if(!setObj) return;

  if(kind === 'weight'){
    const w = parseFloat(t.value);
    setObj.weight = isNaN(w) ? null : w;
  }
  if(kind === 'reps'){
    const r = parseInt(t.value, 10);
    setObj.reps = isNaN(r) ? null : r;
  }
  saveState();
});

// ---------- Measure ----------
function avg(arr){
  if(!arr.length) return null;
  return arr.reduce((a,b)=>a+b,0)/arr.length;
}

function renderMeasure(){
  const dk = selectedDateKey || isoDate(new Date());
  const wk = weekKey(parseISO(dk));
  const dailyVal = state.measurements.dailyWeight[dk] ?? '';
  const wb = state.measurements.weeklyBody[wk] || {chest:null, bicep:null, waist:null, thigh:null};

  // progression list
  const weekKeys = Array.from(new Set([
    ...Object.keys(state.measurements.weeklyBody || {}),
    ...Object.keys(state.measurements.dailyWeight || {}).map(d => weekKey(parseISO(d)))
  ])).sort();

  const progRows = weekKeys.map(w => {
    const body = state.measurements.weeklyBody[w] || {};
    const weights = Object.entries(state.measurements.dailyWeight)
      .filter(([date,_]) => weekKey(parseISO(date)) === w)
      .map(([_,v]) => Number(v))
      .filter(v => !isNaN(v));
    const wAvg = avg(weights);
    return `
      <div class='item' style='align-items:flex-start'>
        <div>
          <div style='font-weight:900'>Week ${w}</div>
          <div class='small'>Avg weight: ${wAvg===null?'—':wAvg.toFixed(1)+' kg'}</div>
          <div class='small'>Chest: ${body.chest ?? '—'} · Bicep: ${body.bicep ?? '—'} · Waist: ${body.waist ?? '—'} · Thigh: ${body.thigh ?? '—'}</div>
        </div>
      </div>
    `;
  }).join('');

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
      <input class='input' id='dailyWeight' inputmode='decimal' value='${dailyVal}' placeholder='e.g., 61.0' />
      <div style='display:flex;gap:10px;margin-top:12px'>
        <button class='btn' id='saveDaily'>Record Entry</button>
        <button class='btn danger' id='clearDaily'>Clear Day</button>
      </div>
      <div class='note' style='margin-top:10px'>Records and stores today’s weight entry.</div>
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
        <button class='btn' id='saveWeekly'>Record Entry</button>
        <button class='btn danger' id='clearWeekly'>Clear Week</button>
      </div>
      <div class='note' style='margin-top:10px'>Records and stores this week’s body measurements.</div>
    </div>

    <div class='card'>
      <div style='font-weight:900'>Progression</div>
      <div class='note'>Shows weekly measurements + weekly average of daily weights.</div>
      <div style='margin-top:10px' class='list'>
        ${progRows || "<div class='note'>No progression data yet</div>"}
      </div>
    </div>
  `;

  $('#pickToday').onclick = () => { selectedDateKey = isoDate(new Date()); renderMeasure(); };

  $('#saveDaily').onclick = () => {
    const v = parseFloat($('#dailyWeight').value);
    if(isNaN(v)) return alert('Enter a valid number');
    state.measurements.dailyWeight[dk] = v;
    saveState();
    alert('Daily weight saved ✅');
    renderMeasure();
  };

  $('#clearDaily').onclick = () => {
    if(!confirm('Clear daily weight for this day?')) return;
    delete state.measurements.dailyWeight[dk];
    saveState();
    renderMeasure();
  };

  $('#saveWeekly').onclick = () => {
    state.measurements.weeklyBody[wk] = {
      chest: numOrNull($('#m_chest').value),
      bicep: numOrNull($('#m_bicep').value),
      waist: numOrNull($('#m_waist').value),
      thigh: numOrNull($('#m_thigh').value)
    };
    saveState();
    alert('Weekly measurements saved ✅');
    renderMeasure();
  };

  $('#clearWeekly').onclick = () => {
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

// ---------- Photos ----------
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

  const pendingCount = (state._pendingPhotos || []).length;

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

      <div class='label'>Choose photos</div>
      <input class='input' style='padding:10px' id='photoInput' type='file' accept='image/*' multiple />

      <div style='display:flex;gap:10px;margin-top:12px'>
        <button class='btn' id='savePhotos'>Record Uploads (${pendingCount})</button>
        <button class='btn secondary' id='clearPending'>Clear Selected</button>
      </div>

      <div class='note' style='margin-top:10px'>Uploads are saved into the chosen week after you tap Record Uploads.</div>

      <div class='grid' style='margin-top:12px'>
        ${(state._pendingPhotos||[]).slice(0,4).map(src => `<div class='card' style='padding:8px;margin:0'><img src='${src}' style='width:100%;border-radius:12px'/></div>`).join('') || "<div class='note'>No selected photos yet</div>"}
      </div>
    </div>

    <div class='card'>
      <div style='font-weight:900;margin-bottom:10px'>Saved Photos in ${chosenWeek}</div>
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
    state._pendingPhotos = [];
    saveState();
    for(const f of files){
      const dataUrl = await fileToDataURL(f);
      state._pendingPhotos.push(dataUrl);
    }
    saveState();
    renderPhotos();
  };

  $('#savePhotos').onclick = () => {
    const wk = state._photoWeek || currentWeek;
    const arr = state.photos[wk] || [];
    (state._pendingPhotos||[]).forEach(p => arr.push(p));
    state.photos[wk] = arr;
    state._pendingPhotos = [];
    saveState();
    alert('Photos saved ✅');
    renderPhotos();
  };

  $('#clearPending').onclick = () => {
    state._pendingPhotos = [];
    saveState();
    renderPhotos();
  };

  $('#clearPhotos').onclick = () => {
    const wk = state._photoWeek || currentWeek;
    if(!confirm(`Clear saved photos for week ${wk}?`)) return;
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

// ---------- Compare (graphs) ----------
function renderCompare(){
  app.innerHTML = `
    <div class='card'>
      <div style='font-weight:900'>Compare</div>
      <div class='note'>Graphs come from Measure + Train logs (stored locally).</div>
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
      <div class='small'>Pick a workout day, see all exercises across weeks (avg of sets)</div>
      <div style='display:flex;gap:10px;align-items:center;margin-top:10px'>
        <span class='badge'>Day</span>
        <select id='compareDay' class='input' style='max-width:180px'>
          <option value='1'>Day 1</option>
          <option value='2'>Day 2</option>
          <option value='3'>Day 3</option>
          <option value='4'>Day 4</option>
          <option value='5'>Day 5</option>
        </select>
      </div>
      <div class='chartWrap'><div id='chartDayExercises'></div></div>
    </div>

    <div class='card'>
      <div style='font-weight:900'>Workout Weights by Week</div>
      <div class='small'>Avg weight across all exercises/sets per workout day</div>
      <div class='chartWrap'><div id='chartWorkout'></div></div>
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

function numOrNull(v){
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function round1(n){ return Math.round(n*10)/10; }
function avg(arr){
  if(!arr.length) return null;
  return arr.reduce((a,b)=>a+b,0)/arr.length;
}

function buildDailyWeightSeries(){
  const entries = Object.entries(state.measurements.dailyWeight)
    .map(([date,val]) => ({date, val:Number(val)}))
    .filter(x => !isNaN(x.val))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const labels = entries.map(x=>x.date);
  const values = entries.map(x=>x.val);
  return [{name:'Weight', color:'#2563eb', labels, values}];
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

function exerciseAvgWeight(exObj){
  const weights = (exObj?.sets || []).map(s => s.weight).filter(w => typeof w==='number' && !isNaN(w));
  const a = avg(weights);
  return a===null ? null : round1(a);
}

function buildWorkoutDayExerciseSeries(dayIndex){
  const day = plan.cycle.find(x => x.dayIndex === dayIndex);
  if(!day) return [];

  // week -> exName -> [avgWeightPerSession]
  const buckets = {};
  Object.entries(state.sessions).forEach(([dateKey, sess]) => {
    if(sess.dayIndex !== dayIndex) return;
    const wk = weekKey(parseISO(dateKey));
    if(!buckets[wk]) buckets[wk] = {};

    day.exercises.forEach(ex => {
      const exObj = sess.exercises?.[ex.name];
      const v = exerciseAvgWeight(exObj);
      if(v===null) return;
      if(!buckets[wk][ex.name]) buckets[wk][ex.name] = [];
      buckets[wk][ex.name].push(v);
    });
  });

  const weekLabels = Object.keys(buckets).sort();
  if(!weekLabels.length) return [{name:'No data', color:'#2563eb', labels:[], values:[]}];

  const palette = ['#2563eb','#f97316','#22c55e','#a78bfa','#eab308','#fb7185','#34d399','#38bdf8'];
  return day.exercises.map((ex, idx) => {
    const vals = weekLabels.map(wk => {
      const arr = buckets[wk]?.[ex.name] || [];
      const a = avg(arr);
      return a===null ? null : round1(a);
    });
    return {name: ex.name, color: palette[idx % palette.length], labels: weekLabels, values: vals};
  });
}

function buildWorkoutWeeklySeries(){
  // week -> dayIndex -> [avgWeightForThatSession]
  const buckets = {};

  Object.entries(state.sessions).forEach(([dateKey, sess]) => {
    const wk = weekKey(parseISO(dateKey));
    if(!buckets[wk]) buckets[wk] = {};
    if(!buckets[wk][sess.dayIndex]) buckets[wk][sess.dayIndex] = [];

    // compute session average across all ex/set weights
    const allWeights = [];
    Object.values(sess.exercises || {}).forEach(exObj => {
      (exObj.sets || []).forEach(s => {
        if(typeof s.weight==='number' && !isNaN(s.weight)) allWeights.push(s.weight);
      });
    });
    const a = avg(allWeights);
    if(a!==null) buckets[wk][sess.dayIndex].push(round1(a));
  });

  const labels = Object.keys(buckets).sort();
  const colors = ['#2563eb','#f97316','#22c55e','#a78bfa','#eab308'];
  const out = [];
  for(let di=1; di<=5; di++){
    const vals = labels.map(wk => {
      const arr = buckets[wk]?.[di] || [];
      const a = avg(arr);
      return a===null ? null : round1(a);
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
    grid += `<line x1='${margin.l}' y1='${yy}' x2='${W-margin.r}' y2='${yy}' stroke='rgba(15,23,42,.10)' />`;
    grid += `<text x='${margin.l-8}' y='${yy+4}' fill='rgba(51,65,85,.75)' font-size='11' text-anchor='end'>${round1(tv)}</text>`;
  }

  const maxXL = 6;
  const step = Math.max(1, Math.ceil(labels.length/maxXL));
  let xlabels = '';
  labels.forEach((lab, i) => {
    if(i % step !== 0 && i !== labels.length-1) return;
    const xx = x(i);
    const txt = lab.length>10 ? lab.slice(5) : lab;
    xlabels += `<text x='${xx}' y='${H-18}' fill='rgba(51,65,85,.75)' font-size='11' text-anchor='middle'>${escapeHTML(txt)}</text>`;
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
      <line x1='${margin.l}' y1='${H-margin.b}' x2='${W-margin.r}' y2='${H-margin.b}' stroke='rgba(15,23,42,.12)' />
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

function escapeHTML(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return escapeHTML(s).replace(/\"/g,'&quot;'); }
function unescapeAttr(s){ return String(s).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'\"'); }

// boot
function boot(){
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js'); }
  wireTabs();
  setActiveTab('train');
}

fetch('./plan.json')
  .then(r => r.json())
  .then(data => { plan = data; boot(); })
  .catch(err => {
    console.error(err);
    app.innerHTML = `<div class='card'><div style='font-weight:900'>Error</div><div class='note'>Could not load plan.json</div></div>`;
  });

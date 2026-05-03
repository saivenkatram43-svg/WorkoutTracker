// MyWorkouts PWA v10 (custom icon + Train in lbs)


const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = 'mw10';
let plan = null;
let state = loadState();

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){ try { return JSON.parse(raw); } catch {} }
  const base = {
    sessions: {},
    measurements: { dailyWeight: {}, weeklyBody: {} },
    photos: {},
    lastAssignedDayIndex: 0,
    _photoWeek: null,
    _pendingPhotos: []
  };
  saveState(base);
  return base;
}
function saveState(s=state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

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
function daysBetween(aISO, bISO){ return Math.round((parseISO(bISO)-parseISO(aISO))/(1000*60*60*24)); }

function nextDayIndex(){ return (state.lastAssignedDayIndex % 5) + 1; }
function ensureExerciseSets(exTemplate){
  return Array.from({length: exTemplate.sets}, (_,i)=>({set:i+1,reps:exTemplate.reps,weight:null}));
}
function assignSessionIfMissing(dateKey){
  if(state.sessions[dateKey]) return state.sessions[dateKey];
  const di = nextDayIndex();
  state.lastAssignedDayIndex = di;
  const session = { dayIndex: di, done:false, exercises:{} };
  const day = plan.cycle.find(x=>x.dayIndex===di);
  day.exercises.forEach(ex=>{ session.exercises[ex.name] = { sets: ensureExerciseSets(ex) }; });
  state.sessions[dateKey] = session;
  saveState();
  return session;
}

const app = $('#app');
let currentTab = 'train';
let selectedDateKey = isoDate(new Date());

function setActiveTab(tab){
  currentTab = tab;
  $$('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  render();
}
function wireTabs(){ $$('.tab').forEach(btn=>btn.addEventListener('click', ()=>setActiveTab(btn.dataset.tab))); }

function render(){
  if(!plan){ app.innerHTML = `<div class='card'><div style='font-weight:900'>Loading…</div><div class='note'>Fetching workout plan.</div></div>`; return; }
  if(currentTab==='train') return renderTrain();
  if(currentTab==='measure') return renderMeasure();
  if(currentTab==='photos') return renderPhotos();
  if(currentTab==='compare') return renderCompare();
}

function getPreviousWeights(dateKey, dayIndex, exName, setNum){
  const keys = Object.keys(state.sessions).sort();
  const idx = keys.indexOf(dateKey);
  if(idx<=0) return {last:null,twoWeeks:null};
  let last=null, twoWeeks=null;
  for(let i=idx-1;i>=0;i--){
    const k=keys[i]; const s=state.sessions[k];
    if(!s||s.dayIndex!==dayIndex) continue;
    const w=s.exercises?.[exName]?.sets?.find(x=>x.set===setNum)?.weight;
    if(typeof w==='number' && !isNaN(w)){ last={date:k,weight:w}; break; }
  }
  for(let i=idx-1;i>=0;i--){
    const k=keys[i];
    if(daysBetween(k,dateKey)<14) continue;
    const s=state.sessions[k];
    if(!s||s.dayIndex!==dayIndex) continue;
    const w=s.exercises?.[exName]?.sets?.find(x=>x.set===setNum)?.weight;
    if(typeof w==='number' && !isNaN(w)){ twoWeeks={date:k,weight:w}; break; }
  }
  return {last,twoWeeks};
}

function overloadWarningsForDay(dateKey){
  const session = assignSessionIfMissing(dateKey);
  const dayIndex = session.dayIndex;
  const day = plan.cycle.find(x=>x.dayIndex===dayIndex);
  const warnings=[];
  day.exercises.forEach(ex=>{
    session.exercises[ex.name].sets.forEach(setObj=>{
      const cur=setObj.weight;
      if(typeof cur!=='number'||isNaN(cur)) return;
      const prev=getPreviousWeights(dateKey,dayIndex,ex.name,setObj.set);
      if(prev.twoWeeks && cur < (prev.twoWeeks.weight+1.5)) warnings.push(1);
    });
  });
  return warnings;
}

function renderTrain(){
  const wkStart=startOfWeek(parseISO(selectedDateKey));
  const days=Array.from({length:7},(_,i)=>addDays(wkStart,i));
  const cells=days.map(d=>{
    const dk=isoDate(d); const s=state.sessions[dk];
    const done=s?.done; const di=s?.dayIndex; const isSel=dk===selectedDateKey;
    const emoji=di?plan.cycle.find(x=>x.dayIndex===di).emoji:'';
    return `<div class='day ${done?'done':''} ${isSel?'selected':''}' data-date='${dk}'>
      <div class='d'>${d.toLocaleDateString(undefined,{weekday:'short'})}</div>
      <div class='s'>${d.getDate()}</div>
      <div class='s'>${di?`Day ${di} ${emoji}`:'Tap'}</div>
    </div>`;
  }).join('');

  const selSession=assignSessionIfMissing(selectedDateKey);
  const selDay=plan.cycle.find(x=>x.dayIndex===selSession.dayIndex);
  const warnHtml = overloadWarningsForDay(selectedDateKey).length ? `<div class='alert'>Overload check: push +1.5lbs vs 2 weeks ago on some sets 💪</div>` : '';

  app.innerHTML = `${warnHtml}
  <div class='card'>
    <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
      <div><div style='font-weight:900'>Week of ${isoDate(wkStart)}</div><div class='small'>Tap a day to log the next workout</div></div>
      <div style='display:flex;gap:8px'>
        <button class='btn secondary' id='prevWeek'>←</button>
        <button class='btn secondary' id='nextWeek'>→</button>
      </div>
    </div>
    <div class='calendar7' style='margin-top:12px'>${cells}</div>
  </div>

  <div class='card'>
    <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
      <div><div style='font-weight:900'>Day ${selDay.dayIndex}: ${selDay.title}</div><div class='small'>${selectedDateKey}</div></div>
      <span class='badge'>${selSession.done?'Done ✅':'Not done'}</span>
    </div>
    <div class='note' style='margin-top:10px'>Enter weight + reps for each set. Placeholder shows last time’s weight.</div>
    <div style='margin-top:12px'>${selDay.exercises.map(ex=>renderExerciseBlock(selectedDateKey,ex)).join('')}</div>
    <div style='display:flex;gap:10px;margin-top:12px'>
      <button class='btn' id='markDone'>Mark Workout Done</button>
      <button class='btn danger' id='clearDay'>Clear This Day</button>
    </div>
  </div>`;

  $$('.day[data-date]').forEach(el=>{ el.onclick=()=>{ selectedDateKey=el.dataset.date; renderTrain(); }; });
  $('#prevWeek').onclick=()=>{ selectedDateKey=isoDate(addDays(wkStart,-7)); renderTrain(); };
  $('#nextWeek').onclick=()=>{ selectedDateKey=isoDate(addDays(wkStart, 7)); renderTrain(); };
  $('#markDone').onclick=()=>{ assignSessionIfMissing(selectedDateKey).done=true; saveState(); renderTrain(); };
  $('#clearDay').onclick=()=>{ if(!confirm('Clear this day log?')) return; delete state.sessions[selectedDateKey]; saveState(); renderTrain(); };
}

function renderExerciseBlock(dateKey, ex){
  const session=assignSessionIfMissing(dateKey);
  const dayIndex=session.dayIndex;
  const exState=session.exercises[ex.name] || {sets:ensureExerciseSets(ex)};
  session.exercises[ex.name]=exState;

  const rows = exState.sets.map(setObj=>{
    const prev=getPreviousWeights(dateKey,dayIndex,ex.name,setObj.set);
    const watermark = prev.last ? `${prev.last.weight} lbs` : '';
    const wVal = (typeof setObj.weight==='number' && !isNaN(setObj.weight)) ? setObj.weight : '';
    const rVal = (typeof setObj.reps==='number' && !isNaN(setObj.reps)) ? setObj.reps : '';
    return `<tr>
      <td><span class='setNum'>${setObj.set}</span></td>
      <td><input class='setInput' inputmode='decimal' placeholder='${watermark || "lbs"}' value='${wVal}' data-kind='weight' data-date='${dateKey}' data-ex='${escapeAttr(ex.name)}' data-set='${setObj.set}' /></td>
      <td><input class='setInput' inputmode='numeric' placeholder='reps' value='${rVal}' data-kind='reps' data-date='${dateKey}' data-ex='${escapeAttr(ex.name)}' data-set='${setObj.set}' /></td>
    </tr>`;
  }).join('');

  return `<div class='exercise'>
    <div class='exTop'>
      <div><div class='exName'>${ex.name}</div><div class='small'>${ex.sets} sets × ${ex.reps} reps</div></div>
      <span class='badge'>${plan.cycle.find(x=>x.dayIndex===dayIndex).emoji}</span>
    </div>
    <table class='setTable'>
      <thead><tr><th>#</th><th>Weight (lbs)</th><th>Reps</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

app.addEventListener('input', (e)=>{
  const t=e.target;
  if(!(t instanceof HTMLInputElement)) return;
  if(!t.dataset.kind||!t.dataset.date||!t.dataset.ex||!t.dataset.set) return;
  const dateKey=t.dataset.date;
  const exName=unescapeAttr(t.dataset.ex);
  const setNum=Number(t.dataset.set);
  const session=assignSessionIfMissing(dateKey);
  const setObj=session.exercises?.[exName]?.sets?.find(x=>x.set===setNum);
  if(!setObj) return;
  if(t.dataset.kind==='weight'){
    const w=parseFloat(t.value); setObj.weight=isNaN(w)?null:w;
  } else {
    const r=parseInt(t.value,10); setObj.reps=isNaN(r)?null:r;
  }
  saveState();
});

// ---- Measure (weekly lists + progression) ----
function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }
function numOrNull(v){ const n=Number(v); return isNaN(n)?null:n; }
function round1(n){ return Math.round(n*10)/10; }

function groupDailyWeightsByWeek(){
  const grouped={};
  Object.entries(state.measurements.dailyWeight).forEach(([date,val])=>{
    const wk=weekKey(parseISO(date));
    (grouped[wk] ||= []).push({date, val:Number(val)});
  });
  Object.keys(grouped).forEach(wk=>grouped[wk].sort((a,b)=>a.date.localeCompare(b.date)));
  return grouped;
}

function renderMeasure(){
  const dk=selectedDateKey || isoDate(new Date());
  const wk=weekKey(parseISO(dk));
  const dailyVal=state.measurements.dailyWeight[dk] ?? '';
  const wb=state.measurements.weeklyBody[wk] || {chest:null,bicep:null,waist:null,thigh:null};

  const grouped=groupDailyWeightsByWeek();
  const weeks=Object.keys(grouped).sort();

  const weekLists = weeks.map(w=>{
    const list=grouped[w].map(x=>`<div class='small'>${x.date}: <b>${x.val}</b></div>`).join('');
    return `<div class='item'><div><div style='font-weight:900'>Week ${w}</div>${list||"<div class='note'>No weights</div>"}</div></div>`;
  }).join('') || `<div class='note'>No daily weights recorded yet</div>`;

  const progRows = weeks.map(w=>{
    const weights=grouped[w].map(x=>x.val).filter(v=>!isNaN(v));
    const wAvg=avg(weights);
    const body=state.measurements.weeklyBody[w] || {};
    return `<div class='item'><div>
      <div style='font-weight:900'>Week ${w}</div>
      <div class='small'>Avg weight: ${wAvg===null?'—':round1(wAvg)}</div>
      <div class='small'>Chest: ${body.chest ?? '—'} · Bicep: ${body.bicep ?? '—'} · Waist: ${body.waist ?? '—'} · Thigh: ${body.thigh ?? '—'}</div>
    </div></div>`;
  }).join('') || `<div class='note'>No progression data yet</div>`;

  app.innerHTML = `
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div><div style='font-weight:900'>Daily Weight</div><div class='small'>${dk}</div></div>
        <button class='btn secondary' id='pickToday'>Today</button>
      </div>
      <div class='label'>Weight</div>
      <input class='input' id='dailyWeight' inputmode='decimal' value='${dailyVal}' placeholder='e.g., 134.0' />
      <div style='display:flex;gap:10px;margin-top:12px'>
        <button class='btn' id='saveDaily'>Record Entry</button>
        <button class='btn danger' id='clearDaily'>Clear Day</button>
      </div>
      <div class='label' style='margin-top:14px'>Weekly daily weights</div>
      <div class='note'>Shows all daily weights recorded in each week.</div>
      <div style='margin-top:10px;display:flex;flex-direction:column;gap:10px'>${weekLists}</div>
    </div>

    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div><div style='font-weight:900'>Weekly Body Measurements</div><div class='small'>Week of ${wk}</div></div>
        <span class='badge'>Weekly</span>
      </div>
      ${measureField('Chest','chest',wb.chest)}
      ${measureField('Bicep','bicep',wb.bicep)}
      ${measureField('Waist','waist',wb.waist)}
      ${measureField('Thigh','thigh',wb.thigh)}
      <div style='display:flex;gap:10px;margin-top:12px'>
        <button class='btn' id='saveWeekly'>Record Entry</button>
        <button class='btn danger' id='clearWeekly'>Clear Week</button>
      </div>
    </div>

    <div class='card'>
      <div style='font-weight:900'>Progression</div>
      <div class='note'>Average weight is computed from the daily weights shown above for each week.</div>
      <div style='margin-top:10px;display:flex;flex-direction:column;gap:10px'>${progRows}</div>
    </div>
  `;

  $('#pickToday').onclick=()=>{ selectedDateKey=isoDate(new Date()); renderMeasure(); };
  $('#saveDaily').onclick=()=>{ const v=parseFloat($('#dailyWeight').value); if(isNaN(v)) return alert('Enter a valid number'); state.measurements.dailyWeight[dk]=v; saveState(); renderMeasure(); };
  $('#clearDaily').onclick=()=>{ if(!confirm('Clear daily weight for this day?')) return; delete state.measurements.dailyWeight[dk]; saveState(); renderMeasure(); };
  $('#saveWeekly').onclick=()=>{ state.measurements.weeklyBody[wk]={ chest:numOrNull($('#m_chest').value), bicep:numOrNull($('#m_bicep').value), waist:numOrNull($('#m_waist').value), thigh:numOrNull($('#m_thigh').value)}; saveState(); renderMeasure(); };
  $('#clearWeekly').onclick=()=>{ if(!confirm('Clear weekly measurements for this week?')) return; delete state.measurements.weeklyBody[wk]; saveState(); renderMeasure(); };
}

function measureField(label,key,val){
  const v = (val ?? '') === null ? '' : (val ?? '');
  return `<div class='label'>${label}</div><input class='input' id='m_${key}' inputmode='decimal' value='${v}' placeholder='e.g., 95' />`;
}

// ---- Photos ----
function renderPhotos(){
  const allWeeks = Object.keys(state.photos || {}).sort().reverse();
  const currentWeek = weekKey(parseISO(selectedDateKey));
  const chosenWeek = state._photoWeek || currentWeek;
  const items = state.photos[chosenWeek] || [];

  const stories = allWeeks.length ? allWeeks.map(wk=>{
    const first=(state.photos[wk]||[])[0];
    const stamp=wk.slice(5);
    const isSel = wk===chosenWeek;
    return `<div class='story' data-week='${wk}'>
      <div class='storyRing' style='filter:${isSel?'none':'grayscale(.25)'}'>
        <div class='storyInner'>${first?`<img src='${first}'/>`:`<div style='font-weight:900'>📸</div>`}<div class='storyStamp'>${stamp}</div></div>
      </div>
      <div class='storyLabel'>Week ${stamp}</div>
    </div>`;
  }).join('') : `<div class='note'>No weekly photos yet. Upload your first week below.</div>`;

  const pendingCount=(state._pendingPhotos||[]).length;

  app.innerHTML = `
    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div><div style='font-weight:900'>Weekly Photo Stories</div><div class='small'>Tap a circle = open that week</div></div>
        <span class='badge'>Stories</span>
      </div>
      <div class='storyBar' style='margin-top:10px'>${stories}</div>
    </div>

    <div class='card'>
      <div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div><div style='font-weight:900'>Selected Week</div><div class='small'>${chosenWeek}</div></div>
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
      <div class='grid' style='margin-top:12px'>
        ${(state._pendingPhotos||[]).slice(0,4).map(src=>`<div class='card' style='padding:8px;margin:0'><img src='${src}' style='width:100%;border-radius:12px'/></div>`).join('') || `<div class='note'>No selected photos yet</div>`}
      </div>
    </div>

    <div class='card'>
      <div style='font-weight:900;margin-bottom:10px'>Saved Photos in ${chosenWeek}</div>
      <div class='grid'>
        ${items.length ? items.map(src=>`<div class='card' style='padding:8px;margin:0'><img src='${src}' style='width:100%;border-radius:12px'/></div>`).join('') : `<div class='note'>No photos for this week yet</div>`}
      </div>
    </div>`;

  $$('.story[data-week]').forEach(el=>{ el.onclick=()=>{ state._photoWeek=el.dataset.week; saveState(); renderPhotos(); }; });
  $('#useCurrentWeek').onclick=()=>{ state._photoWeek=currentWeek; saveState(); renderPhotos(); };
  $('#photoInput').onchange=async (e)=>{
    const files=Array.from(e.target.files||[]);
    state._pendingPhotos=[];
    saveState();
    for(const f of files){ state._pendingPhotos.push(await fileToDataURL(f)); }
    saveState();
    renderPhotos();
  };
  $('#savePhotos').onclick=()=>{
    const wk=state._photoWeek||currentWeek;
    const arr=state.photos[wk]||[];
    (state._pendingPhotos||[]).forEach(p=>arr.push(p));
    state.photos[wk]=arr;
    state._pendingPhotos=[];
    saveState();
    renderPhotos();
  };
  $('#clearPending').onclick=()=>{ state._pendingPhotos=[]; saveState(); renderPhotos(); };
  $('#clearPhotos').onclick=()=>{ const wk=state._photoWeek||currentWeek; if(!confirm(`Clear saved photos for week ${wk}?`)) return; delete state.photos[wk]; saveState(); renderPhotos(); };
}

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>resolve(fr.result);
    fr.onerror=reject;
    fr.readAsDataURL(file);
  });
}

// ---- Compare (two graphs) ----
function renderCompare(){
  app.innerHTML = `
    <div class='card'>
      <div style='font-weight:900'>Compare</div>
      <div class='note'>Two graphs: Daily Weight + Workout Progress by Week.</div>
    </div>
    <div class='card'>
      <div style='font-weight:900'>Daily Weight</div>
      <div class='chartWrap'><div id='chartDaily'></div></div>
    </div>
    <div class='card'>
      <div style='font-weight:900'>Workout Progress by Week</div>
      <div class='small'>Week 1 Workout 1 vs Week 2 Workout 1…</div>
      <div class='chartWrap'><div id='chartWorkout'></div></div>
    </div>`;
  renderLineChart('#chartDaily', buildDailyWeightSeries());
  renderLineChart('#chartWorkout', buildWorkoutWeeklySeries());
}

function buildDailyWeightSeries(){
  const entries=Object.entries(state.measurements.dailyWeight).map(([date,val])=>({date,val:Number(val)})).filter(x=>!isNaN(x.val)).sort((a,b)=>a.date.localeCompare(b.date));
  return [{name:'Weight', color:'#2563eb', labels: entries.map(x=>x.date), values: entries.map(x=>x.val)}];
}

function buildWorkoutWeeklySeries(){
  const buckets={};
  Object.entries(state.sessions).forEach(([dateKey,sess])=>{
    const wk=weekKey(parseISO(dateKey));
    (buckets[wk] ||= {});
    (buckets[wk][sess.dayIndex] ||= []).push(sessionAvg(sess));
  });
  const labels=Object.keys(buckets).sort();
  const colors=['#2563eb','#f97316','#22c55e','#a78bfa','#eab308'];
  const out=[];
  for(let di=1; di<=5; di++){
    const vals=labels.map(wk=>{
      const arr=(buckets[wk]?.[di]||[]).filter(v=>v!==null);
      const a=avg(arr);
      return a===null?null:Math.round(a*10)/10;
    });
    out.push({name:`Workout ${di}`, color: colors[di-1], labels, values: vals});
  }
  return out;
}

function sessionAvg(sess){
  const all=[];
  Object.values(sess.exercises||{}).forEach(exObj=>{
    (exObj.sets||[]).forEach(s=>{ if(typeof s.weight==='number' && !isNaN(s.weight)) all.push(s.weight); });
  });
  const a=avg(all);
  return a===null?null:Math.round(a*10)/10;
}

function renderLineChart(containerSelector, seriesList){
  const el=$(containerSelector);
  const labels=seriesList[0]?.labels||[];
  if(!labels.length){ el.innerHTML=`<div class='note'>No data yet.</div>`; return; }
  let all=[];
  seriesList.forEach(s=>s.values.forEach(v=>{ if(v!==null && v!==undefined && !isNaN(v)) all.push(v); }));
  if(!all.length){ el.innerHTML=`<div class='note'>No numeric data yet.</div>`; return; }
  const minV=Math.min(...all), maxV=Math.max(...all);
  const pad=(maxV-minV)*0.1 || 1;
  const yMin=minV-pad, yMax=maxV+pad;
  const W=900, H=260, m={l:50,r:20,t:20,b:48};
  const innerW=W-m.l-m.r, innerH=H-m.t-m.b;
  const x=i=>m.l+(labels.length===1?innerW/2:(i*(innerW/(labels.length-1))));
  const y=v=>m.t+(innerH*(1-((v-yMin)/(yMax-yMin))));
  let grid='';
  for(let i=0;i<=3;i++){
    const tv=yMin+(i*(yMax-yMin)/3);
    const yy=y(tv);
    grid += `<line x1='${m.l}' y1='${yy}' x2='${W-m.r}' y2='${yy}' stroke='rgba(15,23,42,.10)' />`;
    grid += `<text x='${m.l-8}' y='${yy+4}' fill='rgba(51,65,85,.75)' font-size='11' text-anchor='end'>${Math.round(tv*10)/10}</text>`;
  }
  const step=Math.max(1, Math.ceil(labels.length/6));
  let xlabels='';
  labels.forEach((lab,i)=>{
    if(i%step!==0 && i!==labels.length-1) return;
    xlabels += `<text x='${x(i)}' y='${H-18}' fill='rgba(51,65,85,.75)' font-size='11' text-anchor='middle'>${escapeHTML(lab.length>10?lab.slice(5):lab)}</text>`;
  });
  let paths='', points='';
  seriesList.forEach(s=>{
    let d=''; let started=false;
    for(let i=0;i<labels.length;i++){
      const v=s.values[i];
      if(v===null||v===undefined||isNaN(v)){ started=false; continue; }
      const xx=x(i), yy=y(v);
      d += (!started?`M ${xx} ${yy}`:` L ${xx} ${yy}`);
      started=true;
      points += `<circle cx='${xx}' cy='${yy}' r='3' fill='${s.color}' />`;
    }
    paths += `<path d='${d}' fill='none' stroke='${s.color}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' />`;
  });
  const svg = `<svg class='chart' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'>${grid}<line x1='${m.l}' y1='${H-m.b}' x2='${W-m.r}' y2='${H-m.b}' stroke='rgba(15,23,42,.12)' />${paths}${points}${xlabels}</svg>`;
  const legend = `<div class='legend'>${seriesList.map(s=>`<span><i class='dot' style='background:${s.color}'></i>${escapeHTML(s.name)}</span>`).join('')}</div>`;
  el.innerHTML = svg + legend;
}

function escapeHTML(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return escapeHTML(s).replace(/\"/g,'&quot;'); }
function unescapeAttr(s){ return String(s).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'\"'); }

function boot(){
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js'); }
  wireTabs();
  setActiveTab('train');
}

fetch('./plan.json').then(r=>r.json()).then(data=>{ plan=data; boot(); }).catch(err=>{
  console.error(err);
  app.innerHTML = `<div class='card'><div style='font-weight:900'>Error</div><div class='note'>Could not load plan.json</div></div>`;
});

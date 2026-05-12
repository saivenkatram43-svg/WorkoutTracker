
const state = JSON.parse(localStorage.getItem('v13')) || {photos:{},history:{}};

// calendar scroll
const cal=document.getElementById('calendar');
for(let i=1;i<=30;i++){
  const d=document.createElement('div');
  d.className='day';
  d.innerText='Day '+i;
  cal.appendChild(d);
}

// reps watermark example
function getLast(ex){return state.history[ex]||{w:'',r:''}}

// Photo storage
function savePhotos(){
  const files=document.getElementById('photoInput').files;
  let week='week1';
  state.photos[week]=state.photos[week]||[];
  Array.from(files).forEach(f=>{
    const r=new FileReader();
    r.onload=()=>{
      state.photos[week].push(r.result);
      localStorage.setItem('v13',JSON.stringify(state));
      renderPhotos();
    };
    r.readAsDataURL(f);
  });
}

function renderPhotos(){
  const div=document.getElementById('photos');
  div.innerHTML='';
  (state.photos['week1']||[]).forEach(p=>{
    const img=document.createElement('img');
    img.src=p;img.width=80;
    div.appendChild(img);
  });
}
renderPhotos();

// export import
function exportData(){
  const blob=new Blob([JSON.stringify(state)],{type:'app/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='backup.json';
  a.click();
}

function importData(e){
  const f=e.target.files[0];
  const r=new FileReader();
  r.onload=()=>{
    localStorage.setItem('v13',r.result);
    location.reload();
  };
  r.readAsText(f);
}

// compare max logic placeholder
const select=document.getElementById('exerciseSelect');
['Deadlift','Pullups','Squat'].forEach(x=>{
  const o=document.createElement('option');o.text=x;select.add(o);
});

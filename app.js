
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let currentTab = 'train';
const app = $('#app');

function setActiveTab(tab){
  currentTab = tab;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  render();
}

$$('.tab').forEach(b=>b.onclick=()=>setActiveTab(b.dataset.tab));

function render(){
  if(currentTab==='train') app.innerHTML = `<div class='card'><b>Train</b><p class='note'>Workout logging screen</p></div>`;
  if(currentTab==='measure') app.innerHTML = `<div class='card'><b>Measure</b><p class='note'>Body & weight tracking</p></div>`;
  if(currentTab==='photos') app.innerHTML = `<div class='card'><b>Photos</b><p class='note'>Weekly progress photos</p></div>`;
  if(currentTab==='compare') app.innerHTML = `<div class='card'><b>Compare</b><p class='note'>Graphs & progress</p></div>`;
}

render();

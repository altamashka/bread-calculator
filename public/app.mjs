import {defaults,ingredients,calculate,validate,scale,fromQuery,toQuery,schemaRecipe} from './math.mjs';
const $=id=>document.getElementById(id), fmt=n=>Number(n.toFixed(1)).toLocaleString('en-GB',{maximumFractionDigits:1}), g=n=>`${fmt(n)} g`;
let recipe=defaults(), savedId=null, records=[], valid=true, dirty=false;
function status(message){$('status').textContent=message;}
try {recipe=location.search?fromQuery(location.search):defaults();}catch(e){status(`Recipe link could not be loaded: ${e.message}`);}
for(const [key,label] of Object.entries(ingredients)){
  const row=document.createElement('div');row.className='ingredient';
  const lab=document.createElement('label');lab.htmlFor=key;lab.textContent=label;
  const percent=document.createElement('input');Object.assign(percent,{id:key,type:'number',min:'0',step:'any',inputMode:'decimal'});percent.setAttribute('aria-label',`${label} percent`);
  const grams=document.createElement('input');Object.assign(grams,{id:`${key}Grams`,type:'number',min:'0',step:'any',inputMode:'decimal'});grams.setAttribute('aria-label',`${label} grams`);
  row.append(lab,percent,grams);$(key==='water'||key==='salt'||key==='leaven'?'ingredients':'extras').append(row);
  grams.addEventListener('input',()=>{const v=grams.valueAsNumber;recipe[key]=100*v/recipe.flour;$(key).value=Number.isFinite(v)?recipe[key]:'';dirty=true;render(grams.id);});
}
function fill(){for(const key of Object.keys(defaults()))if($(key))$(key).value=recipe[key];render();}
function render(active){
  try {
    const c=calculate(recipe);valid=true;
    for(const [k,v]of Object.entries(c.grams))if(active!==`${k}Grams`)$(`${k}Grams`).value=Number(v.toFixed(3));
    for(const key of ['hydration','prefermented','saltTotal','liquidHydration'])$(key).textContent=fmt(c[key])+(key==='hydration'?'':'%');
    for(const key of ['dough','totalFlour','totalWater','portion'])$(key).textContent=g(c[key])+(key==='portion'?' each':'');
    $('starterSplit').textContent=`Starter contributes ${g(c.starterFlour)} flour + ${g(c.starterWater)} water.`;
    $('blend').textContent=`Added flour: ${g(recipe.flour*(100-recipe.wholeWheat-recipe.rye)/100)} white · ${g(recipe.flour*recipe.wholeWheat/100)} whole wheat · ${g(recipe.flour*recipe.rye/100)} rye.`;
    $('liquidRow').hidden=!recipe.milk;
    history.replaceState(null,'',`?${toQuery(recipe)}`);
    document.querySelector('.result').removeAttribute('aria-invalid');
  }catch(e){valid=false;status(e.message);document.querySelector('.result').setAttribute('aria-invalid','true');for(const k of ['hydration','dough','totalFlour','totalWater','portion','prefermented','saltTotal','liquidHydration'])$(k).textContent='—';}
}
for(const key of Object.keys(defaults()))if($(key))$(key).addEventListener('input',()=>{recipe[key]=typeof defaults()[key]==='number'?$(key).valueAsNumber:$(key).value;dirty=true;status('');render(key);});
async function api(path,options){const res=await fetch(path,options);const value=await res.json();if(!res.ok)throw Error(value.error||'Request failed.');return value;}
const post=(path,value)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
async function refresh(){records=await api('/api/recipes');$('saved').replaceChildren(new Option('Choose a recipe…',''));records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).forEach(r=>$('saved').add(new Option(r.recipe.name,r.id)));$('saved').value=savedId||'';}
async function save(copy=false){validate(recipe);const record=await post('/api/recipes',{id:copy?undefined:savedId||undefined,recipe});savedId=record.id;dirty=false;await refresh();status('Saved on your server.');return record;}
function action(id,fn){$(id).addEventListener('click',async()=>{const button=$(id);button.disabled=true;try{await fn();}catch(e){status(e.message);}finally{button.disabled=false;}});}
action('save',()=>save());action('copy',()=>save(true));
action('reset',()=>{recipe=defaults();savedId=null;dirty=false;fill();$('saved').value='';status('Recipe reset.');});
$('saved').addEventListener('change',()=>{const r=records.find(r=>r.id===$('saved').value);if(r){recipe=validate(r.recipe);savedId=r.id;dirty=false;fill();status('Saved recipe loaded.');}});
action('scale',()=>{recipe=scale(recipe,$('target').valueAsNumber);dirty=true;fill();status('Batch scaled.');});
action('setHydration',()=>{validate(recipe);const c=calculate(recipe), t=$('targetHydration').valueAsNumber;const water=(t*c.totalFlour/100-c.starterWater)/recipe.flour*100;if(!Number.isFinite(t)||t<0||water<0)throw Error('That hydration is below the water already in your starter.');recipe=validate({...recipe,water});dirty=true;fill();status('Water adjusted to your target total hydration.');});
for(const [id,delta]of [['less',-250],['more',250]])action(id,()=>{recipe=validate({...recipe,flour:Math.max(.1,recipe.flour+delta)});dirty=true;fill();});
action('share',async()=>{validate(recipe);await navigator.clipboard.writeText(location.href);status('Recipe link copied. It includes your notes; share it only with people you choose.');});
action('export',()=>{validate(recipe);const blob=new Blob([JSON.stringify({breadBench:recipe,...schemaRecipe(recipe)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bread-recipe.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Recipe downloaded.');});
$('import').addEventListener('change',async()=>{try{const file=$('import').files[0];if(!file)return;if(file.size>32768)throw Error('Recipe file is too large.');const json=JSON.parse(await file.text());if(!json.breadBench && !Object.hasOwn(json,'flour'))throw Error('Restore requires a Bread Bench recipe export.');recipe=validate(json.breadBench??json);savedId=null;dirty=true;fill();status('Recipe restored. Save it to keep it on the server.');}catch(e){status(e.message);}finally{$('import').value='';}});
action('mealie',async()=>{if(!valid)throw Error('Correct the recipe before exporting.');if(dirty||!savedId)await save();await post('/api/mealie',{id:savedId});status('Recipe sent to Mealie. Open Mealie to view it.');});
action('print',()=>window.print());
fill();refresh().catch(e=>status(`Saved recipes unavailable: ${e.message}`));
api('/api/config').then(c=>{$('mealie').disabled=!c.mealie;$('mealieHint').textContent=c.mealie?'Mealie is connected. Sending creates a recipe snapshot.':'Mealie is not connected yet. Export JSON for manual import, or configure a server-side API token.';}).catch(()=>{$('mealieHint').textContent='Mealie connection could not be checked.';});

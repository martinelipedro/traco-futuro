import {encode} from './model.js?v=20261115.2';
const $=id=>document.getElementById(id),canvas=$('drawing'),ctx=canvas.getContext('2d'),chart=$('confidence'),cc=chart.getContext('2d');
const colors=['#df6944','#658e7b','#6f89ac','#ae8e55','#9273a5','#be7188'];
let worker,ready=false,labels=[],examples=[],strokes=[],active=false,example=null,reference=false,generated=[],visibleGenerated=0;
let tokens=[],points=[],history=[],probabilities=[],sequence=0,lastClass=0,lastGeneration=0,busy=false,revision=0,animation=0,playback=0;
let view={s:1,x:0,y:0},classTimer=0;const exampleIndexes={};
let modelScale=128,modelStep=8;
function status(message,error=false){$('status').replaceChildren();const dot=document.createElement('span');dot.className='tiny-dot';$('status').append(dot,document.createTextNode(message));$('status').classList.toggle('error',error);}
function setButtons(){const ok=ready&&tokens.length>=4&&!busy;$('complete').disabled=!ok;$('another').disabled=!ok||!generated.length;}
function line(points,color,width=4,alpha=1){
  if(!points.length)return;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width/view.s;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=alpha;ctx.beginPath();
  for(let i=0;i<points.length;i++){const p=points[i];if(i===0||points[i-1][2])ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);}ctx.stroke();ctx.restore();
}
function continuationPoints(){if(!points.length)return [];let [x,y]=points.at(-1);const out=[[x,y,points.at(-1)[2]]];for(const token of generated.slice(0,visibleGenerated)){x+=token[0]*modelScale;y+=token[1]*modelScale;out.push([x,y,token[2]]);}return out;}
function render(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.s,view.s);if(reference&&example)line(example.points,'#aabbb0',3,.8);line(points,'#292e31',4);line(continuationPoints(),'#df6944',4);ctx.restore();$('empty').hidden=!!points.length;$('referenceLegend').hidden=!(reference&&example);$('pointCount').textContent=points.length?`${points.length} eventos observados`:'Pronto para começar';}
function drawChart(){
  const w=chart.width,h=chart.height,L=45,R=15,T=15,B=35;cc.clearRect(0,0,w,h);cc.font='13px system-ui';cc.fillStyle='#8b8f85';cc.strokeStyle='#deded4';cc.lineWidth=1;
  for(let i=0;i<=2;i++){const y=T+(h-T-B)*i/2;cc.beginPath();cc.moveTo(L,y);cc.lineTo(w-R,y);cc.stroke();cc.fillText(`${100-50*i}%`,2,y+4);}cc.fillText('Eventos observados',w-150,h-8);
  const chosen=probabilities.map((p,i)=>({p,i})).sort((a,b)=>b.p-a.p).slice(0,3).map(v=>v.i),max=Math.max(10,...history.map(v=>v.n));
  for(const label of chosen){cc.beginPath();cc.strokeStyle=colors[label];cc.lineWidth=3;history.forEach((row,j)=>{const x=L+(w-L-R)*row.n/max,y=T+(h-T-B)*(1-row.p[label]);if(j===0)cc.moveTo(x,y);else cc.lineTo(x,y);});cc.stroke();}
  $('confidenceLegend').replaceChildren();for(const i of chosen){const span=document.createElement('span'),dot=document.createElement('i');dot.style.background=colors[i];span.append(dot,document.createTextNode(labels[i]));$('confidenceLegend').append(span);}
}
function showPredictions(p){
  probabilities=p;$('predictions').replaceChildren();p.map((prob,i)=>({prob,i})).sort((a,b)=>b.prob-a.prob).slice(0,3).forEach(({prob,i})=>{
    const row=document.createElement('div');row.className='prediction';const head=document.createElement('div');head.className='prediction-heading';const name=document.createElement('strong'),value=document.createElement('span');name.textContent=labels[i];value.textContent=`${Math.round(prob*100)}%`;head.append(name,value);const track=document.createElement('div'),fill=document.createElement('div');track.className='track';fill.className='fill';fill.style.width=`${prob*100}%`;fill.style.background=colors[i];track.append(fill);row.append(head,track);$('predictions').append(row);
  });drawChart();
}
function invalidate(){revision++;lastGeneration=0;busy=false;generated=[];visibleGenerated=0;cancelAnimationFrame(animation);$('generationStatus').textContent='';setButtons();}
function classify(){if(!ready||tokens.length<2||classTimer)return;classTimer=setTimeout(()=>{classTimer=0;if(tokens.length<2)return;lastClass=++sequence;worker.postMessage({id:lastClass,type:'classify',tokens,revision});},100);}
function updateFreehand(){const encoded=encode(strokes,!active,modelStep,modelScale);tokens=encoded.tokens;points=encoded.points;view={s:1,x:0,y:0};if(tokens.length<2){lastClass=0;history=[];probabilities=[];$('predictions').replaceChildren();$('recognitionHint').textContent='As hipóteses mudam conforme você desenha.';drawChart();}render();setButtons();classify();}
function stopPlayback(){clearInterval(playback);playback=0;$('play').textContent='▶ Revelar aos poucos';}
function reset(){stopPlayback();clearTimeout(classTimer);classTimer=0;invalidate();example=null;strokes=[];tokens=[];points=[];history=[];probabilities=[];lastClass=0;reference=false;$('replay').hidden=true;$('predictions').replaceChildren();$('reference').textContent='Mostrar desenho original';document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));view={s:1,x:0,y:0};render();drawChart();setButtons();}
function fitExample(){const xs=example.points.map(p=>p[0]),ys=example.points.map(p=>p[1]),minx=Math.min(...xs),miny=Math.min(...ys),width=Math.max(20,Math.max(...xs)-minx),height=Math.max(20,Math.max(...ys)-miny),s=Math.min(780/width,560/height,2.2);view={s,x:(1024-width*s)/2-minx*s,y:(768-height*s)/2-miny*s};}
function updateExample(){
  if(!example)return;invalidate();const fraction=+$('progress').value/100,n=Math.max(2,Math.round(example.tokens.length*fraction));tokens=example.tokens.slice(0,n);points=example.points.slice(0,n);history=history.filter(h=>h.n<n);$('progressValue').textContent=`${Math.round(fraction*100)}%`;render();setButtons();classify();
}
function chooseExample(label){reset();const pool=examples.filter(e=>e.label===label);if(!pool.length){status('Exemplos indisponíveis.',true);return;}const n=exampleIndexes[label]??0;exampleIndexes[label]=n+1;example=pool[n%pool.length];$('replay').hidden=false;$('progress').value=35;fitExample();updateExample();$('exampleButtons').children[label].classList.add('active');}
function pointerPosition(event){const rect=canvas.getBoundingClientRect();return [(event.clientX-rect.left)*1024/rect.width,(event.clientY-rect.top)*768/rect.height];}
canvas.addEventListener('pointerdown',event=>{if(event.button&&event.pointerType==='mouse')return;if(example)reset();stopPlayback();invalidate();active=true;strokes.push([pointerPosition(event)]);canvas.setPointerCapture(event.pointerId);event.preventDefault();updateFreehand();});
canvas.addEventListener('pointermove',event=>{if(!active)return;const coalesced=event.getCoalescedEvents?.(),events=coalesced?.length?coalesced:[event];let count=strokes.reduce((n,s)=>n+s.length,0);for(const e of events){if(count>=12000)break;strokes.at(-1).push(pointerPosition(e));count++;}updateFreehand();});
function endStroke(){if(!active)return;active=false;updateFreehand();}
canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);canvas.addEventListener('lostpointercapture',endStroke);
$('clear').onclick=reset;$('undo').onclick=()=>{if(example){reset();return;}invalidate();active=false;strokes.pop();history=[];updateFreehand();};
$('progress').oninput=()=>{stopPlayback();updateExample();};
$('play').onclick=()=>{if(playback){stopPlayback();return;}if(+$('progress').value>=100)$('progress').value=10;$('play').textContent='Ⅱ Pausar';playback=setInterval(()=>{const p=+$('progress').value+3;$('progress').value=Math.min(100,p);updateExample();if(p>=100)stopPlayback();},250);};
$('reference').onclick=()=>{reference=!reference;$('reference').textContent=reference?'Ocultar desenho original':'Mostrar desenho original';render();};
$('temperature').oninput=()=>{$('temperatureValue').textContent=+$('temperature').value<.35?'Contida':+$('temperature').value>.65?'Livre':'Equilibrada';};
function animate(){visibleGenerated=Math.min(generated.length,visibleGenerated+3);render();if(visibleGenerated<generated.length)animation=requestAnimationFrame(animate);}
function complete(){
  if(!ready||tokens.length<4||busy)return;stopPlayback();busy=true;setButtons();lastGeneration=++sequence;$('generationStatus').textContent='Imaginando uma continuação…';worker.postMessage({id:lastGeneration,type:'generate',tokens,mode:$('mode').value,label:$('category').value==='auto'?null:+$('category').value,temperature:+$('temperature').value,seed:crypto.getRandomValues(new Uint32Array(1))[0]});
}
$('complete').onclick=complete;$('another').onclick=complete;
$('category').onchange=()=>{invalidate();render();};
$('mode').onchange=()=>{invalidate();render();$('modeHint').textContent=$('mode').value==='reference'?'Adapta um desenho conhecido do treino, guiado pela categoria e pelo seu traço.':'A GRU amostra novos movimentos. Experimental: pode produzir formas pouco coerentes.';};
async function loadData(){
  try{const [er,mr]=await Promise.all([fetch('./examples.json'),fetch('./metrics.json')]);if(er.ok)examples=await er.json();[...$('exampleButtons').children].forEach((button,i)=>{button.disabled=!examples.some(e=>e.label===i);});if(mr.ok){const m=await mr.json();$('metricAccuracy').textContent=(m.accuracy*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';$('metricHalf').textContent=(m.half_accuracy*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';}}catch{status('Modelo pronto; exemplos ou métricas indisponíveis.',true);}
}
try{
  worker=new Worker('./worker.js?v=20261115.2',{type:'module'});
  worker.onmessage=({data})=>{
    if(data.error){if(data.type==='generate'){busy=false;setButtons();$('generationStatus').textContent=data.error;}else status(data.error,true);return;}
    if(data.type==='load'){ready=true;labels=data.labels;modelScale=data.scale;modelStep=data.step;status('Modelo pronto · processamento local');labels.forEach((label,i)=>{const option=document.createElement('option');option.value=i;option.textContent=label;$('category').append(option);const button=document.createElement('button');button.className='chip';button.textContent=label;button.disabled=true;button.onclick=()=>chooseExample(i);$('exampleButtons').append(button);});loadData();setButtons();}
    if(data.type==='classify'&&data.id===lastClass&&data.revision===revision&&data.count<=tokens.length&&tokens.length){history=data.trajectory.map((p,i)=>({n:i+1,p}));showPredictions(data.probabilities);$('recognitionHint').textContent=data.count<12?'Ainda há poucos traços: as hipóteses podem mudar bastante.':'Hipóteses entre as seis categorias do experimento.';}
    if(data.type==='generate'&&data.id===lastGeneration){busy=false;generated=data.tokens;visibleGenerated=0;showPredictions(data.probabilities);$('generationStatus').textContent=data.mode==='reference'?`Continuação adaptada de um exemplo de ${labels[data.label].toLowerCase()} do treino.`:`Geração livre de ${labels[data.label].toLowerCase()}: uma hipótese experimental.`;setButtons();cancelAnimationFrame(animation);if(matchMedia('(prefers-reduced-motion: reduce)').matches){visibleGenerated=generated.length;render();}else animate();}
  };
  worker.onerror=()=>{ready=false;status('Falha ao executar o modelo. Recarregue a página.',true);setButtons();};worker.postMessage({id:++sequence,type:'load'});
}catch{status('Este navegador não oferece o suporte necessário.',true);}
drawChart();render();

import {encode} from './model.js?v=20261117.4';
const $=id=>document.getElementById(id),canvas=$('drawing'),ctx=canvas.getContext('2d'),chart=$('confidence'),cc=chart.getContext('2d');
const colors=['#df6944','#658e7b','#6f89ac','#ae8e55','#9273a5','#be7188','#458e93','#b06446','#748d3e','#8b6bb5','#4d7aaf','#b17a3e'];
let worker,ready=false,labels=[],examples=[],strokes=[],active=false,example=null,reference=false,generated=[],visibleGenerated=0;
let tokens=[],points=[],history=[],probabilities=[],sequence=0,lastClass=0,lastGeneration=0,busy=false,revision=0,animation=0,playback=0,replayCount=0;
let view={s:1,x:0,y:0},classTimer=0;const exampleIndexes={};
let modelScale=128,modelStep=8,includeTime=false,timeScale=1;
const seconds=value=>Number(value).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' s';
function status(message,error=false){$('status').replaceChildren();const dot=document.createElement('span');dot.className='tiny-dot';$('status').append(dot,document.createTextNode(message));$('status').classList.toggle('error',error);}
function setButtons(){const ok=ready&&tokens.length>=4&&!busy&&(!example||replayCount<example.tokens.length);const own=example?.id==='user-drawing';$('reviewDrawing').disabled=!ready||active||(!!example&&!own)||(!example&&tokens.length<4);$('reviewDrawing').textContent=own?'↩ Voltar a editar meu desenho':'↻ Rever meu desenho ponto a ponto';$('complete').disabled=!ok;$('another').disabled=!ok||!generated.length;}
function line(points,color,width=4,alpha=1){
  if(!points.length)return;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width/view.s;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=alpha;ctx.beginPath();
  for(let i=0;i<points.length;i++){const p=points[i];if(i===0||points[i-1][2])ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);}ctx.stroke();ctx.restore();
}
function continuationPoints(){if(!points.length)return [];let [x,y]=points.at(-1);const out=[[x,y,points.at(-1)[2]]];for(const token of generated.slice(0,visibleGenerated)){x+=token[0]*modelScale;y+=token[1]*modelScale;out.push([x,y,token[2]]);}return out;}
function render(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.s,view.s);if(reference&&example)line(example.points,'#aabbb0',3,.8);line(points,'#292e31',4);line(continuationPoints(),'#df6944',4);if(example&&points.length){const p=points.at(-1);ctx.beginPath();ctx.arc(p[0],p[1],6/view.s,0,Math.PI*2);ctx.fillStyle=p[2]?'#658e7b':'#df6944';ctx.fill();}ctx.restore();$('empty').hidden=!!points.length;$('referenceLegend').hidden=!(reference&&example);$('pointCount').textContent=points.length?`${points.length} eventos${includeTime?' · '+seconds(points.at(-1)[3]):' observados'}`:'Pronto para começar';}
function drawChart(){
  const w=chart.width,h=chart.height,L=45,R=15,T=15,B=35;cc.clearRect(0,0,w,h);cc.font='13px system-ui';cc.fillStyle='#8b8f85';cc.strokeStyle='#deded4';cc.lineWidth=1;
  for(let i=0;i<=2;i++){const y=T+(h-T-B)*i/2;cc.beginPath();cc.moveTo(L,y);cc.lineTo(w-R,y);cc.stroke();cc.fillText(`${100-50*i}%`,2,y+4);}cc.fillText(includeTime?'Tempo observado (s)':'Eventos observados',w-165,h-8);
  const chosen=probabilities.map((p,i)=>({p,i})).sort((a,b)=>b.p-a.p).slice(0,3).map(v=>v.i),max=Math.max(includeTime?1:10,includeTime&&example?+$('progress').value:0,...history.map(v=>includeTime?v.t:v.n));
  for(let tick=0;tick<=4;tick++){const value=max*tick/4;cc.fillText(includeTime?value.toFixed(1):Math.round(value),L+(w-L-R)*tick/4-5,h-B+17);}
  for(const label of chosen){cc.beginPath();cc.strokeStyle=colors[label];cc.lineWidth=3;let previousY=null;history.forEach((row,j)=>{const x=L+(w-L-R)*(includeTime?row.t:row.n)/max,y=T+(h-T-B)*(1-row.p[label]);if(j===0)cc.moveTo(x,y);else{if(includeTime)cc.lineTo(x,previousY);cc.lineTo(x,y);}previousY=y;});if(includeTime&&history.length)cc.lineTo(w-R,previousY);cc.stroke();}
  $('confidenceLegend').replaceChildren();for(const i of chosen){const span=document.createElement('span'),dot=document.createElement('i');dot.style.background=colors[i];span.append(dot,document.createTextNode(labels[i]));$('confidenceLegend').append(span);}
}
function showPredictions(p){
  probabilities=p;$('predictions').replaceChildren();p.map((prob,i)=>({prob,i})).sort((a,b)=>b.prob-a.prob).slice(0,3).forEach(({prob,i})=>{
    const row=document.createElement('div');row.className='prediction';const head=document.createElement('div');head.className='prediction-heading';const name=document.createElement('strong'),value=document.createElement('span');name.textContent=labels[i];value.textContent=`${Math.round(prob*100)}%`;head.append(name,value);const track=document.createElement('div'),fill=document.createElement('div');track.className='track';fill.className='fill';fill.style.width=`${prob*100}%`;fill.style.background=colors[i];track.append(fill);row.append(head,track);$('predictions').append(row);
  });drawChart();
}
function invalidate(){revision++;lastGeneration=0;busy=false;generated=[];visibleGenerated=0;clearTimeout(animation);$('generationStatus').textContent='';$('generationProgress').textContent='';$('revealAll').hidden=true;setButtons();}
function classify(){if(!ready||tokens.length<1||classTimer)return;classTimer=setTimeout(()=>{classTimer=0;if(tokens.length<1)return;lastClass=++sequence;worker.postMessage({id:lastClass,type:'classify',tokens,revision});},100);}
function updateFreehand(){const encoded=encode(strokes,!active,modelStep,modelScale,includeTime,timeScale);tokens=encoded.tokens;points=encoded.points;if(tokens.length<1){lastClass=0;history=[];probabilities=[];$('predictions').replaceChildren();$('recognitionHint').textContent='As hipóteses mudam conforme você desenha.';drawChart();}render();setButtons();classify();}
function stopPlayback(){clearTimeout(playback);playback=0;$('play').textContent='▶ Revelar aos poucos';}
function reset(){active=false;stopPlayback();clearTimeout(classTimer);classTimer=0;invalidate();example=null;strokes=[];tokens=[];points=[];history=[];probabilities=[];lastClass=0;reference=false;$('replay').hidden=true;$('predictions').replaceChildren();$('reference').textContent='Mostrar desenho original';document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));view={s:1,x:0,y:0};render();drawChart();setButtons();}
function fitExample(){const xs=example.points.map(p=>p[0]),ys=example.points.map(p=>p[1]),minx=Math.min(...xs),miny=Math.min(...ys),width=Math.max(20,Math.max(...xs)-minx),height=Math.max(20,Math.max(...ys)-miny),s=Math.min(780/width,560/height,2.2);view={s,x:(1024-width*s)/2-minx*s,y:(768-height*s)/2-miny*s};}
function updateExample(count=null){
  if(!example)return;invalidate();fitExample();const value=+$('progress').value;
  const available=includeTime?Math.max(1,example.points.filter(p=>p[3]<=value).length):Math.max(2,Math.round(example.tokens.length*value/100));
  const n=count==null?available:Math.max(1,Math.min(example.tokens.length,count)),previousCount=tokens.length;replayCount=n;
  tokens=example.tokens.slice(0,n);points=example.points.slice(0,n);history=history.filter(h=>h.n<=n);if(n<previousCount){if(history.at(-1)?.n===n)showPredictions(history.at(-1).p);else{probabilities=[];$('predictions').replaceChildren();drawChart();}}
  $('progressValue').textContent=includeTime?seconds(value):`${Math.round(value)}%`;
  $('eventIndex').textContent=`${n} / ${example.tokens.length}`;
  $('eventInterval').textContent=includeTime?Math.round(1000*(n>1?points.at(-1)[3]-points.at(-2)[3]:0)).toLocaleString('pt-BR')+' ms':'—';
  $('penState').textContent=points.at(-1)[2]?'Levantada':'Desenhando';
  $('nextEvent').disabled=n>=example.tokens.length;render();setButtons();classify();
}
function chooseExample(label){reset();const pool=examples.filter(e=>e.label===label);if(!pool.length){status('Exemplos indisponíveis.',true);return;}const n=exampleIndexes[label]??0;exampleIndexes[label]=n+1;example=pool[n%pool.length];$('replay').hidden=false;$('progress').min=includeTime?'0':'10';$('progress').max=includeTime?String(example.points.at(-1)[3]):'100';$('progress').step=includeTime?'any':'1';$('progress').value=includeTime?0:10;fitExample();updateExample(includeTime?1:null);$('exampleButtons').children[label].classList.add('active');}
function pointerPosition(event){const rect=canvas.getBoundingClientRect();return [((event.clientX-rect.left)*1024/rect.width-view.x)/view.s,((event.clientY-rect.top)*768/rect.height-view.y)/view.s,event.timeStamp];}
function advanceEvent(){if(!example||replayCount>=example.tokens.length)return;const n=replayCount+1;$('progress').value=includeTime?example.points[n-1][3]:n/example.tokens.length*100;updateExample(n);}
function presentationDelay(nextToken=null){
  const mode=$('playbackSpeed').value;
  if(mode==='original')return Math.max(16,1000*(nextToken?Math.expm1(nextToken[5]??Math.log1p(.04))*timeScale:example&&replayCount<example.points.length?example.points[replayCount][3]-example.points[Math.max(0,replayCount-1)][3]:.04));
  return {slow:600,normal:300,fast:150}[mode]??300;
}
function schedulePlayback(){
  if(!example||replayCount>=example.tokens.length){stopPlayback();return;}
  playback=setTimeout(()=>{advanceEvent();schedulePlayback();},presentationDelay());
}
canvas.addEventListener('pointerdown',event=>{if(event.button&&event.pointerType==='mouse')return;if(example?.id==='user-drawing')finishReview();else if(example)reset();stopPlayback();invalidate();active=true;strokes.push([pointerPosition(event)]);canvas.setPointerCapture(event.pointerId);event.preventDefault();updateFreehand();});
canvas.addEventListener('pointermove',event=>{if(!active)return;const coalesced=event.getCoalescedEvents?.(),events=coalesced?.length?coalesced:[event];let count=strokes.reduce((n,s)=>n+s.length,0);for(const e of events){if(count>=12000)break;strokes.at(-1).push(pointerPosition(e));count++;}updateFreehand();});
function endStroke(){if(!active)return;active=false;updateFreehand();}
canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);canvas.addEventListener('lostpointercapture',endStroke);
$('clear').onclick=reset;$('undo').onclick=()=>{if(example?.id==='user-drawing')finishReview();else if(example){reset();return;}invalidate();active=false;strokes.pop();history=[];updateFreehand();};
$('progress').oninput=()=>{stopPlayback();updateExample();};
document.querySelectorAll('[data-seconds]').forEach(button=>{button.onclick=()=>{if(!example)return;stopPlayback();$('progress').value=button.dataset.seconds==='full'?$('progress').max:Math.min(+$('progress').max,+button.dataset.seconds);updateExample();};});
$('play').onclick=()=>{if(playback){stopPlayback();return;}if(!example)return;if(replayCount>=example.tokens.length){$('progress').value=includeTime?0:10;updateExample(includeTime?1:null);}$('play').textContent='Ⅱ Pausar análise';schedulePlayback();};
$('nextEvent').onclick=()=>{stopPlayback();advanceEvent();};
function finishReview(){stopPlayback();invalidate();example=null;reference=false;$('reference').textContent='Mostrar desenho original';$('replay').hidden=true;history=[];updateFreehand();}
$('reviewDrawing').onclick=()=>{if(example?.id==='user-drawing'){finishReview();return;}if(example||tokens.length<4)return;stopPlayback();const own={id:'user-drawing',label:null,tokens:tokens.map(t=>[...t]),points:points.map(p=>[...p])};invalidate();example=own;$('replay').hidden=false;$('progress').min=0;$('progress').max=String(points.at(-1)[3]);$('progress').step='any';$('progress').value=0;updateExample(1);};
$('playbackSpeed').onchange=()=>{if(playback){clearTimeout(playback);schedulePlayback();}};
$('reference').onclick=()=>{reference=!reference;$('reference').textContent=reference?'Ocultar desenho original':'Mostrar desenho original';render();};
$('temperature').oninput=()=>{$('temperatureValue').textContent=+$('temperature').value<.35?'Contida':+$('temperature').value>.65?'Livre':'Equilibrada';};
function animate(){
  visibleGenerated=Math.min(generated.length,visibleGenerated+1);render();
  $('generationProgress').textContent=`${visibleGenerated} / ${generated.length} pontos sugeridos`;
  $('revealAll').hidden=visibleGenerated>=generated.length;
  if(visibleGenerated<generated.length)animation=setTimeout(animate,presentationDelay(generated[visibleGenerated]));
}
$('revealAll').onclick=()=>{clearTimeout(animation);visibleGenerated=generated.length;render();$('generationProgress').textContent=`${generated.length} pontos sugeridos`;$('revealAll').hidden=true;};
function frameContinuation(){
  if(!points.length)return;const all=[...points];let [x,y]=points.at(-1);for(const t of generated){x+=t[0]*modelScale;y+=t[1]*modelScale;all.push([x,y]);}
  if(reference&&example)all.push(...example.points);
  const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  if(left*view.s+view.x<30||right*view.s+view.x>994||top*view.s+view.y<30||bottom*view.s+view.y>738){
    const s=Math.min(view.s,920/Math.max(20,right-left),660/Math.max(20,bottom-top));view={s,x:(1024-(right-left)*s)/2-left*s,y:(768-(bottom-top)*s)/2-top*s};
  }
}
function complete(){
  if(!ready||tokens.length<4||busy)return;stopPlayback();busy=true;setButtons();lastGeneration=++sequence;$('generationStatus').textContent='Imaginando uma continuação…';worker.postMessage({id:lastGeneration,type:'generate',tokens,mode:$('mode').value,label:$('category').value==='auto'?null:+$('category').value,temperature:+$('temperature').value,seed:generated.length?crypto.getRandomValues(new Uint32Array(1))[0]:0});
}
$('complete').onclick=complete;$('another').onclick=complete;
$('category').onchange=()=>{invalidate();render();};
$('mode').onchange=()=>{invalidate();render();$('modeHint').textContent=$('mode').value==='reference'?'Busca entre 400 exemplos por categoria e encaixa a continuação respeitando os traços já feitos.':'A GRU amostra novos movimentos. Experimental: pode produzir formas pouco coerentes.';};
async function loadData(){
  try{const [er,mr]=await Promise.all([fetch('./examples.json?v=20261117.4'),fetch('./metrics.json?v=20261117.4')]);if(er.ok)examples=await er.json();[...$('exampleButtons').children].forEach((button,i)=>{button.disabled=!examples.some(e=>e.label===i);});if(mr.ok){const m=await mr.json();$('metricAccuracy').textContent=(m.accuracy*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';const early=m.early_accuracy??m.half_accuracy;$('metricHalf').textContent=early==null?'—':(early*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';if($('metricClasses'))$('metricClasses').textContent=labels.length;if($('metricTest'))$('metricTest').textContent=m.n_test.toLocaleString('pt-BR');if($('earlyCoverage')&&m.ongoing_count!=null)$('earlyCoverage').textContent=`Aos 4 s: ${m.ongoing_count.toLocaleString('pt-BR')} de ${m.n_test.toLocaleString('pt-BR')} desenhos ainda estavam em andamento.`;}}catch{status('Modelo pronto; exemplos ou métricas indisponíveis.',true);}
}
try{
  worker=new Worker('./worker.js?v=20261117.4',{type:'module'});
  worker.onmessage=({data})=>{
    if(data.error){if(data.type==='generate'){if(data.id!==lastGeneration)return;busy=false;setButtons();$('generationStatus').textContent=data.error;}else status(data.error,true);return;}
    if(data.type==='load'){ready=true;labels=data.labels;modelScale=data.scale;modelStep=data.step;includeTime=data.include_time;timeScale=data.time_scale;status('Modelo pronto · processamento local');if($('categoriesDescription'))$('categoriesDescription').textContent=labels.join(', ');labels.forEach((label,i)=>{const option=document.createElement('option');option.value=i;option.textContent=label;$('category').append(option);const button=document.createElement('button');button.className='chip';button.textContent=label;button.disabled=true;button.onclick=()=>chooseExample(i);$('exampleButtons').append(button);});loadData();setButtons();}
    if(data.type==='classify'&&data.id===lastClass&&data.revision===revision&&data.count<=tokens.length&&tokens.length){history=data.trajectory.map((p,i)=>({n:i+1,t:points[i]?.[3]??i,p}));showPredictions(data.probabilities);$('recognitionHint').textContent=data.count<12?'Ainda há poucos traços: as hipóteses podem mudar bastante.':`Hipóteses entre as ${labels.length} categorias do experimento.`;}
    if(data.type==='generate'&&data.id===lastGeneration){busy=false;generated=data.tokens;visibleGenerated=0;frameContinuation();showPredictions(data.probabilities);$('generationStatus').textContent=data.mode==='reference'?`Continuação adaptada de um exemplo de ${labels[data.label].toLowerCase()} do treino.`:`Geração livre de ${labels[data.label].toLowerCase()}: uma hipótese experimental.`;setButtons();clearTimeout(animation);if(matchMedia('(prefers-reduced-motion: reduce)').matches){visibleGenerated=generated.length;$('generationProgress').textContent=`${generated.length} pontos sugeridos`;render();}else animate();}
  };
  worker.onerror=()=>{ready=false;status('Falha ao executar o modelo. Recarregue a página.',true);setButtons();};worker.postMessage({id:++sequence,type:'load'});
}catch{status('Este navegador não oferece o suporte necessário.',true);}
drawChart();render();

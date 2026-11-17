// Recuperação de exemplos do treino; não é geração livre da GRU.
// As correspondências usam apenas o prefixo observado e respeitam cada traço.
let prepared=new WeakMap(),states=new WeakMap(),activeLabel=null;
function strokesOf(points){
  const strokes=[];let stroke=[];
  for(let i=0;i<points.length;i++){stroke.push(points[i]);if(points[i][2]||i===points.length-1){strokes.push(stroke);stroke=[];}}
  return strokes;
}
function sampleStroke(points,n=12){
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const out=[];let j=1;
  for(let i=0;i<n;i++){
    const target=lengths.at(-1)*i/(n-1);while(j<lengths.length-1&&lengths[j]<target)j++;
    const a=Math.max(0,j-1),b=Math.min(points.length-1,j),v=(target-lengths[a])/Math.max(1e-9,lengths[b]-lengths[a]);
    out.push([points[a][0]+v*(points[b][0]-points[a][0]),points[a][1]+v*(points[b][1]-points[a][1])]);
  }
  return out;
}
function centered(points){
  const mean=[0,0];for(const p of points){mean[0]+=p[0]/points.length;mean[1]+=p[1]/points.length;}
  return {mean,p:points.map(p=>[p[0]-mean[0],p[1]-mean[1]])};
}
function prepare(drawing){
  if(prepared.has(drawing))return prepared.get(drawing);
  const result=[];let strokeCount=1;
  for(let k=1;k<drawing.points.length-2;k++){
    if(k>1&&drawing.points[k-2][2])strokeCount++;
    // Cortes densos no começo; os finais de traço nunca são descartados.
    if(k<4||(!(k%3===0||drawing.points[k-1][2])&&k>8))continue;
    const points=drawing.points.slice(0,k),strokes=strokesOf(points);
    result.push({length:k,strokeCount,ended:!!points.at(-1)[2],samples:centered(strokes.flatMap(s=>sampleStroke(s)))});
  }
  prepared.set(drawing,result);return result;
}
function alignment(a,b){
  if(a.p.length!==b.p.length)return null;
  let dot=0,cross=0,aa=0,bb=0;
  for(let i=0;i<a.p.length;i++){dot+=b.p[i][0]*a.p[i][0]+b.p[i][1]*a.p[i][1];cross+=b.p[i][0]*a.p[i][1]-b.p[i][1]*a.p[i][0];aa+=a.p[i][0]**2+a.p[i][1]**2;bb+=b.p[i][0]**2+b.p[i][1]**2;}
  if(aa<25||bb<25)return null;
  const angle=Math.max(-.45,Math.min(.45,Math.atan2(cross,dot))),c=Math.cos(angle),s=Math.sin(angle),scale=Math.max(.25,Math.min(4,(c*dot+s*cross)/bb));
  const transform=p=>[a.mean[0]+scale*(c*(p[0]-b.mean[0])-s*(p[1]-b.mean[1])),a.mean[1]+scale*(s*(p[0]-b.mean[0])+c*(p[1]-b.mean[1]))];
  let error=0;for(let i=0;i<a.p.length;i++){const x=scale*(c*b.p[i][0]-s*b.p[i][1]),y=scale*(s*b.p[i][0]+c*b.p[i][1]);error+=(x-a.p[i][0])**2+(y-a.p[i][1])**2;}
  return {scale,transform,error:error/aa,radius:Math.sqrt(aa/a.p.length)};
}
function segmentDistance(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/Math.max(1e-9,dx*dx+dy*dy)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function hiddenFor(model,drawing,length){
  let cache=states.get(drawing);if(!cache){cache=new Map();states.set(drawing,cache);}if(cache.has(length))return cache.get(length);
  let previous=drawing.points[0],time=previous[3]??0;
  const tokens=drawing.points.slice(0,length).map((p,i)=>{const t=[i?(p[0]-previous[0])/model.scale:0,i?(p[1]-previous[1])/model.scale:0,p[2],(p[0]-drawing.points[0][0])/model.scale,(p[1]-drawing.points[0][1])/model.scale];if(model.input_size===6)t.push(Math.log1p(Math.max(0,(p[3]??time)-time)/(model.time_scale??1)));previous=p;time=p[3]??time;return t;});
  const state=model.prefix(tokens).state;cache.set(length,state);return state;
}
export function completeReference(model,library,tokens,label,{seed=0,temperature=.45}={}){
  if(activeLabel!==label){prepared=new WeakMap();states=new WeakMap();activeLabel=label;}
  const observed=tokens.map(t=>[t[3]*model.scale,t[4]*model.scale,t[2]]),strokes=strokesOf(observed),ended=!!observed.at(-1)[2];
  const samples=centered(strokes.flatMap(s=>sampleStroke(s))),ranked=[];
  const xs=observed.map(p=>p[0]),ys=observed.map(p=>p[1]),observedDiagonal=Math.max(20,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)));
  for(const drawing of library.drawings){if(drawing.label!==label)continue;
    const dx=drawing.points.map(p=>p[0]),dy=drawing.points.map(p=>p[1]),fullDiagonal=Math.hypot(Math.max(...dx)-Math.min(...dx),Math.max(...dy)-Math.min(...dy));
    for(const prefix of prepare(drawing)){
      if(prefix.strokeCount!==strokes.length||prefix.ended!==ended)continue;
      const fit=alignment(samples,prefix.samples);if(!fit)continue;
      const endpoint=fit.transform(drawing.points[prefix.length-1]),last=observed.at(-1);
      const endError=((endpoint[0]-last[0])**2+(endpoint[1]-last[1])**2)/Math.max(100,fit.radius**2);
      const expansion=fullDiagonal*fit.scale/observedDiagonal;if(expansion>6)continue;
      ranked.push({drawing,prefix,fit,score:fit.error+.08*endError+.006*Math.log(fit.scale)**2+.025*Math.max(0,expansion-1.8)**2});
    }
  }
  ranked.sort((a,b)=>a.score-b.score);
  if(!ranked.length)throw Error('Ainda não encontrei um exemplo com traços compatíveis. Acrescente detalhes ou escolha outra categoria.');
  // A geometria define os finalistas; a GRU desempata apenas os melhores encaixes.
  const state=model.prefix(tokens).state,norm=Math.hypot(...state);
  const finalists=ranked.slice(0,12).filter(r=>r.score<=ranked[0].score+.06);
  for(const r of finalists){const h=hiddenFor(model,r.drawing,r.prefix.length);let dot=0,other=0;for(let i=0;i<state.length;i++){dot+=state[i]*h[i];other+=h[i]**2;}r.score+=.025*(1-dot/Math.max(1e-9,norm*Math.sqrt(other)));}
  finalists.sort((a,b)=>a.score-b.score);
  // Variações vêm de desenhos distintos e com encaixe próximo; a primeira é a melhor.
  const seen=new Set(),options=finalists.filter(r=>{if(seen.has(r.drawing.id)||r.score>finalists[0].score+.008+temperature*.025)return false;seen.add(r.drawing.id);return true;}).slice(0,3);
  const choice=options[(seed>>>0)%options.length],{drawing,prefix,fit}=choice;
  if(fit.error>.38)throw Error('O encaixe ficou pouco confiável. Acrescente mais traços ou selecione outra categoria antes de completar.');
  const origin=drawing.points[prefix.length-1],last=observed.at(-1);
  const controls=prefix.samples.p.map((p,i)=>{
    const mapped=fit.transform([p[0]+prefix.samples.mean[0],p[1]+prefix.samples.mean[1]]);
    return {mapped,residual:[samples.p[i][0]+samples.mean[0]-mapped[0],samples.p[i][1]+samples.mean[1]-mapped[1]]};
  });
  const mappedOrigin=fit.transform(origin);controls.push({mapped:mappedOrigin,residual:[last[0]-mappedOrigin[0],last[1]-mappedOrigin[1]]});
  function deform(p){const mapped=fit.transform(p);let weights=0,rx=0,ry=0,nearest=Infinity;
    for(const q of controls){const d=(mapped[0]-q.mapped[0])**2+(mapped[1]-q.mapped[1])**2,w=1/(d+.001);nearest=Math.min(nearest,d);weights+=w;rx+=w*q.residual[0];ry+=w*q.residual[1];}
    const decay=Math.exp(-nearest/Math.max(100,4*fit.radius**2));return [mapped[0]+decay*rx/weights,mapped[1]+decay*ry/weights];
  }
  const ink=[];for(let i=1;i<observed.length;i++)if(!observed[i-1][2])ink.push([observed[i-1],observed[i]]);
  const threshold=Math.max(3,Math.min(8,fit.radius*.035));
  function alreadyDrawn(a,b){return [.2,.5,.8].every(t=>{const p=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];return ink.some(([u,v])=>segmentDistance(p,u,v)<threshold);});}

  const result=[];let previous=last.slice(0,2),previousSource=origin,previousTime=origin[3]??0;
  for(const p of drawing.points.slice(prefix.length)){
    const position=deform(p);
    if(!previousSource[2]&&alreadyDrawn(previous,position)){
      if(result.length)result.at(-1)[2]=1;
      else result.push([0,0,1,previous[0]/model.scale,previous[1]/model.scale,...(model.input_size===6?[0]:[])]);
    }
    const interval=Math.max(0,(p[3]??previousTime)-previousTime);
    result.push([(position[0]-previous[0])/model.scale,(position[1]-previous[1])/model.scale,p[2],position[0]/model.scale,position[1]/model.scale,...(model.input_size===6?[Math.log1p(interval/(model.time_scale??1))]:[])]);
    previous=position;previousSource=p;previousTime=p[3]??previousTime;
  }
  return {tokens:result,source_id:drawing.id,source_prefix_length:prefix.length,score:choice.score,fit_error:fit.error,method:'stroke-aware-similarity-v2'};
}

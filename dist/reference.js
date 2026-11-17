// Continuação por referência: a figura resultante adapta um desenho conhecido do treino.
function resample(points,n=24){
  const out=[];for(let i=0;i<n;i++){const t=i*(points.length-1)/(n-1),a=Math.floor(t),b=Math.min(points.length-1,a+1),v=t-a;out.push([points[a][0]*(1-v)+points[b][0]*v,points[a][1]*(1-v)+points[b][1]*v]);}return out;
}
function centered(points){const mean=[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];return {mean,p:points.map(p=>[p[0]-mean[0],p[1]-mean[1]])};}
function alignment(observed,candidate){
  const a=centered(resample(observed)),b=centered(resample(candidate));let dot=0,cross=0,aa=0,bb=0;
  for(let i=0;i<a.p.length;i++){dot+=b.p[i][0]*a.p[i][0]+b.p[i][1]*a.p[i][1];cross+=b.p[i][0]*a.p[i][1]-b.p[i][1]*a.p[i][0];aa+=a.p[i][0]**2+a.p[i][1]**2;bb+=b.p[i][0]**2+b.p[i][1]**2;}
  const angle=Math.max(-.55,Math.min(.55,Math.atan2(cross,dot))),c=Math.cos(angle),s=Math.sin(angle),scale=Math.max(.2,Math.min(4,Math.sqrt((aa+1)/(bb+1))));let error=0;
  for(let i=0;i<a.p.length;i++){const x=scale*(c*b.p[i][0]-s*b.p[i][1]),y=scale*(s*b.p[i][0]+c*b.p[i][1]);error+=(x-a.p[i][0])**2+(y-a.p[i][1])**2;}
  return {c,s,scale,error:error/(aa+20)};
}
export function completeReference(model,library,tokens,label,{seed=0,temperature=.45}={}){
  let x=0,y=0;const observed=tokens.map(t=>{x+=t[0]*model.scale;y+=t[1]*model.scale;return [x,y,t[2]];});
  const state=model.prefix(tokens).state,norm=Math.hypot(...state),ranked=[];
  for(const drawing of library.drawings){if(drawing.label!==label)continue;
    for(const prefix of drawing.prefixes){
      const candidate=drawing.points.slice(0,prefix.length),fit=alignment(observed,candidate);
      let dot=0,other=0;for(let i=0;i<state.length;i++){dot+=state[i]*prefix.hidden[i];other+=prefix.hidden[i]**2;}
      const distance=1-dot/Math.max(1e-9,norm*Math.sqrt(other)),lift=Math.abs(observed.at(-1)[2]-candidate.at(-1)[2]);
      ranked.push({drawing,prefix,fit,score:fit.error+.15*distance+.03*lift});
    }
  }
  ranked.sort((a,b)=>a.score-b.score);if(!ranked.length)throw Error('Não há referências disponíveis para esta categoria.');
  const options=ranked.slice(0,5).filter(r=>r.score<=ranked[0].score+.04+temperature*.08),choice=options[(seed>>>0)%options.length];
  const {drawing,prefix,fit}=choice,origin=drawing.points[prefix.length-1],last=tokens.at(-1),result=[];let previous=[...last.slice(3,5)];
  for(const p of drawing.points.slice(prefix.length)){
    const dx=p[0]-origin[0],dy=p[1]-origin[1],position=[last[3]+fit.scale*(fit.c*dx-fit.s*dy)/model.scale,last[4]+fit.scale*(fit.s*dx+fit.c*dy)/model.scale];
    result.push([position[0]-previous[0],position[1]-previous[1],p[2],...position]);previous=position;
  }
  return {tokens:result,source_id:drawing.id,score:choice.score};
}

export function softmax(values,t=1){const peak=Math.max(...values),out=Array.from(values,v=>Math.exp((v-peak)/t)),total=out.reduce((a,b)=>a+b,0);return out.map(v=>v/total);}
function linear(x,w,b){const y=new Float64Array(w.length);for(let i=0;i<w.length;i++){let v=b?b[i]:0;for(let j=0;j<x.length;j++)v+=w[i][j]*x[j];y[i]=v;}return y;}
const sigmoid=x=>1/(1+Math.exp(-x));
export class SketchModel{
  constructor(data){Object.assign(this,data);this.w=data.weights;}
  step(token,state=new Float64Array(this.hidden)){
    const w=this.w,H=this.hidden,a=linear(token,w['gru.weight_ih_l0'],w['gru.bias_ih_l0']),b=linear(state,w['gru.weight_hh_l0'],w['gru.bias_hh_l0']),next=new Float64Array(H);
    for(let i=0;i<H;i++){const r=sigmoid(a[i]+b[i]),z=sigmoid(a[H+i]+b[H+i]),n=Math.tanh(a[2*H+i]+r*b[2*H+i]);next[i]=(1-z)*n+z*state[i];}return next;
  }
  logits(state){return Array.from(linear(state,this.w['classifier.weight'],this.w['classifier.bias']));}
  params(state,label){const joined=[...state,...this.w['embedding.weight'][label]],middle=linear(joined,this.w['generation_hidden.weight'],this.w['generation_hidden.bias']);return Array.from(linear(Array.from(middle,v=>Math.tanh(v)),this.w['generation.weight'],this.w['generation.bias']));}
  prefix(tokens,collect=false){let state=new Float64Array(this.hidden);const trajectory=[];for(const token of tokens){state=this.step(token,state);if(collect)trajectory.push(softmax(this.logits(state)));}const logits=this.logits(state);return {state,logits,probabilities:softmax(logits),trajectory};}
  generate(tokens,label,{seed=123,temperature=.5,maxSteps=100,minSteps=8}={}){
    temperature=Math.max(.15,Math.min(1.2,temperature));let state=this.prefix(tokens).state;const result=[];let spare=null,value=seed>>>0,px=tokens.at(-1)[3],py=tokens.at(-1)[4];
    const random=()=>{value+=0x6D2B79F5;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
    const normal=()=>{if(spare!==null){const v=spare;spare=null;return v;}const r=Math.sqrt(-2*Math.log(Math.max(random(),1e-12))),a=2*Math.PI*random();spare=r*Math.sin(a);return r*Math.cos(a);};
    const choose=p=>{let v=random();for(let i=0;i<p.length;i++){v-=p[i];if(v<=0)return i;}return p.length-1;};
    for(let i=0;i<maxSteps;i++){
      const p=this.params(state,label),M=this.mixtures,j=choose(softmax(Array.from({length:M},(_,k)=>p[k*6]),temperature)),o=j*6,rho=.95*Math.tanh(p[o+5]),zx=normal(),zy=normal(),spread=Math.sqrt(temperature);
      const dx=p[o+1]+Math.exp(Math.max(-4,Math.min(2,p[o+3])))*spread*zx,dy=p[o+2]+Math.exp(Math.max(-4,Math.min(2,p[o+4])))*spread*(rho*zx+Math.sqrt(1-rho*rho)*zy);
      const pen=p.slice(6*M);if(i<minSteps)pen[2]=-1e9;const status=choose(softmax(pen,temperature));if(status===2)break;
      if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('Coordenada gerada inválida.');px+=dx;py+=dy;const token=[dx,dy,status,px,py];result.push(token);state=this.step(token,state);
    }return result;
  }
}
export function encode(strokes,closed=true,step=5,scale=128){
  const points=[];for(let s=0;s<strokes.length;s++){
    const stroke=strokes[s];if(!stroke.length)continue;const kept=[];
    for(const p of stroke)if(!kept.length||Math.hypot(p[0]-kept.at(-1)[0],p[1]-kept.at(-1)[1])>=step)kept.push(p);
    const isClosed=closed||s<strokes.length-1;
    if(isClosed&&Math.hypot(stroke.at(-1)[0]-kept.at(-1)[0],stroke.at(-1)[1]-kept.at(-1)[1])>0)kept.push(stroke.at(-1));
    kept.forEach((p,i)=>points.push([p[0],p[1],+(isClosed&&i===kept.length-1)]));
  }
  const tokens=points.map((p,i)=>[(p[0]-points[Math.max(0,i-1)][0])/scale,(p[1]-points[Math.max(0,i-1)][1])/scale,p[2],(p[0]-points[0][0])/scale,(p[1]-points[0][1])/scale]);return {tokens,points};
}

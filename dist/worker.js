import {SketchModel} from './model.js?v=20261117.1';
import {completeReference} from './reference.js?v=20261117.1';
let model,library;
self.onmessage=async({data})=>{
  const {id,type}=data;
  try{
    if(type==='load'){const response=await fetch('./model.json?v=20261117.1');if(!response.ok)throw Error('Não foi possível carregar o modelo.');model=new SketchModel(await response.json());self.postMessage({id,type,labels:model.labels,classes:model.classes,scale:model.scale,step:model.spatial_step,include_time:!!model.include_time,time_scale:model.time_scale??1});return;}
    if(!model)throw Error('O modelo ainda está carregando.');
    if(!Array.isArray(data.tokens)||!data.tokens.length||data.tokens.length>4000)throw Error('Desenhe alguns traços antes de continuar.');
    const result=model.prefix(data.tokens,type==='classify');
    if(type==='classify')self.postMessage({id,type,count:data.tokens.length,revision:data.revision,probabilities:result.probabilities,trajectory:result.trajectory});
    if(type==='generate'){
      const label=data.label??result.probabilities.indexOf(Math.max(...result.probabilities));if(!Number.isInteger(label)||label<0||label>=model.labels.length)throw Error('Categoria inválida.');
      let generated;
      if(data.mode==='reference'){
        if(!library){const response=await fetch('./reference_library.json?v=20261117.1');if(!response.ok)throw Error('Não foi possível carregar as referências.');library=await response.json();}
        generated=completeReference(model,library,data.tokens,label,{seed:data.seed,temperature:data.temperature});
      }else generated={tokens:model.generate(data.tokens,label,{seed:data.seed,temperature:data.temperature,maxSteps:120,minSteps:8})};
      self.postMessage({id,type,...generated,mode:data.mode,label,probabilities:result.probabilities});
    }
  }catch(error){self.postMessage({id,type,error:error.message});}
};

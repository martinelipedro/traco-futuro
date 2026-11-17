// Sem dependências npm: confere o artefato estático antes da publicação.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SketchModel} from '../dist/model.js';

const directory=fileURLToPath(new URL('../dist/',import.meta.url));
const required=['index.html','app.js','model.js','worker.js','reference.js','style.css','icon.svg',
  'model.json','reference_library.json','examples.json','metrics.json','relatorio.pdf','.nojekyll'];
for(const name of required)assert.ok(fs.existsSync(path.join(directory,name)),`Arquivo ausente: ${name}`);
let bytes=0,files=0;
function inspect(folder){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);
    assert.ok(!entry.isSymbolicLink(),`Link simbólico no artefato: ${file}`);
    if(entry.isDirectory()){inspect(file);continue;}
    bytes+=fs.statSync(file).size;files++;
    if(!/\.(html|js|css)$/.test(file))continue;
    const content=fs.readFileSync(file,'utf8'),references=[];
    for(const match of content.matchAll(/(?:src|href)=["']([^"']+)["']/g))references.push(match[1]);
    if(file.endsWith('.js'))for(const match of content.matchAll(/(?:\bfrom\s*|\bfetch\s*\(\s*|\bnew\s+Worker\s*\(\s*)['"]([^'"]+)['"]/g))references.push(match[1]);
    for(const ref of references){
      if(ref.startsWith('#')||/^(https?:|data:|mailto:)/.test(ref))continue;
      assert.ok(!ref.startsWith('/'),`Caminho incompatível com Pages de projeto: ${ref}`);
      const target=fileURLToPath(new URL(ref,pathToFileURL(file)));
      assert.ok(target.startsWith(directory),`Recurso fora do artefato: ${ref}`);
      assert.ok(fs.existsSync(target),`Recurso ausente: ${ref} em ${path.basename(file)}`);
    }
  }
}
inspect(directory);
const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
const data=read('model.json'),model=new SketchModel(data),library=read('reference_library.json'),examples=read('examples.json'),metrics=read('metrics.json');
assert.equal(data.classes.length,data.labels.length);
assert.equal(data.weights['gru.weight_ih_l0'].length,3*data.hidden);
assert.ok(data.weights['gru.weight_ih_l0'].every(row=>row.length===5));
assert.equal(data.weights['classifier.weight'].length,data.classes.length);
assert.ok(library.drawings.length>0&&examples.length>0);
for(const drawing of library.drawings){
  assert.ok(Number.isInteger(drawing.label)&&drawing.label>=0&&drawing.label<data.classes.length);
  for(const prefix of drawing.prefixes){assert.equal(prefix.hidden.length,data.hidden);assert.ok(prefix.length>0&&prefix.length<drawing.points.length);}
}
for(const example of examples){assert.equal(example.tokens.length,example.points.length);assert.ok(example.tokens.length>0&&example.tokens.every(t=>t.length===5&&t.every(Number.isFinite)));}
const p=model.prefix(examples[0].tokens.slice(0,12)).probabilities;
assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-8);
assert.ok(metrics.accuracy>=0&&metrics.accuracy<=1&&metrics.half_accuracy>=0&&metrics.half_accuracy<=1);
assert.ok(fs.readFileSync(path.join(directory,'relatorio.pdf')).subarray(0,5).equals(Buffer.from('%PDF-')));
console.log(JSON.stringify({passed:true,files,bytes,categories:data.classes.length,references:library.drawings.length,relative_assets:true,backend_required:false}));

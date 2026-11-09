// Run against the locally started real Anemone Bridge. No dependencies.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=process.env.SMARTSTOCK_URL||'http://127.0.0.1:8096';
const state=async()=>{const r=await fetch(base+'/api/state');assert.equal(r.status,200);return r.json();};
let token=(await state()).csrfToken;
async function command(name,id=randomUUID()){
  const r=await fetch(base+'/api/'+name,{method:'POST',headers:{'X-SmartStock-Token':token,'X-Command-Id':id}});
  assert.equal(r.status,200,await r.clone().text());return r.json();
}
async function until(status){for(let i=0;i<100;i++){const s=await state();if(s.executionStatus===status)return s;if(s.executionStatus==='error')throw new Error(s.message);await new Promise(r=>setTimeout(r,50));}throw new Error('Timeout '+status);}
function coherent(s){
  const count=t=>s.blackboard.find(x=>x.term===t)?.multiplicity||0;
  assert.equal(s.source,'anemone');assert.equal(s.confirmationMultiplicity,count('retrait_confirme(compresse)'));
  assert.equal(s.weightPresent,count('poids_change(compresse)')>0);assert.equal(s.dataMatrixPresent,count('datamatrix_detecte(compresse)')>0);
  if(s.stock!==null)assert.equal(count(`stock(compresse,${s.stock})`),1);
}
const streamAbort=new AbortController();
const sse=await fetch(base+'/api/events',{signal:streamAbort.signal});assert.match(sse.headers.get('content-type'),/text\/event-stream/);
let frames='';const reader=sse.body.getReader();
const readStream=(async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;frames+=new TextDecoder().decode(value);}}catch(e){if(e.name!=='AbortError')throw e;}})();
let s=await command('reset');s=await command('initialize');assert.equal(s.stock,40);coherent(s);console.log('PASS A — initialisation réelle stock40');
await command('events/weight');await command('run');s=await until('blocked');assert.equal(s.stock,40);assert.equal(s.confirmationMultiplicity,0);assert.equal(s.weightPresent,false);assert.match(s.remainingAgent,/datamatrix_detecte/);console.log('PASS B — poids seul, consommé, continuation bloquée conservée');
await command('events/datamatrix');await command('run');s=await until('completed');assert.equal(s.stock,39);assert.equal(s.confirmationMultiplicity,1);assert.equal(s.executionStep,7);coherent(s);console.log('PASS D — reprise du même AST après Data Matrix tardif, 40 → 39');
const session=s.sessionId;await command('events/weight');await command('events/datamatrix');await command('run');s=await until('completed');assert.equal(s.sessionId,session);assert.equal(s.stock,38);assert.equal(s.confirmationMultiplicity,2);coherent(s);console.log('PASS E — même Blackboard, 39 → 38, multiplicité2');
assert.equal((await command('initialize')).stock,38);console.log('PASS — INITIALISER ne réinitialise pas le stock');
s=await command('reset');await command('events/datamatrix');await command('run');s=await until('blocked');assert.equal(s.stock,40);assert.equal(s.confirmationMultiplicity,0);assert.equal(s.dataMatrixPresent,true);console.log('PASS C — Data Matrix seul, stock inchangé');
coherent(await state());console.log('PASS F — GET state cohérent avec les termes et multiplicités');
const oldSession=s.sessionId;s=await command('reset');assert.notEqual(s.sessionId,oldSession);assert.equal(s.stock,40);assert.equal(s.confirmationMultiplicity,0);console.log('PASS I — reset explicite nouvelle session stock40');
const id=randomUUID();await command('events/weight',id);s=await command('events/weight',id);assert.equal(s.blackboard.find(x=>x.term==='poids_change(compresse)').multiplicity,1);console.log('PASS — déduplication des commandes HTTP');
await command('step');s=await command('step');assert.equal(s.executionStatus,'blocked');assert.equal(s.confirmationMultiplicity,0);console.log('PASS — pas à pas et blocage réel');
let rejected=await fetch(base+'/api/reset',{method:'POST'});assert.equal(rejected.status,403);
rejected=await fetch(base+'/api/reset',{method:'POST',headers:{Origin:'http://evil.example','X-SmartStock-Token':token,'X-Command-Id':randomUUID()}});assert.equal(rejected.status,403);
rejected=await fetch(base+'/bridge/bridge.properties');assert.equal(rejected.status,404);
console.log('PASS — commandes protégées, fichiers hors web inaccessibles');
await command('reset');
const home=await fetch(base+'/');assert.equal(home.status,200);
const html=await home.text();const entrypoint=html.includes('js/scalajs/main.js')?'/js/scalajs/main.js':'/js/app.js';
for(const path of ['/css/app.css',entrypoint,'/assets/datamatrix.svg'])assert.equal((await fetch(base+path)).status,200);
console.log('PASS — frontend et ressources servis localement');
await new Promise(r=>setTimeout(r,150));streamAbort.abort();await readStream;
const events=frames.split('\n\n').filter(f=>f.includes('event: state')).map(f=>JSON.parse(f.split('\n').find(l=>l.startsWith('data: ')).slice(6)));
assert(events.length>10);assert(events.some(e=>e.stock===39));assert(events.some(e=>e.stock===38));assert(events.some(e=>e.stock===null));
for(const e of events)coherent(e);
console.log('PASS — SSE réel, étapes transitoires, stock39 et stock38 observés');
console.log('Tous les tests API ont réussi.');

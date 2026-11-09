import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.SMARTSTOCK_URL||'http://127.0.0.1:8092';
const get=async demo=>{const r=await fetch(base+'/api/'+demo+'/state');assert.equal(r.status,200);return r.json();};
const token=(await get('temperature')).csrfToken;
async function post(path,expected=200,id=randomUUID()){
  const r=await fetch(base+'/api/'+path,{method:'POST',headers:{'X-SmartStock-Token':token,'X-Command-Id':id}});
  assert.equal(r.status,expected,await r.clone().text());return r.json();
}
async function done(){for(let i=0;i<100;i++){const s=await get('temperature');if(s.executionStatus==='completed')return s;assert.notEqual(s.executionStatus,'error',s.message);await new Promise(r=>setTimeout(r,25));}throw new Error('Temperature run timeout');}
const abort=new AbortController();const stream=await fetch(base+'/api/temperature/events',{signal:abort.signal});assert.match(stream.headers.get('content-type'),/text\/event-stream/);
const reader=stream.body.getReader();let text='';const reading=(async()=>{try{while(true){const r=await reader.read();if(r.done)break;text+=new TextDecoder().decode(r.value);}}catch(e){if(e.name!=='AbortError')throw e;}})();
let s=await post('temperature/reset');const session=s.sessionId;assert.equal(s.temperature,23);assert.equal(s.fanPower,null);assert.equal(s.blackboard[0].term,'temperature(t230)');
assert.equal((await post('temperature/initialize')).sessionId,session);console.log('PASS — température initialisée, session persistante');
const stockBefore=await get('stock');
for(const [temperature,power] of [[15,0],[20,0],[21.9,0],[22,25],[23.9,25],[24,50],[25.9,50],[26,75],[27.9,75],[28,100],[30,100],[35,100],[24,50],[20,0]]){
  const accepted=await post('temperature/apply?value='+temperature);assert.equal(accepted.fanPower,null);assert.equal(accepted.sessionId,session);
  await post('temperature/run');s=await done();
  assert.equal(s.fanPower,power);assert.equal(s.temperature,temperature);assert.equal(s.sessionId,session);assert.equal(s.executionStep,4);
  assert.equal(s.blackboard.some(t=>t.term.startsWith('temperature(')),false);
  assert(s.blackboard.some(t=>t.term===`ventilation(${power})`));assert(s.blackboard.every(t=>!t.term.includes('stock(')));
  console.log(`PASS — vrai Anemone ${temperature} °C → ventilation(${power}), 4 pas`);
}
const stockAfter=await get('stock');assert.deepEqual(stockAfter.blackboard,stockBefore.blackboard);assert.equal(stockAfter.sessionId,stockBefore.sessionId);assert.equal(stockAfter.sequence,stockBefore.sequence);console.log('PASS — isolation des Blackboards et séquences stock/température');
await post('temperature/apply?value=27');s=await post('temperature/step');assert.equal(s.executionStep,1);assert.equal(s.fanPower,null);assert.equal(s.temperaturePresent,true);
await post('temperature/apply?value=25',409);
s=await post('temperature/step');assert.equal(s.temperaturePresent,false);assert.equal(s.blackboard.length,0);
s=await post('temperature/step');assert.equal(s.remainingAgent,'tell(ventilation(fan(t270)))');assert(s.blackboard.some(t=>t.term==='temperature_current(t270)'));
s=await post('temperature/step');assert.equal(s.fanPower,75);assert.equal(s.executionStatus,'completed');console.log('PASS — pas à pas, fan(t270) dans l’AST puis ventilation(75) réelle');
await post('temperature/apply?value=14.9',400);await post('temperature/apply?value=35.1',400);await post('temperature/apply?value=23.55',400);await post('temperature/apply?value=27&code=anything',400);
const id=randomUUID();await post('temperature/apply?value=20',200,id);await post('temperature/apply?value=30',400,id);console.log('PASS — validation des mesures et déduplication liée à la valeur');
const old=s.sessionId;s=await post('temperature/reset');assert.notEqual(s.sessionId,old);assert.equal(s.temperature,23);assert.equal(s.fanPower,null);console.log('PASS — RESET température indépendant');
const noPost=await fetch(base+'/api/shutdown');assert.equal(noPost.status,405);
const noToken=await fetch(base+'/api/shutdown',{method:'POST'});assert.equal(noToken.status,403);
const foreign=await fetch(base+'/api/shutdown',{method:'POST',headers:{'X-SmartStock-Token':token,Origin:'http://evil.invalid'}});assert.equal(foreign.status,403);
await post('shutdown?command=anything',400);
console.log('PASS — arrêt refusé sans POST, sans jeton, origine étrangère ou arguments');
abort.abort();await reading;
const frames=text.split('\n\n').filter(f=>f.includes('event: state')).map(f=>JSON.parse(f.split('\n').find(l=>l.startsWith('data: ')).slice(6)));
assert(frames.length>20);assert(frames.every(s=>s.demoId==='temperature'));assert(frames.some(s=>s.fanPower===100));console.log('PASS — SSE température réel, distinct du stock');
console.log('Tous les tests API température ont réussi.');

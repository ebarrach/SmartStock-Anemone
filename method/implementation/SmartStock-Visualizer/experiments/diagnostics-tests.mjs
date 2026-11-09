import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.SMARTSTOCK_URL||'http://127.0.0.1:8092';
async function read(path){const r=await fetch(base+path);assert.equal(r.status,200);return r.json();}
let token=(await read('/api/state')).csrfToken;
async function command(path){const r=await fetch(base+path,{method:'POST',headers:{'X-SmartStock-Token':token,'X-Command-Id':randomUUID()}});assert.equal(r.status,200,await r.clone().text());return r.json();}
const diag=()=>read('/api/diagnostics');
await command('/api/reset');await command('/api/temperature/reset');
let d=await diag();
assert.equal(d.source,'bridge-runtime');assert(d.runtime.javaVersion);assert.equal(d.runtime.headless,true);
assert.equal(d.runtime.loadedClasses.length,3);
for(const c of d.runtime.loadedClasses){assert.match(c.codeSource,/\.jar$/);assert.match(c.classResource,/^jar:.*!\/ab_/);assert(c.archiveName.endsWith('.jar'));}
assert.equal(d.sessions.stock.blackboardRuntimeClass,'ab_blackboard.ABBlackboard');
assert.equal(d.sessions.temperature.parserRuntimeClass,'ab_parser.AnimBachSimulParser');
assert.equal(d.sessions.stock.executionRuntimeClass,null);assert.equal(d.sessions.temperature.executionCreated,false);
assert.equal(d.sessions.stock.loadedEquationCount,40);assert.equal(d.sessions.stock.loadedSetMemberCount,41);
assert.deepEqual(d.sessions.stock.loadedSetMembers,Array.from({length:41},(_,i)=>String(i)));
assert.equal(d.sessions.temperature.loadedEquationCount,201);assert.equal(d.sessions.temperature.loadedSetMemberCount,201);
assert.equal(d.sessions.temperature.loadedSetMembers[120],'t270');
console.log('PASS — diagnostic runtime : Java/headless, CodeSource du JAR et classes réelles, définitions lues');
const stockBase=d.sessions.stock.runOneCallsSinceProcessStart,tempBase=d.sessions.temperature.runOneCallsSinceProcessStart;
const stockId=d.sessions.stock.state.sessionId,sequence=d.sessions.stock.state.sequence;
await diag();d=await diag();assert.equal(d.sessions.stock.state.sequence,sequence);assert.equal(d.sessions.stock.runOneCallsSinceProcessStart,stockBase);console.log('PASS — lire le diagnostic ne fait pas avancer le moteur');
await command('/api/events/weight');d=await diag();assert.match(d.sessions.stock.lastOperation,/tell\(poids_change/);assert.equal(d.sessions.stock.runOneCallsSinceProcessStart,stockBase);
await command('/api/step');await command('/api/step');d=await diag();
assert.equal(d.sessions.stock.runOneCallsSinceProcessStart,stockBase+2);assert.equal(d.sessions.stock.lastRunOne.success,false);assert.equal(d.sessions.stock.state.executionStatus,'blocked');assert.equal(d.sessions.stock.lastRunOne.sessionId,stockId);assert.equal(d.sessions.stock.ownerThread,'anemone-owner');
assert.match(d.sessions.stock.lastRunOne.agentAfter,/get\(datamatrix_detecte/);console.log('PASS — vrais appels run_one, retour false et continuation observés');
await command('/api/events/datamatrix');
for(let i=0;i<4;i++)await command('/api/step');
d=await diag();assert.equal(d.sessions.stock.lastRunOne.agentAfter,'tell(stock(compresse,pred(40)))');assert.equal(d.sessions.stock.state.stock,null);
await command('/api/step');d=await diag();assert.equal(d.sessions.stock.state.stock,39);assert.equal(d.sessions.stock.runOneCallsSinceProcessStart,stockBase+7);assert.equal(d.sessions.stock.executionRuntimeClass,'ab_simulators.ABSimulExec');assert.equal(d.sessions.stock.lastRunOne.agentBefore,'tell(stock(compresse,pred(40)))');assert.equal(d.sessions.stock.lastRunOne.success,true);console.log('PASS — trace pred(40) exécutée, stock39 provenant du store');
await command('/api/temperature/apply?value=27');for(let i=0;i<3;i++)await command('/api/temperature/step');
d=await diag();assert.equal(d.sessions.temperature.lastRunOne.agentAfter,'tell(ventilation(fan(t270)))');assert.equal(d.sessions.temperature.state.fanPower,null);
await command('/api/temperature/step');d=await diag();assert.equal(d.sessions.temperature.state.fanPower,75);assert.equal(d.sessions.temperature.runOneCallsSinceProcessStart,tempBase+4);assert.equal(d.sessions.temperature.lastRunOne.agentBefore,'tell(ventilation(fan(t270)))');assert.equal(d.sessions.temperature.ownerThread,'temperature-owner');console.log('PASS — trace fan(t270) exécutée, ventilation75 réelle');
const beforeReset=d.sessions.stock.runOneCallsSinceProcessStart;await command('/api/reset');await command('/api/temperature/reset');d=await diag();assert.equal(d.sessions.stock.runOneCallsSinceProcessStart,beforeReset);assert.notEqual(d.sessions.stock.state.sessionId,stockId);assert.equal(d.sessions.stock.lastRunOne.sessionId,stockId);console.log('PASS — compteurs conservés après RESET, sessions de traces distinguées');
assert.equal((await fetch(base+'/api/diagnostics',{method:'POST'})).status,405);assert.equal((await fetch(base+'/api/diagnostics?file=anything')).status,400);assert.equal((await fetch(base+'/api/diagnostics',{headers:{Origin:'http://foreign.invalid'}})).status,403);console.log('PASS — diagnostic en lecture seule et contrôles locaux conservés');

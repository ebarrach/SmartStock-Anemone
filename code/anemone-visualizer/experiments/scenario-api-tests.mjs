import assert from 'node:assert/strict';
const base=process.env.SMARTSTOCK_URL||'http://127.0.0.1:8094';
assert(!['8092','8093'].includes(new URL(base).port),'Keep existing demo instances intact');
const get=async path=>{const r=await fetch(base+path);assert.equal(r.status,200);return r.json();};
const created=new Set();
const token=(await get('/api/state')).csrfToken;
async function post(action,fields,status=200){const r=await fetch(base+'/api/scenarios/'+action,{method:'POST',headers:{'X-SmartStock-Token':token,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});const s=await r.json();assert.equal(r.status,status,JSON.stringify(s));if(action==='validate'&&status===200)created.add(s.sessionId);return s;}
const stock=await get('/api/state'),temperature=await get('/api/temperature/state');
const templates=await get('/api/scenarios/templates');assert.equal(templates.length,3);
const a=await post('validate',{definitions:'',agent:'tell(probe(ok));get(probe(ok));tell(result(done))'});
assert.equal(a.source,'anemone');assert.equal(a.parserClass,'ab_parser.AnimBachSimulParser');assert.deepEqual(a.blackboard,[]);
let s=await post('step',{sessionId:a.sessionId});assert.equal(s.executionStep,1);assert.equal(s.blackboard[0].term,'probe(ok)');
const b=await post('validate',{definitions:'',agent:'tell(other(isolated))'});assert.notEqual(b.sessionId,a.sessionId);
const bad=await post('validate',{sessionId:a.sessionId,definitions:'',agent:'tell('},400);
assert.equal(bad.phase,'agent');assert.equal(bad.parserClass,'ab_parser.AnimBachSimulParser');assert.match(bad.error,/IllegalStateException: Error in parsing agent/);
const badDefs=await post('validate',{definitions:'set Broken = {',agent:'tell(ok)'},400);assert.equal(badDefs.phase,'definitions');assert.match(badDefs.error,/Error in parsing program/);
s=await post('run',{sessionId:a.sessionId,steps:'2'});assert.equal(s.executionStatus,'completed');assert.equal(s.executionStep,3);assert.deepEqual(s.blackboard,[{term:'result(done)',multiplicity:1}]);
s=await post('step',{sessionId:b.sessionId});assert.deepEqual(s.blackboard,[{term:'other(isolated)',multiplicity:1}]);
await post('run',{sessionId:b.sessionId,steps:'101'},400);
for(const template of templates.filter(t=>t.id!=='empty')){
 const v=await post('validate',template);const done=await post('run',{sessionId:v.sessionId,steps:'32'});assert.equal(done.executionStatus,'completed');assert(done.blackboard.some(r=>r.term===(template.id==='stock'?'stock(compresse,39)':'ventilation(75)')));
}
const blocked=await post('validate',{definitions:'',agent:'get(absent)'});s=await post('run',{sessionId:blocked.sessionId,steps:'100'});assert.equal(s.executionStatus,'blocked');assert.equal(s.executionStep,1);
const denied=await fetch(base+'/api/scenarios/validate',{method:'POST',body:'agent=tell(ok)'});assert.equal(denied.status,403);
for(const [path,before] of [['/api/state',stock],['/api/temperature/state',temperature]]){const after=await get(path);assert.deepEqual(after,before);}
for(const sessionId of created)await post('release',{sessionId});
console.log('PASS real JLAMP24 parser: valid/custom + invalid agent + invalid definitions; isolated sessions, templates 40->39 / fan75, bounded run and unchanged demo sessions');

// Executes the compiled Scala.js entrypoint and its actual handlers in jsdom.
// HTTP, SSE and parser results use the real JVM. This is not a screenshot/browser layout test.
import {JSDOM,VirtualConsole} from 'jsdom';
import assert from 'node:assert/strict';
const base=process.env.SMARTSTOCK_URL||'http://127.0.0.1:8094';
assert(!['8092','8093'].includes(new URL(base).port),'Keep existing demo instances intact');
const beforeStock=await(await fetch(base+'/api/state')).json(),beforeTemperature=await(await fetch(base+'/api/temperature/state')).json();
const workspaces=new Set();
const failures=[],requests=[],streams=new Set();let closeAttempts=0,dispose,networkDown=false;
const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('window.close'))failures.push(e.message);});vc.on('error',e=>failures.push(String(e)));
const app=await JSDOM.fromURL(base+'/',{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 dispose=w.close.bind(w);w.close=()=>{closeAttempts++;};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.AbortSignal=AbortSignal;w.matchMedia=()=>({matches:true});
 w.fetch=(path,options)=>{requests.push(String(path));if(networkDown)return Promise.reject(new Error('Test: bridge inaccessible'));return fetch(new URL(path,base),options).then(async r=>{if(String(path).startsWith('/api/workbench/')){const d=await r.clone().json();if(d.workspaceId)workspaces.add(d.workspaceId);}return r;});};
 w.EventSource=class{
  constructor(path){this.abort=new AbortController();this.handlers={};this.closed=false;streams.add(this);this.read(path);}
  addEventListener(type,handler){this.handlers[type]=handler;}
  async read(path){try{const r=await fetch(base+path,{signal:this.abort.signal});const reader=r.body.getReader();let text='';while(!this.closed){const {done,value}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);let end;while((end=text.indexOf('\n\n'))>=0){const frame=text.slice(0,end);text=text.slice(end+2);const data=frame.split('\n').find(l=>l.startsWith('data: '));if(data)this.handlers.state?.({data:data.slice(6)});}}}catch(e){if(!this.closed)this.onerror?.(e);}}
  close(){if(this.closed)return;this.closed=true;streams.delete(this);this.abort.abort();}
 };
}});
const w=app.window,$=id=>w.document.getElementById(id),sel=s=>w.document.querySelector(s);
async function until(fn,label='UI condition'){for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error(label+' timeout; errors='+JSON.stringify(failures));}
async function click(target){const b=typeof target==='string'?$(target):target;await until(()=>b&&!b.disabled,'button enabled');b.click();await new Promise(r=>setTimeout(r,30));}
function input(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
function mode(value){$('mode').value=value;$('mode').dispatchEvent(new w.Event('change',{bubbles:true}));}
const stock=c=>sel(`[data-command="${c}"]`),temp=c=>sel(`[data-temp-command="${c}"]`);
const back=tool=>sel('#wb-view-'+tool+' .wb-back');
const boardRows=()=>[...$('wb-store').querySelectorAll('tbody tr')].map(r=>r.textContent);
function setTerm(t,n='1'){input('wb-term',t);input('wb-multiplicity',n);}
try{
 await until(()=>w.document.documentElement.dataset.interface==='scala-js-laminar');
 await click('nav-scenarios');await click('scenario-workbench-tab');await until(()=>$('wb-session').textContent.includes('Espace '));
 const session=$('wb-session').textContent.match(/Espace ([0-9a-f-]+)/)[1];
 setTerm('k(a,3)','3');await click('wb-tell');await until(()=>boardRows().some(t=>t.includes('k(a,3)3')));
 setTerm('k(a,3)','2');await click('wb-get');await until(()=>boardRows().some(t=>t.includes('k(a,3)1')));
 setTerm('other','1');await click('wb-tell');input('wb-filter','k(?X,3)');await click('wb-filter-apply');await until(()=>boardRows().length===1);
 input('wb-filter','k(');await click('wb-filter-apply');await until(()=>$('wb-filter-error').textContent.includes('Error in parsing'));assert.equal(boardRows().length,1);
 await click('wb-unfilter');await until(()=>boardRows().length===2);await click('wb-clear');await until(()=>boardRows().length===0);
 await click('wb-open-interactive');input('wb-interactive-source','get(t);tell(interdone)');await click('wb-interactive-submit');await until(()=>$('wb-interactive-current').textContent.includes('get(t)'));assert.equal($('wb-interactive-actions').children.length,0);
 await click(back('interactive'));setTerm('t');await click('wb-tell');await click('wb-open-interactive');assert.equal($('wb-interactive-source').value,'get(t);tell(interdone)');
 await click('wb-interactive-refresh');await until(()=>$('wb-action-0')&&!$('wb-action-0').disabled);await click('wb-interactive-abbrev');assert($('wb-interactive-current').textContent.includes('...'));
 await click('wb-action-0');await until(()=>$('wb-action-0')?.textContent.includes('tell(interdone)'));await click('wb-action-0');await until(()=>$('wb-interactive-current').textContent==='Empty agent');
 await click(back('interactive'));assert(boardRows().some(t=>t.includes('interdone')));
 console.log('PASS compiled Blackboard / interactive UI: multiplicities, filters and field errors, native actions, Abbrev and draft/session retained on return');
 await click('wb-open-autonomous');input('wb-autonomous-source','get(interdone);tell(auto1);tell(auto2)');await click('wb-autonomous-submit');await click('wb-autonomous-abbrev');assert($('wb-autonomous-current').textContent.includes('...'));
 await click('wb-next');await until(()=>$('wb-autonomous-status').textContent.includes('1 pas'));await click('wb-run');await until(()=>$('wb-autonomous-status').textContent.includes('completed'));
 await click(back('autonomous'));assert(boardRows().some(t=>t.includes('auto2')));
 await click('wb-open-definitions');input('wb-definitions-source','set Color = {red,blue}. eqn shade(red)=rouge. proc Paint = tell(painted).');await click('wb-definitions-submit');await until(()=>$('wb-definitions-result').textContent.includes('Paint'));
 input('wb-definitions-source','set Broken = {');await click('wb-definitions-submit');await until(()=>$('wb-definitions-error').textContent.includes('Error in parsing program'));assert($('wb-definitions-result').textContent.includes('Paint'));
 await click(back('definitions'));await click('wb-open-model');await click('wb-model-agent-submit');await click('wb-formula-submit');await click('wb-model-check');await until(()=>$('wb-model-status').textContent==='Formula established');assert($('wb-model-trace-result').textContent.includes('tell(goal)'));
 await click('wb-model-trace');await until(()=>$('wb-model-status').textContent.includes('Trace simulée'));await click(back('model'));assert(boardRows().some(t=>t.includes('goal')));
 console.log('PASS compiled autonomous/definitions/Model Checker UI: Next+Run, real parser field error, native result and trace visibly shared with Blackboard');
 await click('wb-open-definitions');input('wb-definitions-source','rule consume = +fuel --> -fuel,+ash .');await click('wb-definitions-submit');await click(back('definitions'));setTerm('fuel','2');await click('wb-tell');
 await click('wb-open-interactive');input('wb-interactive-source','tellr(consume)');await click('wb-interactive-submit');await until(()=>$('wb-action-0'));await click('wb-action-0');await click(back('interactive'));
 await click('wb-open-rules');await click('wb-rules-refresh');await until(()=>$('wb-rule-0'));await click('wb-rule-0');await click('wb-rules-apply');await until(()=>$('wb-rules-status').textContent.includes('appliquée'));
 await click('wb-rules-run');await until(()=>$('wb-rules-status').textContent.includes('aucune règle applicable'));await click(back('rules'));assert(boardRows().some(t=>t.includes('ash2')));assert(!boardRows().some(t=>t.includes('fuel')));
 await click('nav-stock');await until(()=>$('stock').textContent===String(beforeStock.stock));await click('nav-scenarios');assert($('wb-session').textContent.includes(session));await click('wb-open-definitions');assert.equal($('wb-definitions-source').value,'rule consume = +fuel --> -fuel,+ash .');await click(back('definitions'));
 assert.deepEqual(await(await fetch(base+'/api/state')).json(),beforeStock);assert.deepEqual(await(await fetch(base+'/api/temperature/state')).json(),beforeTemperature);
 console.log('PASS compiled Rule Checker: Refresh, select, Apply and Run Rules mutate real store; all five drafts and session survive SmartStock navigation; demos unchanged');
 await click('scenario-editor-tab');input('scenario-definitions','set Imported = {x,y}.');input('scenario-agent','tell(imported)');await click('scenario-workbench-tab');await click('wb-import');await until(()=>!$('wb-session').textContent.includes(session));
 await click('wb-open-autonomous');assert.equal($('wb-autonomous-source').value,'tell(imported)');await click('wb-run');await until(()=>$('wb-autonomous-status').textContent.includes('completed'));await click(back('autonomous'));assert(boardRows().some(t=>t.includes('imported')));
 await click('wb-new');await until(()=>boardRows().length===0);await click('wb-open-autonomous');assert.equal($('wb-autonomous-source').value,'tell(imported)');
 assert.equal(failures.length,0,JSON.stringify(failures));console.log('PASS explicit scenario-draft import, new isolated context and retained drafts; no simulated result');
}finally{
 for(const s of streams)s.close();dispose();
 const token=(await(await fetch(base+'/api/state')).json()).csrfToken;
 for(const workspaceId of workspaces)await fetch(base+'/api/workbench/release',{method:'POST',headers:{'X-SmartStock-Token':token},body:new URLSearchParams({workspaceId})});
}

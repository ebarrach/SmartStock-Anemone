// Executes the compiled Scala.js entrypoint and its actual handlers in jsdom.
// HTTP, SSE and parser results use the real JVM. This is not a screenshot/browser layout test.
import {JSDOM,VirtualConsole} from 'jsdom';
import assert from 'node:assert/strict';
const base=process.env.SMARTSTOCK_URL||'http://127.0.0.1:8094';
assert(!['8092','8093'].includes(new URL(base).port),'Keep existing demo instances intact');
const state=await(await fetch(base+'/api/state')).json();
for(const path of ['/api/reset','/api/temperature/reset'])assert.equal((await fetch(base+path,{method:'POST',headers:{'X-SmartStock-Token':state.csrfToken,'X-Command-Id':crypto.randomUUID()}})).status,200);
const failures=[],requests=[],streams=new Set();let closeAttempts=0,dispose,networkDown=false,delayInitialTemperature=true;
const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('window.close'))failures.push(e.message);});vc.on('error',e=>failures.push(String(e)));
const app=await JSDOM.fromURL(base+'/',{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 dispose=w.close.bind(w);w.close=()=>{closeAttempts++;};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.AbortSignal=AbortSignal;w.matchMedia=()=>({matches:true});
 w.fetch=(path,options)=>{requests.push(String(path));if(networkDown)return Promise.reject(new Error('Test: bridge inaccessible'));const response=fetch(new URL(path,base),options);if(path==='/api/temperature/state'&&delayInitialTemperature){delayInitialTemperature=false;return response.then(r=>new Promise(resolve=>setTimeout(()=>resolve(r),200)));}return response;};
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
try{
 await until(()=>w.document.documentElement.dataset.interface==='scala-js-laminar','compiled Scala.js startup');
 assert.equal(w.document.querySelectorAll('script[src*="app.js"],script[src*="shell.js"]').length,0);
 await until(()=>$('stock').textContent==='40');
 await click(stock('weight'));await click(stock('run'));await until(()=>$('execution-status').textContent==='EN ATTENTE');assert.equal($('stock').textContent,'40');
 await click(stock('datamatrix'));await click(stock('run'));await until(()=>$('stock').textContent==='39');
 assert($('blackboard').textContent.includes('stock(compresse,39)'));console.log('PASS Scala.js live stock: weight blocked -> DataMatrix resumes -> 40 to 39');
 await click('nav-temperature');assert($('temp-number').disabled,'Temperature input waits for first snapshot');assert(temp('apply').disabled,'Apply waits for first snapshot');await until(()=>$('temp-reading').textContent==='23.0'&&!$('temp-number').disabled);input('temp-number','27');assert.equal($('temp-slider').value,'27');
 await click(temp('apply'));await click(temp('run'));await until(()=>$('fan-power').textContent==='75');assert($('temp-blackboard').textContent.includes('ventilation(75)'));
 input('temp-slider','20');assert.equal($('temp-number').value,'20');await click(temp('apply'));await click(temp('run'));await until(()=>$('fan-power').textContent==='0');
 await click('nav-stock');await until(()=>$('stock').textContent==='39');console.log('PASS Scala.js thermal75 -> 0, synchronized inputs and preserved stock');
 await click('nav-scenarios');input('scenario-agent','tell(custom(ok));get(custom(ok));tell(result(done))');
 await click('scenario-validate');await until(()=>$('scenario-status').textContent.includes('· ready'));
 await click('scenario-step');await until(()=>$('scenario-blackboard').textContent.includes('custom(ok)'));
 await click('scenario-run');await until(()=>$('scenario-status').textContent.includes('completed'));assert($('scenario-blackboard').textContent.includes('result(done)'));
 input('scenario-agent','tell(');assert($('scenario-step').disabled);await click('scenario-validate');await until(()=>$('scenario-status').textContent.includes('Error in parsing agent'));assert($('scenario-step').disabled);
 input('scenario-definitions','set Broken = {');input('scenario-agent','tell(ok)');await click('scenario-validate');await until(()=>$('scenario-status').textContent.includes('Error in parsing program'));
 $('scenario-template').value='temperature';await click('scenario-load');assert($('scenario-definitions').value.includes('fan(t270)'));await click('scenario-validate');await until(()=>$('scenario-status').textContent.includes('· ready'));await click('scenario-run');await until(()=>$('scenario-blackboard').textContent.includes('ventilation(75)'));
 await click('nav-stock');await until(()=>$('stock').textContent==='39');await click('nav-temperature');await until(()=>$('fan-power').textContent==='0');console.log('PASS compiled editor: custom steps, true parser errors, existing thermal template, isolated demos');
 await click('nav-diagnostics');await until(()=>!$('diagnostics-content').hidden);assert($('diagnostics-classes').textContent.includes('ab_parser.AnimBachSimulParser'));assert($('diagnostics-sessions').textContent.includes('run_one'));
 await click('nav-stock');mode('demo');await until(()=>$('stock').textContent==='40');await click(stock('weight'));await click(stock('datamatrix'));await click(stock('run'));await until(()=>$('stock').textContent==='39');
 await click('nav-temperature');mode('demo');await click('temp-auto');await until(()=>$('temp-reading').textContent==='24.0'&&$('fan-power').textContent==='50');
 await click('nav-stock');assert.equal($('mode').value,'demo');assert.equal($('stock').textContent,'39');console.log('PASS explicit simulation only: independent Demo sources, automatic thermal demo and navigation');
 networkDown=true;mode('anemone');await until(()=>!$('error').hidden);assert.equal($('stock').textContent,'—');assert($('mode-label').textContent.includes('MOTEUR RÉEL'));assert($('error').textContent.includes('Aucune simulation'));
 networkDown=false;await until(()=>$('stock').textContent==='39'&&streams.size>0);console.log('PASS Scala.js unavailable bridge: explicit error, no simulated fallback, HTTP/SSE recovery');
 await click('quit-app');assert($('quit-dialog').open);await click('quit-cancel');assert(!$('quit-dialog').open);assert(!requests.includes('/api/shutdown'));
 assert.equal(failures.length,0,JSON.stringify(failures));
 if(process.env.TEST_SHUTDOWN==='1'){
  await click('quit-app');await click('quit-confirm');await until(()=>!$('stopped-page').hidden);await until(()=>streams.size===0);
 await new Promise(r=>setTimeout(r,1300));await assert.rejects(fetch(base+'/api/state'));assert.equal(closeAttempts,1);console.log('PASS Scala.js confirmed shutdown: SSE closed, JVM unreachable');
 }
 console.log('PASS compiled Scala.js UI; real engine and explicit Demo checks distinguished');
}finally{for(const s of streams)s.close();dispose();}

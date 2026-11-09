// Executes the actual frontend event handlers with a small DOM contract double.
// This tests navigation/commands/quit logic, not browser rendering or CSS layout.
import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
const base=process.env.SMARTSTOCK_URL||'http://127.0.0.1:8096';
const resetToken=(await(await fetch(base+'/api/state')).json()).csrfToken;
for(const path of ['/api/reset','/api/temperature/reset'])assert.equal((await fetch(base+path,{method:'POST',headers:{'X-SmartStock-Token':resetToken,'X-Command-Id':crypto.randomUUID()}})).status,200);
const html=fs.readFileSync('experiments/fixtures/legacy-web/index.html','utf8');
const nodes=[],ids=new Map();
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.style={};this.hidden=false;this.disabled=false;this.value='';this.attributes={};this._text={textContent:''};this.classes=new Set();this.classList={add:n=>this.classes.add(n),remove:n=>this.classes.delete(n),toggle:(n,on)=>{const enable=on??!this.classes.has(n);enable?this.classes.add(n):this.classes.delete(n);return enable;},contains:n=>this.classes.has(n)};nodes.push(this);}
  set id(value){this._id=value;ids.set(value,this);}get id(){return this._id;}
  set className(value){this.classes=new Set(value.split(/\s+/));}get className(){return [...this.classes].join(' ');}
  set textContent(value){this.children=[];this._text.textContent=String(value);}get textContent(){return this.children.length?this.children.map(c=>c.textContent).join(''):this._text.textContent;}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}}prepend(c){c.parent=this;this.children.unshift(c);}
  replaceChildren(...children){this.children=[];this._text.textContent='';this.append(...children);}get lastChild(){return this.children.at(-1);}get firstChild(){return this.children[0]||this._text;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  async event(name){for(const fn of this.listeners[name]||[])await fn({target:this});}
  async click(){assert(!this.disabled,`Control disabled: ${this.id||JSON.stringify(this.dataset)}`);await this.event('click');}
  showModal(){this.open=true;}close(){this.open=false;}reportValidity(){return this.value!==''&&Number(this.value)>=Number(this.min)&&Number(this.value)<=Number(this.max);}
}
for(const match of html.matchAll(/<([a-z][a-z0-9-]*)(\s[^>]*?)?>/g)){
  const e=new Element(match[1]),attrs=match[2]||'';
  for(const a of attrs.matchAll(/([\w-]+)="([^"]*)"/g)){const [_,key,value]=a;if(key==='id')e.id=value;else if(key==='class')e.className=value;else if(key.startsWith('data-'))e.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;else e[key]=value;}
  e.hidden=/(?:^|\s)hidden(?:\s|$)/.test(attrs);
}
const select=selector=>nodes.filter(e=>selector.startsWith('.')?e.classes.has(selector.slice(1)):selector==='[data-command]'?e.dataset.command!==undefined:selector==='[data-temp-command]'?e.dataset.tempCommand!==undefined:false);
const $=id=>{assert(ids.has(id),'Missing element '+id);return ids.get(id);};
const streams=new Set();let closedStreams=0,shutdownRequests=0,closeAttempts=0;
class EventSourceDouble{
  constructor(path){this.handlers={};this.abort=new AbortController();streams.add(this);this.closed=false;this.read(path);}
  addEventListener(type,handler){this.handlers[type]=handler;}
  async read(path){try{const r=await fetch(base+path,{signal:this.abort.signal});const reader=r.body.getReader();let text='';while(!this.closed){const {done,value}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);let end;while((end=text.indexOf('\n\n'))>=0){const frame=text.slice(0,end);text=text.slice(end+2);const data=frame.split('\n').find(l=>l.startsWith('data: '));if(data)this.handlers.state?.({data:data.slice(6)});}}}catch(e){if(!this.closed)this.onerror?.(e);}}
  close(){if(this.closed)return;this.closed=true;closedStreams++;streams.delete(this);this.abort.abort();}
}
const context={console,Date,crypto:globalThis.crypto,AbortSignal,location:{protocol:'http:'},document:{getElementById:$,createElement:tag=>new Element(tag),querySelectorAll:select,querySelector:s=>select(s)[0]},setTimeout:(fn,ms)=>setTimeout(fn,ms===200?200:Math.min(ms,5)),clearTimeout,setInterval,clearInterval,requestAnimationFrame:fn=>setTimeout(()=>fn(performance.now()),16),cancelAnimationFrame:clearTimeout,EventSource:EventSourceDouble,matchMedia:()=>({matches:true}),fetch:(path,options)=>{if(path==='/api/shutdown')shutdownRequests++;return fetch(base+path,options);},close:()=>closeAttempts++};
context.window=context;context.AbortController=AbortController;vm.createContext(context);
for(const file of ['data-sources/anemone.js','data-sources/demo.js','temperature-settings.js','data-sources/temperature-demo.js','app.js','fans.js','temperature.js','diagnostics.js','shell.js'])vm.runInContext(fs.readFileSync('experiments/fixtures/legacy-web/js/'+file,'utf8'),context,{filename:file});
async function until(fn){for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('UI condition timeout');}
const stockButton=c=>nodes.find(e=>e.dataset.command===c),tempButton=c=>nodes.find(e=>e.dataset.tempCommand===c);
await until(()=>$('stock').textContent==='40');
await stockButton('weight').click();await stockButton('datamatrix').click();await stockButton('run').click();await until(()=>$('stock').textContent==='39');console.log('PASS — contrôleur stock réel, compteur39');
await $('nav-temperature').click();assert.equal(context.SmartStockNavigation.current(),'temperature');assert($('stock-view').hidden);assert(!$('temperature-view').hidden);await until(()=>$('temp-reading').textContent==='23.0');
$('temp-number').value='27';await $('temp-number').event('input');assert.equal(String($('temp-slider').value),'27');await tempButton('apply').click();await tempButton('run').click();await until(()=>$('fan-power').textContent==='75');assert($('temp-blackboard').textContent.includes('ventilation(75)'));console.log('PASS — navigation température, saisie et vraie décision75');
await $('nav-stock').click();await until(()=>$('stock').textContent==='39');assert(!$('stock-view').hidden);assert($('temperature-view').hidden);console.log('PASS — retour stock sans mélange et sans perte de session');
$('mode').value='demo';await $('mode').event('change');await stockButton('weight').click();await stockButton('datamatrix').click();await stockButton('run').click();assert.equal($('stock').textContent,'39');assert($('mode-label').textContent.includes('SIMULÉES'));
await $('nav-temperature').click();$('mode').value='demo';await $('mode').event('change');await $('temp-auto').click();assert.equal($('temp-reading').textContent,'24.0');assert.equal($('fan-power').textContent,'50');assert($('temp-board-title').textContent.includes('simulé'));
await $('nav-stock').click();assert.equal($('stock').textContent,'39');assert.equal($('mode').value,'demo');console.log('PASS — deux modes Demo autonomes, automatique température, états conservés');
await $('nav-diagnostics').click();await until(()=>!$('diagnostics-content').hidden);
assert($('diagnostics-status').textContent.includes('CONNECTÉ'));assert($('diagnostics-classes').textContent.includes('ab_blackboard.ABBlackboard'));assert($('diagnostics-sessions').textContent.includes('Appels run_one'));assert(select('.mode-control')[0].hidden);
await $('nav-stock').click();assert.equal($('mode').value,'demo');assert(!select('.mode-control')[0].hidden);assert.equal($('stock').textContent,'39');console.log('PASS — diagnostic réel depuis Demo, aucune perte d’état à son ouverture');
await $('quit-app').click();assert($('quit-dialog').open);await $('quit-cancel').click();assert(!$('quit-dialog').open);assert.equal(shutdownRequests,0);assert.equal((await fetch(base+'/api/state')).status,200);console.log('PASS — annulation Quitter, aucune requête d’arrêt');
// Open a real stream before testing confirmation and actual process shutdown.
$('mode').value='anemone';await $('mode').event('change');await until(()=>streams.size>0);const before=closedStreams;
await $('quit-app').click();await $('quit-confirm').click();assert.equal(shutdownRequests,1);assert.equal(streams.size,0);assert(closedStreams>before);assert(!$('stopped-page').hidden);assert(select('.shell')[0].hidden);assert.equal(closeAttempts,1);await assert.rejects(fetch(base+'/api/state',{signal:AbortSignal.timeout(1000)}));
console.log('PASS — confirmation Quitter, SSE fermé, Bridge inaccessible, page finale et window.close tenté');
console.log('Contrats UI validés (sans rendu navigateur).');

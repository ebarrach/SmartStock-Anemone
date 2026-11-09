import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// The simulation is executed with networking forbidden, independently of any server.
const demo={window:{},setTimeout:(fn)=>{fn();return 1;},clearTimeout(){},fetch(){throw new Error('Network forbidden');},console};
vm.createContext(demo);vm.runInContext(fs.readFileSync('experiments/fixtures/legacy-web/js/data-sources/demo.js','utf8'),demo);
const snapshots=[];const ds=new demo.window.DemoDataSource(s=>snapshots.push(s),()=>{});ds.connect();
for(let cycle=0;cycle<2;cycle++){await ds.command('weight');await ds.command('datamatrix');await ds.command('run');}
assert.equal(snapshots.at(-1).stock,38);assert.equal(snapshots.at(-1).confirmationMultiplicity,2);assert(snapshots.every(s=>s.source==='demo'));ds.disconnect();
console.log('PASS G — Demo indépendant, réseau interdit, 40 → 39 → 38');
// Real adapter with an unavailable bridge must emit no fabricated state.
const failures=[],states=[];const real={window:{},location:{protocol:'http:'},AbortSignal,setInterval,clearInterval,fetch:async()=>{throw new Error('Bridge stopped');},console};
vm.createContext(real);vm.runInContext(fs.readFileSync('experiments/fixtures/legacy-web/js/data-sources/anemone.js','utf8'),real);
const anemone=new real.window.AnemoneDataSource(s=>states.push(s),(ok,message)=>failures.push({ok,message}));await anemone.connect();
assert.equal(states.length,0);assert(failures.some(x=>!x.ok&&x.message.includes('indisponible')));anemone.disconnect();
console.log('PASS H — Bridge indisponible : erreur explicite, aucun état simulé');
const accepted=[];const restart=new real.window.AnemoneDataSource(s=>accepted.push(s),()=>{});
restart.accept({source:'anemone',engineInstanceId:'first',sequence:50});
restart.accept({source:'anemone',engineInstanceId:'first',sequence:49});
restart.accept({source:'anemone',engineInstanceId:'second',sequence:1});
assert.equal(accepted.length,2);assert.equal(accepted.at(-1).sequence,1);restart.disconnect();
console.log('PASS — nouvelle JVM acceptée, anciennes séquences ignorées');
// Syntax check all browser scripts without third-party packages.
for(const file of ['experiments/fixtures/legacy-web/js/app.js','experiments/fixtures/legacy-web/js/data-sources/demo.js','experiments/fixtures/legacy-web/js/data-sources/anemone.js'])new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
console.log('PASS — syntaxe JavaScript');

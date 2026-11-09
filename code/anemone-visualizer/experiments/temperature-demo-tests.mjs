import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
const context={console,setTimeout:fn=>{fn();return 1;},fetch(){throw new Error('Network forbidden');}};context.window=context;vm.createContext(context);
for(const file of ['experiments/fixtures/legacy-web/js/temperature-settings.js','experiments/fixtures/legacy-web/js/data-sources/temperature-demo.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const frames=[];const source=new context.TemperatureDemoDataSource(s=>frames.push(s),()=>{});source.connect();
const session=frames.at(-1).sessionId;
for(const [value,power] of [[20,0],[23,25],[25,50],[27,75],[30,100],[24,50]]){await source.command('apply',value);await source.command('run');assert.equal(frames.at(-1).fanPower,power);assert.equal(frames.at(-1).sessionId,session);}
assert(frames.every(s=>s.source==='demo'));source.disconnect();source.connect();assert.equal(frames.at(-1).fanPower,50);source.disconnect();console.log('PASS — Demo température autonome, montée/descente et conservation après navigation');
for(const file of ['experiments/fixtures/legacy-web/js/shell.js','experiments/fixtures/legacy-web/js/temperature.js','experiments/fixtures/legacy-web/js/fans.js','experiments/fixtures/legacy-web/js/data-sources/temperature-demo.js'])new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});console.log('PASS — syntaxe des scripts V2');

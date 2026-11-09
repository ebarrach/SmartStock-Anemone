import {projectTree,repositoryRoot} from './update-structure.mjs';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const protectedFiles={
  'anemone-scenarios/smartstock-procedure-original.txt':'213E03C7EC85BBEB12C0101D545D72E66994F8F33E359D4C588E93F8BF5E4A87',
  'anemone-scenarios/smartstock-schema-original.txt':'0C61933B85E644A2ECC654FFD9D65A216EF0D2E34CC76BA2B237EDC740C0507A'
};
for(const [file,expected] of Object.entries(protectedFiles))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),expected,file);
console.log('PASS — modèles originaux historiques inchangés (SHA-256)');
const docs=['README.md','JLAMP24_TOOLS.md',...['procedure-datamatrix','schema-datamatrix','procedure-temperature','schema-temperature'].map(s=>'anemone-scenarios/smartstock-'+s+'.txt')];
for(const file of docs){assert(fs.existsSync(file),file);assert(!/\[\[[A-Z_]+\]\]/.test(read(file)),file+' contains unfilled placeholder');}
for(const file of docs.filter(f=>f.includes('datamatrix')))assert(!/nfc_detecte|\bNFC\b/i.test(read(file)),file);
const stock=read('anemone-scenarios/smartstock-procedure-datamatrix.txt');
const stockDefs=read('anemone-scenarios/connected/definitions.anemone').trim();
assert(stock.includes(stockDefs.split('\n')[0]));assert(stock.includes(stockDefs.split('\n').slice(1).join('\n')));
assert(stock.includes(read('anemone-scenarios/connected/withdrawal.anemone').trim()));
const temperature=read('anemone-scenarios/smartstock-procedure-temperature.txt');
assert(temperature.includes(read('anemone-scenarios/temperature/definitions.anemone').trim()));
assert(temperature.includes(read('anemone-scenarios/temperature/regulation.anemone').trim()));
for(const [t,p] of [[200,0],[230,25],[250,50],[270,75],[300,100],[240,50]])assert(temperature.includes(`fan(t${t})=${p}`));
console.log('PASS — six TXT présents, aucun ancien événement dans les documents Data Matrix, blocs exécutables exacts');
if(process.argv.includes('--refresh-tree'))fs.writeFileSync(path.join(repositoryRoot,'structure.txt'),projectTree(),'utf8');
assert.equal(read(path.join(repositoryRoot,'structure.txt')),projectTree(),'Arborescence à actualiser : node experiments/update-structure.mjs');
assert(read(path.join(repositoryRoot,'README.md')).startsWith('# Anémone Visualizer'));
const launcher=read('bridge/start.ps1');
assert(launcher.includes("'Anémone/root-assembly-0.1.0-SNAPSHOT.jar'"),'JAR local relatif requis');
assert(!launcher.includes('Downloads')&&!launcher.includes('SmartStock-Visualizer'),'Aucune dépendance au dossier historique');
assert(launcher.includes('Join-Path $PSScriptRoot')&&launcher.includes('smartstock.root=$appRoot'));
assert(read(path.join(repositoryRoot,'.gitignore')).includes('/code/Anémone/*.jar'),'JAR local ignoré');
console.log('PASS — lanceur autonome, JAR local ignoré, arborescence réelle');
for(const p of ['bridge/src/main/java/smartstock/anemone/AnemoneSession.java','bridge/src/main/java/smartstock/anemone/TemperatureEngineSession.java'])assert(read(p).includes('evidence.beforeRun(ast, sessionId, executionId)'));
console.log('PASS — instrumentation présente aux appels moteur');

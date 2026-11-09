import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const protectedFiles={
  'anemone-scenarios/smartstock-procedure-original.txt':'213E03C7EC85BBEB12C0101D545D72E66994F8F33E359D4C588E93F8BF5E4A87',
  'anemone-scenarios/smartstock-schema-original.txt':'0C61933B85E644A2ECC654FFD9D65A216EF0D2E34CC76BA2B237EDC740C0507A',
  'Anemone.bat':'DD9DE4D50D182DDF3ACFB8044C467EA698CB9477DFD529B5D59716D0B43C1E01'
};
for(const [file,expected] of Object.entries(protectedFiles))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),expected,file);
console.log('PASS — originaux historiques et launcher inchangés (SHA-256)');
const docs=['notes/ARCHITECTURE-SMARTSTOCK.txt','notes/DOCUMENTATION-INDEX.txt',...['procedure-datamatrix','schema-datamatrix','procedure-temperature','schema-temperature'].map(s=>'anemone-scenarios/smartstock-'+s+'.txt')];
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
export function projectTree(){
  // Describe versionable sources, independent of .git, IDE files and generated builds.
  const files=execFileSync('git',['-c','core.quotepath=false','ls-files','--cached','--others','--exclude-standard','--','.'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const tree={};
  for(const file of files){let branch=tree;for(const part of file.replaceAll('\\','/').split('/'))branch=branch[part]??={};}
  const lines=['SmartStock-Visualizer/'];
  function walk(branch,indent){for(const name of Object.keys(branch).sort()){const dir=Object.keys(branch[name]).length>0;lines.push(indent+'+-- '+name+(dir?'/':''));if(dir)walk(branch[name],indent+'    ');}}
  walk(tree,'    ');return lines.join('\n');
}
let arch=read('notes/ARCHITECTURE-SMARTSTOCK.txt');
if(process.argv.includes('--refresh-tree')){
  const begin=arch.indexOf('SmartStock-Visualizer/\n'),end=arch.indexOf('\n\nRÔLE DES DOSSIERS',begin);
  assert(begin>=0&&end>begin,'Tree block not found');
  arch=arch.slice(0,begin)+projectTree()+arch.slice(end);fs.writeFileSync('notes/ARCHITECTURE-SMARTSTOCK.txt',arch,'utf8');
}
assert(arch.startsWith('SMARTSTOCK VISUALIZER\nARCHITECTURE COMPLÈTE DU PROJET'));
assert(arch.includes(projectTree()),'Arborescence réelle modifiée : actualiser le relevé dans ARCHITECTURE-SMARTSTOCK.txt');
for(const p of ['bridge/src/main/java/smartstock/anemone/AnemoneSession.java','bridge/src/main/java/smartstock/anemone/TemperatureEngineSession.java'])assert(read(p).includes('evidence.beforeRun(ast, sessionId, executionId)'));
console.log('PASS — arborescence TXT identique au relevé réel et instrumentation présente aux appels moteur');

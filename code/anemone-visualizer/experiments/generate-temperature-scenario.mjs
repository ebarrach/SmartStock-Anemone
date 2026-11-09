// Preparation of explicit Anemone equations, NOT a runtime decision engine.
// Edit config/temperature-policy.json, run this script, then restart SmartStock.
import fs from 'node:fs';
import crypto from 'node:crypto';
const raw=fs.readFileSync('config/temperature-policy.json');
const p=JSON.parse(raw);
if(p.step!==0.1||p.min>=p.max||p.initial<p.min||p.initial>p.max||p.bands[0].from!==p.min)throw new Error('Invalid range');
for(let i=0;i<p.bands.length;i++)if(![0,25,50,75,100].includes(p.bands[i].power)||(i&&p.bands[i].from<=p.bands[i-1].from))throw new Error('Invalid bands');
const min=Math.round(p.min*10),max=Math.round(p.max*10),atoms=[],eqns=[];
for(let t=min;t<=max;t++){
  atoms.push('t'+t);
  const band=p.bands.filter(b=>t>=Math.round(b.from*10)).at(-1);
  eqns.push(`fan(t${t})=${band.power}.`);
}
const definitions=`eset Temperatures = {${atoms.join(',')}}.\neqn\n${eqns.join('\n')}\n`;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync('anemone-scenarios/temperature',{recursive:true});
fs.writeFileSync('anemone-scenarios/temperature/definitions.anemone',definitions);
fs.writeFileSync('anemone-scenarios/temperature/regulation.anemone','sum q in Temperatures: get(temperature(q));tell(temperature_current(q));tell(ventilation(fan(q)))\n');
fs.writeFileSync('anemone-scenarios/temperature/metadata.properties',`minTenths=${min}\nmaxTenths=${max}\ninitialTenths=${Math.round(p.initial*10)}\npolicySha256=${hash(raw)}\ndefinitionsSha256=${hash(Buffer.from(definitions))}\n`);
fs.writeFileSync('web/js/temperature-settings.js','// Generated from config/temperature-policy.json. Real mode uses Anemone equations, never this table.\nwindow.TemperatureSettings = '+JSON.stringify(p,null,2)+';\n');
console.log('Generated explicit Anemone equations and Demo/display settings. No Anemone execution.');

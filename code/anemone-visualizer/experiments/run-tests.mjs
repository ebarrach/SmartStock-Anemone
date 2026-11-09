import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const offline=['data-source-tests','temperature-demo-tests','documentation-tests'];
const full=['workbench-api-tests','workbench-ui-tests','scenario-api-tests','scalajs-ui-tests','api-tests','temperature-api-tests','diagnostics-tests',...offline,'ui-contract-tests'];
const tests=process.argv.includes('--offline')?offline:full;
const env={...process.env,SMARTSTOCK_URL:process.env.SMARTSTOCK_URL||'http://127.0.0.1:8096',TEST_SHUTDOWN:'0'};
if(!process.argv.includes('--offline'))console.log('Tests réels sur '+env.SMARTSTOCK_URL+' ; ui-contract-tests arrêtera CETTE instance en dernier.');
for(const test of tests){const r=spawnSync(process.execPath,['experiments/'+test+'.mjs'],{cwd:app,env,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}

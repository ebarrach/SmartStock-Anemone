import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export function projectTree(){
 const files=execFileSync('git',['-c','core.quotepath=false','ls-files','-z','--cached','--others','--exclude-standard'],{cwd:repositoryRoot,encoding:'utf8'}).split('\0').filter(p=>p&&fs.existsSync(path.join(repositoryRoot,p)));
 const tree={};
 for(const file of files){let node=tree;for(const part of file.replaceAll('\\','/').split('/'))node=node[part]??={};}
 const lines=['Arborescence des sources (caches, IDE et .git exclus).','Le JAR et le carnet sont locaux, non versionnés.','','SmartStock-Anemone/'];
 function walk(node,indent){for(const name of Object.keys(node).sort()){const dir=Object.keys(node[name]).length>0;lines.push(indent+name+(dir?'/':''));if(dir)walk(node[name],indent+'    ');}}
 walk(tree,'    ');
 lines.push('','Dépendances et notes locales (non versionnées) :','    code/Anémone/root-assembly-0.1.0-SNAPSHOT.jar [à fournir après clone]','    carnet-de-bord/ [facultatif, contenu privé conservé]');
 return lines.join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 fs.writeFileSync(path.join(repositoryRoot,'structure.txt'),projectTree(),'utf8');console.log('structure.txt actualisé');
}

/** Diagnostics always use the real local Bridge, never a DemoDataSource. */
window.createDiagnosticsController = () => {
  const $=id=>document.getElementById(id);
  let active=false,timer,abort,generation=0;
  function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e;}
  function values(target,rows){target.replaceChildren();for(const [label,value] of rows)target.append(element('dt',label),element('dd',value===null||value===undefined?'Non disponible / pas encore créé':value));}
  function show(report){
    const runtime=report.runtime,sessions=report.sessions;
    const connected=Object.values(sessions).every(s=>s.active)&&runtime.loadedClasses.length===3;
    $('diagnostics-status').textContent=connected?'ANEMONE — CONNECTÉ ✓ · observations reçues du Bridge Java':'Bridge joignable · vérifier les sessions ci-dessous';
    $('diagnostics-error').hidden=true;$('diagnostics-content').hidden=false;
    values($('diagnostics-runtime'),[['Bridge','Java · processus répondant à GET /api/diagnostics'],['JVM observée',runtime.javaVersion+' · '+runtime.javaVendor],['Machine virtuelle',runtime.vmName],['Headless effectif',String(runtime.headless)],['Propriété java.awt.headless',runtime.headlessProperty],['Durée de vie du processus',Math.round(runtime.uptimeMillis/1000)+' s'],['Échantillon',report.sampledAt]]);
    $('diagnostics-classes').replaceChildren();
    for(const c of runtime.loadedClasses){const block=element('div',undefined,'diagnostic-class');block.append(element('strong',c.className));const dl=element('dl',undefined,'diagnostic-values');values(dl,[['Archive observée',c.archiveName],['Origine CodeSource',c.codeSource],['Ressource .class',c.classResource],['ClassLoader',c.classLoader]]);block.append(dl);$('diagnostics-classes').append(block);}
    values($('diagnostics-config'),[['Fichier de configuration',report.configuration.propertiesFile],['Chemin déclaré dans ce fichier',report.configuration.jarPathInPropertiesFile],['Portée',report.configuration.note]]);
    $('diagnostics-sessions').replaceChildren();
    for(const [name,evidence] of Object.entries(sessions)){
      const s=evidence.state,panel=element('section',undefined,'panel diagnostic-section');panel.append(element('h2',name==='stock'?'Session stock':'Session température'));
      const dl=element('dl',undefined,'diagnostic-values');values(dl,[['Session active',evidence.active?'OUI':'NON'],['Identifiant session',s.sessionId],['Thread propriétaire',evidence.ownerThread],['Blackboard réel',evidence.blackboardRuntimeClass],['Identité JVM du Blackboard',evidence.blackboardIdentityHash],['Parseur réel',evidence.parserRuntimeClass],['Moteur instancié',evidence.executionRuntimeClass],['État / pas courant',s.executionStatus+' / '+s.executionStep],['Appels run_one depuis démarrage',evidence.runOneCallsSinceProcessStart],['Équations réellement chargées',evidence.loadedEquationCount],['Ensemble réellement chargé',evidence.setName+' · '+evidence.loadedSetMemberCount+' membres'],['Dernière opération instrumentée',evidence.lastOperation],['Horodatage opération',evidence.lastOperationAt]]);panel.append(dl);
      const members=element('details');members.append(element('summary','Membres réellement chargés'),element('pre',evidence.loadedSetMembers.join(', ')));panel.append(members);
      const proof=element('details');proof.append(element('summary','Dernier appel réel run_one · AST avant / après'));proof.append(element('pre',evidence.lastRunOne?JSON.stringify(evidence.lastRunOne,null,2):'Aucun appel run_one depuis le démarrage du processus.'));panel.append(proof);
      const ast=element('details');ast.append(element('summary','Agent restant actuel'),element('pre',s.remainingAgent||'Agent terminé.'));panel.append(ast);
      panel.append(element('h3','BLACKBOARD ACTUEL'),element('pre',s.blackboard.length?s.blackboard.map(row=>row.term+' ['+row.multiplicity+']').join('\n'):'VIDE'));
      const link=element('button',name==='stock'?'Ouvrir la Démo 01':'Ouvrir la Démo 02');link.addEventListener('click',()=>SmartStockNavigation.navigate(name));panel.append(link);$('diagnostics-sessions').append(panel);
    }
    $('diagnostics-scope').textContent=report.scope;$('session-label').textContent='Diagnostic runtime · '+new Date(report.sampledAt).toLocaleTimeString('fr-FR');
  }
  async function refresh(){
    const current=generation;abort?.abort();abort=new AbortController();
    if(active)$('diagnostics-status').textContent='Lecture du Bridge en cours… connexion à confirmer';
    try{
      if(location.protocol==='file:')throw new Error('Ouvrir cette page via le serveur local pour accéder au diagnostic.');
      const response=await fetch('/api/diagnostics',{cache:'no-store',signal:abort.signal});if(!response.ok)throw new Error('HTTP '+response.status);
      const report=await response.json();if(active&&current===generation)show(report);
    }catch(e){if(active&&current===generation&&e.name!=='AbortError'){$('diagnostics-status').textContent='DIAGNOSTIC INDISPONIBLE · aucune connexion moteur confirmée';$('diagnostics-error').hidden=false;$('diagnostics-error').textContent=e.message;$('diagnostics-content').hidden=true;}}
  }
  $('diagnostics-refresh').addEventListener('click',refresh);
  return {activate(){active=true;generation++;$('diagnostics-content').hidden=true;$('diagnostics-error').hidden=true;$('diagnostics-status').textContent='Vérification du processus Java…';refresh();timer=setInterval(refresh,2000);},deactivate(){active=false;generation++;clearInterval(timer);abort?.abort();},isBusy(){return false;}};
};

window.createStockController = () => {
  const $=id=>document.getElementById(id);
  let source, demoSource, active=false, mode='anemone', state, session, lastStock, lastCycle, confirmedCycle, pending=false, automatic=false, generation=0;
  const labels={ready:'PRÊT',running:'EN COURS',paused:'EN PAUSE',blocked:'EN ATTENTE',completed:'TERMINÉ',error:'ERREUR'};
  function log(message,timestamp){const li=document.createElement('li'),time=document.createElement('time'),text=document.createElement('span');time.textContent=new Date(timestamp||Date.now()).toLocaleTimeString('fr-FR');text.textContent=message;li.append(time,text);$('journal').prepend(li);while($('journal').children.length>70)$('journal').lastChild.remove();}
  function animate(name){$('scene').classList.remove(name);void $('scene').offsetWidth;$('scene').classList.add(name);setTimeout(()=>$('scene').classList.remove(name),2500);}
  function update(s){
    if(!active||s.source!==mode)return;
    if(session!==s.sessionId){session=s.sessionId;lastStock=undefined;lastCycle=undefined;confirmedCycle=undefined;$('journal').replaceChildren();$('stock-transition').textContent='Nouvelle session · état initial';}
    const previous=state;state=s;
    if(lastCycle!==s.executionId){lastCycle=s.executionId;confirmedCycle=undefined;}
    if(s.observationGap)log('Resynchronisation : des étapes intermédiaires peuvent manquer au journal.',s.timestamp);
    log(s.message,s.timestamp);
    if(s.stock!==null){
      $('stock').textContent=s.stock;
      if(lastStock!==undefined&&lastStock!==s.stock){$('stock-transition').textContent=`${lastStock} → ${s.stock} · ${mode==='anemone'?'valeurs Anemone':'simulation'}`;$('stock').classList.remove('stock-pulse');void $('stock').offsetWidth;$('stock').classList.add('stock-pulse');}
      else if(lastStock===undefined)$('stock-transition').textContent=mode==='anemone'?'Valeur lue dans Anemone':'Valeur simulée';
      lastStock=s.stock;
    }else{$('stock').textContent='…';$('stock-transition').textContent=s.stockStatus==='inconsistent'?'État de stock incohérent':'Transition moteur · stock consommé';}
    $('weight-card').classList.toggle('detected',s.observations.weightDetected);
    $('matrix-card').classList.toggle('detected',s.observations.dataMatrixDetected);
    $('weight-label').textContent=s.observations.weightDetected?'Changement de poids détecté ✓':'En attente…';
    $('matrix-label').textContent=s.observations.dataMatrixDetected?'Data Matrix détecté ✓':'En attente…';
    if(s.eventType==='datamatrix')animate('scanning');
    const confirmed=s.observations.withdrawalConfirmed;
    $('confirmation').classList.toggle('confirmed',confirmed);
    $('confirmation-label').textContent=confirmed?'RETRAIT CONFIRMÉ ✓':'En attente de validation';
    $('confirmation-detail').textContent=confirmed?`${s.confirmationMultiplicity} confirmation(s) ${mode==='anemone'?'dans le store réel':'simulée(s)'}`:mode==='anemone'?'L’agent Anemone prend la décision.':'Simulation indépendante du moteur.';
    if(confirmed&&confirmedCycle!==s.executionId){confirmedCycle=s.executionId;animate('withdraw');}
    $('execution-status').textContent=labels[s.executionStatus]||s.executionStatus;
    $('step-label').textContent='Pas moteur : '+s.executionStep;
    $('narrative').textContent=s.executionStatus==='blocked'?'Agent en attente · continuation conservée':confirmed?'Retrait de Deborah confirmé':s.observations.weightDetected||s.observations.dataMatrixDetected?'Deborah retire une boîte de compresses':'Prête pour un nouveau retrait';
    const board=$('blackboard');board.replaceChildren();
    for(const row of s.blackboard){const line=document.createElement('div'),term=document.createElement('span'),count=document.createElement('span');line.className='term-row';term.textContent=row.term;count.textContent='['+row.multiplicity+']';line.append(term,count);board.append(line);}
    if(!s.blackboard.length){const p=document.createElement('p');p.className='empty-store';p.textContent='Store vide';board.append(p);}
    $('term-count').textContent=s.blackboard.length+' TERMES';$('remaining-agent').textContent=s.remainingAgent||'Agent terminé.';
    $('session-label').textContent='Session '+s.sessionId.slice(0,8)+' · #'+s.sequence;
    updateControls();
  }
  function connection(ok,message){if(!active)return;$('connection').textContent=message;$('mode-banner').classList.toggle('unavailable',!ok);if(!ok&&mode==='anemone'){$('error').hidden=false;$('error').textContent='Moteur Anemone indisponible. Aucune simulation ne remplace ses données.';}else $('error').hidden=true;}
  function updateControls(){if(!active)return;document.querySelectorAll('[data-command]').forEach(b=>{b.disabled=pending||automatic||(b.dataset.command==='step'&&state?.executionStatus==='running');});$('auto').disabled=mode!=='demo'||pending||automatic||state?.executionStatus==='running';$('mode').disabled=automatic;}
  async function command(name){if(!source)return;const current=generation,selected=source;pending=true;updateControls();try{await selected.command(name);}catch(e){if(active&&current===generation){$('error').hidden=false;$('error').textContent=e.message;log('Commande échouée : '+e.message);}}finally{pending=false;updateControls();}}
  function changeMode(next){generation++;source?.disconnect();mode=next;state=undefined;session=undefined;$('stock').textContent='—';$('journal').replaceChildren();$('blackboard').replaceChildren();$('mode').value=mode;$('mode-banner').classList.toggle('demo-mode',mode==='demo');$('mode-label').textContent=mode==='demo'?'DEMO — DONNÉES SIMULÉES':'ANEMONE — MOTEUR RÉEL';$('live-label').textContent=mode==='demo'?'SIMULATION LOCALE':'SOURCE JVM';$('blackboard-title').textContent=mode==='demo'?'Blackboard simulé':'Blackboard Anemone';$('store-source').textContent=mode==='demo'?'DEMO · données simulées':'ABBlackboard.storeContents';$('connection').textContent='Connexion…';$('error').hidden=true;for(const id of ['weight-card','matrix-card'])$(id).classList.remove('detected');$('confirmation').classList.remove('confirmed');$('weight-label').textContent=$('matrix-label').textContent='En attente…';$('confirmation-label').textContent='En attente de validation';$('confirmation-detail').textContent=mode==='demo'?'Simulation indépendante du moteur.':'L’agent Anemone prend la décision.';$('narrative').textContent='Prête pour un nouveau retrait';$('remaining-agent').textContent='—';$('step-label').textContent='Pas moteur : 0';$('execution-status').textContent='PRÊT';$('stock-transition').textContent='En attente de la source';source=mode==='demo'?(demoSource||(demoSource=new DemoDataSource(update,connection))):new AnemoneDataSource(update,connection);source.connect();updateControls();}
  document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>command(button.dataset.command)));
  $('auto').addEventListener('click',async()=>{
    if(mode!=='demo'||automatic)return;
    automatic=true;updateControls();const current=generation, selected=source;
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try {
      if(state?.executionStatus==='blocked'||state?.executionStatus==='paused')await selected.command('reset');
      log('Démonstration automatique · données simulées');
      await wait(650);if(current!==generation)return;
      $('narrative').textContent='Deborah retire une boîte de compresses';
      await wait(700);if(current!==generation)return;await selected.command('weight');
      await wait(1000);if(current!==generation)return;await selected.command('datamatrix');
      await wait(1200);if(current!==generation)return;await selected.command('run');
    }finally{if(current===generation){automatic=false;updateControls();}}
  });
  return {
    activate(next){active=true;changeMode(next);},
    deactivate(){active=false;generation++;automatic=false;source?.disconnect();},
    isBusy(){return pending||automatic;}
  };
};

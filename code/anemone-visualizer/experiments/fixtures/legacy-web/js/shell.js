(() => {
  const $=id=>document.getElementById(id);
  // Register another view and controller here to add an independent demonstration.
  const demos=[
    {id:'stock',number:'01',label:'Gestion du stock',title:'GESTION INTELLIGENTE DU STOCK',subtitle:'Système intelligent de gestion des stocks',create:createStockController},
    {id:'temperature',number:'02',label:'Régulation température',title:'RÉGULATION INTELLIGENTE DE TEMPÉRATURE',subtitle:'Température simulée · décision de ventilation par Anemone',create:createTemperatureController},
    {id:'diagnostics',number:'i',label:'Diagnostic moteur',title:'DIAGNOSTIC MOTEUR',subtitle:'Configuration, classes chargées et traces d’exécution réelles',create:createDiagnosticsController,system:true}
  ];
  let current,controller,mode=location.protocol==='file:'?'demo':'anemone',shuttingDown=false;
  const controllers=new Map(),modes=new Map();
  function navigate(id){
    const demo=demos.find(d=>d.id===id);if(!demo||shuttingDown)return;
    controller?.deactivate();current=id;mode=modes.get(id)||(location.protocol==='file:'?'demo':'anemone');
    for(const d of demos){$(d.id+'-view').hidden=d.id!==id;const button=$('nav-'+d.id);button.classList.toggle('selected',d.id===id);button.setAttribute('aria-current',d.id===id?'page':'false');}
    $('demo-eyebrow').textContent=demo.system?demo.title:'DÉMO '+demo.number+' · '+demo.title;$('demo-subtitle').textContent=demo.subtitle;
    $('mode').value=mode;$('mode').disabled=false;$('mode-banner').classList.toggle('demo-mode',mode==='demo');$('mode-label').textContent=mode==='demo'?'DEMO — DONNÉES SIMULÉES':'ANEMONE — MOTEUR RÉEL';$('live-label').textContent=mode==='demo'?'SIMULATION LOCALE':'SOURCE JVM';$('error').hidden=true;$('connection').textContent='Connexion à la source…';$('session-label').textContent='Session —';
    document.querySelector('.mode-control').hidden=!!demo.system;$('mode-banner').hidden=!!demo.system;
    controller=controllers.get(id);if(!controller){controller=demo.create();controllers.set(id,controller);}controller.activate(mode);
  }
  for(const demo of demos){const button=document.createElement('button');button.id='nav-'+demo.id;button.dataset.demo=demo.id;const number=document.createElement('span'),text=document.createElement('span');number.textContent=demo.number;text.textContent=demo.label;button.append(number,text);button.addEventListener('click',()=>navigate(demo.id));$(demo.system?'system-navigation':'demo-navigation').append(button);}
  $('mode').addEventListener('change',e=>{modes.set(current,e.target.value);navigate(current);});
  $('quit-app').addEventListener('click',()=>{$('quit-error').hidden=true;$('quit-dialog').showModal();});
  $('quit-cancel').addEventListener('click',()=>$('quit-dialog').close());
  $('quit-confirm').addEventListener('click',async()=>{
    if(shuttingDown)return;
    shuttingDown=true;$('quit-confirm').disabled=true;$('quit-cancel').disabled=true;
    try{
      let bridgeStopped=false;
      if(location.protocol!=='file:'){
        const stateResponse=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(4000)});
        if(!stateResponse.ok)throw new Error('Impossible de vérifier le Bridge avant arrêt.');
        const state=await stateResponse.json();
        const response=await fetch('/api/shutdown',{method:'POST',headers:{'X-SmartStock-Token':state.csrfToken},signal:AbortSignal.timeout(5000)});
        if(!response.ok)throw new Error('Le Bridge a refusé la demande d’arrêt.');
        bridgeStopped=true;
      }
      for(const c of controllers.values())c.deactivate();
      if(bridgeStopped){
        let offline=false;
        for(let i=0;i<15;i++){
          try{await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(700)});}
          catch{offline=true;break;}
          await new Promise(r=>setTimeout(r,200));
        }
        if(!offline)throw new Error('Arrêt demandé mais fermeture du service non confirmée.');
      }
      $('quit-dialog').close();document.querySelector('.shell').hidden=true;document.querySelector('.sidebar').hidden=true;
      $('stopped-page').hidden=false;$('stopped-detail').textContent=bridgeStopped?'Vous pouvez fermer cette fenêtre.':'Démonstration locale terminée. Aucun Bridge n’a été arrêté depuis cette page hors connexion.';
      window.close(); // May be refused by the browser. The final page remains; no workaround.
    }catch(e){shuttingDown=false;$('quit-error').hidden=false;$('quit-error').textContent=e.message+' Le service peut être indisponible ; aucun arrêt n’est prétendu.';$('quit-confirm').disabled=false;$('quit-cancel').disabled=false;}
  });
  window.SmartStockNavigation={navigate,current:()=>current};
  navigate('stock');
})();

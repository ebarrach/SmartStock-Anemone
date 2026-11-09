window.createTemperatureController = () => {
  const $=id=>document.getElementById(id),p=TemperatureSettings;
  let source,demoSource,active=false,mode='anemone',state,session,pending=false,automatic=false,generation=0;
  const fans=new FanVisualization(document.querySelectorAll('.fan-rotor'));
  const labels={ready:'PRÊT',paused:'EN PAUSE',running:'EN COURS',blocked:'EN ATTENTE',completed:'TERMINÉ',error:'ERREUR'};
  for(const id of ['temp-slider','temp-number']){
    const input=$(id);input.min=p.min;input.max=p.max;input.step=p.step;input.value=p.initial;
    input.addEventListener('input',()=>{const value=input.value;$(id==='temp-slider'?'temp-number':'temp-slider').value=value;$('temp-draft').textContent=value===''?'—':Number(value).toFixed(1)+' °C';});
  }
  $('temp-range-label').textContent=`${p.min.toFixed(1)} °C — ${p.max.toFixed(1)} °C · pas de ${p.step} °C`;
  for(let i=0;i<p.bands.length;i++){
    const b=p.bands[i],next=p.bands[i+1],li=document.createElement('li'),range=document.createElement('span'),power=document.createElement('strong');
    range.textContent=i===0?`< ${next.from} °C`:next?`${b.from} à < ${next.from} °C`:`≥ ${b.from} °C`;power.textContent=b.power+' %';li.append(range,power);$('threshold-list').append(li);
  }
  function log(text,time){const li=document.createElement('li'),t=document.createElement('time'),s=document.createElement('span');t.textContent=new Date(time||Date.now()).toLocaleTimeString('fr-FR');s.textContent=text;li.append(t,s);$('temp-journal').prepend(li);while($('temp-journal').children.length>70)$('temp-journal').lastChild.remove();}
  function connection(ok,message){if(!active)return;$('connection').textContent=message;$('mode-banner').classList.toggle('unavailable',!ok);$('error').hidden=ok;if(!ok)$('error').textContent='Moteur Anemone indisponible. Aucune simulation ne remplace ses décisions.';}
  function update(s){
    if(!active||s.source!==mode)return;
    if(session!==s.sessionId){session=s.sessionId;$('temp-journal').replaceChildren();}
    state=s;log(s.message,s.timestamp);if(s.observationGap)log('Resynchronisation : certaines étapes intermédiaires peuvent manquer.');
    if(s.eventType==='reset'){for(const id of ['temp-slider','temp-number'])$(id).value=s.temperature;$('temp-draft').textContent=Number(s.temperature).toFixed(1)+' °C';}
    $('temp-reading').textContent=Number(s.temperature).toFixed(1);$('fan-power').textContent=s.fanPower===null?'—':s.fanPower;
    $('fan-bar').style.width=(s.fanPower??0)+'%';
    // ONLY received power controls animation speed; no classification from temperature.
    const power=s.fanPower??0;
    fans.setPower(power);
    $('temperature-view').classList.toggle('ventilating',power>0);
    $('temp-status').textContent=labels[s.executionStatus]||s.executionStatus;
    $('fan-state').textContent=s.fanPower===null?'En attente de décision':power===0?'Ventilation arrêtée':'Régulation active';
    $('path-temperature').textContent=Number(s.temperature).toFixed(1)+' °C';$('path-engine').firstChild.textContent=mode==='anemone'?'ANEMONE ':'SIMULATION ';
    $('path-decision').textContent=s.observations.decisionReceived?'Décision reçue':'En attente';$('path-power').textContent=s.fanPower===null?'—':s.fanPower+' %';
    $('temp-step').textContent='Pas moteur : '+s.executionStep;
    $('temp-blackboard').replaceChildren();
    for(const row of s.blackboard){const line=document.createElement('div'),term=document.createElement('span'),count=document.createElement('span');line.className='term-row';term.textContent=row.term;count.textContent='['+row.multiplicity+']';line.append(term,count);$('temp-blackboard').append(line);}
    if(!s.blackboard.length){const e=document.createElement('p');e.className='empty-store';e.textContent='Store vide';$('temp-blackboard').append(e);}
    $('temp-term-count').textContent=s.blackboard.length+' TERMES';$('temp-agent').textContent=s.remainingAgent||'Agent terminé.';
    $('session-label').textContent='Session température '+s.sessionId.slice(0,8)+' · #'+s.sequence;controls();
  }
  function controls(){if(!active)return;document.querySelectorAll('[data-temp-command]').forEach(b=>{const c=b.dataset.tempCommand;b.disabled=pending||automatic||(c==='apply'&&['running','paused'].includes(state?.executionStatus))||(['run','step'].includes(c)&&['running','completed','error'].includes(state?.executionStatus));});$('temp-auto').disabled=mode!=='demo'||pending||automatic||state?.executionStatus==='running';$('mode').disabled=automatic;}
  async function command(name){const current=generation,selected=source;pending=true;controls();try{const value=$('temp-number').value;if(name==='apply'&&!$('temp-number').reportValidity())return;await selected.command(name,name==='apply'?value:undefined);}catch(e){if(active&&current===generation){$('error').hidden=false;$('error').textContent=e.message;log('Commande refusée : '+e.message);}}finally{pending=false;controls();}}
  document.querySelectorAll('[data-temp-command]').forEach(b=>b.addEventListener('click',()=>command(b.dataset.tempCommand)));
  $('temp-auto').addEventListener('click',async()=>{
    if(mode!=='demo'||automatic)return;
    automatic=true;controls();const current=generation,selected=source;
    try{
      if(['paused','blocked'].includes(state?.executionStatus))await selected.command('reset');
      for(const value of p.automatic){if(current!==generation)return;$('temp-number').value=$('temp-slider').value=value;$('temp-draft').textContent=value.toFixed(1)+' °C';await selected.command('apply',value);await new Promise(r=>setTimeout(r,650));if(current!==generation)return;await selected.command('run');await new Promise(r=>setTimeout(r,900));}
    }catch(e){if(active){$('error').hidden=false;$('error').textContent=e.message;}}finally{if(current===generation){automatic=false;controls();}}
  });
  return {
    activate(next){
      active=true;mode=next;generation++;state=undefined;session=undefined;
      $('temp-journal').replaceChildren();$('temp-blackboard').replaceChildren();$('temp-reading').textContent=$('fan-power').textContent='—';$('temp-agent').textContent='—';$('temp-status').textContent='PRÊT';$('temp-step').textContent='Pas moteur : 0';$('fan-state').textContent='En attente de décision';$('fan-bar').style.width='0%';
      fans.setPower(0);fans.start();$('temperature-view').classList.remove('ventilating');
      $('temp-board-title').textContent=mode==='demo'?'Blackboard simulé':'Blackboard Anemone';$('temp-store-source').textContent=mode==='demo'?'DEMO · données simulées':'ABBlackboard.storeContents';
      source=mode==='demo'?(demoSource||(demoSource=new TemperatureDemoDataSource(update,connection))):new AnemoneDataSource(update,connection,'/api/temperature');source.connect();controls();
    },
    deactivate(){active=false;generation++;automatic=false;source?.disconnect();fans.stop();},
    isBusy(){return pending||automatic;}
  };
};

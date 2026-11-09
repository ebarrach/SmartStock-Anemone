/* DEMO ONLY. The real adapter never calls this classifier. No network access. */
window.TemperatureDemoDataSource = class {
  constructor(onState,onConnection){this.onState=onState;this.onConnection=onConnection;this.sequence=0;this.generation=0;this.reset();}
  reset(){this.generation++;this.sessionId='temperature-demo-'+Date.now()+'-'+this.generation;this.temperature=TemperatureSettings.initial;this.fan=null;this.stage=0;this.step=0;this.status='ready';this.inputPresent=true;this.currentPresent=false;}
  connect(){this.closed=false;this.onConnection(true,'Simulation locale température · aucune décision Anemone');this.emit('initialize','Simulation température prête.');}
  emit(kind,message){
    if(this.closed)return;
    const atom='t'+Math.round(this.temperature*10),blackboard=[];
    if(this.inputPresent)blackboard.push({term:`temperature(${atom})`,multiplicity:1});
    if(this.currentPresent)blackboard.push({term:`temperature_current(${atom})`,multiplicity:1});
    if(this.fan!==null)blackboard.push({term:`ventilation(${this.fan})`,multiplicity:1});
    this.onState({source:'demo',demoId:'temperature',sessionId:this.sessionId,sequence:++this.sequence,timestamp:new Date().toISOString(),eventType:kind,message,temperature:this.temperature,temperaturePresent:this.inputPresent,fanPower:this.fan,executionStatus:this.status,executionStep:this.step,blackboard,observations:{temperatureApplied:true,decisionReceived:this.fan!==null},remainingAgent:'Simulation visuelle — aucun AST Anemone.'});
  }
  async command(name,value){
    if(name==='reset'){this.reset();this.emit('reset','Simulation température réinitialisée.');return;}
    if(name==='initialize'){this.emit('initialize','Simulation déjà initialisée.');return;}
    if(name==='apply'){
      const p=TemperatureSettings,t=Number(value);
      if(!Number.isFinite(t)||t<p.min||t>p.max||Math.abs(t*10-Math.round(t*10))>1e-6)throw new Error('Température invalide');
      if(this.status==='running'||this.status==='paused')throw new Error('Terminer la régulation ou RESET');
      this.temperature=t;this.stage=0;this.step=0;this.fan=null;this.status='ready';this.inputPresent=true;this.currentPresent=false;this.emit('temperature','Simulation : nouvelle température.');return;
    }
    if(name==='step'){if(this.status==='running'||this.status==='completed')throw new Error('Appliquer une nouvelle température ou attendre');this.advance();return;}
    if(name==='run'){
      if(this.status==='running')return;if(this.status==='completed')throw new Error('Appliquer une nouvelle température');
      this.status='running';const generation=this.generation;
      while(!this.closed&&generation===this.generation){this.advance();if(this.status==='completed')break;await new Promise(r=>setTimeout(r,400));}
    }
  }
  advance(){
    this.step++;
    if(this.stage===1)this.inputPresent=false;
    if(this.stage===2)this.currentPresent=true;
    if(this.stage===3){this.fan=TemperatureSettings.bands.filter(b=>this.temperature>=b.from).at(-1).power;this.status='completed';}
    this.stage++;if(this.status!=='running'&&this.status!=='completed')this.status='paused';
    this.emit('step',this.status==='completed'?'Simulation : puissance de ventilation disponible.':'Simulation : étape '+this.step);
  }
  disconnect(){this.closed=true;this.generation++;if(this.status==='running')this.status='paused';}
};

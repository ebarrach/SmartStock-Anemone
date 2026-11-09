/* SIMULATION ONLY. No bridge request is made by this class. */
window.DemoDataSource = class {
  constructor(onState,onConnection){this.onState=onState;this.onConnection=onConnection;this.sequence=0;this.closed=false;this.generation=0;this.reset();}
  connect(){this.closed=false;this.onConnection(true,'Simulation locale indépendante · aucune donnée Anemone');this.emit('initialize','Simulation visuelle prête.');}
  reset(){this.generation++;this.sessionId='demo-'+Date.now()+'-'+this.generation;this.stock=40;this.weight=false;this.matrix=false;this.count=0;this.cycle();}
  cycle(){this.stage=0;this.step=0;this.status='ready';this.observed={weightDetected:false,dataMatrixDetected:false,withdrawalConfirmed:false};this.executionId='demo-cycle-'+Date.now()+'-'+this.sequence;}
  emit(kind,message){
    if(this.closed)return;
    const blackboard=[];
    if(this.stock!==null)blackboard.push({term:`stock(compresse,${this.stock})`,multiplicity:1});
    if(this.weight)blackboard.push({term:'poids_change(compresse)',multiplicity:1});
    if(this.matrix)blackboard.push({term:'datamatrix_detecte(compresse)',multiplicity:1});
    if(this.count)blackboard.push({term:'retrait_confirme(compresse)',multiplicity:this.count});
    blackboard.sort((a,b)=>a.term.localeCompare(b.term));
    this.onState({source:'demo',sessionId:this.sessionId,sequence:++this.sequence,timestamp:new Date().toISOString(),eventType:kind,message,stock:this.stock,stockStatus:this.stock===null?'transient-absent':'valid',weightPresent:this.weight,dataMatrixPresent:this.matrix,confirmationMultiplicity:this.count,executionStatus:this.status,executionStep:this.step,executionId:this.executionId,observations:{...this.observed},blackboard,remainingAgent:'Simulation visuelle — aucun AST Anemone.'});
  }
  async command(name){
    if(name==='reset'){this.reset();this.emit('reset','Simulation réinitialisée à 40.');return;}
    if(name==='initialize'){this.emit('initialize','Simulation déjà initialisée.');return;}
    if(name==='weight'||name==='datamatrix'){
      if(this.status==='completed')this.cycle();
      if(name==='weight'){this.weight=true;this.observed.weightDetected=true;}else{this.matrix=true;this.observed.dataMatrixDetected=true;}
      this.emit(name,name==='weight'?'Simulation : changement de poids.':'Simulation : Data Matrix détecté.');return;
    }
    if(name==='step'){if(this.status==='running')return;if(this.status==='completed')this.cycle();this.advance();return;}
    if(name==='run'){
      if(this.status==='running')return;
      if(this.status==='completed')this.cycle();
      const generation=this.generation;
      this.status='running';
      while(!this.closed&&generation===this.generation){this.advance();if(this.status==='blocked'||this.status==='completed')break;await new Promise(r=>setTimeout(r,350));}
    }
  }
  advance(){
    this.step++;
    if((this.stage===0&&!this.weight)||(this.stage===1&&!this.matrix)){this.status='blocked';this.emit('step','Simulation en attente du capteur manquant.');return;}
    if(this.stage===0)this.weight=false;
    if(this.stage===1)this.matrix=false;
    if(this.stage===2){this.count++;this.observed.withdrawalConfirmed=true;}
    if(this.stage===4){this.previousStock=this.stock;this.stock=null;}
    if(this.stage===5){this.stock=Math.max(0,this.previousStock-1);this.status='completed';}
    this.stage++;
    if(this.status!=='completed'&&this.status!=='running')this.status='paused';
    this.emit('step',this.status==='completed'?'Simulation : stock mis à jour.':`Simulation : étape ${this.step}.`);
  }
  disconnect(){this.closed=true;this.generation++;if(this.status==='running')this.status='paused';}
};

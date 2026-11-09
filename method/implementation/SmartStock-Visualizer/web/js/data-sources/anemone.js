/* Real data only. This adapter never applies a stock rule or creates a confirmation. */
window.AnemoneDataSource = class {
  constructor(onState, onConnection, apiBase='/api') { this.onState=onState; this.onConnection=onConnection; this.apiBase=apiBase; this.closed=false; this.sequence=-1; }
  async connect() {
    this.timer=setInterval(()=>this.refresh().then(()=>this.openStream()).catch(()=>{}),2500);
    try {
      if (location.protocol === 'file:') throw new Error('Ouvrez le mode Anemone via http://127.0.0.1:8080.');
      await this.refresh();
      if(this.closed) return;
      this.openStream();
    } catch(e) { if(!this.closed)this.onConnection(false,'Moteur Anemone indisponible · '+e.message); }
  }
  openStream(){
    if(this.closed||this.stream||location.protocol==='file:')return;
    this.stream=new EventSource(this.apiBase+'/events');
    this.stream.addEventListener('state', e=>{try{this.accept(JSON.parse(e.data));this.onConnection(true,'Flux du vrai moteur connecté');}catch{this.onConnection(false,'Réponse moteur invalide');}});
    this.stream.onerror=()=>{if(!this.closed)this.onConnection(false,'Flux interrompu · lecture HTTP de secours');};
  }
  accept(state) {
    if(this.closed) return;
    if(state.source!=='anemone') throw new Error('Source inattendue');
    if(state.engineInstanceId&&state.engineInstanceId!==this.engineInstanceId){this.engineInstanceId=state.engineInstanceId;this.sequence=-1;}
    if(state.csrfToken) this.token=state.csrfToken;
    if(state.sequence<=this.sequence) return;
    if(this.sequence>=0 && state.sequence>this.sequence+1) state.observationGap=true;
    this.sequence=state.sequence;this.onState(state);
  }
  async refresh() {
    try {
      const response=await fetch(this.apiBase+'/state',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const state=await response.json();this.accept(state);
      if(!this.closed)this.onConnection(true,'Vrai moteur · JVM persistante');
    }catch(e){if(!this.closed)this.onConnection(false,'Moteur Anemone indisponible');throw e;}
  }
  async command(name, argument) {
    if(!this.token) await this.refresh();
    const path={weight:'events/weight',datamatrix:'events/datamatrix'}[name]||name;
    const query=name==='apply'?'?value='+encodeURIComponent(argument):'';
    const response=await fetch(this.apiBase+'/'+path+query,{method:'POST',headers:{'X-SmartStock-Token':this.token,'X-Command-Id':crypto.randomUUID()},signal:AbortSignal.timeout(8000)});
    const state=await response.json();
    if(!response.ok) throw new Error(state.error||'Commande refusée');
    this.accept(state);
  }
  disconnect(){this.closed=true;clearInterval(this.timer);this.stream?.close();}
};

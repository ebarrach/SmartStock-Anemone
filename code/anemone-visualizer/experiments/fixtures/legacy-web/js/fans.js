/** Presentation only: interpolates a speed from the received power, not from temperature. */
window.FanVisualization = class {
  constructor(elements){this.elements=[...elements];this.angle=0;this.speed=0;this.target=0;this.frame=null;this.reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;this.elements.forEach(e=>e.style.animation='none');}
  setPower(power){this.target=Number(power||0)/100*500;}
  start(){
    if(this.frame!==null||this.reduced)return;
    this.last=null;
    const tick=time=>{
      const dt=this.last===null?0:Math.min((time-this.last)/1000,.05);this.last=time;
      this.speed+=(this.target-this.speed)*(1-Math.exp(-dt*6));
      if(Math.abs(this.speed-this.target)<.05)this.speed=this.target;
      this.angle=(this.angle+this.speed*dt)%360;
      this.elements.forEach(e=>e.style.transform=`rotate(${this.angle}deg)`);
      this.frame=requestAnimationFrame(tick);
    };
    this.frame=requestAnimationFrame(tick);
  }
  stop(){if(this.frame!==null)cancelAnimationFrame(this.frame);this.frame=null;this.target=0;this.speed=0;}
};

const STEP = 1/120;
const MAX_STEPS = 4;
const LIMIT = .025;
const DEFAULTS = Object.freeze({enabled:true,frequency:1.3,coupling:1,damping:.16,
  impulseVelocity:.025,impulseRadius:.32,maxDisplacement:.012,flipCoupling:8});
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
const clamp = (v, a, b) => Math.max(a,Math.min(b,v));

/** Signed, fixed-step face-normal wave with fixed carrier anchors. */
export class PanelRipple {
  constructor(manifest) {
    this.cornerEnergySupported = manifest.clearanceMetadata?.cornerEnergySupported === true;
    this.movingPanels = [...manifest.squarePanels, ...(this.cornerEnergySupported ? manifest.perimeterPanels.filter(p=>p.kind==='curved_corner') : [])];
    this.fixedPanels = manifest.perimeterPanels.filter(p=>!this.cornerEnergySupported || p.kind!=='curved_corner');
    this.ids = this.movingPanels.map(p=>p.panelId);
    this.index = new Map(this.ids.map((id,i)=>[id,i]));
    this.count = this.ids.length;
    if (manifest.squarePanels.length !== 21 || manifest.perimeterPanels.length !== 16 || (this.cornerEnergySupported && (this.count !== 25 || this.fixedPanels.length !== 12))) throw new Error('Ripple requires the 21/16 panel registry');
    this.anchorCount = this.fixedPanels.length;
    this.x = new Float64Array(this.count + this.anchorCount);
    this.y = new Float64Array(this.count + this.anchorCount);
    for (let i=0;i<this.count;i++) {const p=this.movingPanels[i],xy=p.pivotGltf||[p.pivotWorld[0],p.pivotWorld[2]];this.x[i]=xy[0];this.y[i]=xy[1];}
    for (let i=0;i<this.anchorCount;i++) {
      const panel=this.fixedPanels[i],tips=this.cornerEnergySupported?panel.energyPolicy?.frameAnchorTipsGltf:null;
      if(Array.isArray(tips)&&tips.length){this.x[this.count+i]=tips.reduce((n,p)=>n+p[0],0)/tips.length;this.y[this.count+i]=tips.reduce((n,p)=>n+p[1],0)/tips.length;}
      else {const p=panel.pivotWorld;this.x[this.count+i]=p[0];this.y[this.count+i]=p[2];}
    }
    const tips=manifest.perimeterPanels.flatMap(p=>p.stubSegments.map(s=>s.restGltf[1]));
    const innerBindings=this.cornerEnergySupported?manifest.perimeterPanels
      .filter(p=>p.kind==='curved_corner').flatMap(p=>p.energyPolicy?.innerSquareEndpoints||[p.energyPolicy?.innerSquareEndpoint]):[];
    this.squareBridgeBindings=[...innerBindings];
    const rimBindings=manifest.clearanceMetadata?.circularRim?.rimCapBindings||[];
    this.squareBridgeBindings.push(...rimBindings.map(p=>({panelId:p.panelId,axis:p.axis,sign:p.sign})));
    this.fixedFrameTips=this.cornerEnergySupported?[...manifest.perimeterPanels
      .filter(p=>p.kind==='curved_corner').map(p=>p.energyPolicy?.outerFrameAnchorGltf),...rimBindings.map(p=>p.rimCapTipGltf)]:[];
    if(this.cornerEnergySupported && (this.squareBridgeBindings.length!==innerBindings.length+rimBindings.length ||
      this.squareBridgeBindings.some(b=>!b?.panelId||!b.axis||![-1,1].includes(b.sign)) ||
      this.fixedFrameTips.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))))
      throw new Error('Missing V11 corner bridge bindings');
    this.capX=new Float64Array(tips.length+this.squareBridgeBindings.length+this.fixedFrameTips.length);
    this.capY=new Float64Array(this.capX.length);
    this.capOwner=new Int16Array(this.capX.length).fill(-1);
    this.setCapTips(manifest.perimeterPanels,manifest.squareVisualAxes);
    this.capRevision=0;
    const offsets=[0],neighbors=[],weights=[],weightSum=new Float64Array(this.count);
    for (let i=0;i<this.count;i++) {
      let closest=-1,closestDistance=Infinity,anchors=0;
      for (let j=0;j<this.count+this.anchorCount;j++) {
        if(i===j)continue;
        const dx=this.x[i]-this.x[j],dy=this.y[i]-this.y[j],d=Math.hypot(dx,dy);
        if(j>=this.count && d<closestDistance){closest=j;closestDistance=d;}
        let weight=0;
        if(j<this.count && d<.34)weight=1;
        else if(j<this.count && d<.46)weight=.35;
        else if(j>=this.count && d<.34 && anchors<3){weight=.55;anchors++;}
        if(weight){neighbors.push(j);weights.push(weight);weightSum[i]+=weight;}
      }
      if(anchors===0 && closest>=0 && closestDistance<.6){neighbors.push(closest);weights.push(.3);weightSum[i]+=.3;}
      offsets.push(neighbors.length);
    }
    this.offsets=new Uint16Array(offsets);
    this.neighbors=new Uint8Array(neighbors);
    this.weights=new Float64Array(weights);
    this.weightSum=weightSum;
    this.height=new Float64Array(this.count);
    this.velocity=new Float64Array(this.count);
    // Rigid card slopes are independent local spring coordinates (dz/dx, dz/dy).
    this.slopeX=new Float64Array(this.count);this.slopeY=new Float64Array(this.count);
    this.slopeVelocityX=new Float64Array(this.count);this.slopeVelocityY=new Float64Array(this.count);
    this.pendingSlopeX=new Float64Array(this.count);this.pendingSlopeY=new Float64Array(this.count);
    this.nextHeight=new Float64Array(this.count);
    this.nextVelocity=new Float64Array(this.count);
    this.pending=new Float64Array(this.count);
    this.options={...DEFAULTS};
    this.accumulator=0;this.sleepTime=0;this.holdTime=0;
    this.settling=false;this.sleeping=true;this.paused=false;this.reducedMotion=false;
    this.steps=0;this.droppedSeconds=0;
    this.listeners=new Set();
  }
  setOptions(partial={}) {
    const before=this.options,next={...before};
    for(const [key,lo,hi] of [['frequency',.8,8],['coupling',0,1.2],['damping',.08,1.5],
      ['impulseVelocity',0,.03],['impulseRadius',.05,.75],['maxDisplacement',.0002,LIMIT],['flipCoupling',0,12]])
      if(Object.hasOwn(partial,key))next[key]=clamp(finite(Number(partial[key]),before[key]),lo,hi);
    if(Object.hasOwn(partial,'enabled'))next.enabled=Boolean(partial.enabled);
    this.options=next;
    if(next.maxDisplacement!==before.maxDisplacement)for(let i=0;i<this.count;i++){
      const bounded=clamp(this.height[i],-next.maxDisplacement,next.maxDisplacement);
      if(bounded!==this.height[i]){this.height[i]=bounded;this.velocity[i]=0;}
    }
    if(!next.enabled)this.clear();
    this._notify();
    return this;
  }
  setCapTips(perimeterPanels,squareVisualAxes=[]) {
    const tips=perimeterPanels.flatMap(p=>p.stubSegments.map(s=>s.restGltf[1]));
    if(tips.length+this.squareBridgeBindings.length+this.fixedFrameTips.length!==this.capX.length||tips.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))throw new RangeError('Expected finite authored perimeter cap tips');
    let i=0;
    for(const panel of perimeterPanels)for(const [stubIndex,stub] of panel.stubSegments.entries()){
      const tip=stub.restGltf[1];this.capX[i]=tip[0];this.capY[i]=tip[1];
      // Schema 9 corners have three moving inward caps and one fixed outward cap.
      const outward=panel.energyPolicy?.outerStubIndex;
      this.capOwner[i]=this.cornerEnergySupported&&panel.kind==='curved_corner'&&stubIndex!==outward?(this.index.get(panel.panelId)??-1):-1;
      i++;
    }
    for(const binding of this.squareBridgeBindings){
      const axis=squareVisualAxes.find(a=>a.panelId===binding.panelId&&a.axis===binding.axis);
      if(!axis)throw new Error(`Missing square corner axis ${binding.panelId}:${binding.axis}`);
      const tip=axis.restGltf?.[binding.sign===-1?0:1];
      if(!Array.isArray(tip)||tip.length!==3||!tip.every(Number.isFinite))throw new Error(`Missing square corner binding ${binding.panelId}:${binding.axis}`);
      const owner=this.index.get(binding.panelId);
      if(owner===undefined)throw new Error(`Missing moving square ${binding.panelId}`);
      this.capX[i]=tip[0];this.capY[i]=tip[1];this.capOwner[i]=owner;i++;
    }
    for(const tip of this.fixedFrameTips){this.capX[i]=tip[0];this.capY[i]=tip[1];this.capOwner[i]=-1;i++;}
    if(i!==this.capX.length||this.capY.length!==this.capX.length||
      [...this.capX,...this.capY].some(v=>!Number.isFinite(v))||
      [...this.capOwner].some(owner=>owner>=this.count||owner< -1))
      throw new Error('Invalid ripple cap support bindings');
    this.capRevision++;
    return this;
  }
  impulse(panelId,signedStrength=1,radius=this.options.impulseRadius) {
    const origin=this.index.get(panelId);
    if(origin===undefined)return false;
    return this.impulseAt(this.x[origin],this.y[origin],signedStrength,radius);
  }
  /** A contact can be on a pinned perimeter panel; its nearby free nodes respond. */
  impulseAt(x,y,signedStrength=1,radius=this.options.impulseRadius) {
    if(!this.options.enabled||this.reducedMotion)return false;
    if(![x,y,signedStrength,radius].every(Number.isFinite))return false;
    const strength=clamp(signedStrength,-1,1),reach=clamp(radius,.05,.75);
    if(strength===0)return true;
    for(let i=0;i<this.count;i++) {
      const distance=Math.hypot(this.x[i]-x,this.y[i]-y);
      if(distance>reach)continue;
      const weight=Math.exp(-3*distance*distance/(reach*reach));
      // Sum signed impulses before the velocity safety clamp in _step.
      this.pending[i]+=strength*this.options.impulseVelocity*weight*6;
      // A contact off the card center produces a real torque at that card.
      const localX=x-this.x[i],localY=y-this.y[i];
      if(Math.abs(localX)<.16&&Math.abs(localY)<.16){
        const torque=strength*this.options.impulseVelocity*weight*32;
        this.pendingSlopeX[i]+=torque*localX;
        this.pendingSlopeY[i]+=torque*localY;
      }
    }
    this.sleeping=false;this.sleepTime=0;this.holdTime=Math.max(this.holdTime,.65);
    this._notify();
    return true;
  }
  /** Opposing edge/corner pulls, with zero force at the rotating panel's center. */
  impulseFlip(panelId,axis,strength=1,halfWidth=.1385) {
    const origin=this.index.get(panelId),length=Math.hypot(axis?.[0],axis?.[1]);
    if(origin===undefined||!Number.isFinite(length)||length<1e-8||!Number.isFinite(strength)||!Number.isFinite(halfWidth))return false;
    // axis cross position has signed Z = ax*y - ay*x. The clicked edge goes down.
    const dx=-axis[1]/length,dy=axis[0]/length;
    const extent=clamp(halfWidth,.05,.2)/Math.max(Math.abs(dx),Math.abs(dy));
    const reach=this.options.impulseRadius,scale=clamp(strength,-12,12)*this.options.impulseVelocity;
    if(!this.options.enabled||this.reducedMotion)return false;
    if(scale===0)return true;
    // Equal opposing edge forces have zero center impulse and nonzero torque.
    this.pendingSlopeX[origin]+=scale*dx*32;
    this.pendingSlopeY[origin]+=scale*dy*32;
    for(let i=0;i<this.count;i++){
      const x=this.x[i]-this.x[origin],y=this.y[i]-this.y[origin];
      const up=Math.hypot(x-dx*extent,y-dy*extent),down=Math.hypot(x+dx*extent,y+dy*extent);
      const kernel=d=>d>reach?0:Math.exp(-3*d*d/(reach*reach));
      this.pending[i]+=scale*(kernel(up)-kernel(down));
    }
    this.sleeping=false;this.sleepTime=0;this.holdTime=Math.max(this.holdTime,.65);this._notify();return true;
  }
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  _notify(){for(const listener of this.listeners)listener();}
  update(dt) {
    if(this.paused||this.reducedMotion||!this.options.enabled)return 0;
    if(!Number.isFinite(dt)||dt<=0)return 0;
    const received=Math.min(dt,.25);
    this.droppedSeconds+=Math.max(0,dt-received);
    this.accumulator+=received;
    const maxBacklog=STEP*MAX_STEPS;
    if(this.accumulator>maxBacklog){this.droppedSeconds+=this.accumulator-maxBacklog;this.accumulator=maxBacklog;}
    let count=0;
    while(this.accumulator+1e-12>=STEP&&count<MAX_STEPS){this._step();this.accumulator-=STEP;count++;}
    return count;
  }
  _step() {
    this.steps++;
    this.holdTime=Math.max(0,this.holdTime-STEP);
    if(this.sleeping)return;
    const o=this.options,omega=2*Math.PI*o.frequency,restore=omega*omega;
    const damping= Math.exp(-2*o.damping*omega*STEP);
    let maxHeight=0,maxVelocity=0;
    for(let i=0;i<this.count;i++) {
      let lap=0;
      for(let k=this.offsets[i];k<this.offsets[i+1];k++){
        const j=this.neighbors[k];
        lap+=this.weights[k]*((j<this.count?this.height[j]:0)-this.height[i]);
      }
      lap/=this.weightSum[i]||1;
      const acceleration=restore*(-this.height[i]+o.coupling*lap);
      // Signed pending impulses cancel first, then the resulting velocity is bounded.
      let velocity=clamp((this.velocity[i]+this.pending[i]+acceleration*STEP)*damping,-.25,.25);
      let height=this.height[i]+velocity*STEP;
      const bound=o.maxDisplacement;
      if(height>bound){height=bound;if(velocity>0)velocity=0;}
      else if(height< -bound){height=-bound;if(velocity<0)velocity=0;}
      if(this.settling&&this.holdTime===0){const fade=Math.exp(-STEP/.09);height*=fade;velocity*=fade;}
      this.pending[i]=0;
      this.nextHeight[i]=height;this.nextVelocity[i]=velocity;
      const slopeRestore=(omega*1.65)**2,slopeDamping=Math.exp(-2*o.damping*omega*1.65*STEP);
      for(const [slope,slopeVelocity,pendingSlope] of [[this.slopeX,this.slopeVelocityX,this.pendingSlopeX],[this.slopeY,this.slopeVelocityY,this.pendingSlopeY]]){
        const v=clamp((slopeVelocity[i]+pendingSlope[i]-slopeRestore*slope[i]*STEP)*slopeDamping,-.3,.3);
        slopeVelocity[i]=v;slope[i]=clamp(slope[i]+v*STEP,-.035,.035);pendingSlope[i]=0;
        maxHeight=Math.max(maxHeight,Math.abs(slope[i])*.14);
        maxVelocity=Math.max(maxVelocity,Math.abs(v)*.14);
      }
      maxHeight=Math.max(maxHeight,Math.abs(height));maxVelocity=Math.max(maxVelocity,Math.abs(velocity));
    }
    this.height.set(this.nextHeight);this.velocity.set(this.nextVelocity);
    if(maxHeight<.000001&&maxVelocity<.000015){this.sleepTime+=STEP;if(this.sleepTime>.2){
      this.height.fill(0);this.velocity.fill(0);this.pending.fill(0);this.slopeX.fill(0);this.slopeY.fill(0);this.slopeVelocityX.fill(0);this.slopeVelocityY.fill(0);this.pendingSlopeX.fill(0);this.pendingSlopeY.fill(0);this.sleeping=true;this.sleepTime=0;this.holdTime=0;this.settling=false;
    }}
    else this.sleepTime=0;
  }
  setSettling(value){this.settling=Boolean(value);return this;}
  canRetract(){return this.sleeping && this.pending.every(v=>v===0)&&this.pendingSlopeX.every(v=>v===0)&&this.pendingSlopeY.every(v=>v===0);}
  clear(){this.height.fill(0);this.velocity.fill(0);this.pending.fill(0);this.slopeX.fill(0);this.slopeY.fill(0);this.slopeVelocityX.fill(0);this.slopeVelocityY.fill(0);this.pendingSlopeX.fill(0);this.pendingSlopeY.fill(0);this.accumulator=0;this.sleepTime=0;this.holdTime=0;this.sleeping=true;this.settling=false;this._notify();return this;}
  sampleHeight(x,y){
    if(!Number.isFinite(x)||!Number.isFinite(y)||this.sleeping)return 0;
    // Compact inverse-distance basis. Each fixed anchor has height zero; the
    // baseline zero weight makes the outer support boundary continuous too.
    const radius2=.5*.5;
    let sum=0,weightSum=1;
    for(let i=0;i<this.x.length+this.capX.length;i++){
      const hinge=i<this.x.length,owner=hinge?(i<this.count?i:-1):this.capOwner[i-this.x.length];
      const px=hinge?this.x[i]:this.capX[i-this.x.length],py=hinge?this.y[i]:this.capY[i-this.x.length];
      const d2=(x-px)**2+(y-py)**2;
      if(d2<1e-16)return owner>=0?this.height[owner]:0;
      if(d2>=radius2)continue;
      const taper=1-d2/radius2,weight=taper*taper/d2;
      sum+=weight*(owner>=0?this.height[owner]:0);weightSum+=weight;
    }
    return sum/weightSum;
  }
  getNodeData(){return {ids:this.ids,x:this.x,y:this.y,heights:this.height,slopeX:this.slopeX,slopeY:this.slopeY,perimeterStart:this.count,capX:this.capX,capY:this.capY,capOwner:this.capOwner};}
  getSettings(){return {...this.options};}
  getStats(){let maxHeight=0,maxVelocity=0;for(let i=0;i<this.count;i++){
    maxHeight=Math.max(maxHeight,Math.abs(this.height[i]));maxVelocity=Math.max(maxVelocity,Math.abs(this.velocity[i]));}
    return{squareNodes:21,movingNodes:this.count,cornerNodes:this.count-21,pinnedAnchors:this.anchorCount,edges:this.neighbors.length,steps:this.steps,
      droppedSeconds:this.droppedSeconds,maxHeight,maxVelocity,sleeping:this.sleeping,
      maxSlope:Math.max(...this.slopeX.map(Math.abs),...this.slopeY.map(Math.abs)),
      settling:this.settling,holdTime:this.holdTime,canRetract:this.canRetract()};}
  dispose(){this.clear();this.listeners.clear();}
}

export {DEFAULTS as defaultRippleOptions, STEP as rippleStep};

import * as THREE from 'three';

const HALF_TURN = Math.PI;
const FULL_TURN = HALF_TURN * 2;
const EPS = 1e-7;
const FACE_NORMAL = new THREE.Vector3(0, 0, 1);
const COMPASS = {N:[0,1], NE:[1,1], E:[1,0], SE:[1,-1], S:[0,-1], SW:[-1,-1], W:[-1,0], NW:[-1,1]};
const AXIS = {N:'H', S:'H', E:'V', W:'V', NW:'D+', SE:'D+', NE:'D-', SW:'D-'};
const vec = a => new THREE.Vector3(...a);

/** Portable panel movement. Positions are in the v9 carriage frame; no field paths depend on pivot rotation. */
export class PanelMotion {
  constructor(rig, manifest, findRawNode) {
    this.rig = rig;
    this.manifest = manifest;
    this.target = manifest.deploy.defaultPreview;
    this.manualTarget = this.target;
    this.velocity = 0;
    this.focused = true;
    this.autoFocus = false;
    this.reducedMotion = false;
    this.paused = false;
    this.queue = new Map();
    this.active = new Map();
    this.panels = new Map();
    this.onChange = null;
    this.changeListeners = new Set();
    this.onFlipStart = null;
    this.onFlipEnd = null;
    this.onFlipProgress = null;
    this.onShapeProgress = null;
    this.onReset = null;
    this.canRetract = () => true;
    this.tiltEnabled = true;
    this.tiltResponse = .85;
    this.normalTravelLimitM=manifest.clearanceMetadata?.normalRippleTravel?.sampledScreenPassed===true?.025:.006;
    this.combinedPoseLimitM=.006;
    this.rippleGraph = null;
    this.displayBaseline='icon';
    this.onDisplayChange=null;
    this._tiltNormal = new THREE.Vector3();
    this._tiltIdentity = new THREE.Quaternion();
    const all = [...manifest.squarePanels, ...manifest.perimeterPanels];
    for (const record of all) {
      const pivot = findRawNode(record.exportPivotName);
      const body = findRawNode(record.exportBodyName);
      if (!pivot || !body) throw new Error(`Missing motion binding ${record.panelId}`);
      const isSquare = Boolean(record.axes);
      const meshes = [];
      body.traverse(o => {if (o.isMesh) meshes.push(o);});
      const morphs = meshes.filter(m => m.morphTargetDictionary?.Clicked !== undefined);
      const center = isSquare ? vec(record.pivotGltf) : vec([record.pivotWorld[0], record.pivotWorld[2], -record.pivotWorld[1]]);
      const radius = this._radius(record, meshes, pivot, center, isSquare);
      this.panels.set(record.panelId, {record, pivot, body, meshes, morphs, center, radius,
        restQuaternion: pivot.quaternion.clone(), restPosition: pivot.position.clone(),
        baseQuaternion: pivot.quaternion.clone(), tiltQuaternion: new THREE.Quaternion(),
        turn: null, clicked: false, displayFlipped: false, clickFrom: 0, clickTo: 0, clickProgress: 1, ripple: 0});
    }
    if (this.panels.size !== 37) throw new Error(`Expected 37 v9 panels, got ${this.panels.size}`);
    this.previousOptionGuard = rig.canApplyOptions;
    rig.canApplyOptions = (next, before) => {
      if (!this.previousOptionGuard(next,before)) return false;
      if(this.active.size&&['neutralCardThickness','clickedCardThickness','clickedCardOffset'].some(key=>next[key]!==before[key]))return false;
      if (this.active.size && !this._safeOptions(next)) return false;
      if (this.queue.size && !this._safeOptions(next)) {this.queue.clear();this._changed();}
      return true;
    };
  }

  _radius(record, meshes, pivot, center, isSquare) {
    // Body rest and Clicked endpoints, authored stubs/hubs, and the maximum configurable juts.
    this.rig.model.updateMatrixWorld(true);
    const toCarriage = this.rig.deployNode.matrixWorld.clone().invert();
    let radius = 0;
    for (const mesh of meshes) {
      const attr = mesh.geometry.attributes.position;
      const morph = mesh.geometry.morphAttributes.position || [];
      const matrix = toCarriage.clone().multiply(mesh.matrixWorld);
      const p = new THREE.Vector3(), delta = new THREE.Vector3();
      for (let i = 0; i < attr.count; i++) {
        p.fromBufferAttribute(attr, i).applyMatrix4(matrix);
        radius = Math.max(radius, p.distanceTo(center));
        if (morph.length) {
          p.fromBufferAttribute(attr, i);
          delta.fromBufferAttribute(morph[0], i);
          if (mesh.geometry.morphTargetsRelative) p.add(delta); else p.copy(delta);
          p.applyMatrix4(matrix);
          radius = Math.max(radius, p.distanceTo(center));
        }
      }
    }
    if (isSquare) {
      for (const axis of record.axes) for (const sign of [-1, 1]) {
        const end = axis.ends[String(sign)];
        radius = Math.max(radius, vec(end.bodyExitGltf).distanceTo(center) + .018);
      }
    } else {
      for (const stub of record.stubSegments) for (const endpoint of stub.restGltf)
        radius = Math.max(radius, vec(endpoint).distanceTo(center) + .018);
    }
    // Includes 2 mm future ripple, maximum axle diameter and configurable extension, plus margin.
    return radius + .002 + .007 + .004;
  }

  setTarget(value) {
    if (!Number.isFinite(value)) return;
    this.target = THREE.MathUtils.clamp(value, 0, 1);
    this.manualTarget = this.target;
    this._changed();
  }
  setFocused(value) {
    this.focused = Boolean(value);
    if (!this.focused) {this.queue.clear();for(const turn of this.active.values()){turn.hovered=false;this._setTurnTarget(turn,turn.hover?FULL_TURN:turn.target);}this.target = 0;}
    else this.target = this.autoFocus ? 1 : this.manualTarget;
    this._changed();
  }
  setAutoFocus(value) {
    this.autoFocus = Boolean(value);
    this.target = this.focused ? (this.autoFocus ? 1 : this.manualTarget) : 0;
    this._changed();
  }
  setRippleGraph(graph) { this.rippleGraph = graph; return this; }
  setRippleTiltOptions(partial = {}) {
    if (Object.hasOwn(partial, 'tiltEnabled')) this.tiltEnabled = Boolean(partial.tiltEnabled);
    if (Number.isFinite(partial.tiltResponse)) this.tiltResponse = THREE.MathUtils.clamp(partial.tiltResponse, 0, 2);
    this._updateRippleTilts();this.rig.updateTransforms();this._changed();return this;
  }
  _applyPose(panel) {
    panel.pivot.position.copy(panel.restPosition).addScaledVector(FACE_NORMAL, panel.ripple);
    panel.pivot.quaternion.copy(panel.tiltQuaternion).multiply(panel.baseQuaternion);
  }
  _updateRippleTilts() {
    const graph=this.rippleGraph;
    for(const panel of this.panels.values())panel.tiltQuaternion.identity();
    if(graph && this.tiltEnabled && !this.reducedMotion)for(let i=0;i<graph.count;i++){
      const panel=this.panels.get(graph.ids[i]);if(!panel)continue;
      const h=panel.ripple;
      const gx=(graph.slopeX?.[i]||0)*this.tiltResponse;
      const gy=(graph.slopeY?.[i]||0)*this.tiltResponse;
      const normal=this._tiltNormal.set(-gx,-gy,1).normalize();
      panel.tiltQuaternion.setFromUnitVectors(FACE_NORMAL,normal);
      // Normal translation leaves the card-pair XY separating intervals intact.
      // Tilt retains its 6 mm point-displacement budget; expanded normal travel
      // is enabled only by the model-bound sampled source/mechanism screen.
      const budget=this.normalTravelLimitM>.006?.006:Math.max(0,this.combinedPoseLimitM-Math.abs(h));
      const maxAngle=2*Math.asin(Math.min(1,budget/(2*panel.radius)));
      const angle=panel.tiltQuaternion.angleTo(this._tiltIdentity);
      if(angle>maxAngle)panel.tiltQuaternion.slerp(this._tiltIdentity,1-maxAngle/angle);
    }
    for(const panel of this.panels.values())this._applyPose(panel);
  }
  setRipple(panelId, offset) {
    const panel = this.panels.get(panelId);
    if (!panel || !(panel.record.axes || this.manifest.clearanceMetadata?.cornerEnergySupported === true && panel.record.kind === 'curved_corner') || !Number.isFinite(offset)) return false;
    const max=Math.min(this.normalTravelLimitM,this.rippleGraph?.options?.maxDisplacement||.002);
    panel.ripple = THREE.MathUtils.clamp(offset, -max, max);
    this._updateRippleTilts();
    this.rig.updateTransforms();
    return true;
  }
  setRippleOffsets(offsets) {
    let changed = false;
    for (const [id, offset] of Object.entries(offsets)) {
      const panel = this.panels.get(id);
      if (!panel || !(panel.record.axes || this.manifest.clearanceMetadata?.cornerEnergySupported === true && panel.record.kind === 'curved_corner') || !Number.isFinite(offset)) continue;
      const max=Math.min(this.normalTravelLimitM,this.rippleGraph?.options?.maxDisplacement||.002);
      panel.ripple = THREE.MathUtils.clamp(offset, -max, max);
      this._applyPose(panel);
      changed = true;
    }
    if (changed) {this._updateRippleTilts();this.rig.updateTransforms();}
    return changed;
  }
  setRippleArray(ids, offsets) {
    if (ids.length !== offsets.length) return false;
    let changed = false;
    for (let i = 0; i < ids.length; i++) {
      const panel = this.panels.get(ids[i]), offset = offsets[i];
      if (!panel || !(panel.record.axes || this.manifest.clearanceMetadata?.cornerEnergySupported === true && panel.record.kind === 'curved_corner') || !Number.isFinite(offset)) continue;
      const max=Math.min(this.normalTravelLimitM,this.rippleGraph?.options?.maxDisplacement||.002);
      const bounded = THREE.MathUtils.clamp(offset, -max, max);
      const slopeX=this.rippleGraph?.slopeX?.[i]||0,slopeY=this.rippleGraph?.slopeY?.[i]||0;
      if (panel.ripple === bounded && panel.appliedSlopeX===slopeX && panel.appliedSlopeY===slopeY) continue;
      panel.ripple = bounded;
      panel.appliedSlopeX=slopeX;panel.appliedSlopeY=slopeY;
      changed = true;
    }
    if (changed) {this._updateRippleTilts();this.rig.updateTransforms();}
    return changed;
  }
  flip(panelId, direction = 'N') {
    const panel = this.panels.get(panelId);
    if (!panel || !this.focused || !this.rig.isPanelVisible(panelId) || (panel.record.axes && !COMPASS[direction])) return false;
    // The source clearance audit certifies the default axle envelope. Smaller settings stay inside it.
    if (!this._safeOptions(this.rig.options)) return false;
    if(this.active.get(panelId)?.surprise||this.queue.get(panelId)?.surprise)return false;
    if (this.active.has(panelId)) {
      const turn=this.active.get(panelId);turn.hover=false;turn.hovered=false;
      this._setTurnTarget(turn,turn.angle>HALF_TURN?FULL_TURN:HALF_TURN);return true;
    }
    if (this.queue.has(panelId)) this.queue.set(panelId, {direction,target:HALF_TURN});
    else if (this.queue.size < this.panels.size) this.queue.set(panelId, {direction,target:HALF_TURN});
    else return false;
    this._changed();
    return true;
  }
  hoverEnter(panelId,direction='N'){
    const panel=this.panels.get(panelId);
    if(!panel||!this.focused||!this.rig.isPanelVisible(panelId)||(panel.record.axes&&!COMPASS[direction])||!this._safeOptions(this.rig.options))return false;
    const turn=this.active.get(panelId);
    // Pointer entry must not replace a queued corner action's physical flip.
    const pending=this.queue.get(panelId);
    if(pending&&!pending.hover)return true;
    if(pending?.hover&&pending.target===FULL_TURN){pending.hovered=true;pending.reentryDirection=direction;return true;}
    if(turn){
      if(turn.impact)return true;
      if(turn.hover){turn.hovered=true;turn.reentryDirection=direction;}
      return true;
    }
    this.queue.set(panelId,{direction,target:HALF_TURN,hover:true,hovered:true});this._changed();return true;
  }
  hoverExit(panelId,direction){
    const panel=this.panels.get(panelId);
    const turn=this.active.get(panelId);
    if(turn?.hover){
      turn.hovered=false;
      if(!turn.surprise&&!turn.impact&&panel.record.axes&&COMPASS[direction]&&turn.angle<=HALF_TURN){
        turn.exitAxis.copy(this._axis(panel,direction)).negate();turn.exitDirection=direction;
      }
      this._setTurnTarget(turn,FULL_TURN);return true;
    }
    const pending=this.queue.get(panelId);
    if(pending?.hover){pending.hovered=false;pending.target=FULL_TURN;pending.exitDirection=direction;return true;}
    return false;
  }
  toggleClicked(panelId,options) {
    const panel = this.panels.get(panelId);
    if (!panel?.record.axes) return false;
    return this.setClicked(panelId,!panel.clicked,options);
  }
  clickToggle(panelId) {
    const panel=this.panels.get(panelId);
    if(!panel?.record.axes)return false;
    const turn=this.active.get(panelId),pending=this.queue.get(panelId);
    // Surprise art is never a saved face. Let its committed cycle hide it;
    // clicking still changes the card's mass without interrupting that turn.
    if(turn?.surprise||pending?.surprise)return this.toggleClicked(panelId,{preserveVisible:true});
    if(turn?.hover){
      // Commit the side already facing the viewer, even for a quick click
      // before the hover turn has reached its opposite face.
      const displayFlipped=panel.displayFlipped!==(Math.cos(turn.angle)<0);
      turn.hover=false;turn.hovered=false;
      this._setTurnTarget(turn,Math.round(turn.angle/HALF_TURN)*HALF_TURN);
      this.setDisplayFlipped(panelId,displayFlipped,{preserveVisible:true});
    }else if(pending?.hover){
      // Nothing has turned yet: keep the current face and cancel that hover.
      this.queue.delete(panelId);
    }
    return this.toggleClicked(panelId,{preserveVisible:Boolean(turn)});
  }
  setDisplayFlipped(panelId,value,{preserveVisible=false}={}){
    const panel=this.panels.get(panelId);if(!panel?.record.axes)return false;
    const next=Boolean(value);if(panel.displayFlipped===next)return true;
    panel.displayFlipped=next;
    this.onDisplayChange?.(panelId,{preserveVisible});this._changed();return true;
  }
  setClicked(panelId,value,{immediate=false,preserveVisible=false}={}) {
    const panel=this.panels.get(panelId);if(!panel?.record.axes)return false;
    const next=Boolean(value);if(panel.clicked===next)return true;
    const current = panel.clickFrom + (panel.clickTo - panel.clickFrom) * panel.clickProgress;
    panel.clicked = next;
    panel.clickFrom = current;
    panel.clickTo = Number(panel.clicked);
    panel.clickProgress = this.reducedMotion||immediate ? 1 : 0;
    this._applyMorph(panel);
    this.rig.updateTransforms();
    this.onDisplayChange?.(panelId,{preserveVisible});
    this._changed();
    return true;
  }
  setAllClicked(value){for(const panel of this.panels.values())if(panel.record.axes)this.setClicked(panel.record.panelId,value);return true;}
  impactSpin(panelId,direction='N'){
    const panel=this.panels.get(panelId);
    if(!panel||!this.focused||!this.rig.isPanelVisible(panelId)||!this._safeOptions(this.rig.options)||(panel.record.axes&&!COMPASS[direction]))return false;
    const turn=this.active.get(panelId);
    if(turn){panel.pendingImpact=direction;if(turn.hover){turn.hovered=false;this._setTurnTarget(turn,FULL_TURN);}return true;}
    this.queue.set(panelId,{direction,target:FULL_TURN,hover:true,hovered:false,impact:true});this._changed();return true;
  }
  alignCard(panelId,side){
    const turn=this.active.get(panelId);
    if(turn){turn.afterAlignment=side;if(turn.hover){turn.hovered=false;this._setTurnTarget(turn,FULL_TURN);}return;}
    this.queue.delete(panelId);
    if(this.getLogicalSide(panelId)!==side)this.queue.set(panelId,{direction:'N',target:HALF_TURN,landingSide:side});
  }
  normalizeAllClicked(value){
    if(!this.focused||!this._safeOptions(this.rig.options)||[...this.active.values(),...this.queue.values()].some(turn=>turn.surprise))return false;
    const cards=[...this.panels.values()].filter(panel=>panel.record.axes);
    // Vote on the mapping between mass and artwork, so the two ALL buttons
    // select opposite sides even when the current saved display is mixed.
    const iconVotes=cards.filter(panel=>(this.getLogicalSide(panel.record.panelId)==='icon')===panel.clicked).length;
    const clickedSide=iconVotes>cards.length/2?'icon':'name',side=value?clickedSide:clickedSide==='icon'?'name':'icon';
    for(const panel of cards){this.setClicked(panel.record.panelId,value,{preserveVisible:true});this.alignCard(panel.record.panelId,side);}
    this._changed();return true;
  }
  invertClicked(){for(const panel of this.panels.values())if(panel.record.axes)this.toggleClicked(panel.record.panelId);return true;}
  toggleDisplayBaseline(){this.displayBaseline=this.displayBaseline==='icon'?'name':'icon';for(const panel of this.panels.values())if(panel.record.axes)this.onDisplayChange?.(panel.record.panelId,this.getLogicalSide(panel.record.panelId));this._changed();return this.displayBaseline;}
  setAllClickedAnimated(value){
    if(!this.focused||!this._safeOptions(this.rig.options))return false;
    const next=Boolean(value);
    for(const [id,panel] of this.panels)if(panel.record.axes&&panel.clicked!==next&&this.flip(id,'N'))
      this.setClicked(id,next,{preserveVisible:true});
    return true;
  }
  invertClickedAnimated(){
    if(!this.focused||!this._safeOptions(this.rig.options))return false;
    for(const [id,panel] of this.panels)if(panel.record.axes&&this.flip(id,'N'))
      this.setClicked(id,!panel.clicked,{preserveVisible:true});
    return true;
  }
  toggleDisplayBaselineAnimated(){
    if(!this.focused||!this._safeOptions(this.rig.options))return false;
    if([...this.active.values(),...this.queue.values()].some(turn=>turn.surprise))return false;
    const ids=[...this.panels].filter(([,panel])=>panel.record.axes).map(([id])=>id);
    for(const id of ids)if(!this.flip(id,'N'))return false;
    this.displayBaseline=this.displayBaseline==='icon'?'name':'icon';
    for(const id of ids)this.onDisplayChange?.(id,{preserveVisible:true});
    this._changed();return this.displayBaseline;
  }
  getLogicalSide(panelId){const panel=this.panels.get(panelId);if(!panel?.record.axes)return null;return panel.displayFlipped?(this.displayBaseline==='icon'?'name':'icon'):this.displayBaseline;}
  getDisplayState(panelId){const panel=this.panels.get(panelId);return panel?{clicked:panel.clicked,displayFlipped:panel.displayFlipped,baseline:this.displayBaseline,logicalSide:this.getLogicalSide(panelId),hoverAngle:panel.turn?.angle||0}:null;}
  _applyMorph(panel) {
    const value = panel.clickFrom + (panel.clickTo - panel.clickFrom) * panel.clickProgress;
    for (const mesh of panel.morphs) mesh.morphTargetInfluences[mesh.morphTargetDictionary.Clicked] = value;
    const previousValue=panel.appliedMorph??0;panel.appliedMorph=value;
    if(value!==previousValue)this.onShapeProgress?.({panelId:panel.record.panelId,value,previousValue});
  }
  _axis(panel, direction) {
    if (!panel.record.axes) return vec(panel.record.energyPolicy.virtualHingeAxisGltf || panel.record.energyPolicy.allowedThroughBodyAxisGltf).normalize();
    const [x,y] = COMPASS[direction];
    // axis × clicked direction points toward negative face normal (away from viewer).
    const axis = new THREE.Vector3(-y, x, 0).normalize();
    const authored = panel.record.axes.find(a => a.name === AXIS[direction]);
    const reference = vec(authored.axisGltf).normalize();
    if (Math.abs(reference.dot(axis)) < .999) throw new Error(`Compass axis mismatch ${panel.record.panelId}:${direction}`);
    return axis;
  }
  _conflicts(panel) {
    for (const other of this.active.values()) {
      if (other.panel === panel) return true;
      // Only a model-bound continuous projection certificate can replace the
      // fallback spheres. The safe-options gate still bounds all visible juts.
      const clearance=this.manifest.clearanceMetadata;
      const proof=clearance?.independentPanelFlips||clearance?.independentSquareFlips;
      if(proof?.certified===true&&proof.minimumSeparatingGapM>.002&&Array.isArray(proof.panelIds)&&
        (clearance?.independentPanelFlips||panel.record.axes&&other.panel.record.axes)&&
        proof.panelIds.includes(panel.record.panelId)&&proof.panelIds.includes(other.panel.record.panelId)&&
        this._safeOptions(this.rig.options))continue;
      if (panel.center.distanceTo(other.panel.center) < panel.radius + other.panel.radius) return true;
    }
    return false;
  }
  _safeOptions(o) {
    return o.axleDiameter <= .010001 && o.squareJut <= .006001 &&
      (o.matchDiagonal || o.diagonalJut <= .006001) && o.stubLengthFactor <= 1.000001;
  }
  _setTurnTarget(turn,target){
    turn.target=target;
    this._turnQuaternion(turn,target,turn.end);
  }
  _turnQuaternion(turn,angle,result){
    if(turn.exitAxis&&angle>HALF_TURN)return result.setFromAxisAngle(turn.exitAxis,angle-HALF_TURN).multiply(turn.mid);
    return result.setFromAxisAngle(turn.axis,angle).multiply(turn.start);
  }
  _start(panel, direction, target=HALF_TURN, hover=false, hovered=false, exitDirection) {
    const axis = this._axis(panel, direction);
    panel.lastFlipAxis=axis.clone();
    const start = panel.baseQuaternion.clone();
    const mid = new THREE.Quaternion().setFromAxisAngle(axis, HALF_TURN).multiply(start);
    const exitAxis=hover?(panel.record.axes&&COMPASS[exitDirection]?this._axis(panel,exitDirection).negate():axis.clone()):null;
    const turn = {panel, direction, axis, start, mid, exitAxis, exitDirection, end:new THREE.Quaternion(), angle:0, target, hover, hovered, angularVelocity:0};
    this._setTurnTarget(turn,target);
    panel.turn = turn;
    this.active.set(panel.record.panelId, turn);
    this.queue.delete(panel.record.panelId);
    // Print landing predictions read the unperturbed authored flip pose.
    panel.pivot.quaternion.copy(start);
    this.onFlipStart?.({panelId:panel.record.panelId,direction,axis:axis.clone()});
    return turn;
  }
  update(dt) {
    if (this.paused || document.hidden) return;
    dt = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
    const mustRaise = this.active.size || this.queue.size || !this.canRetract();
    const desired = mustRaise ? 1 : this.target;
    const old = this.rig.deployment;
    if (this.reducedMotion) {
      this.velocity = 0;
      if (Math.abs(old-desired)>EPS) this.rig.setDeployment(desired);
    } else {
      const error = desired - old;
      this.velocity += (144 * error - 24 * this.velocity) * dt;
      this.velocity = THREE.MathUtils.clamp(this.velocity, -2.5, 2.5);
      let next = old + this.velocity * dt;
      if ((error >= 0 && next >= desired) || (error <= 0 && next <= desired) || Math.abs(error) < .001 && Math.abs(this.velocity) < .03) {
        next = desired;
        this.velocity = 0;
      }
      if (Math.abs(old-next)>EPS) this.rig.setDeployment(next);
    }
    let changed = Math.abs(old - this.rig.deployment) > EPS, pivotChanged = false;
    if (this.rig.deployment === 1 && this.focused) {
      for (const [id, request] of [...this.queue]) {
        const panel = this.panels.get(id);
        if (!this._safeOptions(this.rig.options) || !this.rig.isPanelVisible(id)) {this.queue.delete(id);changed = true;continue;}
        if (!this._conflicts(panel)) {if(request.landingSide)this.setDisplayFlipped(id,request.landingSide!==this.displayBaseline,{preserveVisible:true});const turn=this._start(panel, request.direction, request.target, request.hover, request.hovered, request.exitDirection);turn.surprise=Boolean(request.surprise);turn.impact=Boolean(request.impact);turn.reentryDirection=request.reentryDirection;changed = true;pivotChanged = true;}
      }
    }
    for (const [id, turn] of [...this.active]) {
      const previousAngle=turn.angle;
      if(this.reducedMotion){turn.angle=turn.target;turn.angularVelocity=0;}
      else{
        const acceleration=105*(turn.target-turn.angle)-19*turn.angularVelocity;
        turn.angularVelocity=THREE.MathUtils.clamp(turn.angularVelocity+acceleration*dt,-7,7);
        turn.angle=THREE.MathUtils.clamp(turn.angle+turn.angularVelocity*dt,0,Math.max(turn.target,previousAngle));
        if(Math.abs(turn.target-turn.angle)<.002&&Math.abs(turn.angularVelocity)<.035){turn.angle=turn.target;turn.angularVelocity=0;}
      }
      this._turnQuaternion(turn,turn.angle,turn.panel.baseQuaternion);
      const axis=turn.exitAxis&&turn.angle>HALF_TURN?turn.exitAxis:turn.axis;
      turn.panel.lastFlipAxis.copy(axis);
      this.onFlipProgress?.({panelId:id,axis,angle:turn.angle,previousAngle});
      if (turn.angle===turn.target&&turn.angularVelocity===0&&(!turn.hover||turn.target===FULL_TURN)) {
        turn.panel.baseQuaternion.copy(turn.end);turn.panel.turn = null;this.active.delete(id);
        this.onFlipEnd?.({panelId:id,direction:turn.exitDirection||turn.direction,axis:axis.clone()});this.onDisplayChange?.(id,this.getLogicalSide(id));
        if(turn.afterAlignment){this.alignCard(id,turn.afterAlignment);if(!this.queue.has(id)&&turn.panel.pendingImpact){const direction=turn.panel.pendingImpact;turn.panel.pendingImpact=null;this.impactSpin(id,direction);}}
        else if(turn.panel.pendingImpact){const direction=turn.panel.pendingImpact;turn.panel.pendingImpact=null;this.impactSpin(id,direction);}
        else if(turn.hover&&turn.hovered)this.queue.set(id,{direction:turn.reentryDirection||turn.direction,target:HALF_TURN,hover:true,hovered:true});
      }
      changed = true;pivotChanged = true;
    }
    for (const panel of this.panels.values()) if (panel.clickProgress < 1) {
      panel.clickProgress = this.reducedMotion ? 1 : Math.min(1, panel.clickProgress + dt / .25);
      this._applyMorph(panel);changed = true;pivotChanged = true;
    }
    if (changed) {if (pivotChanged){for(const panel of this.panels.values())this._applyPose(panel);this.rig.updateTransforms();}this._changed();}
  }
  reset() {
    this.queue.clear();this.active.clear();this.velocity = 0;
    this.target = this.manifest.deploy.defaultPreview;
    this.manualTarget = this.target;
    this.displayBaseline='icon';
    this.focused = true;this.autoFocus = false;this.paused = false;this.reducedMotion = false;
    for (const panel of this.panels.values()) {
      panel.pivot.quaternion.copy(panel.restQuaternion);
      panel.pivot.position.copy(panel.restPosition);
      panel.baseQuaternion.copy(panel.restQuaternion);panel.tiltQuaternion.identity();
      panel.turn = null;panel.pendingImpact=null;panel.lastFlipAxis=null;panel.clicked = false;panel.displayFlipped=false;panel.clickFrom = panel.clickTo = 0;panel.clickProgress = 1;panel.ripple = 0;panel.appliedMorph=0;
      this._applyMorph(panel);
    }
    this.rig.setDeployment(this.target);
    this.rig.updateTransforms();this.onReset?.();for(const panel of this.panels.values())if(panel.record.axes)this.onDisplayChange?.(panel.record.panelId,this.getLogicalSide(panel.record.panelId));this._changed();
  }
  getStatus() {return {deployment:this.rig.deployment,target:this.target,velocity:this.velocity,
    focused:this.focused,autoFocus:this.autoFocus,active:[...this.active.keys()],queued:[...this.queue.keys()],
    reducedMotion:this.reducedMotion,paused:this.paused};}
  subscribe(listener){this.changeListeners.add(listener);return()=>this.changeListeners.delete(listener);}
  _changed() {const status=this.getStatus();this.onChange?.(status);for(const listener of this.changeListeners)listener(status);}
  dispose() {this.queue.clear();this.active.clear();this.rig.canApplyOptions=this.previousOptionGuard;for(const panel of this.panels.values()){
    panel.pivot.quaternion.copy(panel.restQuaternion);panel.pivot.position.copy(panel.restPosition);
    panel.baseQuaternion.copy(panel.restQuaternion);panel.tiltQuaternion.identity();
    for(const mesh of panel.morphs)mesh.morphTargetInfluences[mesh.morphTargetDictionary.Clicked]=0;
  }this.rig.updateTransforms();this.changeListeners.clear();this.onChange = this.onFlipStart = this.onFlipEnd = this.onFlipProgress = this.onReset = null;}
}

export {COMPASS, AXIS};

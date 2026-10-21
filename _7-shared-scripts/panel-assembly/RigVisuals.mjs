import * as THREE from 'three';
import {CardDepth,cardDepthDefaults,cardDepthLimits} from './CardDepth.mjs';

const Y = new THREE.Vector3(0, 1, 0);
const PROFILES = ['flat', 'rounded', 'pointed'];
const toGltf = p => [p[0], p[2], -p[1]];
const clamp = (v, lo, hi, fallback) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
const vector = p => new THREE.Vector3(...p);
const CARD_PREFS_KEY = 'skills-card-appearance-v1';
const cardColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
const readCardPrefs = () => {try{return JSON.parse(globalThis.localStorage?.getItem(CARD_PREFS_KEY)||'null');}catch{return null;}};
const writeCardPrefs = options => {try{globalThis.localStorage?.setItem(CARD_PREFS_KEY,JSON.stringify({
  sideCardColor:options.sideCardColor,cornerCardColor:options.cornerCardColor,
  showSidePanels:options.showSidePanels}));}catch{}};

/** Review-only geometry controls. No simulation, flip policy or animation loop. */
export class RigVisuals {
  constructor(model, manifest, findRawNode) {
    this.model = model;
    this.manifest = manifest;
    this.findRawNode = findRawNode;
    this.deployNode = findRawNode(manifest.exportHierarchy.deployNode);
    if (!this.deployNode) throw new Error('Missing v7 deployment carriage');
    this.options = {showAxles: true, showSidePanels: manifest.clearanceMetadata?.cornerEnergySupported !== true, capProfile: 'pointed', axleDiameter: .01,
      squareJut: .006, diagonalJut: .006, stubLengthFactor: 1, matchDiagonal: true,...cardDepthDefaults};
    this.canApplyOptions = () => true;
    this.lastOptionRejection = '';
    this.deployment = 0;
    this.restDeployPosition = this.deployNode.position.clone();
    this.lift = vector(toGltf(manifest.deploy.liftVectorWorld));
    this.group = new THREE.Group();
    this.group.name = 'Adjustable decorative panel axles';
    this.deployNode.add(this.group);
    this.originalVisibility = new Map();
    this.rimCaps=Object.values(manifest.clearanceMetadata?.circularRim?.rimCapNodeNames||{}).map(name=>{
      const node=findRawNode(name);if(!node)throw new Error(`Missing rim energy cap ${name}`);this.originalVisibility.set(node,node.visible);return node;
    });
    this.pivotVisibility = new Map();
    this.hubs = [];
    this.sidePanels = new Set(manifest.perimeterPanels.filter(p => p.kind !== 'curved_corner').map(p => p.panelId));
    this.panels = new Map();
    for (const panel of [...manifest.squarePanels, ...manifest.perimeterPanels]) {
      const node = findRawNode(panel.exportPivotName);
      if (!node) throw new Error(`Missing panel pivot ${panel.panelId}`);
      node.updateMatrix();
      this.panels.set(panel.panelId, {node, inverseRest: node.matrix.clone().invert()});
      this.pivotVisibility.set(node, node.visible);
    }
    this.originalBodyMaterials = new Map();
    this.cardMaterials = [];
    this.contrastGain = 1;
    const defaults = {};
    for (const panel of manifest.perimeterPanels) {
      const body = findRawNode(panel.exportBodyName);
      if (!body) throw new Error(`Missing card body ${panel.panelId}`);
      const kind = panel.kind === 'curved_corner' ? 'cornerCardColor' : 'sideCardColor';
      let found = false;
      body.traverse(mesh => {
        if (!mesh.isMesh) return;
        const original = mesh.material;
        const clone = material => {
          if (!material?.color || !/Body structural color|V17 deep yellow background/i.test(material.name || '')) return material;
          found = true;
          defaults[kind] ??= `#${material.color.getHexString()}`;
          const owned = material.clone();
          this.cardMaterials.push({kind,material:owned});
          return owned;
        };
        const replacement = Array.isArray(original) ? original.map(clone) : clone(original);
        if (replacement !== original) {this.originalBodyMaterials.set(mesh,original);mesh.material = replacement;}
      });
      if (!found) throw new Error(`Missing structural body material ${panel.panelId}`);
    }
    this.defaultCardColors = Object.freeze({sideCardColor:defaults.sideCardColor,
      cornerCardColor:defaults.cornerCardColor});
    Object.assign(this.options,this.defaultCardColors);
    this.cardDepth=new CardDepth(this);this.cardDepth.apply(this.options);
    this.squareProfiles = measureSquareProfiles(manifest, findRawNode, this.deployNode);
    const hideBaked = name => {
      const node = findRawNode(name);
      if (!node) throw new Error(`Missing decorative axle node ${name}`);
      this.originalVisibility.set(node, node.visible);
      node.visible = false;
      return node;
    };
    let sourceMaterial;
    for (const axis of manifest.squareVisualAxes) {
      const node = hideBaked(axis.exportMeshName);
      node.traverse(o => { if (!sourceMaterial && o.isMesh) sourceMaterial = Array.isArray(o.material) ? o.material[0] : o.material; });
    }
    for (const panel of manifest.perimeterPanels) {
      if (panel.exportMovingStubName) {
        const stub = findRawNode(panel.exportMovingStubName);
        if (stub) hideBaked(panel.exportMovingStubName);
        else if (panel.kind !== 'curved_corner' || manifest.clearanceMetadata?.cornerEnergySupported !== true)
          throw new Error(`Missing decorative axle node ${panel.exportMovingStubName}`);
      }
      for (const name of panel.exportHubNames || []) {
        const node = findRawNode(name);
        if (!node) throw new Error(`Missing visual hub ${name}`);
        this.originalVisibility.set(node, node.visible);
        this.hubs.push(node);
      }
    }
    this.material = sourceMaterial?.clone() ?? new THREE.MeshStandardMaterial({color: '#a4afb7', metalness: .78, roughness: .33});
    this.material.name = 'Adjustable axle metal';
    this.coreGeometry = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false);
    this.capGeometry = capGeometry(this.options.capProfile);
    this.coreMesh = new THREE.InstancedMesh(this.coreGeometry, this.material, 116);
    this.capMesh = new THREE.InstancedMesh(this.capGeometry, this.material, 232);
    this.coreMesh.name = 'Batched axle cores';
    this.capMesh.name = 'Batched axle caps';
    for (const mesh of [this.coreMesh, this.capMesh]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.supports = manifest.supports.map(s => {
      const aim = findRawNode(s.aimNode), inner = findRawNode(s.innerMesh);
      if (!aim || !inner) throw new Error(`Missing telescopic support ${s.id}`);
      return {record: s, aim, inner, anchor: vector(s.anchorGltf), seat: vector(s.seatParkedGltf),
        restAimQuaternion: aim.quaternion.clone(),
        restAimPosition: aim.position.clone()};
    });
    this._inverseDeploy = new THREE.Matrix4();
    this._parentMatrix = new THREE.Matrix4();
    this._instance = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._rotation = new THREE.Quaternion();
    this._supportDirection = new THREE.Vector3();
    this.rebuild();
    this.setDeployment(manifest.deploy.defaultPreview);
    this.setOptions(manifest.clearanceMetadata?.cornerEnergySupported === true ? readCardPrefs() || {} : {});
  }

  setOptions(partial = {}) {
    const before = this.options;
    const next = {...before};
    for (const key of ['showAxles', 'showSidePanels', 'matchDiagonal']) if (Object.hasOwn(partial, key)) next[key] = Boolean(partial[key]);
    for (const key of ['sideCardColor','cornerCardColor']) if (Object.hasOwn(partial,key))
      next[key] = cardColor(partial[key]) || before[key];
    for(const [key,[lo,hi]]of Object.entries(cardDepthLimits))if(Object.hasOwn(partial,key))next[key]=clamp(partial[key],lo,hi,before[key]);
    if (PROFILES.includes(partial.capProfile)) next.capProfile = partial.capProfile;
    this.lastOptionAdjustment='';
    for (const [key, lo, hi] of [['axleDiameter', .006, .01], ['squareJut', .002, .006],
      ['diagonalJut', .002, .006], ['stubLengthFactor', .8, 1]]) {
      if (Object.hasOwn(partial, key)) {next[key] = clamp(partial[key], lo, hi, before[key]);if(Number.isFinite(Number(partial[key]))&&Number(partial[key])>hi)this.lastOptionAdjustment='Axle sizes limited to the supported flip range.';}
    }
    if (!this.canApplyOptions(next, before)) {
      this.lastOptionRejection = 'Finish active turns before changing card depth or increasing axle geometry.';
      return this;
    }
    this.lastOptionRejection = '';
    this.options = next;
    if(Object.keys(cardDepthLimits).some(key=>next[key]!==before[key])){
      this.cardDepth.apply(next);this.squareProfiles=measureSquareProfiles(this.manifest,this.findRawNode,this.deployNode);
    }
    for (const {kind,material} of this.cardMaterials) material.color.set(next[kind]);
    this.applyCornerGlow();
    if (this.manifest.clearanceMetadata?.cornerEnergySupported === true &&
        (next.sideCardColor !== before.sideCardColor || next.cornerCardColor !== before.cornerCardColor ||
        next.showSidePanels !== before.showSidePanels)) writeCardPrefs(next);
    if (next.capProfile !== before.capProfile) {
      const old = this.capGeometry;
      this.capGeometry = capGeometry(next.capProfile);
      this.capMesh.geometry = this.capGeometry;
      old.dispose();
    }
    const structural = ['axleDiameter', 'squareJut', 'diagonalJut', 'stubLengthFactor', 'matchDiagonal'];
    if (structural.some(key => next[key] !== before[key])) this.rebuild();
    this.group.visible = next.showAxles;
    for(const node of this.rimCaps)node.visible=next.showAxles;
    for (const panel of this.manifest.perimeterPanels) {
      const visible = this.isPanelVisible(panel.panelId);
      this.panels.get(panel.panelId).node.visible = visible;
      for (const name of panel.exportHubNames || []) {
        const node = this.findRawNode(name);
        if (node) node.visible = visible && next.showAxles && this.originalVisibility.get(node);
      }
    }
    this.updateTransforms();
    return this;
  }

  isPanelVisible(panelId) { return !this.sidePanels.has(panelId) || this.options.showSidePanels; }

  applyCornerGlow() {
    for(const {kind,material} of this.cardMaterials){
      if(kind!=='cornerCardColor')continue;
      // Keep the chosen hue even for near-black body colors, whose raw emissive
      // RGB would otherwise make the requested glow disappear.
      const glow=new THREE.Color(this.options.cornerCardColor);
      const peak=Math.max(glow.r,glow.g,glow.b);
      if(peak<.22){if(peak>0)glow.multiplyScalar(.22/peak);else glow.setRGB(.22,.22,.22);}
      material.emissive.copy(glow);
      material.emissiveIntensity=.33*this.contrastGain;
    }
  }

  setContrastGain(gain) {
    this.contrastGain=clamp(gain,0,2,1);
    this.applyCornerGlow();
  }

  setDeployment(value) {
    this.deployment = clamp(value, 0, 1, this.deployment);
    this.deployNode.position.copy(this.restDeployPosition).addScaledVector(this.lift, this.deployment);
    for (const {record, aim, inner, anchor, seat, restAimQuaternion, restAimPosition} of this.supports) {
      this._supportDirection.copy(seat).addScaledVector(this.lift, this.deployment).sub(anchor);
      const length = this._supportDirection.length();
      if (record.runtimeAimAndSlide.type === 'linearGuide') {
        aim.position.copy(restAimPosition);
        aim.quaternion.copy(restAimQuaternion);
        // The exported GLB rod vertices run along local Y (native Blender Z).
        const start = record.runtimeAimAndSlide.innerLocalTranslationY ?? record.runtimeAimAndSlide.nativeInnerLocalTranslationZ ?? record.runtimeAimAndSlide.innerStartsAtM;
        inner.position.set(0, start, 0);
        inner.scale.set(1, Math.max(.01, length - start), 1);
      } else {
        aim.position.copy(anchor);
        aim.quaternion.setFromUnitVectors(Y, this._supportDirection.normalize());
        inner.position.set(0, record.runtimeAimAndSlide.innerStartsAtM, 0);
        inner.scale.set(1, Math.max(.01, length - record.runtimeAimAndSlide.innerStartsAtM), 1);
      }
    }
    this.updateTransforms();
    return this;
  }

  rebuild() {
    const o = this.options;
    this.cores = [];
    this.caps = [];
    this.squareOverrides = [];
    this.perimeterOverrides = [];
    this.morphAxles = [];
    const add = (records, panelId, a, b, radius, role) => {
      const panel = this.panels.get(panelId);
      const start = a.clone().applyMatrix4(panel.inverseRest);
      const end = b.clone().applyMatrix4(panel.inverseRest);
      const entry = {panelId, node: panel.node, start, end, radius, role};
      records.push(entry);
      return entry;
    };
    for (const panel of this.manifest.squarePanels) {
      for (const axis of panel.axes) {
        const bases = [], tips = [], caps = [];
        const profile = this.squareProfiles.get(panel.panelId);
        for (const sign of [-1, 1]) {
          const end = axis.ends[String(sign)];
          const direction = vector(end.outwardAxisGltf).normalize();
          const edge = vector(end.bodyExitGltf);
          const jut = axis.name.startsWith('D') && !o.matchDiagonal ? o.diagonalJut : o.squareJut;
          const base = edge.clone().addScaledVector(direction, .001);
          const tip = base.clone().addScaledVector(direction, (jut - .001) * o.stubLengthFactor);
          const cap = add(this.caps, panel.panelId, base, tip, o.axleDiameter / 2, 'square-end');
          caps.push(cap);
          const localDirection = direction.clone().transformDirection(this.panels.get(panel.panelId).inverseRest);
          this.morphAxles.push({profile, cap, localDirection,
            base: cap.start.clone(), tip: cap.end.clone(), delta: profile.edges[axis.name][String(sign)], last: NaN});
          bases.push(base); tips.push(tip.toArray());
        }
        const core = add(this.cores, panel.panelId, bases[0], bases[1], o.axleDiameter / 2, 'square-core');
        this.morphAxles.push({core, caps});
        this.squareOverrides.push({panelId: panel.panelId, appId: panel.appId, axis: axis.name,
          restGltf: tips, exportMeshName: axis.exportMeshName});
      }
    }
    for (const panel of this.manifest.perimeterPanels) {
      if (this.manifest.clearanceMetadata?.cornerEnergySupported === true && panel.kind === 'curved_corner') {
        // Manifest-bound body tips meet the virtual lattice bindings without a
        // radial through-shaft, bearing, or hub.
        const segments = panel.stubSegments.map(stub => {
          const root = vector(stub.restGltf[0]);
          const a = vector(stub.bodyExitGltf || stub.restGltf[0]);
          const direction = vector(stub.restGltf[1]).sub(root).normalize();
          const originalLength = vector(stub.restGltf[1]).distanceTo(root);
          const nominal = originalLength + stub.tipRetreatM +
            (o.matchDiagonal ? o.squareJut : o.diagonalJut) - .006;
          const length = Math.max(root.distanceTo(a) + .002, nominal * o.stubLengthFactor - stub.tipRetreatM);
          const b = root.clone().addScaledVector(direction, length);
          add(this.caps, panel.panelId, a, b, o.axleDiameter / 2, 'corner-tip');
          return {...stub, restGltf: [root.toArray(), b.toArray()], diameterM: o.axleDiameter};
        });
        this.perimeterOverrides.push({...panel, stubSegments: segments,
          energyPolicy: {...panel.energyPolicy,
            nonAxialTerminationTipsWorld: segments.map(s => [s.restGltf[1][0], -s.restGltf[1][2], s.restGltf[1][1]])}});
        continue;
      }
      const segments = [];
      for (const stub of panel.stubSegments) {
        const a = vector(stub.restGltf[0]);
        const direction = vector(stub.restGltf[1]).sub(a).normalize();
        const originalLength = vector(stub.restGltf[1]).distanceTo(a);
        let nominal = originalLength + stub.tipRetreatM;
        if (panel.kind === 'curved_corner') nominal += (o.matchDiagonal ? o.squareJut : o.diagonalJut) - .006;
        const length = Math.max(.01, nominal * o.stubLengthFactor - stub.tipRetreatM);
        const b = a.clone().addScaledVector(direction, length);
        const shoulder = length < .024 ? length * .25 : .012;
        const startBase = a.clone().addScaledVector(direction, shoulder);
        const endBase = b.clone().addScaledVector(direction, -shoulder);
        add(this.cores, panel.panelId, startBase, endBase, o.axleDiameter / 2, 'perimeter-core');
        add(this.caps, panel.panelId, startBase, a, o.axleDiameter / 2, 'perimeter-start');
        add(this.caps, panel.panelId, endBase, b, o.axleDiameter / 2, 'perimeter-end');
        segments.push({...stub, restGltf: [a.toArray(), b.toArray()], diameterM: o.axleDiameter});
      }
      this.perimeterOverrides.push({...panel, stubSegments: segments,
        energyPolicy: {...panel.energyPolicy, nonAxialTerminationTipsWorld: segments.map(s => [s.restGltf[1][0], -s.restGltf[1][2], s.restGltf[1][1]])}});
    }
    this.coreMesh.count = this.cores.length;
    this.capMesh.count = this.caps.length;
    this.updateTransforms();
    return this;
  }

  /** Call after future panel-pivot transforms; the field does not use these rotations. */
  updateTransforms() {
    // Only slide the existing cap/core endpoints. The energy lattice retains its
    // authored paths and the pooled instanced geometry is never rebuilt here.
    for (const binding of this.morphAxles) {
      if (binding.core) {
        binding.core.start.copy(binding.caps[0].start);
        binding.core.end.copy(binding.caps[1].start);
      } else {
        const {profile, cap, localDirection, base, tip, delta} = binding;
        const weight = profile.mesh.morphTargetInfluences[profile.index];
        if (weight === binding.last) continue;
        cap.start.copy(base).addScaledVector(localDirection, delta * weight);
        cap.end.copy(tip).addScaledVector(localDirection, delta * weight);
        binding.last = weight;
      }
    }
    this.model.updateMatrixWorld(true);
    this._inverseDeploy.copy(this.deployNode.matrixWorld).invert();
    for (const [mesh, entries, cap] of [[this.coreMesh, this.cores, false], [this.capMesh, this.caps, true]]) {
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        this._direction.copy(entry.end).sub(entry.start);
        const length = this._direction.length();
        this._rotation.setFromUnitVectors(Y, this._direction.normalize());
        this._position.copy(entry.start);
        if (!cap) this._position.add(entry.end).multiplyScalar(.5);
        this._scale.set(entry.radius, length, entry.radius);
        if (!this.isPanelVisible(entry.panelId)) this._scale.setScalar(0);
        this._instance.compose(this._position, this._rotation, this._scale);
        this._parentMatrix.multiplyMatrices(this._inverseDeploy, entry.node.matrixWorld);
        this._instance.premultiply(this._parentMatrix);
        mesh.setMatrixAt(index, this._instance);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    return this;
  }

  getPathOverrides() {
    const perimeterPanels = this.perimeterOverrides.map(panel => {
      if (this.manifest.clearanceMetadata?.cornerEnergySupported === true && panel.kind === 'curved_corner' &&
          (!panel.energyPolicy?.frameAnchorNodeName || !this.findRawNode(panel.energyPolicy.frameAnchorNodeName)))
        throw new Error(`Missing fixed carrier binding for corner ${panel.panelId}`);
      if (this.manifest.clearanceMetadata?.cornerEnergySupported === true &&
          panel.kind === 'curved_corner' && !this.options.showAxles) {
        const stubSegments = panel.stubSegments.map(stub => ({...stub,
          restGltf: [stub.restGltf[0], [...(stub.bodyExitGltf || stub.restGltf[0])]]}));
        return {...panel, stubSegments, energyPolicy:{...panel.energyPolicy,
          nonAxialTerminationTipsWorld:stubSegments.map(s=>[s.restGltf[1][0],-s.restGltf[1][2],s.restGltf[1][1]])}};
      }
      if (this.isPanelVisible(panel.panelId) || panel.kind === 'curved_corner' ||
          this.manifest.clearanceMetadata?.cornerEnergySupported !== true) return panel;
      const tips = panel.energyPolicy?.frameAnchorTipsGltf;
      if (!panel.energyPolicy?.frameAnchorNodeName || !this.findRawNode(panel.energyPolicy.frameAnchorNodeName) ||
          !Array.isArray(tips) || tips.length !== panel.stubSegments.length ||
          tips.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))) {
        throw new Error(`Missing fixed carrier energy anchors for hidden side ${panel.panelId}`);
      }
      const stubSegments = panel.stubSegments.map((stub, i) => ({...stub, frameAnchor:true,
        restGltf: [stub.restGltf[0], [...tips[i]]] }));
      return {...panel, stubSegments, energyPolicy: {...panel.energyPolicy,
        nonAxialTerminationTipsWorld: tips.map(p => [p[0], -p[2], p[1]])}};
    });
    return {squareVisualAxes: this.squareOverrides, perimeterPanels};
  }

  getStats() {
    return {deployment: this.deployment, liftDistance: this.lift.length() * this.deployment,
      squareAxes: this.squareOverrides.length, squareEnds: this.squareOverrides.length*2,
      perimeterStubs: this.perimeterOverrides.reduce((n,p)=>n+p.stubSegments.length,0), supportAssemblies: this.supports.length,
      proceduralCores: this.coreMesh.count, proceduralCaps: this.capMesh.count,
      drawCalls: this.options.showAxles ? 2 : 0, options: {...this.options},
      defaultClearanceOnly: true, sampledFlipGate: this.manifest.deploy.recommendedNeutralSquareFlipGate};
  }

  dispose() {
    this.cardDepth.dispose();
    this.group.removeFromParent();
    this.coreGeometry.dispose();
    this.capGeometry.dispose();
    this.material.dispose();
    for (const [node, visible] of this.originalVisibility) node.visible = visible;
    for (const [node, visible] of this.pivotVisibility) node.visible = visible;
    for (const [mesh, material] of this.originalBodyMaterials) mesh.material = material;
    for (const {material} of this.cardMaterials) material.dispose();
  }
}

function measureSquareProfiles(manifest, findRawNode, deployNode) {
  deployNode.updateWorldMatrix(true, true);
  const world = deployNode.matrixWorld, inverse = world.clone().invert();
  const ray = new THREE.Raycaster(), profiles = new Map();
  const origin = new THREE.Vector3(), direction = new THREE.Vector3(), hitPoint = new THREE.Vector3();
  for (const panel of manifest.squarePanels) {
    const body = findRawNode(panel.exportBodyName), morphs = [];
    body.traverse(mesh => {const index = mesh.morphTargetDictionary?.Clicked;
      if (mesh.isMesh && index !== undefined) morphs.push({mesh, index, value: mesh.morphTargetInfluences[index]});});
    if (!morphs.length) throw new Error(`Missing axle morph profile ${panel.panelId}`);
    const center = vector(panel.pivotGltf), edges = {};
    try {
      for (const axis of panel.axes) {
        edges[axis.name] = {};
        for (const sign of [-1, 1]) {
          const outward = vector(axis.ends[String(sign)].outwardAxisGltf).normalize(), distances = [];
          for (const weight of [0, 1]) {
            for (const {mesh, index} of morphs) mesh.morphTargetInfluences[index] = weight;
            origin.copy(center).addScaledVector(outward, .5).applyMatrix4(world);
            direction.copy(outward).negate().transformDirection(world);
            ray.set(origin, direction);
            const hit = ray.intersectObject(body, true)[0];
            if (!hit) throw new Error(`Missing body/axle intersection ${panel.panelId}/${axis.name}/${sign}`);
            hitPoint.copy(hit.point).applyMatrix4(inverse).sub(center);
            distances.push(hitPoint.dot(outward));
          }
          edges[axis.name][String(sign)] = distances[1] - distances[0];
        }
      }
    } finally {for (const {mesh, index, value} of morphs) mesh.morphTargetInfluences[index] = value;}
    profiles.set(panel.panelId, {...morphs[0], edges});
  }
  return profiles;
}

function capGeometry(profile) {
  const segments = 16;
  const levels = profile === 'flat' ? [0, 1] : [0, .18, .48, .76, .92, .98, 1];
  const positions = [], indices = [];
  // The last non-flat ring has tiny positive radius; a separate pole closes it cleanly.
  const rings = profile === 'flat' ? levels : levels.slice(0, -1);
  for (const t of rings) {
    const radius = profile === 'flat' ? 1 : profile === 'rounded' ? Math.sqrt(Math.max(0, 1 - t*t)) : 1 - t;
    for (let j = 0; j < segments; j++) {
      const angle = 2 * Math.PI * j / segments;
      positions.push(radius * Math.cos(angle), t, radius * Math.sin(angle));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i*segments+j, b = i*segments+(j+1)%segments;
      indices.push(a, b, b+segments, a, b+segments, a+segments);
    }
  }
  const bottom = positions.length / 3;
  positions.push(0, 0, 0);
  for (let j = 0; j < segments; j++) indices.push(bottom, (j+1)%segments, j);
  const top = positions.length / 3;
  positions.push(0, 1, 0);
  const last = (rings.length-1)*segments;
  for (let j = 0; j < segments; j++) indices.push(last+j, last+(j+1)%segments, top);
  // Winding above follows an X/Z ring with axial Y; reverse for outward surfaces.
  for (let i = 0; i < indices.length; i += 3) [indices[i+1], indices[i+2]] = [indices[i+2], indices[i+1]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

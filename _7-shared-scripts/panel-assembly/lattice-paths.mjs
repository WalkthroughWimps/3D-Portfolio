/** Immutable, deployed-carriage-local energy channels from v7 rest coordinates. */
const DIR={H:[1,0,0],V:[0,1,0],'D+':[Math.SQRT1_2,Math.SQRT1_2,0],'D-':[Math.SQRT1_2,-Math.SQRT1_2,0]};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const line=(axis,p)=>axis==='H'?p[1]:axis==='V'?p[0]:axis==='D+'?(p[1]-p[0])*Math.SQRT1_2:(p[1]+p[0])*Math.SQRT1_2;
const clone=p=>[...p];
function axisOf(a,b){const dx=b[0]-a[0],dy=b[1]-a[1];if(Math.abs(dy)<Math.abs(dx)*.08)return'H';if(Math.abs(dx)<Math.abs(dy)*.08)return'V';if(Math.abs(Math.abs(dx)-Math.abs(dy))<Math.max(Math.abs(dx),Math.abs(dy))*.08)return dx*dy>=0?'D+':'D-';return null;}

export function pathsFromV7Manifest(manifest,{maxJoinGap=.065,maxTerminationGap=.12,pathOverrides=null}={}){
  if(![7,8,9].includes(manifest?.schemaVersion)||!Array.isArray(manifest.squareVisualAxes)||!Array.isArray(manifest.perimeterPanels))throw new TypeError('Expected skill-card runtime manifest');
  if(!Number.isFinite(maxJoinGap)||maxJoinGap<0||maxJoinGap>.08)throw new RangeError('maxJoinGap');
  const squareAxes=pathOverrides?.squareVisualAxes??manifest.squareVisualAxes;
  const perimeterPanels=pathOverrides?.perimeterPanels??manifest.perimeterPanels;
  if(squareAxes.length!==manifest.squareVisualAxes.length||perimeterPanels.length!==manifest.perimeterPanels.length)throw new Error('Path override counts must match v7 manifest');
  const groups=new Map(),squares=[];
  for(const row of squareAxes){
    const {axis,restGltf,panelId}=row;if(!(axis in DIR)||!Array.isArray(restGltf)||!finite(restGltf[0])||!finite(restGltf[1]))throw new TypeError(`Bad square rest axis ${panelId}`);
    const d=DIR[axis],a=clone(restGltf[0]),b=clone(restGltf[1]);if(dot(a,d)>dot(b,d)){const old=clone(a);a.splice(0,3,...b);b.splice(0,3,...old);}
    const seg={id:`${panelId}:${axis}`,axis,start:a,end:b,from:dot(a,d),to:dot(b,d),line:line(axis,a),depth:(a[2]+b[2])/2};
    if(seg.to-seg.from<.006)throw new RangeError(`Short square axis ${seg.id}`);
    squares.push(seg);const key=`${axis}:${Math.round(seg.line/.002)}:${Math.round(seg.depth/.004)}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(seg);
  }
  const paths=[],stats={squareSegments:squares.length,joinedSquareGaps:0,externalTerminations:0,excludedPerimeterThroughBodies:0,excludedFixedRailAndSupports:true};
  for(const [key,items] of [...groups].sort((a,b)=>a[0].localeCompare(b[0]))){
    items.sort((a,b)=>a.from-b.from||a.id.localeCompare(b.id));let run=null;
    const finish=()=>{if(!run)return;paths.push({id:`${key}:${Math.round(run.originalFrom*1e4)}:${Math.round(run.to*1e4)}`,axis:run.axis,start:run.start,end:run.end,sourceIds:run.ids,gaps:run.gaps,from:run.from,to:run.to,line:run.line,depth:run.depth,terminations:[]});};
    for(const item of items){if(run&&item.from-run.to<=maxJoinGap&&Math.abs(item.line-run.line)<.0018){if(item.from>run.to+.0001){run.gaps.push([run.to,item.from]);stats.joinedSquareGaps++;}if(item.to>run.to){run.to=item.to;run.end=clone(item.end);}run.ids.push(item.id);}else{finish();run={axis:item.axis,start:clone(item.start),end:clone(item.end),originalFrom:item.from,from:item.from,to:item.to,line:item.line,depth:item.depth,ids:[item.id],gaps:[]};}}finish();
  }
  // Only outside-facing cap tips may extend a square channel. Perimeter stubs,
  // tangent hinge axes, carrier rail and cube supports never become field rails.
  const candidates=[];
  for(const panel of perimeterPanels){
    const policy=panel.energyPolicy;
    if(policy?.nonAxialContinuation!=='forbidden_through_perimeter_silhouette' &&
      !(manifest.clearanceMetadata?.cornerEnergySupported===true && panel.kind==='curved_corner' &&
        policy?.cornerEnergySupported===true && policy?.throughBodyCarrier==='forbidden'))
      throw new Error(`Missing perimeter energy policy ${panel.panelId}`);
    for(const stub of panel.stubSegments||[]){if(stub.role!=='decorative_nonaxial_termination')continue;
      const tip=stub.restGltf?.[1];if(!finite(tip))throw new TypeError(`Bad perimeter tip ${panel.panelId}`);
      stats.excludedPerimeterThroughBodies++;
      // V11 corners use explicit inner and outer bridges below. Letting the
      // legacy straight-channel matcher see these tips would double-draw them.
      if(manifest.clearanceMetadata?.cornerEnergySupported===true&&panel.kind==='curved_corner')continue;
      candidates.push({id:`${panel.panelId}:${stub.sourceObject}`,tip,frameAnchor:stub.frameAnchor===true});
    }
  }
  const rimBindings=manifest.clearanceMetadata?.circularRim?.rimCapBindings;
  for(const path of rimBindings?[]:paths){
    const d=DIR[path.axis];for(const side of ['start','end']){
      const end=path[side],endScalar=dot(end,d);let best=null;
      for(const c of candidates){const axis=axisOf(end,c.tip),perp=Math.abs(line(path.axis,c.tip)-path.line),depth=Math.abs(c.tip[2]-path.depth),step=dot(c.tip,d)-endScalar;
        if((!c.frameAnchor&&axis!==path.axis)||perp>(c.frameAnchor?.02:.003)||depth>(c.frameAnchor?.01:.003)||
          (side==='start'?step>=-.0005:step<=.0005)||Math.abs(step)>maxTerminationGap)continue;
        if(Math.hypot(c.tip[0],c.tip[1])<Math.hypot(end[0],end[1])-.001)continue;
        const score=Math.abs(step)+perp*3;
        if(!best||score<best.score)best={...c,score,scalar:dot(c.tip,d)};
      }
      if(best){path.gaps.push(side==='start'?[best.scalar,path.from]:[path.to,best.scalar]);path[side]=clone(best.tip);if(side==='start')path.from=best.scalar;else path.to=best.scalar;path.terminations.push(best.id);stats.externalTerminations++;}
    }
  }
  const frozen=paths.map(p=>{const span=p.to-p.from;return Object.freeze({id:p.id,axis:p.axis,start:Object.freeze(p.start),end:Object.freeze(p.end),length:Math.hypot(...p.end.map((v,i)=>v-p.start[i])),sourceIds:Object.freeze(p.sourceIds),terminations:Object.freeze(p.terminations),gapWindows:Object.freeze(p.gaps.map(g=>Object.freeze([(g[0]-p.from)/span,(g[1]-p.from)/span])).sort((a,b)=>a[0]-b[0]))});});
  if(rimBindings){
    if(!Array.isArray(rimBindings)||![36,44].includes(rimBindings.length))throw new Error('Expected explicit circular-rim connections');
    for(const binding of rimBindings){
      const square=squareAxes.find(a=>a.panelId===binding.panelId&&a.axis===binding.axis),side=binding.sign===-1?0:1;
      const start=square?.restGltf?.[side],end=binding.rimCapTipGltf;
      if(!finite(start)||!finite(end)||!binding.rimCapNodeName)throw new Error(`Missing rim endpoint ${binding.panelId}:${binding.axis}`);
      const path=paths.find(p=>p.axis===binding.axis&&p.sourceIds?.includes?.(`${binding.panelId}:${binding.axis}`)||p.axis===binding.axis&&p.sourceIds===undefined&&p.ids?.includes?.(`${binding.panelId}:${binding.axis}`));
      const owner=path||paths.find(p=>p.axis===binding.axis&&p.sourceIds?.some?.(id=>id===`${binding.panelId}:${binding.axis}`));
      // All explicit square tips must be an extreme of their merged lane.
      if(!owner||Math.min(Math.hypot(...owner.start.map((v,i)=>v-start[i])),Math.hypot(...owner.end.map((v,i)=>v-start[i])))>.03)
        throw new Error(`Rim binding is not a lane terminus ${binding.panelId}:${binding.axis}`);
      frozen.push(Object.freeze({id:`rim-bridge:${binding.panelId}:${binding.axis}:${binding.sign}`,axis:binding.axis,
        start:Object.freeze([...start]),end:Object.freeze([...end]),length:Math.hypot(...end.map((v,i)=>v-start[i])),
        sourceIds:Object.freeze([binding.panelId]),terminations:Object.freeze([binding.rimCapNodeName]),gapWindows:Object.freeze([])}));
      stats.externalTerminations++;
    }
  }
  stats.cornerBridges=0;
  if(manifest.clearanceMetadata?.cornerEnergySupported===true)for(const panel of perimeterPanels){
    if(panel.kind!=='curved_corner')continue;
    const policy=panel.energyPolicy,inners=policy?.innerSquareEndpoints||[policy?.innerSquareEndpoint];
    const indices=policy?.innerStubIndices||[policy?.innerStubIndex];
    if(!policy?.frameAnchorNodeName||!finite(policy?.outerFrameAnchorGltf)||!Number.isInteger(policy.outerStubIndex)||
      !inners.length||inners.length!==indices.length||indices.some(i=>!Number.isInteger(i)||i===policy.outerStubIndex))
      throw new Error(`Missing physical carrier bindings for corner ${panel.panelId}`);
    const bindings=[];
    for(let i=0;i<inners.length;i++){
      const inner=inners[i];if(!inner?.panelId||!(inner.axis in DIR)||![-1,1].includes(inner.sign))throw new Error(`Invalid corner inner endpoint ${panel.panelId}:${i}`);
      const square=squareAxes.find(a=>a.panelId===inner.panelId&&a.axis===inner.axis);
      if(!square)throw new Error(`Missing inner square endpoint ${panel.panelId}`);
      const authored=manifest.squareVisualAxes.find(a=>a.panelId===inner.panelId&&a.axis===inner.axis)?.restGltf?.[inner.sign===-1?0:1];
      if(!finite(inner.capGltf)||!finite(authored)||Math.hypot(...authored.map((v,j)=>v-inner.capGltf[j]))>.0001)
        throw new Error(`Misbound inner square cap ${panel.panelId}:${i}`);
      bindings.push({role:inners.length===1?'inner':`inner-${i+1}`,start:square.restGltf[inner.sign===-1?0:1],
        end:panel.stubSegments[indices[i]]?.restGltf?.[1],axis:inner.axis,source:inner.panelId});
    }
    bindings.push({role:'outer',start:policy.outerFrameAnchorGltf,
      end:panel.stubSegments[policy.outerStubIndex]?.restGltf?.[1],source:policy.frameAnchorNodeName});
    for(const {role,start,end,axis:authoredAxis,source} of bindings){
      if(!finite(start)||!finite(end))throw new TypeError(`Bad corner bridge ${panel.panelId}:${role}`);
      const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy,end[2]-start[2]);
      if(length<.006)throw new RangeError(`Short corner bridge ${panel.panelId}:${role}`);
      const axis=authoredAxis||Object.entries(DIR).sort((a,b)=>Math.abs(dot([dx,dy,0],b[1]))-Math.abs(dot([dx,dy,0],a[1])))[0][0];
      frozen.push(Object.freeze({id:`corner-bridge:${panel.panelId}:${role}`,axis,
        start:Object.freeze([...start]),end:Object.freeze([...end]),length,
        sourceIds:Object.freeze([panel.panelId,source]),terminations:Object.freeze([source]),
        gapWindows:Object.freeze([])}));
      stats.cornerBridges++;
    }
  }
  frozen.sort((a,b)=>a.id.localeCompare(b.id));stats.pathCount=frozen.length;stats.terminationCandidates=candidates.length;stats.gapSites=frozen.reduce((n,p)=>n+p.gapWindows.length,0);
  if(new Set(frozen.map(p=>p.id)).size!==frozen.length)throw new Error('Duplicate energy channel IDs');
  return Object.freeze({paths:Object.freeze(frozen),stats:Object.freeze(stats)});
}

import {clipDuration, placementPlan} from './clip-layout.mjs?v=panel-custom-1';

/** A capture keeps its time; only its voice may change. */
export function capturePlan(clips,candidate,preferred,{strategy=null}={}){
  const base=[...clips,candidate],start=candidate.start,first=((preferred%4)+4)%4;
  for(let step=0;step<4;step++){
    const lane=(first+step)%4,trial=placementPlan(base,candidate.id,{lane,start});
    if(!trial.conflict&&start+clipDuration(trial.candidate)<=60+.001)return {...trial,lane};
  }
  const plan=placementPlan(base,candidate.id,{lane:first,start},{strategy});
  if(!plan.conflict&&start+clipDuration(plan.candidate)>60+.001)throw Error('The recording would run past the end of the reel.');
  return {...plan,lane:first};
}

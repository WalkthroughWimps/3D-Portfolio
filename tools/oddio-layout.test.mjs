import test from 'node:test';
import assert from 'node:assert/strict';
import {ADDON_SPECS,MAIN_PANELS,resolveAddonLayout,constrainAddon,panelEdgeX} from '../_1-about/faces/odd/addon-layout.mjs';

const intersects=(a,b)=>a.minX<b.maxX+.0119&&a.maxX>b.minX-.0119&&a.minY<b.maxY+.0119&&a.maxY>b.minY-.0119;
test('default and extreme control placements fit their host and spheroid reserve',()=>{
  for(const settings of [{},{addonMeterY:82,addonTransportY:74,addonShuttleY:-74,addonMeterGap:30,addonTransportGap:30,addonShuttleGap:30}]){
    const layout=resolveAddonLayout(settings);
    for(const [id,part] of Object.entries(layout)){
      const spec=ADDON_SPECS[id],b=part.bounds,panel=MAIN_PANELS[part.host];
      assert.ok(b.minY>=panel.minY-1e-9&&b.maxY<=panel.maxY+1e-9,id+' host');
      assert.ok(Math.min(Math.abs(b.minX),Math.abs(b.maxX))>=panelEdgeX(part.host,b.minY)-1e-9,id+' edge');
      for(const x of [b.minX,b.maxX])for(const y of [b.minY,b.maxY])assert.ok(Math.hypot(x,y)<=.815+1e-9,id+' circle');
      assert.ok(Math.abs((b.maxX-b.minX)-spec.width)<1e-9);
    }
    const ids=Object.keys(layout);
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)assert.ok(!intersects(layout[ids[i]].bounds,layout[ids[j]].bounds));
  }
});
test('an impossible same-side move keeps the current legal station',()=>{
  const patch=constrainAddon('transport',{side:'left',host:'upper',gap:7.5,y:42.2},{});
  assert.equal(patch.addonTransportSide,'right');
  assert.equal(patch.addonTransportHost,ADDON_SPECS.transport.defaults.host);
});
test('every host and edge request resolves to a physically feasible rectangle',()=>{
  for(const id of Object.keys(ADDON_SPECS))for(const host of ['upper','lower'])for(const side of ['left','right'])for(const y of [-82,-19,19,82])for(const gap of [0,30]){
    const patch=constrainAddon(id,{host,side,y,gap},{}),layout=resolveAddonLayout(patch);
    for(const [name,item] of Object.entries(layout)){
      const b=item.bounds,panel=MAIN_PANELS[item.host];
      assert.ok(b.minY>=panel.minY-1e-9&&b.maxY<=panel.maxY+1e-9,name+' host');
      for(const x of [b.minX,b.maxX])for(const yy of [b.minY,b.maxY])assert.ok(Math.hypot(x,yy)<=.815+1e-9,name+' corner');
    }
  }
  assert.equal(constrainAddon('meter',{host:'lower',y:-40},{}).addonMeterHost,'upper');
});

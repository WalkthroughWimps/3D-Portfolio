/* Pure burst lifecycle and rare-group policy, shared by browser UI and deterministic tests. */
((scope) => {
  function createMotionCore(random=Math.random) {
    let activeKind=null,soloCycles=0,pendingGroup=false;
    return Object.freeze({
      chance(probability) { return probability>0&&probability<=1&&random()<probability; },
      start(kind) { if(activeKind||!['solo','highlight','group'].includes(kind))return false;activeKind=kind;return true; },
      completeCycle() {
        if(!activeKind||activeKind==='group')return soloCycles;
        soloCycles++;
        if(soloCycles%8===0&&!pendingGroup&&random()<.001)pendingGroup=true;
        return soloCycles;
      },
      finish() { if(!activeKind)return null;activeKind=null;if(pendingGroup){pendingGroup=false;return 'group';}return null; },
      cancel() { activeKind=null;pendingGroup=false; },
      snapshot() { return {activeKind,soloCycles,pendingGroup}; }
    });
  }
  const api={createMotionCore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else scope.CakeFlavorMotion=api;
})(typeof window==='undefined'?globalThis:window);

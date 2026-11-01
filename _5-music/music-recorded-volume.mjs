export function createRecordedTrackVolumeRoute() {
  let gainNode = null;
  let context = null;
  let output = null;
  const effectiveLevel = settings => settings?.muted ? 0 : Math.max(0, Math.min(1, Number(settings?.volume) || 0));
  return {
    connectSource(source, audioContext, destination, settings) {
      if(!source || !audioContext || !destination) return null;
      if(!gainNode || context !== audioContext) {
        try{ gainNode?.disconnect(); }catch{}
        context = audioContext;
        gainNode = context.createGain();
        output = null;
      }
      if(output !== destination) {
        try{ gainNode.disconnect(); }catch{}
        gainNode.connect(destination);
        output = destination;
      }
      gainNode.gain.value = effectiveLevel(settings);
      source.connect(gainNode);
      return gainNode;
    },
    update(settings) {
      if(gainNode) gainNode.gain.value = effectiveLevel(settings);
    },
    dispose() {
      try{ gainNode?.disconnect(); }catch{}
      gainNode = null;
      context = null;
      output = null;
    }
  };
}

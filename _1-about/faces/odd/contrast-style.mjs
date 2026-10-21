import {contrastGain} from './theme.mjs?v=contrast-glows-1';

// CSS alpha is bounded; Three's emission uses the same gain without that bound.
export function applyContrastVariables(root,contrast){
  const value=Math.max(0,Math.min(1,Number.isFinite(contrast)?contrast:.5));
  root.style.setProperty('--odd-contrast',value);
  root.style.setProperty('--odd-glow',contrastGain(value));
  root.style.setProperty('--odd-glow-alpha',contrastGain(value)/2.4);
}

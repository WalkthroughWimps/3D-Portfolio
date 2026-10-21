import * as THREE from 'three';
import {getSharedSettings} from '../_7-shared-scripts/core/settings.js';
import {getLightScaleForValue} from '../_7-shared-scripts/scene-lighting-sync.js';

export const MUSIC_GLOW_RATIOS = Object.freeze({keys: .33, labels: .33, sideGreen: .5, sideRed: .15, panelGreen: .15});

// Same intentional-highlight curve as Start and the About cube.
export function musicContrastGlow(value = .5) {
  const c = THREE.MathUtils.clamp(Number.isFinite(value) ? value : .5, 0, 1);
  return .08 + 2.32 * c * c * (3 - 2 * c);
}

function ancestry(node, expression) {
  for (let current = node; current; current = current.parent) {
    if (expression.test(current.name || '')) return true;
  }
  return false;
}

/** Scene-owned material clones; shared textures and geometry stay with the host. */
export function bindMusicHighlights({model, lights = [], keyMaterials = [], signal, settings = getSharedSettings()}) {
  const owned = new Set();
  const cache = new Map();
  const assignments = [];
  const emissions = new Map();
  const sprites = new Map();
  const stripeUniforms = new Set();
  const lightBases = lights.map(light => [light, light.intensity]);
  let snapshot = settings.get();
  let disposed = false;

  function registerMaterial(material, ratio = MUSIC_GLOW_RATIOS.keys) {
    if (!material || disposed || emissions.has(material)) return;
    emissions.set(material, {ratio, original: material.emissiveIntensity});
    material.emissiveIntensity = musicContrastGlow(snapshot.start?.contrast) * ratio;
  }

  function cloneMaterial(source, role) {
    let roles = cache.get(source);
    if (!roles) { roles = new Map(); cache.set(source, roles); }
    if (roles.has(role)) return roles.get(role);
    const material = source.clone();
    material.name = source.name + '__music_' + role;
    material.userData.musicHighlightRole = role;
    owned.add(material);
    roles.set(role, material);
    if (role === 'side-stripes') {
      const glow = {value: musicContrastGlow(snapshot.start?.contrast)};
      stripeUniforms.add(glow);
      const previous = source.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.uniforms.musicContrastGlow = glow;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float musicContrastGlow;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            #ifdef USE_MAP
              // Reuse the base map's own UV channel, transform and color decoding.
              vec3 musicStripe = sampledDiffuseColor.rgb;
              float musicGreen = smoothstep(0.003, 0.018, musicStripe.g - max(musicStripe.r, musicStripe.b));
              float musicRed = smoothstep(0.003, 0.018, musicStripe.r - max(musicStripe.g, musicStripe.b));
              totalEmissiveRadiance += musicStripe * musicContrastGlow * (${MUSIC_GLOW_RATIOS.sideGreen} * musicGreen + ${MUSIC_GLOW_RATIOS.sideRed} * musicRed);
            #endif`);
      };
      material.customProgramCacheKey = () => 'music-side-stripes-v1';
      material.needsUpdate = true;
    } else if (role === 'sprite-label') {
      sprites.set(material, source.color.clone());
    } else if (material.emissive) {
      // Retain the painted color's lightness as well as its hue. Normalizing a
      // dark green to full-strength green would make broad panels look neon.
      material.emissive.copy(source.color);
      material.emissiveMap = source.map || null;
      registerMaterial(material, role === 'panel-green' ? MUSIC_GLOW_RATIOS.panelGreen : MUSIC_GLOW_RATIOS.keys);
    }
    return material;
  }

  model.traverse(node => {
    if (!node.material) return;
    const originals = Array.isArray(node.material) ? node.material : [node.material];
    const next = originals.map(source => {
      if (!source) return source;
      let role;
      if (node.isSprite && ancestry(node, /^(?:user_stickers_group|qwerty_labels_group)$/)) role = 'sprite-label';
      else if (ancestry(node, /^\d{3}_[A-G]#?\d$/)) role = 'key';
      else if (/^(?:noteSticker|noteAccidental|noteText)/i.test(node.name)) role = 'label';
      else if (ancestry(node, /^(?:piano_leftLeg|stripey_stripes)/) && /^Plane_baked/.test(source.name) && source.map) role = 'side-stripes';
      else if (ancestry(node, /^(?:SK_(?:backing|fronting|keysFronting|top|keyboard|bottom|midrail)|piano_leftLeg|stripey_stripes)/)
        && source.color?.g > Math.max(source.color.r, source.color.b) * 1.25) role = 'panel-green';
      return role ? cloneMaterial(source, role) : source;
    });
    if (next.every((material, i) => material === originals[i])) return;
    const original = node.material;
    const replacement = Array.isArray(original) ? next : next[0];
    node.material = replacement;
    const originalKeyMaterial = node.userData._origMaterial;
    if (originalKeyMaterial === original) node.userData._origMaterial = replacement;
    assignments.push({node, original, replacement, originalKeyMaterial});
  });

  for (const material of keyMaterials) registerMaterial(material);

  function apply(next = settings.get()) {
    if (disposed) return;
    snapshot = next;
    const glow = musicContrastGlow(next.start?.contrast);
    for (const [material, {ratio}] of emissions) material.emissiveIntensity = glow * ratio;
    for (const [material, color] of sprites) material.color.copy(color).multiplyScalar(glow * MUSIC_GLOW_RATIOS.labels);
    for (const uniform of stripeUniforms) uniform.value = glow;
    const brightness = THREE.MathUtils.clamp(next.start?.brightness ?? .5, 0, 1);
    const lightScale = getLightScaleForValue(.005 + .995 * brightness) * (1 + 2.15 * Math.pow(brightness, 1.35)) / 2.9925;
    for (const [light, base] of lightBases) light.intensity = base * lightScale;
  }

  const stop = settings.subscribe((next, change) => {
    if (!change?.changed?.length || change.changed.some(key => key === 'start.contrast' || key === 'start.brightness')) apply(next);
  }, {immediate: true});

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    signal?.removeEventListener('abort', dispose);
    for (const {node, original, replacement, originalKeyMaterial} of assignments) {
      if (node.material === replacement) node.material = original;
      if (node.userData._origMaterial === replacement) node.userData._origMaterial = originalKeyMaterial;
    }
    for (const [material, {original}] of emissions) if (!owned.has(material)) material.emissiveIntensity = original;
    for (const [light, base] of lightBases) light.intensity = base;
    for (const material of owned) material.dispose();
    assignments.length = 0;
    owned.clear(); cache.clear(); emissions.clear(); sprites.clear(); stripeUniforms.clear();
  }
  signal?.addEventListener('abort', dispose, {once: true});
  if (signal?.aborted) dispose();
  return {apply, registerMaterial, dispose};
}

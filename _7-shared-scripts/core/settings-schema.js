export const SCHEMA_VERSION = 2;
export const A11Y_KEY = 'site.a11y.settings';
export const SCHEMA_KEY = 'site.settings.schemaVersion';
// Declare new faces here so their persistent fields and common controls agree.
export const ABOUT_FACES = Object.freeze({about: 'About', skills: 'Skills', notes: 'Notes', clock: 'Clock', refs: 'Refs', odd: 'Oddio'});
const numeric = (min, max, snap = false) => value => {
  if (value === null || value === undefined || value === '' || (typeof value === 'string' && !value.trim())) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.max(min, Math.min(max, n));
  return snap ? Math.round(clamped / 5) * 5 : clamped;
};
const bool = value => value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;
const choice = (...values) => value => values.includes(value) ? value : undefined;
const color = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
const podConfig = value => {
  if (typeof value !== 'string' || value.length > 180000) return undefined;
  if (!value) return '';
  try {
    const slots = JSON.parse(value);
    const actions = new Set(['play','reverse','stop','record','wind:1','wind:5','wind:-1','wind:-5','bell','loop','output','upload','undo','redo','console','audition','split','join','reverse-clip']);
    const icons = new Set(['auto',...actions]);
    if (!Array.isArray(slots) || slots.length !== 4 || new Set(slots.map(slot => slot?.action)).size !== 4) return undefined;
    if (!slots.every(slot => slot && actions.has(slot.action) && (slot.color === '' || color(slot.color)) && icons.has(slot.icon) && (slot.image === '' || (typeof slot.image === 'string' && slot.image.length <= 44000 && /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(slot.image))))) return undefined;
    return value;
  } catch { return undefined; }
};
export const SETTINGS_FIELDS = Object.freeze({
  'cube.faceSnap': { key: 'site.cube.faceSnap', default: false, parse: bool },
  'cube.uprightFaces': { key: 'site.cube.uprightFaces', default: true, parse: bool },
  'cube.showShell': { key: 'site.cube.showShell', default: true, parse: bool },
  ...Object.fromEntries(Object.keys(ABOUT_FACES).flatMap(face => [
    [`about.${face}.enabled`, {key: `site.about.${face}.enabled`, default: true, parse: bool}],
    [`about.${face}.showBacking`, {key: `site.about.${face}.showBacking`, default: true, parse: bool}]
  ])),
  'about.odd.armSpeed': {key: 'site.about.odd.armSpeed', default: 1, parse: numeric(.25, 3)},
  'about.odd.sewingAnimations': {key:'site.about.odd.sewing-animations',default:true,parse:bool},
  'about.odd.innerRotation': {key:'site.about.odd.inner-rotation',default:'none',parse:choice('none','clockwise','counterclockwise')},
  'about.odd.innerSpeed': {key:'site.about.odd.inner-speed',default:1,parse:numeric(.2,5)},
  ...Object.fromEntries(['mainMeterWidth','mainMeterHeight','trackMeterWidth','trackMeterHeight'].map(name=>[
    'about.odd.'+name,{key:'site.about.odd.'+name,default:1,parse:numeric(.6,1.1)}
  ])),
  'about.odd.separateSpeeds': {key: 'site.about.odd.separateSpeeds', default: false, parse: bool},
  'about.odd.foldSpeed': {key: 'site.about.odd.foldSpeed', default: 1, parse: numeric(.25, 3)},
  'about.odd.jams': {key: 'site.about.odd.jams', default: false, parse: bool},
  'about.odd.jamFrequency': {key: 'site.about.odd.jamFrequency', default: 10, parse: numeric(0, 100)},
  'about.odd.highlightColor': {key: 'site.about.odd.highlightColor', default: '#d9f5ff', parse: color},
  'about.odd.trackMetersReady': {key:'site.about.odd.track-meters-ready',default:false,parse:bool},
  ...Object.fromEntries(['Transport','Shuttle'].flatMap(id=>[
    [`about.odd.addon${id}FlipX`,{key:`site.about.odd.addon-${id.toLowerCase()}-flip-x`,default:false,parse:bool}],
    [`about.odd.addon${id}FlipY`,{key:`site.about.odd.addon-${id.toLowerCase()}-flip-y`,default:false,parse:bool}],
    [`about.odd.pod${id}Config`,{key:`site.about.odd.pod-${id.toLowerCase()}-config`,default:'',parse:podConfig}]
  ])),
  ...Object.fromEntries(Object.entries({Meter:{side:'left',host:'upper',gap:5,y:39.5},Transport:{side:'right',host:'lower',gap:2,y:-29},Shuttle:{side:'left',host:'lower',gap:7.7,y:-27},TrackMeters:{side:'right',host:'upper',gap:1.8,y:36.5}}).flatMap(([id,value])=>[
    [`about.odd.addon${id}Side`,{key:`site.about.odd.addon-${id.toLowerCase()}-side`,default:value.side,parse:choice('left','right')}],
    [`about.odd.addon${id}Host`,{key:`site.about.odd.addon-${id.toLowerCase()}-host`,default:value.host,parse:choice('upper','lower')}],
    [`about.odd.addon${id}Gap`,{key:`site.about.odd.addon-${id.toLowerCase()}-gap`,default:value.gap,parse:numeric(0,30)}],
    [`about.odd.addon${id}Y`,{key:`site.about.odd.addon-${id.toLowerCase()}-y`,default:value.y,parse:numeric(-82,82)}]
  ])),
  'about.odd.layoutSnapCtrl': {key:'site.about.odd.layout-snap-ctrl',default:1,parse:numeric(.01,10)},
  'about.odd.layoutSnapShift': {key:'site.about.odd.layout-snap-shift',default:.01,parse:numeric(.01,10)},
  'about.odd.layoutSnapBoth': {key:'site.about.odd.layout-snap-both',default:.1,parse:numeric(.01,10)},
  'about.odd.stackBlends': {key: 'site.about.odd.stackBlends', default: true, parse: bool},
  'about.odd.tickSpacingMs': {key: 'site.about.odd.tickSpacingMs', default: 200, parse: value => {const parsed=numeric(50,1000)(value);return parsed===undefined?undefined:Math.round(parsed);}},
  'about.odd.particles': {key: 'site.about.odd.particles', default: true, parse: bool},
  'about.odd.particleDensity': {key: 'site.about.odd.particleDensity', default: 90, parse: numeric(0, 240)},
  'about.odd.particleLife': {key: 'site.about.odd.particleLife', default: 1, parse: numeric(.25, 3)},
  'about.odd.particleSize': {key: 'site.about.odd.particleSize', default: 1, parse: numeric(.25, 3)},
  'about.odd.particleWind': {key: 'site.about.odd.particleWind', default: 1, parse: numeric(-2, 2)},
  'about.odd.particleSpread': {key: 'site.about.odd.particleSpread', default: 1, parse: numeric(0, 3)},
  ...Object.fromEntries(['#cf542c', '#188b91', '#dfaa27', '#788b36'].map((value, i) =>
    [`about.odd.color${i + 1}`, {key: `site.about.odd.color${i + 1}`, default: value, parse: color}])),
  'about.notes.armSpeed': {key: 'site.about.notes.armSpeed', default: 1, parse: numeric(.25, 3)},
  'about.notes.separateSpeeds': {key: 'site.about.notes.separateSpeeds', default: false, parse: bool},
  'about.notes.foldSpeed': {key: 'site.about.notes.foldSpeed', default: 1, parse: numeric(.25, 3)},
  'about.notes.showClippedArt': {key: 'site.about.notes.clipped', default: true, parse: bool},
  'about.notes.rearArtwork': {key: 'site.about.notes.rearArtwork', default: true, parse: bool},
  'about.notes.projector': {key: 'site.about.notes.projector', default: true, parse: bool},
  'about.notes.backingProjection': {key: 'site.about.notes.backingProjection', default: true, parse: bool},
  'about.notes.fitInterior': {key: 'site.about.notes.fitInterior', default: false, parse: bool},
  'about.clock.timeOffsetSeconds': {key: 'site.about.clock.timeOffsetSeconds', default: 0, parse: numeric(-1000000000, 1000000000)},
  'about.clock.markerPhase': {key: 'site.about.clock.markerPhase', default: 0, parse: numeric(-1000000, 1000000)},
  'about.clock.showGroove': {key: 'site.about.clock.showGroove', default: true, parse: bool},
  'about.clock.grooveColor': {key: 'site.about.clock.grooveColor', default: '#a98b55', parse: color},
  ...Object.fromEntries(['hour', 'minute', 'second'].flatMap((hand, i) => [
    [`about.clock.${hand}Visible`, {key: `site.about.clock.${hand}Visible`, default: true, parse: bool}],
    [`about.clock.${hand}Style`, {key: `site.about.clock.${hand}Style`, default: hand === 'second' ? 'baton' : 'tapered', parse: choice('baton', 'tapered', 'skeleton', 'slim-arrow', 'chevron', 'art-deco', 'spade', 'breguet', 'rocket')}],
    [`about.clock.${hand}Length`, {key: `site.about.clock.${hand}Length`, default: [0.39, 0.58, 0.30][i], parse: numeric(hand === 'second' ? .04 : hand === 'minute' ? .45 : .18, hand === 'second' ? .55 : hand === 'minute' ? .82 : .7)}],
    [`about.clock.${hand}Girth`, {key: `site.about.clock.${hand}Girth`, default: [0.035, 0.026, 0.018][i], parse: numeric(.008, .07)}],
    [`about.clock.${hand}Color`, {key: `site.about.clock.${hand}Color`, default: ['#f4f0d9', '#c7e7ff', '#e27d66'][i], parse: color}]
  ])),
  'about.spheroid.enabled': { key: 'site.about.spheroid.enabled', default: true, parse: bool },
  'about.spheroid.pattern': { key: 'site.about.spheroid.pattern', default: 'crossed', parse: choice('crossed', 'ascending', 'descending') },
  'about.spheroid.strands': { key: 'site.about.spheroid.strands', default: 9, parse: numeric(4, 18) },
  'about.spheroid.turns': { key: 'site.about.spheroid.turns', default: 1.35, parse: numeric(.5, 3) },
  'about.spheroid.glow': { key: 'site.about.spheroid.glow', default: .65, parse: numeric(0, 1) },
  'about.spheroid.speed': { key: 'site.about.spheroid.speed', default: .24, parse: numeric(0, 1) },
  'about.spheroid.color': { key: 'site.about.spheroid.color', default: 'cyan', parse: choice('cyan', 'amber', 'violet') },
  'audio.volume': { key: 'site.audio.volume', legacy: ['a11y:masterVolume'], default: 0.25, parse: numeric(0, 1) },
  'audio.muted': { key: 'site.audio.muted', legacy: ['a11y:mute'], default: false, parse: bool },
  'audio.syncMs': { key: 'site.audio.sync', legacy: ['globalAudioMidiOffsetMs', 'a11y:audioSyncMs'], default: -270, parse: numeric(-3000, 3000, true) },
  'audio.preservePitch': { key: 'site.audio.preservePitch', default: false, parse: bool },
  'accessibility.reducedMotion': { key: A11Y_KEY, prop: 'reducedMotion', default: null, parse: bool },
  'accessibility.highContrast': { key: A11Y_KEY, prop: 'highContrast', default: false, parse: bool },
  'accessibility.textScale': { key: A11Y_KEY, prop: 'textScale', default: 1, parse: numeric(1, 1.25) },
  'accessibility.focusOutline': { key: A11Y_KEY, prop: 'focusOutline', default: 'auto', parse: choice('auto', 'always') },
  'scene.lighting': { key: 'site.scene.lighting', default: null, parse: numeric(0, 1) },
  'start.animationAllowed': { key: 'site.start.animation.allowed', default: null, parse: bool },
  'media.syncDrag': { key: 'video-sync-unlimited-drag', default: null, parse: choice('enabled', 'disabled') },
  'media.tabletFocus': { key: 'video.tablet.focus', default: false, parse: bool },
  'start.contrast': { key: 'site.contrast.value', default: 0.5, parse: numeric(0, 1) },
  'start.brightness': { key: 'site.start.brightness', default: 0.5, parse: numeric(0, 1) },
  'start.backgroundContrast': { key: 'site.start.background.contrast', default: 0.5, parse: numeric(0, 1) },
  'start.look.underlight': { key: 'site.start.look.underlight', default: 0.65, parse: numeric(0, 3) },
  'start.look.speakerPurple': { key: 'site.start.look.speaker-purple', default: 0.65, parse: numeric(0, 3) },
  'music.masterGain': { key: 'music.instrument.master', default: 0.85, parse: numeric(0.2, 3) }
});
export const SETTINGS_KEYS = new Set([SCHEMA_KEY, A11Y_KEY, ...Object.values(SETTINGS_FIELDS).flatMap(field => [field.key, ...(field.legacy || []).filter(key => !key.startsWith('a11y:'))])]);
export function flattenPatch(input, prefix = '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const values = {};
  for (const [name, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (SETTINGS_FIELDS[path]) values[path] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenPatch(value, path);
      if (nested === null) return null;
      Object.assign(values, nested);
    } else values[path] = value;
  }
  return values;
}

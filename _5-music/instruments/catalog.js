// One catalog per Music session. Configs stay mutable: loaders attach sample ranges
// and dynamic pickers register additional IDs in the same map. No audio or storage.
export function createInstrumentCatalog({ SOUND_FONT_BASE, LOCAL_SOUNDFONT_BASES, SF2_HYPERSOUND_URL, SALAMANDER_DRUM_RANGE }) {
const SOUND_LIBRARY_CONFIG = {
  keys: {
    id: 'keys',
    sources: [
      { name: 'local-musyngkite', soundfont: '.', format: 'mp3', url: SOUND_FONT_BASE },
      { name: 'local-fluidr3', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.fluidr3_gm }
    ]
  },
  electric: {
    id: 'electric',
    sources: [
      { name: 'local-fluidr3', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.fluidr3_gm },
      { name: 'local-musyngkite', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.musyngkite }
    ]
  },
  pads: {
    id: 'pads',
    sources: [
      { name: 'local-fluidr3', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.fluidr3_gm },
      { name: 'local-musyngkite', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.musyngkite }
    ]
  },
  solo: {
    id: 'solo',
    sources: [
      { name: 'local-fluidr3', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.fluidr3_gm },
      { name: 'local-musyngkite', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.musyngkite }
    ]
  },
  fx: {
    id: 'fx',
    sources: [
      { name: 'local-fluidr3', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.fluidr3_gm },
      { name: 'local-musyngkite', soundfont: '.', format: 'mp3', url: LOCAL_SOUNDFONT_BASES.musyngkite }
    ]
  }
};
const INSTRUMENT_CONFIG = [
  { id: 'keys_acoustic_piano', tab: 'keys', label: 'Grand Piano', library: 'keys', patch: 'acoustic_grand_piano', wafProgram: 1, minNote: 21, maxNote: 108, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.35, attack: 0.01, decay: 0.2, sustain: 0.55, release: 0.32, eq: [{ type: 'lowshelf', freq: 220, gain: 1.5 }, { type: 'highshelf', freq: 2800, gain: -1.5 }] },
  { id: 'keys_bright_piano', tab: 'keys', label: 'Bright Piano', library: 'keys', patch: 'bright_acoustic_piano', wafProgram: 2, minNote: 21, maxNote: 108, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.45, attack: 0.008, decay: 0.18, sustain: 0.55, release: 0.3, eq: [{ type: 'highshelf', freq: 2400, gain: 4.5 }, { type: 'peaking', freq: 1200, gain: 2.0, q: 0.8 }] },
  { id: 'keys_honky_tonk', tab: 'keys', label: 'Honky-Tonk', library: 'keys', patch: 'honkytonk_piano', wafProgram: 4, minNote: 28, maxNote: 103, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.2, attack: 0.012, decay: 0.18, sustain: 0.5, release: 0.28 },
  { id: 'keys_harpsichord', tab: 'keys', label: 'Harpsichord', library: 'keys', patch: 'harpsichord', wafProgram: 7, minNote: 36, maxNote: 96, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.1, attack: 0.006, decay: 0.12, sustain: 0.4, release: 0.18 },
  { id: 'electric_piano', tab: 'electric', label: 'Electric Piano 1', library: 'electric', patch: 'electric_piano_1', wafProgram: 5, minNote: 28, maxNote: 103, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.35, attack: 0.012, decay: 0.22, sustain: 0.6, release: 0.36 },
  { id: 'electric_fm_piano', tab: 'electric', label: 'Electric Piano 2', library: 'electric', patch: 'electric_piano_2', wafProgram: 6, minNote: 28, maxNote: 103, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.35, attack: 0.012, decay: 0.22, sustain: 0.6, release: 0.36 },
  { id: 'electric_vibraphone', tab: 'electric', label: 'Vibraphone', library: 'electric', patch: 'vibraphone', wafProgram: 12, minNote: 48, maxNote: 96, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.15, attack: 0.01, decay: 0.2, sustain: 0.55, release: 0.3 },
  { id: 'electric_clav', tab: 'electric', label: 'Clav', library: 'electric', patch: 'clavinet', wafProgram: 8, minNote: 36, maxNote: 96, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, attack: 0.008, decay: 0.16, sustain: 0.45, release: 0.18, gainScale: 1.15 },
  { id: 'pad_string', tab: 'pads', label: 'String Pad', library: 'pads', patch: 'string_ensemble_1', wafProgram: 49, minNote: 36, maxNote: 96, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.1, attack: 0.08, decay: 0.4, sustain: 0.8, release: 0.6 },
  { id: 'pad_brass', tab: 'pads', label: 'Brass Pad', library: 'pads', patch: 'brass_section', wafProgram: 61, minNote: 40, maxNote: 88, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.1, attack: 0.06, decay: 0.35, sustain: 0.75, release: 0.5 },
  { id: 'pad_choir', tab: 'pads', label: 'Choir Pad', library: 'pads', patch: 'choir_aahs', wafProgram: 52, minNote: 48, maxNote: 84, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.1, attack: 0.08, decay: 0.35, sustain: 0.75, release: 0.55 },
  { id: 'pad_synth', tab: 'pads', label: 'Synth Pad', library: 'pads', patch: 'pad_1_new_age', wafProgram: 89, minNote: 24, maxNote: 96, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.05, attack: 0.09, decay: 0.4, sustain: 0.8, release: 0.6 },
  { id: 'solo_string', tab: 'solo', label: 'Solo String', library: 'solo', patch: 'violin', wafProgram: 41, minNote: 55, maxNote: 103, outOfRangeBehavior: 'clamp', mono: true, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.1, attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.35 },
  { id: 'solo_brass', tab: 'solo', label: 'Solo Brass', library: 'solo', patch: 'trumpet', wafProgram: 57, minNote: 54, maxNote: 94, outOfRangeBehavior: 'clamp', mono: true, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.1, attack: 0.02, decay: 0.22, sustain: 0.7, release: 0.35 },
  { id: 'solo_wind', tab: 'solo', label: 'Solo Wind', library: 'solo', patch: 'flute', wafProgram: 74, minNote: 60, maxNote: 103, outOfRangeBehavior: 'clamp', mono: true, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.05, attack: 0.02, decay: 0.22, sustain: 0.7, release: 0.35 },
  { id: 'solo_lead', tab: 'solo', label: 'Lead Synth', library: 'solo', patch: 'lead_1_square', wafProgram: 81, minNote: 36, maxNote: 108, outOfRangeBehavior: 'clamp', mono: true, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.05, attack: 0.015, decay: 0.18, sustain: 0.6, release: 0.25 },
  { id: 'fx_drums', tab: 'fx', label: 'Drums', library: 'fx', patch: 'synth_drum', wafProgram: 119, minNote: SALAMANDER_DRUM_RANGE.min, maxNote: SALAMANDER_DRUM_RANGE.max, outOfRangeBehavior: 'ignore', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: false, gainScale: 1.05, attack: 0.005, decay: 0.12, sustain: 0.4, release: 0.16, isDrums: true, drumNoteRange: SALAMANDER_DRUM_RANGE, engine: 'sample', drumSampleSet: 'salamander' },
  { id: 'fx_dog', tab: 'fx', label: 'Dog', library: 'fx', patch: 'bird_tweet', wafProgram: 124, minNote: 36, maxNote: 96, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, localBase: LOCAL_SOUNDFONT_BASES.fluidr3_gm, gainScale: 1.05, attack: 0.008, decay: 0.12, sustain: 0.4, release: 0.18, engine: 'sf2', sf2Url: SF2_HYPERSOUND_URL, sf2PresetName: 'DOGBW60', sf2ProgramFallback: 0, oneShotMs: 160 },
  { id: 'fx_telephone', tab: 'fx', label: 'Telephone', library: 'fx', patch: 'telephone_ring', wafProgram: 125, minNote: 48, maxNote: 84, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, gainScale: 1.05, attack: 0.01, decay: 0.18, sustain: 0.55, release: 0.2 },
  { id: 'fx_odd', tab: 'fx', label: 'Odd FX', library: 'fx', patch: 'fx_8_scifi', wafProgram: 122, minNote: 36, maxNote: 96, outOfRangeBehavior: 'clamp', mono: false, stub: false, allowWebAudioFont: false, localSoundfont: true, localBase: LOCAL_SOUNDFONT_BASES.fluidr3_gm, gainScale: 1.0, attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.25, isFxKeyZone: true, keyZoneMap: { 48: 'toy-pop', 50: 'cartoon-blip', 52: 'vocal-yip', 53: 'spring-boing', 55: 'metal-clank', 57: 'bubble-pop', 59: 'odd-hit' } }
];
const INSTRUMENT_BUTTONS = INSTRUMENT_CONFIG.map(item => ({ id: item.id, label: item.label }));
const instrumentById = new Map(INSTRUMENT_BUTTONS.map(btn => [btn.id, btn]));
const INSTRUMENT_CONFIG_BY_ID = new Map(INSTRUMENT_CONFIG.map(item => [item.id, item]));
const INSTRUMENT_LAYOUT = INSTRUMENT_CONFIG.map(item => ({ id: item.id, label: item.label }));
const LEFT_INSTRUMENT_LAYOUT = INSTRUMENT_LAYOUT;
const RIGHT_INSTRUMENT_LAYOUT = INSTRUMENT_LAYOUT;
const INSTRUMENT_TABS = [
  { id: 'keys', label: 'KEYS' },
  { id: 'electric', label: 'ELECTRIC' },
  { id: 'pads', label: 'PADS' },
  { id: 'solo', label: 'SOLO' },
  { id: 'fx', label: 'FX' }
];
const INSTRUMENT_TAB_IDS = new Set(INSTRUMENT_TABS.map(tab => tab.id));
function getInstrumentTabId(item){
  if(item && item.id && INSTRUMENT_CONFIG_BY_ID.has(item.id)) return INSTRUMENT_CONFIG_BY_ID.get(item.id).tab;
  return INSTRUMENT_TABS[0].id;
}
const RANDOM_POOLS = {
  keys: [
    { patch: 'acoustic_grand_piano', label: 'Grand Piano' },
    { patch: 'bright_acoustic_piano', label: 'Bright Piano' },
    { patch: 'honkytonk_piano', label: 'Honky-Tonk' },
    { patch: 'harpsichord', label: 'Harpsichord' },
    { patch: 'celesta', label: 'Celesta' }
  ],
  electric: [
    { patch: 'electric_piano_1', label: 'Electric Piano 1' },
    { patch: 'electric_piano_2', label: 'Electric Piano 2' },
    { patch: 'electric_grand_piano', label: 'Electric Grand' },
    { patch: 'clavinet', label: 'Clavinet' },
    { patch: 'drawbar_organ', label: 'Drawbar Organ' },
    { patch: 'rock_organ', label: 'Rock Organ' }
  ],
  pads: [
    { patch: 'pad_1_new_age', label: 'New Age Pad' },
    { patch: 'pad_2_warm', label: 'Warm Pad' },
    { patch: 'pad_3_polysynth', label: 'Polysynth Pad' },
    { patch: 'pad_4_choir', label: 'Choir Pad' },
    { patch: 'pad_5_bowed', label: 'Bowed Pad' },
    { patch: 'pad_6_metallic', label: 'Metallic Pad' },
    { patch: 'pad_7_halo', label: 'Halo Pad' },
    { patch: 'pad_8_sweep', label: 'Sweep Pad' }
  ],
  solo: [
    { patch: 'lead_1_square', label: 'Lead Square' },
    { patch: 'lead_2_sawtooth', label: 'Lead Saw' },
    { patch: 'lead_3_calliope', label: 'Lead Calliope' },
    { patch: 'lead_4_chiff', label: 'Lead Chiff' },
    { patch: 'lead_5_charang', label: 'Lead Charang' },
    { patch: 'lead_6_voice', label: 'Lead Voice' },
    { patch: 'lead_7_fifths', label: 'Lead Fifths' },
    { patch: 'lead_8_bass__lead', label: 'Lead Bass' },
    { patch: 'clarinet', label: 'Clarinet' },
    { patch: 'oboe', label: 'Oboe' },
    { patch: 'flute', label: 'Flute' },
    { patch: 'alto_sax', label: 'Alto Sax' },
    { patch: 'trumpet', label: 'Trumpet' }
  ],
  fx: [
    { id: 'fx_drums', label: 'Drums' },
    { id: 'fx_dog', label: 'WappyDog' },
    { patch: 'applause', label: 'Applause' },
    { patch: 'whistle', label: 'Whistle' },
    { patch: 'tinkle_bell', label: 'Tinkle Bell' },
    { patch: 'seashore', label: 'Seashore' },
    { patch: 'breath_noise', label: 'Breath Noise' },
    { patch: 'fx_1_rain', label: 'Rain FX' },
    { patch: 'fx_3_crystal', label: 'Crystal FX' },
    { patch: 'fx_4_atmosphere', label: 'Atmosphere FX' },
    { patch: 'fx_5_brightness', label: 'Brightness FX' },
    { patch: 'fx_8_scifi', label: 'Sci-Fi FX' }
  ]
};
function getPreferredBasesForTab(tabId){
  if(tabId === 'keys'){
    return [LOCAL_SOUNDFONT_BASES.musyngkite, LOCAL_SOUNDFONT_BASES.fluidr3_gm];
  }
  return [LOCAL_SOUNDFONT_BASES.fluidr3_gm, LOCAL_SOUNDFONT_BASES.musyngkite];
}
function getDefaultConfigForTab(tabId){
  return INSTRUMENT_CONFIG.find(cfg => cfg.tab === tabId) || INSTRUMENT_CONFIG[0] || null;
}
return { SOUND_LIBRARY_CONFIG, INSTRUMENT_CONFIG, INSTRUMENT_BUTTONS, instrumentById, INSTRUMENT_CONFIG_BY_ID, INSTRUMENT_LAYOUT, LEFT_INSTRUMENT_LAYOUT, RIGHT_INSTRUMENT_LAYOUT, INSTRUMENT_TABS, INSTRUMENT_TAB_IDS, getInstrumentTabId, RANDOM_POOLS, getPreferredBasesForTab, getDefaultConfigForTab };
}

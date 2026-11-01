// Authored About-face defaults from site-settings(7).json, owner about.refs.sketch.
// No other page, general preference, or sticky-note data is included.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
export const REFS_EXPORTED_DEFAULTS = freeze({
  "scale": 1,
  "width": 1,
  "height": 1,
  "x": 0,
  "y": 0,
  "angle": 0,
  "outline": "curio",
  "roundness": 0.5,
  "portraitRadius": 79,
  "apertureRadius": 142,
  "baySpacing": 208,
  "bayWidth": 62,
  "lineWeight": 1,
  "opacity": 0.68,
  "ink": "#e4dfcb",
  "accent": "#65c5c8",
  "innerTrim": true,
  "guides": false,
  "anchors": false,
  "opening": false,
  "style": "precision",
  "hinges": false,
  "leftHinge": true,
  "rightHinge": true,
  "pairLinked": true,
  "cabinetEnabled": true,
  "cabinetFrontEnabled": true,
  "cabinetCutaway": false,
  "selectorBackingEnabled": true,
  "housingEnabled": true,
  "dummyIrisEnabled": true,
  "irisBulgeRatio": 0.15,
  "irisOpening": 100,
  "irisSize": 1,
  "quoteDisplayVersion": 2,
  "glassDisplayEnabled": true,
  "glassBackingColor": "#153d67",
  "glassTint": "#6eacd0",
  "glassClarity": 0.9,
  "glassPolish": 0.8,
  "glassCurvature": 0.55,
  "portraitWindowEnabled": true,
  "portraitGlassEnabled": true,
  "portraitLockEnabled": true,
  "portraitFrameWidthRatio": 0.2,
  "cabinetDepth": 0.22,
  "cabinetPosition": 0,
  "wallThickness": 0.018,
  "cabinetFaceColor": "#182b3a",
  "cabinetSideColor": "#182b3a",
  "cabinetTrimColor": "#7b3f7c",
  "cabinetFaceMaterial": "mahogany",
  "cabinetSideMaterial": "mahogany",
  "plateLightColor": "#43ed73",
  "cabinetWoodTint": 0.65,
  "cabinetGrainScale": 2,
  "cabinetSheen": 0.65,
  "mechanismEnabled": true,
  "plateCount": 7,
  "plateSpacing": 0.025,
  "plateIndex": 4,
  "selectorAngle": 60,
  "selectorSpeed": 1,
  "doorSpeed": 1.4,
  "doors": {
    "leftBay": {
      "type": "rotating",
      "hinge": "left",
      "axis": "vertical",
      "direction": "clockwise",
      "angle": 180,
      "open": true
    },
    "rightBay": {
      "type": "rotating",
      "hinge": "left",
      "axis": "vertical",
      "direction": "counterclockwise",
      "angle": 180,
      "open": true
    },
    "leftCrescent": {
      "type": "hinged",
      "hinge": "left",
      "axis": "vertical",
      "direction": "out",
      "angle": 102,
      "open": false
    },
    "rightCrescent": {
      "type": "hinged",
      "hinge": "right",
      "axis": "vertical",
      "direction": "out",
      "angle": 102,
      "open": false
    },
    "leftArch": {
      "type": "hinged",
      "hinge": "left",
      "axis": "vertical",
      "direction": "out",
      "angle": 105,
      "open": false
    },
    "rightArch": {
      "type": "hinged",
      "hinge": "right",
      "axis": "vertical",
      "direction": "out",
      "angle": 105,
      "open": false
    },
    "plaque": {
      "type": "hinged",
      "hinge": "bottom",
      "axis": "vertical",
      "direction": "out",
      "angle": 100,
      "open": false
    }
  },
  "butterflyEnabled": true,
  "butterflyHost": "leftArch",
  "platesVersion": 1,
  "originalQuotesVersion": 1,
  "plates": [
    {
      "image": "",
      "text": "“Creating better lessons for my students sparked a passion for captivating, interactive content that helped them forget they were learning.”",
      "bodyColor": "#14283a",
      "rimColor": "#9e8060",
      "imageScale": 1,
      "sourceId": ""
    },
    {
      "image": "",
      "text": "“This sparked a passion for creating captivating, interactive content that helped the students forget they were learning. My creative output has run the gamut from educational games to animated explainers to engaging video content.”",
      "bodyColor": "#14283a",
      "rimColor": "#9e8060",
      "imageScale": 1,
      "sourceId": ""
    },
    {
      "image": "",
      "text": "“I'm keen to put my skills to use in a dynamic environment where I can contribute to innovative projects and continue to grow as a creative technologist.”",
      "bodyColor": "#14283a",
      "rimColor": "#9e8060",
      "imageScale": 1,
      "sourceId": ""
    },
    {
      "image": "",
      "text": "",
      "bodyColor": "#14283a",
      "rimColor": "#9e8060",
      "imageScale": 1,
      "sourceId": ""
    },
    {
      "image": "",
      "text": "His talent in music and curriculum development, coupled with advanced technical skills continually impressed both myself and the school.”",
      "bodyColor": "#14283a",
      "rimColor": "#9e8060",
      "imageScale": 1,
      "sourceId": ""
    },
    {
      "image": "",
      "text": "“He willingly helps his coworkers with any problems or questions they have, and he has proved a valuable addition to both the office and the school.”",
      "bodyColor": "#14283a",
      "rimColor": "#9e8060",
      "imageScale": 1,
      "sourceId": ""
    },
    {
      "image": "",
      "text": "“His commitment to excellence and continuous pursuit of improvement have had a profound impact on me, both as an educator and as an individual.”",
      "bodyColor": "#14283a",
      "rimColor": "#9e8060",
      "imageScale": 1,
      "sourceId": ""
    }
  ],
  "elements": {}
});

(() => {
  const common = {
  "candy": {
    "version": 1,
    "geometry": "Frozen CakeContactRenderer.edgeGeometry and actual canvas alpha; plain top0/bottomheight fallback. No contact edits.",
    "inputs": {
      "contact": "existing blur.blend0–1; zero adds no seating or rim contact",
      "drag": "existing blur.valley/6 clamped0–1; zero disables displacement and fragments",
      "burial": "Structural minimum asymmetric cut burial remains at blend0; source-photo wall luminance modulates rims."
    },
    "bounds": {
      "topperWidthPx": 220,
      "topperHeightPx": 48,
      "fillingWidthPx": 520,
      "spriteCacheLimit": 12,
      "textureCacheLimit": 3
    },
    "materials": [
      {
        "id": "candyCoatedChocolate",
        "label": "Candy-coated chocolate",
        "description": "Small flattened colored shells with milk chocolate interiors.",
        "selectorDescriptions": {
          "topper": "Frontal chocolate cut faces with thin colored candy shells.",
          "filling": "Sparse small chocolate windows with interrupted colored shell arcs."
        },
        "assets": {
          "wholeRed": "assets/images/materials/candy-coated-whole-red-v2.webp",
          "wholeBlue": "assets/images/materials/candy-coated-whole-blue-v2.webp",
          "wholeYellow": "assets/images/materials/candy-coated-whole-yellow-v2.webp",
          "cutRed": "assets/images/phase10-candy-cutface-red-v1.png",
          "cutBlue": "assets/images/materials/candy-coated-cut-blue-v1.webp",
          "cutYellow": "assets/images/materials/candy-coated-cut-yellow-v1.webp"
        },
        "topper": [
          {
            "sprite": "wholeRed",
            "xOffsetPx": -64,
            "widthPx": 31,
            "angleDeg": -12,
            "seatMultiplier": 0.8
          },
          {
            "sprite": "wholeBlue",
            "xOffsetPx": -43,
            "widthPx": 25,
            "angleDeg": 8,
            "seatMultiplier": 1.2
          },
          {
            "sprite": "wholeYellow",
            "xOffsetPx": -22,
            "widthPx": 29,
            "angleDeg": -15,
            "seatMultiplier": 0.95
          },
          {
            "sprite": "wholeRed",
            "xOffsetPx": -4,
            "widthPx": 23,
            "angleDeg": 16,
            "seatMultiplier": 1.05
          },
          {
            "sprite": "wholeBlue",
            "xOffsetPx": 46,
            "widthPx": 28,
            "angleDeg": 5,
            "seatMultiplier": 0.9
          },
          {
            "sprite": "wholeYellow",
            "xOffsetPx": 68,
            "widthPx": 25,
            "angleDeg": -9,
            "seatMultiplier": 1.35
          }
        ],
        "filling": [
          {
            "sprite": "cutBlue",
            "xFraction": -0.34,
            "yFraction": 0,
            "yOffsetPx": 8,
            "widthPx": 28,
            "angleDeg": -16,
            "burialVariant": 0
          },
          {
            "sprite": "cutYellow",
            "xFraction": 0.19,
            "yFraction": 0.2,
            "yOffsetPx": 0,
            "widthPx": 24,
            "angleDeg": 19,
            "burialVariant": 1
          },
          {
            "sprite": "cutRed",
            "xFraction": -0.09,
            "yFraction": 0.43,
            "yOffsetPx": 0,
            "widthPx": 31,
            "angleDeg": -8,
            "burialVariant": 2
          },
          {
            "sprite": "cutBlue",
            "xFraction": 0.36,
            "yFraction": 0.61,
            "yOffsetPx": 0,
            "widthPx": 25,
            "angleDeg": 24,
            "burialVariant": 0
          },
          {
            "sprite": "cutYellow",
            "xFraction": -0.3,
            "yFraction": 0.82,
            "yOffsetPx": 0,
            "widthPx": 27,
            "angleDeg": 7,
            "burialVariant": 1
          },
          {
            "sprite": "cutRed",
            "xFraction": 0.13,
            "yFraction": 1,
            "yOffsetPx": -6,
            "widthPx": 29,
            "angleDeg": -20,
            "burialVariant": 2
          }
        ],
        "coefficients": {
          "weight": 0.58,
          "contactArea": 0.46,
          "icingFirmness": 0.72,
          "seatFractionRange": [
            0.08,
            0.24
          ],
          "maxCutDisplacementPx": 3,
          "burialStrength": 1,
          "rimWidthPx": 7.2
        },
        "roles": {
          "topper": [
            "wholeRed",
            "wholeBlue",
            "wholeYellow"
          ],
          "filling": [
            "cutRed",
            "cutBlue",
            "cutYellow"
          ]
        }
      },
      {
        "id": "almondPieces",
        "label": "Almond pieces",
        "description": "Brown-skinned almonds and pale dense almond fragments.",
        "selectorDescriptions": {
          "topper": "One large frontal almond cut with smaller companion pieces.",
          "filling": "Uneven ivory almond windows with some brown skin remaining."
        },
        "assets": {
          "whole": "assets/images/materials/almond-whole-v1.webp",
          "broken": "assets/images/materials/almond-broken-v1.webp",
          "cutA": "assets/images/phase10-almond-cutface-transverse-v1.png",
          "cutB": "assets/images/materials/almond-cut-b-v1.webp"
        },
        "topper": [
          {
            "sprite": "whole",
            "xOffsetPx": -38,
            "widthPx": 35,
            "angleDeg": -7,
            "seatMultiplier": 0.8
          },
          {
            "sprite": "broken",
            "xOffsetPx": -17,
            "widthPx": 20,
            "angleDeg": 15,
            "seatMultiplier": 1.12
          },
          {
            "sprite": "whole",
            "xOffsetPx": 30,
            "widthPx": 30,
            "angleDeg": 17,
            "seatMultiplier": 1
          },
          {
            "sprite": "broken",
            "xOffsetPx": 54,
            "widthPx": 18,
            "angleDeg": -19,
            "seatMultiplier": 0.88
          }
        ],
        "filling": [
          {
            "sprite": "cutA",
            "xFraction": -0.3,
            "yFraction": 0,
            "yOffsetPx": 7,
            "widthPx": 24,
            "angleDeg": -10,
            "burialVariant": 0
          },
          {
            "sprite": "cutB",
            "xFraction": 0.2,
            "yFraction": 0.22,
            "yOffsetPx": 0,
            "widthPx": 22,
            "angleDeg": 16,
            "burialVariant": 1
          },
          {
            "sprite": "cutA",
            "xFraction": -0.1,
            "yFraction": 0.49,
            "yOffsetPx": 0,
            "widthPx": 26,
            "angleDeg": 12,
            "burialVariant": 2
          },
          {
            "sprite": "cutB",
            "xFraction": 0.32,
            "yFraction": 0.72,
            "yOffsetPx": 0,
            "widthPx": 19,
            "angleDeg": -18,
            "burialVariant": 0
          },
          {
            "sprite": "cutA",
            "xFraction": -0.25,
            "yFraction": 1,
            "yOffsetPx": -6,
            "widthPx": 23,
            "angleDeg": -15,
            "burialVariant": 1
          }
        ],
        "coefficients": {
          "weight": 0.45,
          "contactArea": 0.56,
          "icingFirmness": 0.68,
          "seatFractionRange": [
            0.08,
            0.2
          ],
          "maxCutDisplacementPx": 2.5,
          "burialStrength": 0.95,
          "rimWidthPx": 4.2
        },
        "roles": {
          "topper": [
            "whole",
            "broken"
          ],
          "filling": [
            "cutA",
            "cutB"
          ]
        }
      },
      {
        "id": "walnutPieces",
        "label": "Walnut pieces",
        "description": "Folded tan walnut lobes and irregular cream nut interiors.",
        "selectorDescriptions": {
          "topper": "One large frontal walnut cut with smaller companion pieces.",
          "filling": "Sparse irregular walnut cut faces partly buried in crumb."
        },
        "assets": {
          "whole": "assets/images/materials/walnut-whole-v1.webp",
          "broken": "assets/images/materials/walnut-broken-v1.webp",
          "cutA": "assets/images/phase10-walnut-cutface-v1.png",
          "cutB": "assets/images/materials/walnut-cut-b-v1.webp"
        },
        "topper": [
          {
            "sprite": "whole",
            "xOffsetPx": -32,
            "widthPx": 32,
            "angleDeg": -10,
            "seatMultiplier": 0.9
          },
          {
            "sprite": "broken",
            "xOffsetPx": -6,
            "widthPx": 24,
            "angleDeg": 16,
            "seatMultiplier": 1.2
          },
          {
            "sprite": "broken",
            "xOffsetPx": 40,
            "widthPx": 21,
            "angleDeg": -12,
            "seatMultiplier": 1
          }
        ],
        "filling": [
          {
            "sprite": "cutA",
            "xFraction": -0.31,
            "yFraction": 0,
            "yOffsetPx": 8,
            "widthPx": 22,
            "angleDeg": -14,
            "burialVariant": 0
          },
          {
            "sprite": "cutB",
            "xFraction": 0.23,
            "yFraction": 0.24,
            "yOffsetPx": 0,
            "widthPx": 24,
            "angleDeg": 18,
            "burialVariant": 1
          },
          {
            "sprite": "cutA",
            "xFraction": -0.08,
            "yFraction": 0.48,
            "yOffsetPx": 0,
            "widthPx": 27,
            "angleDeg": 11,
            "burialVariant": 2
          },
          {
            "sprite": "cutB",
            "xFraction": 0.32,
            "yFraction": 0.73,
            "yOffsetPx": 0,
            "widthPx": 21,
            "angleDeg": -17,
            "burialVariant": 0
          },
          {
            "sprite": "cutB",
            "xFraction": -0.26,
            "yFraction": 1,
            "yOffsetPx": -8,
            "widthPx": 25,
            "angleDeg": -11,
            "burialVariant": 1
          }
        ],
        "coefficients": {
          "weight": 0.43,
          "contactArea": 0.63,
          "icingFirmness": 0.68,
          "seatFractionRange": [
            0.08,
            0.2
          ],
          "maxCutDisplacementPx": 2.5,
          "burialStrength": 0.92,
          "rimWidthPx": 4
        },
        "roles": {
          "topper": [
            "whole",
            "broken"
          ],
          "filling": [
            "cutA",
            "cutB"
          ]
        }
      }
    ]
  },
  "chocolate": {
    "version": 1,
    "geometry": "Frozen CakeContactRenderer.edgeGeometry and actual canvas alpha; plain top0/bottomheight fallback. No contact edits.",
    "inputs": {
      "contact": "existing blur.blend clamped0–1; zero adds no seating/contact rim",
      "drag": "existing blur.valley/6 clamped0–1; zero means no displacement or tiny fragments",
      "burial": "Minimum asymmetric cut burial is structural at blend0, matching accepted6a. Source relative wall luminance modulates contact rim."
    },
    "bounds": {
      "topperWidthPx": 220,
      "topperCount": 3,
      "fillingWidthPx": 520,
      "fillingCount": 5,
      "spriteCacheLimit": 8,
      "textureCacheLimit": 3
    },
    "materials": [
      {
        "id": "caramelNutChocolate",
        "label": "Caramel & peanut chocolate",
        "description": "Broken chocolate chunks with peanut, caramel and nougat layers.",
        "selectorDescriptions": {
          "topper": "Frontal chocolate, caramel, and nut cut faces seated in icing.",
          "filling": "Sparse cut windows exposing peanut, caramel and nougat."
        },
        "assets": {
          "segment": "assets/images/materials/caramel-nut-chocolate-segment-v1.webp",
          "cut": "assets/images/phase10-caramel-nut-chocolate-cutface-v1.png",
          "slice": "assets/images/materials/caramel-nut-chocolate-slice-v1.webp",
          "fragment": "assets/images/materials/caramel-nut-chocolate-fragment-v1.webp"
        },
        "topper": [
          {
            "sprite": "segment",
            "xOffsetPx": -60,
            "widthPx": 43,
            "angleDeg": -12,
            "seatMultiplier": 1
          },
          {
            "sprite": "slice",
            "xOffsetPx": -8,
            "widthPx": 47,
            "angleDeg": 13,
            "seatMultiplier": 0.9
          },
          {
            "sprite": "fragment",
            "xOffsetPx": 49,
            "widthPx": 32,
            "angleDeg": -17,
            "seatMultiplier": 0.85
          }
        ],
        "filling": [
          {
            "sprite": "cut",
            "xFraction": -0.31,
            "yFraction": 0.04,
            "yOffsetPx": 0,
            "widthPx": 37,
            "angleDeg": -12,
            "burialVariant": 0
          },
          {
            "sprite": "slice",
            "xFraction": 0.23,
            "yFraction": 0.27,
            "yOffsetPx": 0,
            "widthPx": 43,
            "angleDeg": 16,
            "burialVariant": 1
          },
          {
            "sprite": "fragment",
            "xFraction": -0.09,
            "yFraction": 0.49,
            "yOffsetPx": 0,
            "widthPx": 28,
            "angleDeg": -9,
            "burialVariant": 2
          },
          {
            "sprite": "cut",
            "xFraction": 0.34,
            "yFraction": 0.71,
            "yOffsetPx": 0,
            "widthPx": 34,
            "angleDeg": 22,
            "burialVariant": 1
          },
          {
            "sprite": "slice",
            "xFraction": -0.27,
            "yFraction": 0.93,
            "yOffsetPx": 0,
            "widthPx": 39,
            "angleDeg": -17,
            "burialVariant": 0
          }
        ],
        "coefficients": {
          "weight": 0.88,
          "contactArea": 0.7,
          "icingFirmness": 0.72,
          "seatFractionRange": [
            0.08,
            0.18
          ],
          "maxCutDisplacementPx": 3,
          "burialStrength": 0.88,
          "rimWidthPx": 4.5
        },
        "roles": {
          "topper": [
            "segment",
            "slice",
            "fragment"
          ],
          "filling": [
            "cut",
            "slice",
            "fragment"
          ]
        }
      },
      {
        "id": "peanutButterCup",
        "label": "Peanut butter cups",
        "description": "Fluted chocolate shell with a dense peanut butter center.",
        "selectorDescriptions": {
          "topper": "Frontal peanut butter cup cuts with a clear filling center.",
          "filling": "Irregular cut windows through shell and peanut butter center."
        },
        "assets": {
          "cup": "assets/images/materials/peanut-butter-cup-cup-v1.webp",
          "half": "assets/images/materials/peanut-butter-cup-half-v1.webp",
          "cutFace": "assets/images/phase10-peanut-butter-cup-cutface-v1.png",
          "quarter": "assets/images/materials/peanut-butter-cup-quarter-v1.webp",
          "fragment": "assets/images/materials/peanut-butter-cup-fragment-v1.webp"
        },
        "topper": [
          {
            "sprite": "cup",
            "xOffsetPx": -55,
            "widthPx": 42,
            "angleDeg": -8,
            "seatMultiplier": 1
          },
          {
            "sprite": "half",
            "xOffsetPx": 0,
            "widthPx": 45,
            "angleDeg": 12,
            "seatMultiplier": 0.85
          },
          {
            "sprite": "quarter",
            "xOffsetPx": 54,
            "widthPx": 34,
            "angleDeg": -17,
            "seatMultiplier": 0.9
          }
        ],
        "filling": [
          {
            "sprite": "half",
            "xFraction": -0.32,
            "yFraction": 0.05,
            "yOffsetPx": 0,
            "widthPx": 38,
            "angleDeg": -11,
            "burialVariant": 0
          },
          {
            "sprite": "quarter",
            "xFraction": 0.21,
            "yFraction": 0.29,
            "yOffsetPx": 0,
            "widthPx": 31,
            "angleDeg": 18,
            "burialVariant": 1
          },
          {
            "sprite": "fragment",
            "xFraction": -0.13,
            "yFraction": 0.51,
            "yOffsetPx": 0,
            "widthPx": 29,
            "angleDeg": -7,
            "burialVariant": 2
          },
          {
            "sprite": "half",
            "xFraction": 0.33,
            "yFraction": 0.73,
            "yOffsetPx": 0,
            "widthPx": 40,
            "angleDeg": -16,
            "burialVariant": 1
          },
          {
            "sprite": "quarter",
            "xFraction": -0.26,
            "yFraction": 0.94,
            "yOffsetPx": 0,
            "widthPx": 33,
            "angleDeg": 15,
            "burialVariant": 0
          }
        ],
        "coefficients": {
          "weight": 0.73,
          "contactArea": 0.6,
          "icingFirmness": 0.72,
          "seatFractionRange": [
            0.08,
            0.18
          ],
          "maxCutDisplacementPx": 2.5,
          "burialStrength": 0.92,
          "rimWidthPx": 4
        },
        "roles": {
          "topper": [
            "cup",
            "half",
            "quarter"
          ],
          "filling": [
            "half",
            "quarter",
            "fragment"
          ]
        }
      }
    ]
  }
};

/* Immutable photographic recipes for the supported cake decorations. */
  const entries = common.candy.materials.map(item => ({ ...item, rendererKind: 'alpha-bottom', topperHeightPx: 48 }));
  entries.push(...common.chocolate.materials.map(item => ({ ...item, rendererKind: 'pad-seat', topperHeightPx: 80 })));
  entries.push({
    id: 'chocolateChips', label: 'Chocolate chips',
    description: 'Chocolate chip sections with fine chocolate grain and naturally softened edges.',
    selectorDescriptions: { topper: 'Photographic chocolate chip cuts seated in icing.', filling: 'Varied chocolate chip cross-sections through the cake.' },
    rendererKind: 'alpha-bottom', topperHeightPx: 48,
    assets: {}, topper: [], filling: [],
    coefficients: { weight: .54, contactArea: .42, icingFirmness: .72, seatFractionRange: [.08, .2], maxCutDisplacementPx: 2.5, burialStrength: 1, rimWidthPx: 3 },
    roles: { topper: [], filling: [] }
  });
  const frontalTopper = {
    candyCoatedChocolate: ['cutRed', [-66, -23, 23, 66], [25, 28, 24, 27]],
    almondPieces: ['cutA', [-47, -11, 37], [43, 31, 27]],
    walnutPieces: ['cutA', [-48, 1, 43], [49, 31, 25]],
    caramelNutChocolate: ['cut', [-49, 2, 44], [47, 35, 27]],
    peanutButterCup: ['cutFace', [-49, 2, 43], [46, 35, 28]],
    chocolateChips: ['cutA', [-40, 0, 39], [30, 23, 25]]
  };
  const cutFaceVariants = {
  "candyCoatedChocolate": {
    "cutRed": "phase11-candy-cut-a.webp",
    "cutAlt": "phase11-candy-cut-b.webp",
    "cutC": "phase12-candy-cut-c.webp",
    "cutD": "phase12-candy-cut-d.webp",
    "cutE": "phase12-candy-cut-e.webp",
    "cutF": "phase12-candy-cut-f.webp",
    "cutG": "phase12-candy-cut-g.webp",
    "cutH": "phase12-candy-cut-h.webp"
  },
  "almondPieces": {
    "cutA": "phase11-almond-cut-a.webp",
    "cutB": "phase11-almond-cut-b.webp",
    "cutC": "phase12-almond-cut-c.webp",
    "cutD": "phase12-almond-cut-d.webp",
    "cutE": "phase12-almond-cut-e.webp",
    "cutF": "phase12-almond-cut-f.webp",
    "cutG": "phase12-almond-cut-g.webp",
    "cutH": "phase12-almond-cut-h.webp"
  },
  "walnutPieces": {
    "cutA": "phase11-walnut-cut-a.webp",
    "cutB": "phase11-walnut-cut-b.webp",
    "cutC": "phase12-walnut-cut-c.webp",
    "cutD": "phase12-walnut-cut-d.webp",
    "cutE": "phase12-walnut-cut-e.webp",
    "cutF": "phase12-walnut-cut-f.webp",
    "cutG": "phase12-walnut-cut-g.webp",
    "cutH": "phase12-walnut-cut-h.webp"
  },
  "caramelNutChocolate": {
    "cut": "phase11-caramel-peanut-cut-a.webp",
    "cutAlt": "phase11-caramel-peanut-cut-b.webp",
    "cutC": "phase12-caramel-peanut-cut-c.webp",
    "cutD": "phase12-caramel-peanut-cut-d.webp",
    "cutE": "phase12-caramel-peanut-cut-e.webp",
    "cutF": "phase12-caramel-peanut-cut-f.webp",
    "cutG": "phase12-caramel-peanut-cut-g.webp",
    "cutH": "phase12-caramel-peanut-cut-h.webp"
  },
  "peanutButterCup": {
    "cutFace": "phase11-peanut-butter-cut-a.webp",
    "cutAlt": "phase11-peanut-butter-cut-b.webp",
    "cutC": "phase12-peanut-butter-cut-c.webp",
    "cutD": "phase12-peanut-butter-cut-d.webp",
    "cutE": "phase12-peanut-butter-cut-e.webp",
    "cutF": "phase12-peanut-butter-cut-f.webp",
    "cutG": "phase12-peanut-butter-cut-g.webp",
    "cutH": "phase12-peanut-butter-cut-h.webp"
  },
  "chocolateChips": {
    "cutA": "phase12-chocolate-chip-cut-a.webp",
    "cutB": "phase12-chocolate-chip-cut-b.webp",
    "cutC": "phase12-chocolate-chip-cut-c.webp",
    "cutD": "phase12-chocolate-chip-cut-d.webp",
    "cutE": "phase12-chocolate-chip-cut-e.webp",
    "cutF": "phase12-chocolate-chip-cut-f.webp",
    "cutG": "phase12-chocolate-chip-cut-g.webp",
    "cutH": "phase12-chocolate-chip-cut-h.webp"
  }
};
  const candyShellMasks = {
  "cutRed": "assets/images/phase11-candy-cut-a-shell.webp",
  "cutAlt": "assets/images/phase11-candy-cut-b-shell.webp",
  "cutC": "assets/images/phase12-candy-cut-c-shell.webp",
  "cutD": "assets/images/phase12-candy-cut-d-shell.webp",
  "cutE": "assets/images/phase12-candy-cut-e-shell.webp",
  "cutF": "assets/images/phase12-candy-cut-f-shell.webp",
  "cutG": "assets/images/phase12-candy-cut-g-shell.webp",
  "cutH": "assets/images/phase12-candy-cut-h-shell.webp"
};
  const variation = {
    almondPieces: { baseWidth: 46, sizeRange: [.55, 1.4], angleRange: [-170, 170], topperAngleRange: [-28, 28] },
    walnutPieces: { baseWidth: 40, sizeRange: [.55, 1.4], angleRange: [-170, 170], topperAngleRange: [-28, 28] },
    candyCoatedChocolate: { baseWidth: 34, sizeRange: [.85, 1.15], angleRange: [-170, 170], topperAngleRange: [-20, 20] },
    caramelNutChocolate: { baseWidth: 48, sizeRange: [.6, 1.35], angleRange: [-170, 170], topperAngleRange: [-25, 25] },
    peanutButterCup: { baseWidth: 48, sizeRange: [.6, 1.35], angleRange: [-170, 170], topperAngleRange: [-25, 25] },
    chocolateChips: { baseWidth: 34, sizeRange: [.6, 1.35], angleRange: [-170, 170], topperAngleRange: [-28, 28] }
  };
  entries.forEach(item => {
    const [, offsets, widths] = frontalTopper[item.id];
    const variants = Object.keys(cutFaceVariants[item.id]);
    item.assets = { ...item.assets, ...Object.fromEntries(Object.entries(cutFaceVariants[item.id])
      .map(([id, filename]) => [id, `assets/images/${filename}`])) };
    item.topper = offsets.map((xOffsetPx, index) => ({
      sprite: variants[index % variants.length], xOffsetPx, widthPx: widths[index],
      angleDeg: [-3, 2, -2, 3, -1, 2][index], seatMultiplier: index === 1 ? .85 : 1
    }));
    item.topperHeightScale = 1;
    // The first two views face the knife plane; the remaining cuts add variety inside crumb.
    item.roles = { ...item.roles, topper: variants.slice(0,2), filling: variants };
    item.cavitySprites = variants;
    item.variation = { ...variation[item.id], topperAngleRange: [-5,5] };
    item.shellMasks = item.id === 'candyCoatedChocolate' ? candyShellMasks : {};
    item.selectorDescriptions = { ...item.selectorDescriptions, topper:'Straight-on knife-cut faces reveal the interior, with the pieces seated on the icing.',
      filling: 'Photographic cut faces with varied shapes, sizes, and angles through the cake.' };
  });
  function topperPlacements(item, candyCount, pattern = 'cluster', spanBase = 0) {
    const base = item.id === 'candyCoatedChocolate' && candyCount > item.topper.length
      ? Array.from({ length: candyCount }, (_, index) => ({ sprite:item.roles.topper[index % item.roles.topper.length], xOffsetPx:-91+index*182/(candyCount-1),
        widthPx:23, angleDeg:index%2?2:-2, seatMultiplier:1 })) : item.topper;
    if (pattern === 'line' && base.length > 1 && spanBase > 0) {
      const largestHalfFace = Math.max(...base.map(p => p.widthPx * 3 / 2)) + 6;
      const halfOffset = Math.max(0, (spanBase / 2 - largestHalfFace) / 2.25);
      return base.map((p, index) => ({ ...p, xOffsetPx: -halfOffset + index * 2 * halfOffset / (base.length - 1) }));
    }
    const clusterTightness = item.id === 'candyCoatedChocolate' ? candyCount > 6 ? .55 : .7 : 1;
    return base.map(p => ({ ...p, xOffsetPx: p.xOffsetPx * clusterTightness }));
  }
  function topperNominalWidth(item, candyCount, pattern = 'cluster', spanBase = 0) {
    const extent = Math.max(...topperPlacements(item, candyCount, pattern, spanBase).map(p => Math.abs(p.xOffsetPx*2.25)+(p.widthPx*3+20)/2+4));
    return Math.ceil(extent*2+8);
  }
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
    return value;
  };
  const materials = freeze(entries);
  const byId = freeze(Object.assign(Object.create(null), Object.fromEntries(materials.map(item => [item.id, item]))));
  window.CAKE_MATERIAL_CATALOG = freeze({ materials, byId, topperPlacements, topperNominalWidth,
    bounds: { topperWidthPx: 520, fillingWidthPx: 520, spriteCacheLimit: 32, textureCacheLimit: 3 } });
})();

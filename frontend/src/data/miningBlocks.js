/**
 * Pre-defined MOIL / regional manganese mining blocks.
 *
 * Coordinates are indicative bounding-style polygons covering each lease area.
 * Replace with the official survey boundaries when the geology team supplies
 * them - the shape is a plain GeoJSON Polygon, so no code changes are needed.
 */

export const MINING_BLOCKS = [
  {
    id: 'balaghat',
    name: 'Balaghat Block',
    state: 'Madhya Pradesh',
    district: 'Balaghat',
    commodity: 'Manganese (lateritic)',
    // The type A/AB Mn ore belt around Balaghat.
    polygon: [
      [79.02, 22.14],
      [79.28, 22.14],
      [79.28, 22.33],
      [79.02, 22.33],
      [79.02, 22.14],
    ],
  },
  {
    id: 'bharweli',
    name: 'Bharweli Block',
    state: 'Madhya Pradesh',
    district: 'Balaghat',
    commodity: 'Manganese (lateritic)',
    polygon: [
      [78.72, 22.36],
      [78.98, 22.36],
      [78.98, 22.56],
      [78.72, 22.56],
      [78.72, 22.36],
    ],
  },
  {
    id: 'dongarbodi',
    name: 'Dongarbodi Block',
    state: 'Madhya Pradesh',
    district: 'Balaghat',
    commodity: 'Manganese (lateritic)',
    polygon: [
      [78.86, 22.02],
      [79.06, 22.02],
      [79.06, 22.18],
      [78.86, 22.18],
      [78.86, 22.02],
    ],
  },
  {
    id: 'gua',
    name: 'Gua Valley Block',
    state: 'Jharkhand',
    district: 'East Singhbhum',
    commodity: 'Manganese (metamorphosed)',
    polygon: [
      [86.22, 22.26],
      [86.52, 22.26],
      [86.52, 22.46],
      [86.22, 22.46],
      [86.22, 22.26],
    ],
  },
  {
    id: 'bonke',
    name: 'Bonke-Khondsia Block',
    state: 'Odisha',
    district: 'Keonjhar',
    commodity: 'Manganese (lateritic)',
    polygon: [
      [84.92, 21.72],
      [85.28, 21.72],
      [85.28, 22.02],
      [84.92, 22.02],
      [84.92, 21.72],
    ],
  },
];

/** Convert a block to the GeoJSON Polygon the API expects. */
export const blockToGeoJSON = (block) => ({
  type: 'Polygon',
  coordinates: [block.polygon.map(([lng, lat]) => [lng, lat])],
});

/** Centre point of a block, for map fly-to. */
export const blockCenter = (block) => {
  const lngs = block.polygon.map((p) => p[0]);
  const lats = block.polygon.map((p) => p[1]);
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];
};

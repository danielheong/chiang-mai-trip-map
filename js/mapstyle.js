// Watercolor basemap: a hand-built MapLibre style on OpenFreeMap's free vector tiles.
// Sage land, pale water, cream roads, almost no labels — the pins and hand-lettered
// area names carry the map. Tweak the PAINT colours to restyle everything.
export const PAINT = {
  land:      '#BCCB9E',
  urban:     '#C6D2A8',
  park:      '#A9BD88',
  wood:      '#9FB47F',
  farmland:  '#C9D3A6',
  water:     '#C8DEE2',
  waterLine: '#B7D3D9',
  road:      '#F5F0DE',
  roadMinor: '#EFEAD4',
  path:      '#E9E3CB',
  building:  '#B3C394',
  runway:    '#D9D7C2',
  label:     '#66705A',
  labelWater:'#6F8F98',
  halo:      '#F5F0DE',
};

// Night: indigo land, deep water and lamp-lit roads, like the city after dusk.
export const PAINT_NIGHT = {
  land:      '#2B3442',
  urban:     '#313B4A',
  park:      '#2A4239',
  wood:      '#263C35',
  farmland:  '#2F3C41',
  water:     '#1A2540',
  waterLine: '#22304F',
  road:      '#8B7B58',
  roadMinor: '#5F584B',
  path:      '#4E4A41',
  building:  '#3B4658',
  runway:    '#3A4252',
  label:     '#B4BBC8',
  labelWater:'#8AA3C6',
  halo:      '#222A36',
};

const line = (ids) => ['match', ['get', 'class'], ids, true, false];
const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];
const w = (stops) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];
const name = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];

const build = P => ({
  version: 8,
  name: 'Chiang Mai watercolor',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  layers: [
    { id: 'land', type: 'background', paint: { 'background-color': P.land } },
    { id: 'urban', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: line(['residential', 'commercial', 'retail', 'suburb', 'neighbourhood', 'quarter']),
      paint: { 'fill-color': P.urban, 'fill-opacity': 0.8 } },
    { id: 'farmland', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: line(['farmland']), paint: { 'fill-color': P.farmland, 'fill-opacity': 0.7 } },
    { id: 'grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: line(['grass']), paint: { 'fill-color': P.park, 'fill-opacity': 0.6 } },
    { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: line(['wood', 'forest']), paint: { 'fill-color': P.wood, 'fill-opacity': 0.85 } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
      paint: { 'fill-color': P.park, 'fill-opacity': 0.75 } },
    { id: 'pitch', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: line(['pitch', 'stadium', 'school', 'university', 'cemetery']),
      paint: { 'fill-color': P.park, 'fill-opacity': 0.4 } },
    { id: 'runway', type: 'fill', source: 'omt', 'source-layer': 'aeroway', minzoom: 11,
      paint: { 'fill-color': P.runway, 'fill-opacity': 0.8 } },

    { id: 'river', type: 'line', source: 'omt', 'source-layer': 'waterway', filter: notTunnel,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': P.waterLine, 'line-width': w([10, 1, 16, 4, 20, 10]) } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', filter: notTunnel,
      paint: { 'fill-color': P.water } },

    { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 15,
      paint: { 'fill-color': P.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 17, 0.55] } },

    { id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 15,
      filter: ['all', notTunnel, line(['path', 'pedestrian'])],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': P.path, 'line-width': w([15, 1, 20, 4]), 'line-dasharray': [2, 1.5] } },
    { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12.5,
      filter: ['all', notTunnel, line(['minor', 'service', 'track'])],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': P.roadMinor, 'line-width': w([12.5, 0.4, 15, 2.5, 18, 9, 20, 18]),
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0.15, 14, 0.45, 15.5, 1] } },
    { id: 'road-mid', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 9,
      filter: ['all', notTunnel, line(['secondary', 'tertiary'])],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': P.road, 'line-width': w([9, 0.6, 13, 2.5, 16, 7, 20, 26]) } },
    { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 5,
      filter: ['all', notTunnel, line(['primary', 'trunk', 'motorway'])],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': P.road, 'line-width': w([6, 0.8, 12, 3.2, 16, 10, 20, 34]) } },

    { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15.5,
      filter: line(['primary', 'secondary', 'tertiary', 'trunk', 'minor']),
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-letter-spacing': 0.05 },
      paint: { 'text-color': P.label, 'text-opacity': 0.8, 'text-halo-color': P.halo, 'text-halo-width': 1.5 } },
    { id: 'place', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 11.5,
      filter: line(['city', 'town']),
      layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-transform': 'uppercase', 'text-letter-spacing': 0.2,
        'text-size': ['match', ['get', 'class'], 'city', 15, 'town', 12, 11] },
      paint: { 'text-color': P.label, 'text-halo-color': P.land, 'text-halo-width': 1.5 } },
  ],
});
export const watercolorStyle = build(PAINT);
export const nightStyle = build(PAINT_NIGHT);

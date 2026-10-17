// One local outline icon family. No remote assets or user-provided SVG markup.
const paths = {
  dashboard: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  package: ['m12 3 9 5v8l-9 5-9-5V8z', 'm3 8 9 5 9-5M12 13v8M7.5 5.5l9 5'],
  layers: ['m12 3 10 5-10 5L2 8z', 'm2 12 10 5 10-5M2 16l10 5 10-5'],
  truck: ['M1 4h14v13H1zM15 8h4l3 4v5h-7M4 17a2 2 0 1 0 4 0M16 17a2 2 0 1 0 4 0'],
  chart: ['M3 3v18h18M7 16v-5M12 16V7M17 16v-8'],
  database: ['M20 6c0 2-4 3-8 3s-8-1-8-3 4-3 8-3 8 1 8 3Z', 'M4 6v6c0 2 4 3 8 3s8-1 8-3V6M4 12v6c0 2 4 3 8 3s8-1 8-3v-6'],
  settings: ['m9 3-.7 3-2.5 1-2.7-.9L1.6 9l2.2 2v2l-2.2 2 1.5 2.9 2.7-.9 2.5 1L9 21h6l.7-3 2.5-1 2.7.9 1.5-2.9-2.2-2v-2l2.2-2-1.5-2.9-2.7.9-2.5-1L15 3Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 15l6 6'],
  x: ['m6 6 12 12M6 18 18 6'], menu: ['M4 6h16M4 12h16M4 18h16'],
  arrowRight: ['M4 12h16m-6-6 6 6-6 6'], plus: ['M12 5v14M5 12h14'],
  filter: ['M3 4h18l-7 8v7l-4 2V12z'],
  edit: ['m16 3 5 5-12 12-6 1 1-6zM14 5l5 5'],
  trash: ['M3 6h18M5 6l1 15h12l1-15M9 6V3h6v3M10 10v7M14 10v7'],
  check: ['M20 11v1a8 8 0 1 1-4.7-7.3', 'm8 11 4 4 9-10'],
  alert: ['m12 3 10 18H2zM12 9v5M12 17v.1'],
  circleOff: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM6 6l12 12'],
  sun: ['M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1'],
  moon: ['M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z'],
  logout: ['M9 4H4v16h5M9 12h12m-5-5 5 5-5 5']
};
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key,value] of Object.entries({viewBox:'0 0 24 24',width:20,height:20,fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'icon'})) svg.setAttribute(key,value);
  for (const d of paths[name] || paths.package) { const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',d); svg.append(path); }
  return svg;
}

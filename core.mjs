const norm = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
export function findField(fields, candidates) { return fields.find(k => candidates.includes(norm(k))) || ''; }
export function parseYear(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!/^\d{4}(?:\.0+)?$/.test(s)) return null;
  const y = Number(s); return Number.isInteger(y) && y >= 1500 && y <= 2500 ? y : null;
}
export function samplingDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    // ArcGIS stores historical dates as negative milliseconds before 1970.
    // Reject small ambiguous numbers (for example an Excel day serial).
    if (Math.abs(value) > 1e11 && Math.abs(value) < 2e13) {
      const date = new Date(value), year = date.getUTCFullYear();
      if (year >= 1500 && year <= 2500) return date.toISOString().slice(0, 10);
    }
    return null;
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const named = s.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,.]\s*|\s+)(\d{4})$/i);
  if (!iso && !us && !named) return null;
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const y = Number(iso ? iso[1] : us ? us[3] : named[3]);
  const m = iso ? Number(iso[2]) : us ? Number(us[1]) : months.indexOf(named[1].toLowerCase()) + 1;
  const d = Number(iso ? iso[3] : us ? us[2] : named[2]);
  const test = new Date(Date.UTC(y, m - 1, d));
  if (test.getUTCFullYear() !== y || test.getUTCMonth() + 1 !== m || test.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function collection(raw) {
  if (Array.isArray(raw)) return { type: 'FeatureCollection', features: raw.flatMap(v => collection(v).features.map(f => ({ ...f, properties: { ...f.properties, ...(v.fileName ? { source_layer: v.fileName } : {}) } }))) };
  if (raw?.type === 'FeatureCollection' && Array.isArray(raw.features)) return raw;
  if (raw?.type === 'Feature') return { type: 'FeatureCollection', features: [raw] };
  throw new Error('Choose a GeoJSON FeatureCollection or a zipped shapefile.');
}
function validLine(line) { return Array.isArray(line) && line.length >= 2 && line.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90); }
export function normalizeArchive(raw, { yearField = '', dateField = '' } = {}) {
  const source = collection(raw), fields = [...new Set(source.features.flatMap(f => Object.keys(f.properties || {})))];
  const yf = yearField || findField(fields, ['year','year1','shorelineyear','surveyyear','sampleyear']);
  const df = dateField || findField(fields, ['datesampled','datesampl','samplingdate','surveydate','date']);
  const features = [], skipped = []; let derivedYears = 0;
  for (let i = 0; i < source.features.length; i++) {
    const f = source.features[i], p = f.properties || {}, g = f.geometry;
    const lines = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : [];
    if (!lines.length || !lines.every(validLine)) { skipped.push({ index: i, reason: 'Not a valid WGS84 shoreline line' }); continue; }
    const date = samplingDate(p[df]); let year = parseYear(p[yf]);
    if (!year && date) { year = Number(date.slice(0,4)); derivedYears++; }
    if (!year) { skipped.push({ index: i, reason: 'Missing or invalid shoreline year' }); continue; }
    features.push({ type: 'Feature', ...(f.id != null ? { id: f.id } : {}), properties: { ...p }, geometry: g, _shoreline: { year, date, index: i, yearDerived: !parseYear(p[yf]) } });
  }
  return { features, fields, yearField: yf, dateField: df, skipped, derivedYears, years: [...new Set(features.map(f => f._shoreline.year))].sort((a,b) => a-b) };
}
export function visibleYears(years, mode, active, comparison, enabled) {
  return new Set(years.filter(y => enabled.has(y) && (mode === 'all' || (mode === 'cumulative' ? y <= active : mode === 'compare' ? y === active || y === comparison : y === active))));
}
export function yearColor(year, min, max) {
  const values = [year,min,max].map(value => value == null || String(value).trim() === '' ? NaN : Number(value));
  if (!values.every(Number.isFinite)) return 'rgb(148,163,184)';
  const [value,a,b] = values, oldest = Math.min(a,b), newest = Math.max(a,b);
  // Calendar-year spacing keeps each shoreline's color stable across display modes.
  const t = newest === oldest ? 1 : Math.min(1, Math.max(0, (value-oldest)/(newest-oldest)));
  const colors = [[239,68,68],[250,204,21],[34,197,94]], i = t < .5 ? 0 : 1, k = i ? (t-.5)*2 : t*2;
  return `rgb(${colors[i].map((v,j) => Math.round(v + (colors[i+1][j]-v)*k)).join(',')})`;
}
export function distanceMeters(a,b) {
  const rad = Math.PI/180, p1=a[1]*rad, p2=b[1]*rad, dp=(b[1]-a[1])*rad, dl=(b[0]-a[0])*rad;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
export function lineLength(feature) {
  const lines=feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return lines.reduce((sum,line) => sum + line.slice(1).reduce((s,p,i) => s+distanceMeters(line[i],p),0),0);
}
export function exportCollection(features, metadata={}) {
  return { type:'FeatureCollection', ...metadata, features:features.map(f => ({type:'Feature', ...(f.id != null ? {id:f.id}:{}), properties:{...f.properties}, geometry:f.geometry})) };
}
export function transectCrossings(features, a, b) {
  const rad=Math.PI/180, cos=Math.cos((a[1]+b[1])/2*rad), scale=6371008.8*rad;
  const xy=p=>[(p[0]-a[0])*cos*scale,(p[1]-a[1])*scale], v=xy(b), len=distanceMeters(a,b), found=new Map();
  if(len<.01) return [];
  for(const f of features) {
    const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const line of lines) for(let i=1;i<line.length;i++) {
      const p=xy(line[i-1]), q=xy(line[i]), w=[q[0]-p[0],q[1]-p[1]], den=v[0]*w[1]-v[1]*w[0];
      if(Math.abs(den)<1e-8) continue;
      const t=(p[0]*w[1]-p[1]*w[0])/den, u=(p[0]*v[1]-p[1]*v[0])/den;
      if(t< -1e-8 || t>1+1e-8 || u< -1e-8 || u>1+1e-8) continue;
      const year=f._shoreline.year, metres=Math.max(0,Math.min(1,t))*len, rows=found.get(year)||[];
      if(!rows.some(x=>Math.abs(x.metres-metres)<.5)) rows.push({year,metres,feet:metres/0.3048,longitude:a[0]+(b[0]-a[0])*t,latitude:a[1]+(b[1]-a[1])*t});
      found.set(year,rows);
    }
  }
  return [...found.values()].flat().sort((x,y)=>x.year-y.year||x.metres-y.metres);
}

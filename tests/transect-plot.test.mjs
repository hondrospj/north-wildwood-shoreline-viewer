import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSeawardPositions,positionPlotModel,positionPlotSvg,filterPositionYears,shorelineChanges,signedFeet} from '../transect-plot.mjs';
import {normalizeArchive,transectCrossings,distanceMeters} from '../core.mjs';

test('chooses the crossing nearest the selected seaward end for each year without averaging or mutating observations',()=>{
  const raw=[{year:2000,metres:20,longitude:-74.82},{year:2000,metres:80,longitude:-74.81},{year:2025,metres:60,longitude:-74.815}];
  const copy=structuredClone(raw),b=selectSeawardPositions(raw,100,'B'),a=selectSeawardPositions(raw,100,'A');
  assert.deepEqual(b.map(r=>[r.year,r.metres,r.longitude]),[[2000,80,-74.81],[2025,60,-74.815]]);
  assert.deepEqual(a.map(r=>[r.year,r.metres,r.longitude]),[[2000,80,-74.82],[2025,40,-74.815]]);
  assert.equal(b[0].feet,80/0.3048);assert.deepEqual(raw,copy);
});
test('reversing the transect and its sea end preserves selected physical crossings and distances',()=>{
  const line=(year,x)=>({type:'Feature',properties:{Year:year},geometry:{type:'LineString',coordinates:[[x,38.96],[x,38.98]]}});
  const f=normalizeArchive({type:'FeatureCollection',features:[line(2000,-74.826),line(2000,-74.822),line(2025,-74.821)]}).features;
  const a=[-74.83,38.97],b=[-74.82,38.97],length=distanceMeters(a,b);
  const forward=selectSeawardPositions(transectCrossings(f,a,b),length,'B'),reverse=selectSeawardPositions(transectCrossings(f,b,a),length,'A');
  assert.equal(forward.length,2);assert.equal(reverse.length,2);
  for(let i=0;i<forward.length;i++){assert.equal(forward[i].year,reverse[i].year);assert.ok(Math.abs(forward[i].feet-reverse[i].feet)<1e-6);assert.ok(Math.abs(forward[i].longitude-reverse[i].longitude)<1e-10);}
});
test('feet plot uses actual year spacing, a zero baseline, and places all observations within its axes',()=>{
  const positions=shorelineChanges([{year:2025,feet:1500},{year:1771,feet:1000},{year:2000,feet:1200}],'earliest'),m=positionPlotModel(positions);
  assert.deepEqual(m.points.map(p=>p.year),[1771,2000,2025]);assert.equal(m.yTicks[0].value,0);
  assert.ok(m.maxFeet>=500);assert.ok(m.points.every(p=>p.x>=m.left&&p.x<=m.width-m.right&&p.y>=m.top&&p.y<=m.height-m.bottom));
  const [first,middle,last]=m.points;assert.ok(Math.abs((middle.x-first.x)/(last.x-first.x)-(2000-1771)/(2025-1771))<1e-10);
  const svg=positionPlotSvg(positions);assert.equal((svg.match(/class="position-point"/g)||[]).length,3);assert.match(svg,/Relative position \(ft\)/);assert.match(svg,/relative to 1771/);assert.doesNotMatch(svg,/metres/);
});
test('single-year, zero-distance, and no-crossing results remain valid without invented points',()=>{
  const m=positionPlotModel(shorelineChanges([{year:2025,feet:0}]));assert.equal(m.points.length,1);assert.ok(Number.isFinite(m.points[0].x));assert.ok(Number.isFinite(m.points[0].y));
  assert.equal(positionPlotModel([]),null);assert.equal(positionPlotSvg([]),'');assert.deepEqual(selectSeawardPositions([],100),[]);
  assert.deepEqual(selectSeawardPositions([{year:2025,metres:101}],100),[]);
});
test('year range includes both bounds, preserves measured feet and coordinates, and invents no missing years',()=>{
  const positions=[{year:1771,feet:500,longitude:-74.82},{year:1989,feet:600,longitude:-74.81},{year:2020,feet:700,longitude:-74.80},{year:2025,feet:650,longitude:-74.805}],copy=structuredClone(positions);
  assert.deepEqual(filterPositionYears(positions,1989,2020),[positions[1],positions[2]]);
  assert.deepEqual(filterPositionYears(positions,2020,2020),[positions[2]]);
  assert.deepEqual(filterPositionYears(positions,1990,2019),[]);
  assert.deepEqual(filterPositionYears(positions,1771,2025),positions);
  assert.deepEqual(positions,copy);
  const svg=positionPlotSvg(shorelineChanges(filterPositionYears(positions,2020,2025)));
  assert.equal((svg.match(/class="position-point"/g)||[]).length,2);
  assert.doesNotMatch(svg,/data-year="(?:1771|1989)"/);
});
test('retreat is negative, advance is positive, and the earliest selected observation is the explicit zero reference',()=>{
  const raw=[{year:2022,feet:1200,longitude:-74.80},{year:2020,feet:1000,longitude:-74.82},{year:2021,feet:900,longitude:-74.83}],copy=structuredClone(raw),changed=shorelineChanges(raw,'earliest');
  assert.deepEqual(changed.map(p=>[p.year,p.referenceYear,p.changeFeet]),[[2020,2020,0],[2021,2020,-100],[2022,2020,200]]);
  assert.equal(changed[1].changeMetres,-30.48);assert.equal(changed[1].feet,900);assert.equal(changed[1].longitude,-74.83);assert.deepEqual(raw,copy);
  const later=shorelineChanges(filterPositionYears(raw,2021,2022),'earliest');assert.deepEqual(later.map(p=>[p.year,p.referenceYear,p.changeFeet]),[[2021,2021,0],[2022,2021,300]]);
});
test('negative plotted changes are retained below zero and positive changes above zero without clipping',()=>{
  const points=shorelineChanges([{year:2020,feet:1500},{year:2021,feet:1200},{year:2022,feet:500},{year:2023,feet:2000}],'earliest'),model=positionPlotModel(points);
  assert.equal(model.points.length,4);assert.ok(model.minFeet<=-1000);assert.ok(model.maxFeet>=500);assert.ok(model.yTicks.some(t=>t.value===0));
  assert.ok(model.points.filter(p=>p.changeFeet<0).every(p=>p.y>model.zeroY&&p.y<=model.height-model.bottom));
  assert.ok(model.points.filter(p=>p.changeFeet>0).every(p=>p.y<model.zeroY&&p.y>=model.top));
  const svg=positionPlotSvg(points);assert.match(svg,/data-change-feet="-1000"/);assert.match(svg,/class="plot-zero"/);assert.match(svg,/−1,000/);assert.match(svg,/\+500/);
});
test('signed labels show plus and minus without a negative zero',()=>{
  assert.equal(signedFeet(-1234.6),'−1,235');assert.equal(signedFeet(1234.6),'+1,235');assert.equal(signedFeet(-0.4),'0');assert.equal(signedFeet(0),'0');
});
test('latest reference shows earlier landward positions as negative without changing measured positions',()=>{
  const raw=[{year:2022,feet:1200,longitude:-74.80},{year:2020,feet:1000,longitude:-74.82},{year:2021,feet:900,longitude:-74.83}],copy=structuredClone(raw);
  const positions=shorelineChanges(raw);
  assert.deepEqual(positions.map(p=>[p.year,p.referenceYear,p.changeFeet]),[[2020,2022,-200],[2021,2022,-300],[2022,2022,0]]);
  assert.deepEqual(positions.map(p=>p.feet),[1000,900,1200]);assert.deepEqual(raw,copy);
  const model=positionPlotModel(positions);assert.ok(model.minFeet<=-300);assert.equal(model.maxFeet,0);
  assert.ok(model.points.filter(p=>p.changeFeet<0).every(p=>p.y>model.zeroY));
  const svg=positionPlotSvg(positions);assert.match(svg,/data-change-feet="-300"/);assert.match(svg,/relative to 2022/);assert.doesNotMatch(svg,/since|retreat/);
});
test('manual reference is exact and a reference excluded by the range falls back to the latest observation',()=>{
  const raw=[{year:2020,feet:1000},{year:2021,feet:900},{year:2022,feet:1200}];
  assert.deepEqual(shorelineChanges(raw,2020).map(p=>p.changeFeet),[0,-100,200]);
  assert.deepEqual(shorelineChanges(raw,2021).map(p=>p.changeFeet),[100,0,300]);
  const filtered=shorelineChanges(filterPositionYears(raw,2021,2022),2020);
  assert.deepEqual(filtered.map(p=>[p.year,p.referenceYear,p.changeFeet]),[[2021,2022,-300],[2022,2022,0]]);
  assert.deepEqual(shorelineChanges([raw[1]],'latest').map(p=>[p.referenceYear,p.changeFeet]),[[2021,0]]);
  assert.deepEqual(shorelineChanges([],2020),[]);
});
test('latest-reference signed offsets are unchanged when the transect and seaward end are reversed',()=>{
  const line=(year,x)=>({type:'Feature',properties:{Year:year},geometry:{type:'LineString',coordinates:[[x,38.96],[x,38.98]]}});
  const features=normalizeArchive({type:'FeatureCollection',features:[line(2000,-74.826),line(2000,-74.822),line(2025,-74.821)]}).features;
  const a=[-74.83,38.97],b=[-74.82,38.97],length=distanceMeters(a,b);
  const forward=shorelineChanges(selectSeawardPositions(transectCrossings(features,a,b),length,'B'));
  const reverse=shorelineChanges(selectSeawardPositions(transectCrossings(features,b,a),length,'A'));
  assert.ok(forward[0].changeFeet<0);assert.equal(forward[1].changeFeet,0);
  for(let i=0;i<forward.length;i++){assert.equal(forward[i].referenceYear,reverse[i].referenceYear);assert.ok(Math.abs(forward[i].changeFeet-reverse[i].changeFeet)<1e-6);}
});

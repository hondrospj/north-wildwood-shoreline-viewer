import {normalizeArchive, visibleYears, yearColor, lineLength, distanceMeters, transectCrossings} from './core.mjs?v=age-colors-20261118';
import {selectSeawardPositions,positionPlotSvg,filterPositionYears,shorelineChanges,signedFeet} from './transect-plot.mjs?v=reference-year-1';
import {floodmapperBasemap} from './floodmapper-basemap.mjs';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {features:[],years:[],enabled:new Set(),year:null,compare:null,mode:'single',base:'street',playing:null,measureActive:false,measurePoints:[],crossings:[],positions:[],seawardEnd:'B',plotFrom:null,plotTo:null,plotReference:'latest'};
const params = new URLSearchParams(location.hash.slice(1));
const groups = new Map();
let toastTimer, loading=false, tileErrors=0;
const map = L.map('map', {zoomControl:false,zoomSnap:.25,minZoom:4,maxZoom:20}).setView([38.971,-74.826],13);
map.createPane('basemapColorPane').style.zIndex='200';
map.createPane('satellitePane').style.zIndex='201';
L.control.scale({position:'bottomleft',imperial:true,metric:true,maxWidth:100}).addTo(map);
const bases = {
  street:floodmapperBasemap('basemapColorPane'),
  satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{pane:'satellitePane',attribution:'Imagery © Esri and contributors',maxNativeZoom:19,maxZoom:20})
};
bases.street.addTo(map);
Object.values(bases).forEach(layer=>layer.on('tileerror',()=>{if(layer===bases[state.base]&&++tileErrors===6)toast('Some map tiles could not load. Check your connection or switch the Satellite option.');}));
const measureLayer=L.layerGroup().addTo(map),crossingLayer=L.layerGroup().addTo(measureLayer);
let measureLine=null,measureLabel=null,measureMarkers=[],measurementView=null;
L.DomEvent.disableClickPropagation($('measurePanel'));
L.DomEvent.disableScrollPropagation($('measurePanel'));
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function color(year){return yearColor(year,state.years[0],state.years.at(-1));}
function selectedFeatures(){const shown=visibleYears(state.years,state.mode,state.year,state.compare,state.enabled);return state.features.filter(feature=>shown.has(feature._shoreline.year));}
function style(feature){
  const year=feature._shoreline.year;
  return {color:color(year),weight:state.mode==='all'&&year===state.year?4.2:3,opacity:1,dashArray:state.mode==='compare'&&year===state.compare&&state.year!==state.compare?'9 5':null,lineCap:'round',lineJoin:'round'};
}
function popup(feature){
  const info=feature._shoreline;
  return `<div class="shoreline-popup"><h3>${info.year}</h3><dl><dt>Sampling date</dt><dd>${escape(info.date||'Not recorded')}</dd><dt>Line length</dt><dd>${Math.round(lineLength(feature)/.3048).toLocaleString()} ft</dd></dl></div>`;
}
function buildGroups(){
  for(const group of groups.values())group.remove();groups.clear();
  for(const year of state.years){
    const features=state.features.filter(feature=>feature._shoreline.year===year);
    groups.set(year,L.geoJSON(features,{style,onEachFeature:(feature,layer)=>{
      layer.bindPopup(popup(feature),{maxWidth:280});layer.bindTooltip(String(year),{sticky:true,direction:'top'});
      layer.on('mouseover',()=>{if(!state.measureActive)layer.setStyle({weight:5});});
      layer.on('mouseout',()=>layer.setStyle(style(feature)));
      layer.on('click',()=>{if(!state.measureActive){stopPlayback();setYear(year);}else layer.closePopup();});
    }}));
  }
}
function redraw(){
  if(state.mode==='compare'&&state.compare===state.year)state.compare=state.years.find(year=>year!==state.year)??state.year;
  const shown=visibleYears(state.years,state.mode,state.year,state.compare,state.enabled);
  for(const [year,group] of groups){
    if(shown.has(year)){if(!map.hasLayer(group))group.addTo(map);group.setStyle(style);}
    else if(map.hasLayer(group))group.remove();
  }
  if(shown.has(state.year))groups.get(state.year)?.bringToFront();
  $('mapCaption').textContent=state.years.length?(state.mode==='compare'?`Comparing ${state.year} and ${state.compare}`:state.mode==='all'?`All ${state.years.length} recorded shoreline years`:`Shoreline recorded in ${state.year}`):'North Wildwood shoreline map';
  document.querySelectorAll('[data-mode]').forEach(button=>{const selected=button.dataset.mode===state.mode;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=!state.years.length;});
  $('compareControls').hidden=state.mode!=='compare';
  $('activeLineLabel').hidden=state.mode!=='compare';
  $('activeYearLabel').textContent=state.mode==='compare'?'First year':'Year';
  $('activeYearSwatch').style.color=color(state.year);$('compareYearSwatch').style.color=color(state.compare);
  $('comparisonKey').textContent=state.mode==='compare'?`${state.year} solid; ${state.compare} dashed`:'';
  updateTimeline();updateMeasure();
}
function updateTimeline(){
  const ready=!!state.years.length,index=Math.max(0,state.years.indexOf(state.year)),slider=$('timeSlider');
  slider.disabled=!ready;slider.max=Math.max(0,state.years.length-1);slider.value=index;slider.setAttribute('aria-valuetext',ready?String(state.year):'Loading shorelines');
  slider.style.setProperty('--timeline-progress',`${state.years.length>1?index/(state.years.length-1)*100:0}%`);
  $('activeYear').disabled=!ready;$('activeYear').value=ready?String(state.year):'';$('compareYear').disabled=!ready;$('compareYear').value=ready?String(state.compare):'';
  $('previous').disabled=!ready||index===0;$('next').disabled=!ready||index===state.years.length-1;$('play').disabled=state.years.length<2;
  $('timelineStart').textContent=ready?state.years[0]:'—';$('timelineEnd').textContent=ready?state.years.at(-1):'—';
  $('measureButton').disabled=!ready;$('fitButton').disabled=!ready;
}
function setMode(mode){if(!state.years.length||!['single','compare','all'].includes(mode))return;if(!$('measurePanel').hidden)clearMeasurement();state.mode=mode;redraw();}
function setYear(year,scan=false){year=Number(year);if(!state.years.includes(year))return;if(!$('measurePanel').hidden)clearMeasurement();if(state.mode==='compare'&&year===state.compare)state.compare=state.year;state.year=year;if(scan&&state.mode==='all')state.mode='single';redraw();}
function advance(delta=1){const next=state.years.indexOf(state.year)+delta;if(next<0||next>=state.years.length)return false;setYear(state.years[next],true);return true;}
function stopPlayback(){clearInterval(state.playing);state.playing=null;$('play').setAttribute('aria-pressed','false');$('play').setAttribute('aria-label','Play shoreline timeline');$('play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>';}
function startPlayback(){
  stopPlayback();if(state.years.length<2)return;if(!$('measurePanel').hidden)clearMeasurement();if(state.year===state.years.at(-1))setYear(state.years[0],true);if(state.mode==='all')setMode('single');
  $('play').setAttribute('aria-pressed','true');$('play').setAttribute('aria-label','Pause shoreline timeline');$('play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  state.playing=setInterval(()=>{if(!advance()||state.year===state.years.at(-1))stopPlayback();},1000);
}
function fit(){
  const bounds=L.latLngBounds([]);for(const group of groups.values())bounds.extend(group.getBounds());
  if(bounds.isValid()){
    map.fitBounds(bounds,{padding:[24,24],maxZoom:15,animate:false});
  }
}
function chooseBasemap(base){
  if(!bases[base])return;
  // Retain the vector renderer and loaded imagery so repeated switches are immediate.
  if(base==='satellite'&&!map.hasLayer(bases.satellite))bases.satellite.addTo(map);
  map.getPane('satellitePane').style.visibility=base==='satellite'?'visible':'hidden';
  state.base=base;tileErrors=0;
  $('satelliteToggle').classList.toggle('on',base==='satellite');$('satelliteToggle').setAttribute('aria-checked',String(base==='satellite'));
}
$('aboutButton').addEventListener('click',()=>$('aboutDialog').showModal());
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('aboutDialog').addEventListener('close',()=>$('aboutButton').focus());
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{stopPlayback();setMode(button.dataset.mode);}));
$('activeYear').addEventListener('change',event=>{stopPlayback();setYear(event.target.value,true);});
$('compareYear').addEventListener('change',event=>{const year=Number(event.target.value);if(state.years.includes(year)){stopPlayback();if(!$('measurePanel').hidden)clearMeasurement();if(year===state.year)state.year=state.compare;state.compare=year;redraw();}});
$('satelliteToggle').addEventListener('click',()=>chooseBasemap(state.base==='satellite'?'street':'satellite'));
$('timeSlider').addEventListener('input',event=>{stopPlayback();setYear(state.years[Number(event.target.value)],true);});
$('previous').addEventListener('click',()=>{stopPlayback();advance(-1);});$('next').addEventListener('click',()=>{stopPlayback();advance();});
$('play').addEventListener('click',()=>state.playing?stopPlayback():startPlayback());
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
$('fitButton').addEventListener('click',fit);
$('zoomIn').addEventListener('click',()=>map.zoomIn());$('zoomOut').addEventListener('click',()=>map.zoomOut());
function updateZoom(){ $('zoomIn').disabled=map.getZoom()>=map.getMaxZoom();$('zoomOut').disabled=map.getZoom()<=map.getMinZoom(); }
map.on('zoomend',updateZoom);updateZoom();
new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('mainMap'));
function download(blob,name){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function measurementMode(on){
  state.measureActive=on;
  $('measureButton').setAttribute('aria-pressed',String(on));
  $('measureButtonLabel').textContent=on?'Cancel':'Measure';
  $('mainMap').classList.toggle('measuring',on);
  if(on){
    if(!measurementView)measurementView={mode:state.mode,year:state.year,compare:state.compare};
    stopPlayback();map.closePopup();for(const group of groups.values())group.eachLayer(layer=>layer.closeTooltip());
    state.measurePoints=[];state.crossings=[];state.positions=[];measureLayer.clearLayers();crossingLayer.clearLayers();crossingLayer.addTo(measureLayer);
    measureLine=null;measureLabel=null;measureMarkers=[];
    $('measurePanel').hidden=false;document.body.classList.add('measuring-panel-open');$('redrawMeasure').hidden=true;
    $('measureInstructions').textContent=state.seawardEnd==='B'?'Click landward point A, then seaward point B.':'Click seaward point A, then landward point B.';
    $('measureDistance').textContent='—';$('crossings').replaceChildren();$('positionPlot').replaceChildren();$('transectPlot').hidden=true;$('plotControls').hidden=true;$('plottedValues').hidden=true;$('plottedValues').open=false;$('downloadCrossings').hidden=true;state.mode='all';redraw();$('clearMeasure').focus();
  }
}
function clearMeasurement(){
  const focusedInside=$('measurePanel').contains(document.activeElement);
  measurementMode(false);state.measurePoints=[];state.crossings=[];state.positions=[];measureLayer.clearLayers();crossingLayer.clearLayers();
  measureLine=null;measureLabel=null;measureMarkers=[];$('measurePanel').hidden=true;document.body.classList.remove('measuring-panel-open');
  if(measurementView){const view=measurementView;measurementView=null;Object.assign(state,view);redraw();}
  if(focusedInside)$('measureButton').focus();
}
const lengthText=metres=>`${Math.round(metres/.3048).toLocaleString()} ft`;
function drawMeasureLine(a,b){
  const latlngs=[a,b].map(p=>[p[1],p[0]]),metres=distanceMeters(a,b),text=lengthText(metres);
  if(measureLine)measureLine.setLatLngs(latlngs);
  else measureLine=L.polyline(latlngs,{color:'#0b1220',weight:3,dashArray:'7 5',interactive:false}).addTo(measureLayer);
  const midpoint=[(a[1]+b[1])/2,(a[0]+b[0])/2];
  if(!measureLabel)measureLabel=L.tooltip({permanent:true,direction:'top',className:'transect-length',offset:[0,-8]}).setLatLng(midpoint).setContent(text).addTo(measureLayer);
  else measureLabel.setLatLng(midpoint).setContent(text);
  $('measureDistance').textContent=text;
}
$('measureButton').addEventListener('click',()=>state.measureActive?clearMeasurement():measurementMode(true));
$('redrawMeasure').addEventListener('click',()=>measurementMode(true));
$('clearMeasure').addEventListener('click',clearMeasurement);
map.on('mousemove',e=>{
  if(state.measureActive&&state.measurePoints.length===1)drawMeasureLine(state.measurePoints[0],[e.latlng.lng,e.latlng.lat]);
});
map.on('click',e=>{
  if(!state.measureActive)return;
  const p=[e.latlng.lng,e.latlng.lat],index=state.measurePoints.length,label=index===0?'A':'B';
  if(index===1&&distanceMeters(state.measurePoints[0],p)<.05){toast('Choose a different point for B.');return;}
  state.measurePoints.push(p);
  const marker=L.marker(e.latlng,{title:`Transect endpoint ${label} — drag to adjust`,alt:`Transect endpoint ${label}`,draggable:false,bubblingMouseEvents:false,icon:L.divIcon({className:'measure-marker',html:label,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(measureLayer);
  marker.on('drag',()=>{const latlng=marker.getLatLng();state.measurePoints[index]=[latlng.lng,latlng.lat];updateMeasure();});
  measureMarkers.push(marker);
  if(index===0)$('measureInstructions').textContent=`Now click ${state.seawardEnd==='B'?'seaward':'landward'} point B. The plot appears automatically.`;
  else{measurementMode(false);measureMarkers.forEach(m=>m.dragging.enable());$('redrawMeasure').hidden=false;updateMeasure();}
});
function updateMeasure(){
  if(state.measurePoints.length!==2)return;
  const [a,b]=state.measurePoints,total=distanceMeters(a,b),landward=state.seawardEnd==='B'?'A':'B';drawMeasureLine(a,b);
  $('measureInstructions').textContent=`Drag A or B to update. Distances start at landward end ${landward}.`;
  state.crossings=transectCrossings(selectedFeatures(),a,b);crossingLayer.clearLayers();
  const selected=filterPositionYears(selectSeawardPositions(state.crossings,total,state.seawardEnd),state.plotFrom,state.plotTo);
  updatePlotReferenceControl(selected);state.positions=shorelineChanges(selected,state.plotReference);
  for(const r of state.positions)L.circleMarker([r.latitude,r.longitude],{radius:3,color:'#0b1220',weight:1,fillColor:color(r.year),fillOpacity:1,bubblingMouseEvents:false}).bindTooltip(`${r.year} · ${signedFeet(r.changeFeet)} ft relative to ${r.referenceYear} · seaward-most`).addTo(crossingLayer);
  $('plotControls').hidden=false;$('transectPlot').hidden=false;updatePlotYearControls();
  $('plotChartTitle').textContent=state.positions.length?`Relative to ${state.positions[0].referenceYear} (ft)`:'Relative shoreline position (ft)';
  $('positionPlot').innerHTML=positionPlotSvg(state.positions,color)||'<p class="plot-empty">No shoreline crossings in these years. Widen the year range or show more shoreline years.</p>';
  $('plotSelection').textContent=`${state.positions.length} recorded ${state.positions.length===1?'year':'years'} · − landward / + seaward`;
  $('plottedValues').hidden=false;
  $('crossings').innerHTML=state.positions.length?`<div class="crossing-table"><table><thead><tr><th scope="col">Year</th><th scope="col">Relative to ${state.positions[0].referenceYear} (ft)</th></tr></thead><tbody>${state.positions.map(r=>`<tr><th scope="row">${r.year}</th><td>${signedFeet(r.changeFeet)}</td></tr>`).join('')}</tbody></table></div>`:'<p>No crossings in the selected year range.</p>';
  $('downloadCrossings').hidden=!state.positions.length;
}
function updatePlotReferenceControl(positions){
  const select=$('plotReferenceYear'),latest=positions.at(-1)?.year;
  if(state.plotReference!=='latest'&&!positions.some(p=>p.year===state.plotReference))state.plotReference='latest';
  select.replaceChildren(new Option(latest===undefined?'No measured years':`Latest year (${latest})`,'latest'),...positions.slice().reverse().map(p=>new Option(String(p.year),String(p.year))));
  select.value=String(state.plotReference);select.disabled=!positions.length;
}
function updatePlotYearControls(){
  const start=Math.max(0,state.years.indexOf(state.plotFrom)),end=Math.max(start,state.years.indexOf(state.plotTo));
  for(const [id,value] of [['plotYearStart',start],['plotYearEnd',end]]){
    const slider=$(id);slider.max=Math.max(0,state.years.length-1);slider.value=value;slider.disabled=!state.years.length;slider.setAttribute('aria-valuetext',String(state.years[value]??''));
  }
  $('plotYearStartValue').textContent=state.plotFrom??'—';$('plotYearEndValue').textContent=state.plotTo??'—';
  $('resetPlotYears').disabled=state.plotFrom===state.years[0]&&state.plotTo===state.years.at(-1);
}
$('plotYearStart').addEventListener('input',e=>{
  if(!state.years.length)return;
  state.plotFrom=state.years[Math.min(Number(e.target.value),state.years.indexOf(state.plotTo))];updateMeasure();
});
$('plotYearEnd').addEventListener('input',e=>{
  if(!state.years.length)return;
  state.plotTo=state.years[Math.max(Number(e.target.value),state.years.indexOf(state.plotFrom))];updateMeasure();
});
$('resetPlotYears').addEventListener('click',()=>{state.plotFrom=state.years[0];state.plotTo=state.years.at(-1);updateMeasure();});
$('seawardEnd').addEventListener('change',e=>{state.seawardEnd=e.target.value;updateMeasure();});
$('plotReferenceYear').addEventListener('change',e=>{state.plotReference=e.target.value==='latest'?'latest':Number(e.target.value);updateMeasure();});
function showPlotPoint(event){const point=event.target.closest('.position-point');if(!point)return;$('positionPlot').querySelectorAll('.selected-point').forEach(p=>p.classList.remove('selected-point'));point.classList.add('selected-point');$('plotSelection').textContent=`${point.dataset.year} · ${signedFeet(Number(point.dataset.changeFeet))} ft relative to ${point.dataset.referenceYear}`;}
['pointerover','focusin','click'].forEach(type=>$('positionPlot').addEventListener(type,showPlotPoint));
$('positionPlot').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showPlotPoint(e);}});
$('downloadCrossings').addEventListener('click',()=>{const rows=['year,reference_year,change_feet,change_metres,seaward_end,landward_end,distance_from_landward_end_feet,distance_from_landward_end_metres,longitude,latitude',...state.positions.map(r=>`${r.year},${r.referenceYear},${r.changeFeet.toFixed(3)},${r.changeMetres.toFixed(3)},${state.seawardEnd},${state.seawardEnd==='B'?'A':'B'},${r.feet.toFixed(3)},${r.metres.toFixed(3)},${r.longitude.toFixed(8)},${r.latitude.toFixed(8)}`)];download(new Blob([rows.join('\n')],{type:'text/csv'}),'wildwoods-shoreline-change.csv');});


document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||$('aboutDialog').open)return;
  if(!$('measurePanel').hidden){clearMeasurement();$('measureButton').focus();}
});
function openArchive(raw){
  const normalized=normalizeArchive(raw);
  if(!normalized.features.length)throw new Error('No dated shorelines were found.');
  stopPlayback();state.features=normalized.features;state.years=normalized.years;state.enabled=new Set(state.years);
  state.year=state.years.at(-1);state.compare=state.years[0];state.mode='single';
  const year=Number(params.get('year')),compare=Number(params.get('compare'));
  if(state.years.includes(year))state.year=year;
  if(state.years.includes(compare))state.compare=compare;
  if(['single','compare','all'].includes(params.get('mode')))state.mode=params.get('mode');
  state.plotFrom=state.years[0];state.plotTo=state.years.at(-1);state.plotReference='latest';
  for(const id of ['activeYear','compareYear'])$(id).replaceChildren(...state.years.map(value=>new Option(String(value),String(value))));
  $('yearCount').textContent=state.years.length;$('yearSpan').textContent=`${state.years[0]}–${state.years.at(-1)}`;
  $('aboutData').textContent=`${state.features.length} original shoreline traces. Missing years are not interpolated.`;
  $('archiveNotice').hidden=true;
  buildGroups();updatePlotYearControls();redraw();fit();
  const lat=Number(params.get('lat')),lng=Number(params.get('lng')),zoom=Number(params.get('zoom'));
  if(params.has('lat')&&params.has('lng')&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=85&&Math.abs(lng)<=180&&zoom>=4&&zoom<=20)map.setView([lat,lng],zoom,{animate:false});
  if(params.get('base')==='satellite')chooseBasemap('satellite');
}
async function init(){
  if(loading)return;loading=true;
  $('archiveNotice').hidden=false;$('archiveNotice').querySelector('strong').textContent='Loading shorelines…';$('archiveNotice').querySelector('p').textContent='';$('retryLoad').hidden=true;
  redraw();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch('data/archive.geojson',{signal:controller.signal});
    if(!response.ok)throw new Error('Archive unavailable');
    openArchive(await response.json());
  }catch(error){
    $('archiveNotice').hidden=false;$('archiveNotice').querySelector('strong').textContent='Shorelines could not load';
    $('archiveNotice').querySelector('p').textContent='Check your connection and try again.';$('retryLoad').hidden=false;
    $('aboutData').textContent='The shoreline archive is currently unavailable.';
  }finally{clearTimeout(timeout);loading=false;}
}
$('retryLoad').addEventListener('click',init);
init();

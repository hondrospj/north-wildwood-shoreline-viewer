// One outermost observed crossing per year, toward the explicitly chosen sea end.
// Distances always start at the opposite (landward) endpoint.
export function selectSeawardPositions(crossings,totalMetres,seawardEnd='B') {
  if(!Number.isFinite(totalMetres)||totalMetres<=0)return [];
  const selected=new Map();
  for(const crossing of crossings) {
    if(!Number.isFinite(crossing.year)||!Number.isFinite(crossing.metres)||crossing.metres<0||crossing.metres>totalMetres+0.01)continue;
    const fromA=Math.min(totalMetres,crossing.metres),metres=seawardEnd==='A'?totalMetres-fromA:fromA;
    const point={...crossing,metres,feet:metres/0.3048,metresFromA:fromA};
    if(!selected.has(point.year)||point.metres>selected.get(point.year).metres)selected.set(point.year,point);
  }
  return [...selected.values()].sort((a,b)=>a.year-b.year);
}

export function filterPositionYears(positions,from,to) {
  return positions.filter(point=>point.year>=from&&point.year<=to);
}

// Preserve absolute positions while expressing signed offsets from a measured
// reference shoreline. The coordinate increases seaward; latest is the default.
export function shorelineChanges(positions,referenceYear='latest') {
  const measured=positions.filter(p=>Number.isFinite(p.year)&&Number.isFinite(p.feet)).sort((a,b)=>a.year-b.year);
  if(!measured.length)return [];
  const reference=referenceYear==='earliest'?measured[0]:measured.find(p=>p.year===referenceYear)||measured.at(-1);
  return measured.map(p=>({...p,referenceYear:reference.year,changeFeet:p.feet-reference.feet,changeMetres:(p.feet-reference.feet)*0.3048}));
}

export function signedFeet(value) {
  const rounded=Math.round(value);
  return `${rounded>0?'+':rounded<0?'−':''}${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function positionPlotModel(positions) {
  const points=positions.filter(p=>Number.isFinite(p.year)&&Number.isFinite(p.changeFeet)).sort((a,b)=>a.year-b.year);
  if(!points.length)return null;
  const width=440,height=205,left=65,right=16,top=14,bottom=38;
  const first=points[0].year,last=points.at(-1).year,minYear=first===last?first-1:first,maxYear=first===last?last+1:last;
  const lowest=Math.min(0,...points.map(p=>p.changeFeet)),highest=Math.max(0,...points.map(p=>p.changeFeet));
  const span=Math.max(1,highest-lowest),rough=span/4,power=10**Math.floor(Math.log10(rough));
  const step=([1,2,2.5,5,10].find(n=>n>=rough/power)||10)*power;
  let minFeet=Math.floor(lowest/step)*step,maxFeet=Math.ceil(highest/step)*step;
  if(minFeet===maxFeet){minFeet=-1;maxFeet=1;}
  const x=year=>left+(year-minYear)/(maxYear-minYear)*(width-left-right),y=feet=>height-bottom-(feet-minFeet)/(maxFeet-minFeet)*(height-top-bottom);
  const yTicks=Array.from({length:Math.round((maxFeet-minFeet)/step)+1},(_,i)=>({value:minFeet+i*step,y:y(minFeet+i*step)}));
  let years=[first];
  if(first!==last) {
    const rawStep=(last-first)/4,magnitude=10**Math.floor(Math.log10(rawStep));
    const yearStep=Math.max(1,([1,2,5,10].find(n=>n>=rawStep/magnitude)||10)*magnitude);
    for(let year=Math.ceil(first/yearStep)*yearStep;year<last;year+=yearStep)if(year-first>(last-first)*.14&&last-year>(last-first)*.14)years.push(year);
    years.push(last);
  }
  return {width,height,left,right,top,bottom,minYear,maxYear,minFeet,maxFeet,zeroY:y(0),yTicks,xTicks:years.map(value=>({value,x:x(value)})),points:points.map(p=>({...p,x:x(p.year),y:y(p.changeFeet)}))};
}

export function positionPlotSvg(positions,color=()=>'#60a5fa') {
  const model=positionPlotModel(positions);if(!model)return '';
  const {width,height,left,right,top,bottom,yTicks,xTicks,points,minFeet,maxFeet}=model,base=height-bottom,referenceYear=points[0].referenceYear;
  const format=n=>{const value=Math.abs(n)<1e-8?0:n;return `${value>0?'+':value<0?'−':''}${Math.abs(value).toLocaleString('en-US',{maximumFractionDigits:Math.max(Math.abs(minFeet),Math.abs(maxFeet))<10?2:0})}`;};
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="positionPlotTitle positionPlotDescription">
    <title id="positionPlotTitle">Shoreline position relative to ${referenceYear}, in feet</title>
    <desc id="positionPlotDescription">Year on the horizontal axis. Signed shoreline position in feet relative to ${referenceYear} on the vertical axis. Negative means landward of that shoreline; positive means seaward of it. One observed seaward-most crossing per year. Years without a crossing are omitted.</desc>
    ${yTicks.map(t=>`<line class="${Math.abs(t.value)<1e-8?'plot-zero':'plot-grid'}" x1="${left}" x2="${width-right}" y1="${t.y}" y2="${t.y}"/><text class="plot-tick" x="${left-8}" y="${t.y+4}" text-anchor="end">${format(t.value)}</text>`).join('')}
    <path class="plot-axis" d="M${left} ${top}V${base}H${width-right}"/>
    ${xTicks.map(t=>`<line class="plot-axis" x1="${t.x}" x2="${t.x}" y1="${base}" y2="${base+4}"/><text class="plot-tick" x="${t.x}" y="${base+17}" text-anchor="${t.value===xTicks[0].value&&xTicks.length>1?'start':t.value===xTicks.at(-1).value&&xTicks.length>1?'end':'middle'}">${t.value}</text>`).join('')}
    <text class="plot-axis-label" x="${(left+width-right)/2}" y="${height-2}" text-anchor="middle">Year</text>
    <text class="plot-axis-label" transform="translate(14 ${(top+base)/2}) rotate(-90)" text-anchor="middle">Relative position (ft)</text>
    ${points.map(p=>`<circle class="position-point" cx="${p.x}" cy="${p.y}" r="3.5" fill="${color(p.year)}" data-year="${p.year}" data-feet="${p.feet}" data-change-feet="${p.changeFeet}" data-reference-year="${p.referenceYear}" tabindex="0" role="button" aria-label="${p.year}: ${signedFeet(p.changeFeet)} feet relative to ${p.referenceYear}"><title>${p.year}: ${signedFeet(p.changeFeet)} ft relative to ${p.referenceYear}</title></circle>`).join('')}
  </svg>`;
}

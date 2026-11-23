import { isClosedRoute, wrapLongitude } from './route.js?v=4';

// Mile End campus, from the footpath east of the Clock Tower to Library Square.
export const QUEEN_MARY_MILE_END = {
  name: '伦敦玛丽女王大学 · Mile End 校园步道',
  points: [
    [51.5231100, -0.0399572], [51.5231166, -0.0399344], [51.5231285, -0.0399437],
    [51.5232299, -0.0400261], [51.5232502, -0.0400432], [51.5232727, -0.0400692],
    [51.5232808, -0.0400933], [51.5233188, -0.0400749], [51.5233459, -0.0400644],
    [51.5233831, -0.0400476], [51.5234141, -0.0400341], [51.5234292, -0.0400278],
    [51.5234419, -0.0400245], [51.5234531, -0.0400239], [51.5234671, -0.0400247],
    [51.5234785, -0.0400296], [51.5234960, -0.0400413], [51.5235546, -0.0400928],
    [51.5236335, -0.0401588], [51.5237137, -0.0402280], [51.5238139, -0.0403103],
    [51.5238275, -0.0402685], [51.5239461, -0.0403676], [51.5239680, -0.0403854],
    [51.5240767, -0.0403924], [51.5241258, -0.0403939], [51.5241341, -0.0403776],
    [51.5241542, -0.0403383], [51.5241653, -0.0403162], [51.5242339, -0.0401912],
    [51.5244046, -0.0404335],
  ],
};

// Independently drawn demonstration loop inside OSM sports-centre way 1125998153.
// Degrees are WGS84; the ellipse is illustrative geometry for the in-page receiver.
const centre = [18.40139, 110.01342];
const radians = degrees => degrees * Math.PI / 180;
const bearing = radians(-12);
const longitudeScale = 111195 * Math.cos(radians(centre[0]));
const stadiumPoints = Array.from({ length: 32 }, (_, index) => {
  const angle = 2 * Math.PI * index / 32;
  const along = 76 * Math.cos(angle);
  const across = 47 * Math.sin(angle);
  const north = along * Math.cos(bearing) - across * Math.sin(bearing);
  const east = along * Math.sin(bearing) + across * Math.cos(bearing);
  return [Number((centre[0] + north / 111195).toFixed(6)),
    Number((centre[1] + east / longitudeScale).toFixed(6))];
});

export const LINGSHUI_STADIUM = {
  name: '陵水体育场 · 示意环线',
  points: counterclockwiseTrack([...stadiumPoints, [...stadiumPoints[0]]]),
};

function counterclockwiseTrack(points) {
  if (!isClosedRoute(points)) return points;
  // Signed area with east as x and north as y. Translate to the start to
  // keep the calculation precise even for small running tracks.
  const [lat, lon] = points[0];
  let twiceArea = 0, previousX = 0, previousY = 0;
  for (const [y, x] of points) {
    const east = wrapLongitude(x - lon), north = y - lat;
    twiceArea += previousX * north - previousY * east;
    previousX = east;
    previousY = north;
  }
  return twiceArea < 0 ? [...points].reverse() : points;
}

export function sharedTrackPoints(points, fieldName) {
  if (fieldName) return counterclockwiseTrack(points);
  // Earlier direct Lingshui preset links stored coordinates without a field name.
  const preset = LINGSHUI_STADIUM.points;
  if (points.length === preset.length && points.every(([lat,lon], i) => {
    const original = preset[preset.length - 1 - i];
    return lat === original[0] && lon === original[1];
  })) return preset;
  return points;
}

const D = Math.PI / 180;
const M = 111195;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function offsetFrom(origin, point) {
  return [(point[1]-origin[1])*M*Math.cos(origin[0]*D), (point[0]-origin[0])*M];
}
export function offsetPoint(center, east, north) {
  return [center[0]+north/M, center[1]+east/(M*Math.cos(center[0]*D))];
}

// Bearing is clockwise from north. Length and width include the bends.
export function ovalPoint(model, longitudinal, lateral) {
  const angle = model.bearing * D;
  return offsetPoint(model.center, longitudinal*Math.sin(angle) + lateral*Math.cos(angle),
    longitudinal*Math.cos(angle) - lateral*Math.sin(angle));
}
export function stadiumLoop(model) {
  const radius = model.width/2;
  const straight = (model.length-model.width)/2;
  const points = [];
  for (const sign of [1,-1]) {
    for (let step=0; step<=24; step++) {
      const angle = Math.PI*step/24;
      points.push(ovalPoint(model, sign*(straight + radius*Math.sin(angle)), sign*radius*Math.cos(angle)));
    }
  }
  return [...points, [...points[0]]];
}
export function fitOval(center, outline) {
  const model = {center, length:168, width:72, bearing:0};
  if (outline.length < 4) return model;
  const xy = outline.map(p => offsetFrom(center,p));
  let best = Infinity;
  for (let deg=0; deg<180; deg+=2) {
    const a=deg*D;
    const u=xy.map(([x,y])=>x*Math.sin(a)+y*Math.cos(a));
    const v=xy.map(([x,y])=>x*Math.cos(a)-y*Math.sin(a));
    const long=Math.max(...u)-Math.min(...u), wide=Math.max(...v)-Math.min(...v);
    if (long < wide || long*wide >= best || wide < 10) continue;
    best=long*wide;
    model.bearing=deg;
    model.length=clamp(long*.9,35,600);
    model.width=clamp(wide*.87,14,model.length*.88);
    model.center=ovalPoint({...model,center},(Math.max(...u)+Math.min(...u))/2,(Math.max(...v)+Math.min(...v))/2);
  }
  return model;
}

const alias = {北大:'北京大学',清华:'清华大学',浙大:'浙江大学',复旦:'复旦大学',武大:'武汉大学',厦大:'厦门大学',上交:'上海交通大学',中大:'中山大学',北航:'北京航空航天大学',中科大:'中国科学技术大学',北邮:'北京邮电大学'};
const simplify = s => s.toLowerCase().replace(/[\s（）()·－-]+/gu,'');
export function searchSchools(rows, query) {
  const terms=query.trim().replace(/^(北京邮电大学|北邮|bupt)/i,'北京邮电大学 ').trim()
    .split(/\s+/).map(t=>simplify(alias[t] || t));
  if (!terms[0]) return [];
  return rows.map(row=>{
    if (row[6]?.specificQuery && !query.includes(row[6].specificQuery)) return {row,score:0};
    const name=simplify(row[0]), hay=simplify(row.slice(0,3).join(' '));
    const score=terms.every(t=>hay.includes(t)) ? terms.reduce((n,t)=>n+(name===t?100:name.startsWith(t)?30:name.includes(t)?15:2),0) : 0;
    return {row,score};
  }).filter(hit=>hit.score).sort((a,b)=>b.score-a.score || (a.row[6]?.order ?? Infinity)-(b.row[6]?.order ?? Infinity) || a.row[0].length-b.row[0].length).slice(0,35).map(hit=>hit.row);
}
export function nearbyVenues(rows, school) {
  const [,,,lat,lon] = school;
  if (school[6]?.venues) {
    return school[6].venues.map(field=>({...field, exact:false, reviewed:true,
      metres:Math.hypot(...offsetFrom([lat,lon],field.center))}));
  }
  const ids=new Set(school[6]?.fieldIds);
  const candidates=[];
  for (const [id,name,y,x,exact,deltas,track=0] of rows) {
    if(!ids.has(id)) continue;
    const [east,north]=offsetFrom([lat,lon],[y,x]);
    const metres=Math.hypot(east,north);
    const outline=[];
    for(let i=0;i<deltas.length;i+=2) outline.push([y+deltas[i]/1e6,x+deltas[i+1]/1e6]);
    const direction=Math.abs(north)<45 && Math.abs(east)<45 ? '中心' :
      (Math.abs(north)>Math.abs(east)*.45 ? (north>0?'北':'南'):'') +
      (Math.abs(east)>Math.abs(north)*.45 ? (east>0?'东':'西'):'');
    candidates.push({id,name:name || direction.replace('北东','东北').replace('北西','西北').replace('南东','东南').replace('南西','西南')+'侧操场',
      center:[y,x],outline:exact ? counterclockwiseTrack(outline) : outline,exact:Boolean(exact),metres,mappedName:name,track});
  }
  // Several mapped lanes or a stadium boundary can represent the same field.
  candidates.sort((a,b)=>Number(b.exact)-Number(a.exact) || b.track-a.track || Number(Boolean(b.mappedName))-Number(Boolean(a.mappedName)) || a.metres-b.metres);
  const unique=[];
  for (const candidate of candidates) {
    const same=unique.find(other=>Math.hypot(...offsetFrom(other.center,candidate.center))<38 &&
      (!other.mappedName || !candidate.mappedName || other.mappedName===candidate.mappedName));
    if(!same) unique.push(candidate);
    else if(!same.mappedName && candidate.mappedName) {
      same.name=same.mappedName=candidate.mappedName;
    }
  }
  return unique.sort((a,b)=>a.metres-b.metres);
}


export function streetBasemap(L, status) {
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  let failed = false;
  tiles.on('loading', () => { failed = false; status.textContent = '正在加载底图…'; });
  tiles.on('tileerror', () => { failed = true; status.textContent = '底图加载失败，可刷新重试。'; });
  tiles.on('load', () => { if (!failed) status.textContent = ''; });
  tiles.on('remove', () => { status.textContent = ''; });
  return tiles;
}

export function setupCampusFinder({L, measure, use, showRoute}) {
  const $ = id => document.getElementById(id);
  const status = message => { $('school-status').textContent=message; };
  const demoSchool = ['陵水黎安国际教育创新试验区','海南 · 陵水','陵水体育场;海南陵水黎安',...centre,[]];
  const cache = new Map();
  let index, school, map, candidates, preview, path, startPin;
  let revision=0, placing=false, chosen=null, model=null, points=[], fieldLabel='';
  const handles=[];
  async function dataset(file) {
    if (cache.has(file)) return cache.get(file);
    const task=(async()=>{
      const path='campus-data/'+file+'.json?v=8';
      let response=await fetch(path);
      // Older local USB helpers only serve the original application assets.
      if (response.status===404 && location.hostname==='127.0.0.1')
        response=await fetch('https://softbread1217.github.io/trace-isle/'+path);
      if (!response.ok) throw new Error('地图资料暂时无法加载');
      return response.json();
    })();
    cache.set(file,task);
    try { return await task; } catch (err) {cache.delete(file);throw err;}
  }
  function openMap() {
    $('field-picker').hidden=false;
    $('route-editor').hidden=true;
    if (!map) {
      map=L.map('campus-map',{maxZoom:19});
      const tiles=streetBasemap(L, $('campus-map-status'));
      requestAnimationFrame(() => { if ($('basemap').checked) tiles.addTo(map); });
      $('basemap').addEventListener('change',()=>$('basemap').checked?tiles.addTo(map):tiles.remove());
      candidates=L.layerGroup().addTo(map);
      preview=L.layerGroup().addTo(map);
      map.on('click',e=>{
        if (!placing) return;
        if (map.getZoom()<15) {map.setView(e.latlng,Math.min(16,map.getZoom()+4));status('继续放大，在操场中心点一下。');return;}
        placing=false;
        select({name:'自选操场',center:[e.latlng.lat,e.latlng.lng],outline:[],exact:false},true);
      });
    }
    map.invalidateSize();
  }
  function resetPreview() {
    preview?.clearLayers();handles.length=0;chosen=model=null;points=[];placing=false;
    $('field-preview').hidden=true;
  }
  function resetResults() {
    resetPreview(); candidates?.clearLayers();
    $('field-results').replaceChildren();
  }
  function closePicker() {
    ++revision;
    resetResults();
    $('school-results').replaceChildren();
    $('field-picker').hidden=true;
    $('route-editor').hidden=false;
    status('');
    showRoute();
  }
  function geometry() {
    if(model) points=stadiumLoop(model);
    path.setLatLngs(points);startPin.setLatLng(points[0]);
    $('field-length').textContent=fieldLabel+' · '+(model || chosen.estimated?'估算路线':'地图跑道')+' · 逆时针 · 一圈约 '+Math.round(measure(points))+' 米';
    if(!model) return;
    const locations=[model.center,ovalPoint(model,model.length/2,0),ovalPoint(model,-model.length/2,0),ovalPoint(model,0,model.width/2)];
    handles.forEach((h,i)=>h.setLatLng(locations[i]));
  }
  function addHandles() {
    const names=['移动中心','调整第一端','调整另一端','调整宽度'];
    names.forEach((name,i)=>{
      const handle=L.marker(model.center,{draggable:true,title:name,alt:name,
        icon:L.divIcon({className:'oval-handle'+(i===0?' oval-center':''),iconSize:[18,18],iconAnchor:[9,9]})}).addTo(preview);
      let anchor;
      handle.on('dragstart',()=>{if(i===1 || i===2) anchor=ovalPoint(model,(i===1?-1:1)*model.length/2,0);});
      handle.on('drag',()=>{
        const ll=handle.getLatLng(), pt=[ll.lat,ll.lng];
        if (i===0) model.center=pt;
        else if (i===3) {
          const [x,y]=offsetFrom(model.center,pt), a=model.bearing*D;
          model.width=clamp(2*Math.abs(x*Math.cos(a)-y*Math.sin(a)),14,model.length*.88);
        } else {
          const [x,y]=offsetFrom(anchor,pt), distance=Math.hypot(x,y);
          if (distance<1) return;
          model.length=clamp(distance,Math.max(35,model.width/0.88),600);
          model.center=offsetPoint(anchor,x/distance*model.length/2,y/distance*model.length/2);
          model.bearing=Math.atan2(x,y)/D+(i===2?180:0);
        }
        geometry();
      });
      handles.push(handle);
    });
  }
  function select(field, asTemplate=false) {
    resetPreview();chosen=field;fieldLabel=field.name;
    for(const button of $('field-results').children)
      button.setAttribute('aria-pressed',String(button.dataset.field===String(field.id)));
    model=asTemplate || !field.exact ? (field.template ? structuredClone(field.template) : fitOval(field.center,field.outline)) : null;
    points=model?stadiumLoop(model):field.outline;
    path=L.polyline(points,{color:'#08735c',weight:5,interactive:false}).addTo(preview);
    startPin=L.circleMarker(points[0],{radius:5,color:'#fff',fillColor:'#173f32',fillOpacity:1}).bindTooltip('起点').addTo(preview);
    if(model) addHandles();
    geometry();
    $('field-preview').hidden=false;
    $('edit-template').hidden=Boolean(model);
    $('field-guide').textContent=model?'拖中心移动；拖两端调整长度和方向；拖侧边调整宽度。':'已标出起点，可先对照地图确认整圈位置。';
    map.fitBounds(path.getBounds(),{padding:[38,38],maxZoom:18,animate:false});
    status('');
  }
  function choice(container,title,sub,action) {
    const b=document.createElement('button'); b.type='button';
    const label=document.createElement('span'), detail=document.createElement('small');
    label.textContent=title;detail.textContent=sub;label.append(detail);b.append(label);
    b.onclick=action;container.append(b);return b;
  }
  function thumbnail(button,field) {
    const shape=field.exact?field.outline:stadiumLoop(field.template ?? fitOval(field.center,field.outline));
    const a=shape.map(p=>offsetFrom(field.center,p));
    const xs=a.map(p=>p[0]), ys=a.map(p=>p[1]);
    const left=Math.min(...xs),top=Math.max(...ys),w=Math.max(...xs)-left,h=top-Math.min(...ys);
    const scale=Math.min(82/Math.max(w,1),58/Math.max(h,1));
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=72;canvas.setAttribute('aria-hidden','true');
    const ctx=canvas.getContext('2d');
    if(!ctx) return;
    ctx.beginPath();a.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo']((96-w*scale)/2+(x-left)*scale,(72-h*scale)/2+(top-y)*scale));
    ctx.fillStyle='#e4f2df';ctx.fill();ctx.strokeStyle='#267355';ctx.lineWidth=3;ctx.stroke();button.prepend(canvas);
  }
  async function openSchool(row) {
    const current=++revision;school=row;
    openMap();resetResults();
    $('campus-title').textContent=row[0];
    $('school-results').replaceChildren();
    const center=[row[3],row[4]], bounds=row[5];
    if(bounds?.length===4) map.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{maxZoom:16,animate:false});
    else map.setView(center,16,{animate:false});
    if (row===demoSchool) {
      select({name:'陵水体育场',center:centre,outline:LINGSHUI_STADIUM.points,exact:true,estimated:true});return;
    }
    status('正在查找校界内的操场…');
    try {
      index ??= await dataset('schools');
      const keys=[];
      const region=bounds?.length===4?bounds:[...center,...center];
      if (row[6]?.fieldIds?.length) {
        for(let y=Math.floor(region[0]/3);y<=Math.floor(region[2]/3);y++)
          for(let x=Math.floor(region[1]/3);x<=Math.floor(region[3]/3);x++)
            if(index.tiles.includes(y+'_'+x)) keys.push(y+'_'+x);
      }
      const groups=await Promise.all(keys.map(dataset));
      if(current!==revision)return;
      const fields=nearbyVenues(groups.flat(),row);
      if (row[6]?.boundary) L.polygon(row[6].boundary,{interactive:false,color:'#64776c',weight:2,dashArray:'5 5',fillOpacity:.035}).addTo(candidates);
      fields.forEach((f,i)=>{
        const label=(i+1)+' · '+f.name;
        const source=f.reviewed?(f.shared?'园区共享场地':'已核对校内场地'):'位于校区边界内';
        const b=choice($('field-results'),label,source+' · '+(f.exact?'地图跑道':'估算模板'),()=>select(f));
        b.dataset.field=String(f.id);thumbnail(b,f);
        const marker=L.circleMarker(f.center,{radius:10,color:'#fff',fillColor:'#276044',fillOpacity:1}).addTo(candidates);
        marker.bindTooltip(String(i+1),{permanent:true,direction:'center',className:'field-number'}).on('click',()=>{if(!placing)select(f);});
      });
      if(fields.length>1) map.fitBounds(L.latLngBounds(fields.map(f=>f.center)),{padding:[30,30],maxZoom:17,animate:false});
      if(fields.length===1) select(fields[0]);
      else if(fields.length) status('请选择要预览的校内操场。');
      else status((row[6]?.fieldIds ? '这个校区的边界内暂无已收录的操场。' : '地图缺少可核实的校区边界。')+'可点「在地图上指定操场」手动选择。');
    } catch { if(current===revision)status('场地资料加载失败。可以重试或在地图上指定操场。'); }
  }
  $('school-search').onsubmit=async event=>{
    event.preventDefault();const current=++revision;
    const query=$('school-query').value.trim();if(!query)return;
    resetResults();school=null;$('field-picker').hidden=true;$('route-editor').hidden=false;showRoute();$('school-results').replaceChildren();
    status('正在搜索校区…');
    try {
      index ??= await dataset('schools');
      if(current!==revision)return;
      const found=searchSchools([demoSchool,...index.schools],query);
      found.forEach(row=>choice($('school-results'),row[0],row[1] || ('地图位置 '+row[3].toFixed(3)+'°, '+row[4].toFixed(3)+'°'),()=>openSchool(row)));
      status(found.length?'请选择校区。':'没有匹配的校区。可换用学校全名，或直接在地图上指定操场。');
    }catch{if(current===revision)status('学校索引暂时无法加载，可以直接在地图上指定操场。');}
  };
  $('back-route').onclick=()=>{closePicker();$('choose-manual').focus();};
  $('choose-manual').onclick=$('field-manual').onclick=()=>{
    ++revision;openMap();resetPreview();candidates.clearLayers();
    $('field-results').replaceChildren();$('school-results').replaceChildren();
    $('campus-title').textContent=school?.[0] || '地图选操场';
    if(!school)map.setView([34.5,106],4,{animate:false});
    placing=true;status('放大到能看清操场，点击中心生成跑道模板。');
  };
  $('edit-template').onclick=()=>select(chosen,true);
  $('use-field').onclick=()=>{
    if(!chosen || !points.length)return;
    const name=[school?.[0],fieldLabel,model || chosen.estimated?'估算路线':'地图跑道'].filter(Boolean).join(' · ');
    const selected=points, label=fieldLabel;
    closePicker();
    use(selected,name);
    status('已载入 '+label+'。');
    $('play').focus({preventScroll:true});
  };
  return closePicker;
}

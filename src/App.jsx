import { useState, useEffect, useRef, useCallback } from "react";

// ─── Damage Types ─────────────────────────────────────────────────────────────
const DAMAGE_TYPES = [
  { id:"danger",  label:"Danger / Emergency",          icon:"🚨", urgent:true  },
  { id:"power",   label:"Downed Power Line",            icon:"⚡"               },
  { id:"comms",   label:"Downed Aerial Comms",          icon:"📡"               },
  { id:"drop",    label:"Downed Service Drop",          icon:"🔻"               },
  { id:"pole",    label:"Broken Pole",                  icon:"🪵"               },
  { id:"closure", label:"Hanging Splice Closure",       icon:"⚠️"               },
  { id:"strand",  label:"Damaged Aerial Strand",        icon:"🔌"               },
  { id:"cable",   label:"Damaged Aerial Cable",         icon:"📶"               },
  { id:"vault",   label:"Damaged Vault / Handhole / Ped",icon:"🕳️"             },
  { id:"tree",    label:"Tree on Lines",                icon:"🌳"               },
  { id:"other",   label:"Other",                        icon:"📋"               },
];
const DT_MAP = Object.fromEntries(DAMAGE_TYPES.map(d=>[d.label,d]));
function dtIcon(label){ return DT_MAP[label]?.icon || "📋"; }
function dtUrgent(labels){ return (labels||[]).some(l=>DT_MAP[l]?.urgent); }

// ─── Owners by Region ─────────────────────────────────────────────────────────
const OWNERS = {
  cleveland: ["Spectrum / Charter","AT&T","Breezeline","Verizon","Windstream","Consolidated","FirstEnergy","Crown Castle","Lumen / CenturyLink","City of Cleveland","Unknown"],
  chicago:   ["Comcast","AT&T","Verizon","Crown Castle","Lumen / CenturyLink","ComEd","City of Chicago","Unknown"],
  national:  ["AT&T","Verizon","Spectrum / Charter","Comcast","Breezeline","Windstream","Consolidated","FirstEnergy","Crown Castle","Lumen / CenturyLink","Unknown"],
};
function detectRegion(lat,lng){
  if(haversine(lat,lng,41.4993,-81.6944)<80000) return "cleveland";
  if(haversine(lat,lng,41.8827,-87.6233)<80000) return "chicago";
  return "national";
}

// ─── Status colors ────────────────────────────────────────────────────────────
const SC = {
  New:      {fg:"#f97316",bg:"rgba(249,115,22,.15)",border:"rgba(249,115,22,.4)"},
  Assigned: {fg:"#3b82f6",bg:"rgba(59,130,246,.15)",border:"rgba(59,130,246,.4)"},
  Resolved: {fg:"#22c55e",bg:"rgba(34,197,94,.15)",border:"rgba(34,197,94,.4)"},
};

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO = [
  {report_id:"d1",photo_url:null,damage_types:["Hanging Splice Closure","Danger / Emergency"],damage_type:"Hanging Splice Closure",latitude:41.4993,longitude:-81.6944,heading:45,notes:"Closure hanging by single bolt — W 25th & Lorain Ave",status:"New",submitted_at:new Date(Date.now()-7200000).toISOString(),sync_status:"Synced",reporter:"Brian J.",owner:"Spectrum / Charter",asset_id:"POLE-2241",updates:[{update_id:"u1",photo_url:null,notes:"Still present, bolt looks worse",reporter:"Mike T.",updated_at:new Date(Date.now()-3600000).toISOString()}]},
  {report_id:"d2",photo_url:null,damage_types:["Broken Pole","Tree on Lines"],damage_type:"Broken Pole",latitude:41.5020,longitude:-81.6890,heading:210,notes:"Pole snapped, tree pulled it down on W 65th",status:"Assigned",submitted_at:new Date(Date.now()-172800000).toISOString(),sync_status:"Synced",reporter:"Brian J.",owner:"FirstEnergy",asset_id:"FE-88123",updates:[]},
  {report_id:"d3",photo_url:null,damage_types:["Downed Aerial Comms"],damage_type:"Downed Aerial Comms",latitude:41.4965,longitude:-81.7005,heading:130,notes:"Cable on ground near W 117th",status:"New",submitted_at:new Date(Date.now()-3600000).toISOString(),sync_status:"Synced",reporter:"Dana R.",owner:"AT&T",asset_id:"",updates:[]},
  {report_id:"d4",photo_url:null,damage_types:["Damaged Aerial Strand"],damage_type:"Damaged Aerial Strand",latitude:41.5010,longitude:-81.6960,heading:300,notes:"Significant sag, vegetation contact",status:"Resolved",submitted_at:new Date(Date.now()-432000000).toISOString(),sync_status:"Synced",reporter:"Brian J.",owner:"Spectrum / Charter",asset_id:"POLE-1988",updates:[{update_id:"u2",photo_url:null,notes:"Crew dispatched",reporter:"Brian J.",updated_at:new Date(Date.now()-259200000).toISOString()},{update_id:"u3",photo_url:null,notes:"Confirmed repaired",reporter:"Mike T.",updated_at:new Date(Date.now()-86400000).toISOString()}]},
  {report_id:"d5",photo_url:null,damage_types:["Downed Power Line","Danger / Emergency"],damage_type:"Downed Power Line",latitude:41.5005,longitude:-81.6920,heading:0,notes:"Line across road, traffic stopped — CALL 911",status:"New",submitted_at:new Date(Date.now()-900000).toISOString(),sync_status:"Synced",reporter:"Dana R.",owner:"FirstEnergy",asset_id:"",updates:[]},
  {report_id:"d6",photo_url:null,damage_types:["Damaged Vault / Handhole / Ped"],damage_type:"Damaged Vault / Handhole / Ped",latitude:41.4978,longitude:-81.6975,heading:180,notes:"Handhole lid missing, open vault",status:"New",submitted_at:new Date(Date.now()-5400000).toISOString(),sync_status:"Synced",reporter:"Brian J.",owner:"Breezeline",asset_id:"VLT-0091",updates:[]},
];

// ─── Utils ────────────────────────────────────────────────────────────────────
function haversine(a,b,c,d){const R=6371000,p1=a*Math.PI/180,p2=c*Math.PI/180,dp=(c-a)*Math.PI/180,dl=(d-b)*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function timeAgo(iso){const s=(Date.now()-new Date(iso))/1000;if(s<60)return"just now";if(s<3600)return`${~~(s/60)}m ago`;if(s<86400)return`${~~(s/3600)}h ago`;return`${~~(s/86400)}d ago`;}
function fmtDist(m){return m<1000?`${Math.round(m)}m`:`${(m/1609.34).toFixed(1)}mi`;}
function uid(){return`r_${Date.now()}_${Math.random().toString(36).substr(2,7)}`;}
function initials(n){return(n||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);}
function avatarColor(n){const c=["#f97316","#3b82f6","#a855f7","#ec4899","#14b8a6","#eab308"];let h=0;for(let i=0;i<(n||"").length;i++)h=n.charCodeAt(i)+((h<<5)-h);return c[Math.abs(h)%c.length];}

async function extractExifGPS(file){
  return new Promise(resolve=>{
    const r=new FileReader();
    r.onload=e=>{
      try{
        const buf=e.target.result,view=new DataView(buf);
        if(view.getUint16(0)!==0xFFD8){resolve(null);return;}
        let off=2;
        while(off<buf.byteLength-2){
          const mk=view.getUint16(off);off+=2;
          if(mk===0xFFE1){
            const len=view.getUint16(off),exif=new DataView(buf,off+2,len-2);
            if(String.fromCharCode(exif.getUint8(0),exif.getUint8(1),exif.getUint8(2),exif.getUint8(3))!=="Exif"){resolve(null);return;}
            const le=exif.getUint16(6)===0x4949,ifd=exif.getUint32(10,le)+6,entries=exif.getUint16(ifd,le);
            let gpsOff=null;
            for(let i=0;i<entries;i++){const tag=exif.getUint16(ifd+2+i*12,le);if(tag===0x8825){gpsOff=exif.getUint32(ifd+2+i*12+8,le)+6;break;}}
            if(!gpsOff){resolve(null);return;}
            const ge=exif.getUint16(gpsOff,le);let latRef="N",lonRef="E",la=null,lo=null;
            const rr=o=>{const n=exif.getUint32(o,le),d=exif.getUint32(o+4,le);return d?n/d:0;};
            for(let i=0;i<ge;i++){
              const base=gpsOff+2+i*12,tag=exif.getUint16(base,le),vo=exif.getUint32(base+8,le)+6;
              if(tag===0x0001)latRef=String.fromCharCode(exif.getUint8(base+8));
              else if(tag===0x0003)lonRef=String.fromCharCode(exif.getUint8(base+8));
              else if(tag===0x0002)la=[rr(vo),rr(vo+8),rr(vo+16)];
              else if(tag===0x0004)lo=[rr(vo),rr(vo+8),rr(vo+16)];
            }
            if(la&&lo){resolve({lat:(la[0]+la[1]/60+la[2]/3600)*(latRef==="S"?-1:1),lng:(lo[0]+lo[1]/60+lo[2]/3600)*(lonRef==="W"?-1:1)});return;}
            resolve(null);return;
          }
          off+=view.getUint16(off);
        }
      }catch{}
      resolve(null);
    };
    r.readAsArrayBuffer(file);
  });
}

function Avatar({name,size=26}){
  return <div style={{width:size,height:size,borderRadius:"50%",background:avatarColor(name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.38,fontWeight:800,color:"#fff",flexShrink:0,border:"1.5px solid rgba(255,255,255,.12)"}}>{initials(name)}</div>;
}

function TypeBadges({types,max=3}){
  if(!types?.length) return null;
  const show=types.slice(0,max);
  return(
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      {show.map(t=>(
        <span key={t} style={{fontSize:11,padding:"2px 7px",borderRadius:8,background:DT_MAP[t]?.urgent?"rgba(239,68,68,.15)":"rgba(255,255,255,.07)",color:DT_MAP[t]?.urgent?"#ef4444":"#888",border:`1px solid ${DT_MAP[t]?.urgent?"rgba(239,68,68,.3)":"rgba(255,255,255,.1)"}`,whiteSpace:"nowrap"}}>
          {dtIcon(t)} {t}
        </span>
      ))}
      {types.length>max&&<span style={{fontSize:11,color:"#555"}}>+{types.length-max}</span>}
    </div>
  );
}

function UpdateEntry({upd,onPhoto}){
  return(
    <div style={{display:"flex",gap:10,padding:"10px 0",borderTop:"1px solid rgba(255,255,255,.05)"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}>
        <Avatar name={upd.reporter} size={28}/>
        <div style={{width:1,flex:1,minHeight:8,background:"rgba(255,255,255,.06)"}}/>
      </div>
      <div style={{flex:1,minWidth:0,paddingBottom:4}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:13,fontWeight:700,color:"#ccc"}}>{upd.reporter}</span>
          <span style={{fontSize:11,color:"#3a3a3a"}}>{timeAgo(upd.updated_at)}</span>
        </div>
        {upd.notes&&<p style={{fontSize:13,color:"#888",margin:"0 0 6px",lineHeight:1.5}}>{upd.notes}</p>}
        {upd.photo_url&&<img src={upd.photo_url} onClick={()=>onPhoto(upd.photo_url)} style={{width:"100%",maxHeight:110,objectFit:"cover",borderRadius:8,cursor:"zoom-in",border:"1px solid rgba(255,255,255,.08)"}}/>}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ClearLine(){
  const [tab,setTab]=useState("report");
  const [reports,setReports]=useState([]);
  const [queue,setQueue]=useState([]);
  const [online,setOnline]=useState(navigator.onLine);
  const [loaded,setLoaded]=useState(false);
  const [proxAlert,setProxAlert]=useState(null);
  const [selected,setSelected]=useState(null);
  const [fsPhoto,setFsPhoto]=useState(null);
  const [reporter,setReporter]=useState("");
  const [nameModal,setNameModal]=useState(false);
  const [nameDraft,setNameDraft]=useState("");
  // dashboard
  const [dashView,setDashView]=useState("split"); // "split"|"map"|"list"
  const [ftFilter,setFtFilter]=useState("All");
  const [stFilter,setStFilter]=useState("All");
  const [nearbyActive,setNearbyActive]=useState(false);
  const [userLoc,setUserLoc]=useState(null);
  const [nearbyLoading,setNearbyLoading]=useState(false);
  // owners dynamic
  const [ownerList,setOwnerList]=useState(OWNERS.national);
  const [regionLabel,setRegionLabel]=useState("");
  // reporter form
  const [preview,setPreview]=useState(null);
  const [dtypes,setDtypes]=useState([]);
  const [notesTxt,setNotesTxt]=useState("");
  const [gps,setGps]=useState(null);
  const [heading,setHeading]=useState(null);
  const [gpsLoading,setGpsLoading]=useState(false);
  const [locMode,setLocMode]=useState("gps");
  const [manLat,setManLat]=useState("");
  const [manLng,setManLng]=useState("");
  const [owner,setOwner]=useState("");
  const [ownerCustom,setOwnerCustom]=useState("");
  const [assetId,setAssetId]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [submitDone,setSubmitDone]=useState(false);
  // update form
  const [showUpdForm,setShowUpdForm]=useState(false);
  const [updPreview,setUpdPreview]=useState(null);
  const [updNotes,setUpdNotes]=useState("");
  const [updSubmitting,setUpdSubmitting]=useState(false);

  const fileRef=useRef(),updFileRef=useRef(),mapDiv=useRef();
  const lmap=useRef(null),markersRef=useRef(null),alerted=useRef(new Set());
  const PROX_M=76;

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(()=>{
    (async()=>{
      try{
        const rd=await window.storage.get("cl_r"),qd=await window.storage.get("cl_q"),nr=await window.storage.get("cl_reporter");
        const rpts=rd?JSON.parse(rd.value):[];
        setReports(rpts.length?rpts:DEMO);
        if(qd)setQueue(JSON.parse(qd.value));
        if(nr)setReporter(nr.value); else setNameModal(true);
      }catch{setReports(DEMO);setNameModal(true);}
      setLoaded(true);
    })();
  },[]);

  // ── Fonts/CSS ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    const lnk=document.createElement("link");lnk.rel="stylesheet";lnk.href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&display=swap";document.head.appendChild(lnk);
    const s=document.createElement("style");
    s.textContent=`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes glow{0%,100%{box-shadow:0 0 6px #f97316}50%{box-shadow:0 0 16px #f97316,0 0 32px rgba(249,115,22,.3)}}@keyframes urgentPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0D1117}::-webkit-scrollbar-thumb{background:#1e2836;border-radius:4px}.rcard:hover{border-color:rgba(249,115,22,.3)!important;background:rgba(249,115,22,.05)!important}.rcard.urgent:hover{border-color:rgba(239,68,68,.4)!important;background:rgba(239,68,68,.06)!important}.vbtn:hover{background:rgba(255,255,255,.08)!important}`;
    document.head.appendChild(s);
  },[]);

  // ── Online/offline ─────────────────────────────────────────────────────────
  useEffect(()=>{
    const on=()=>setOnline(true),off=()=>setOnline(false);
    window.addEventListener("online",on);window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);

  useEffect(()=>{
    if(!online||!queue.length)return;
    const synced=queue.map(r=>({...r,sync_status:"Synced"}));
    const upd=[...reports,...synced];setReports(upd);setQueue([]);persist(upd,[]);
  },[online]);

  async function persist(r=reports,q=queue){try{await window.storage.set("cl_r",JSON.stringify(r));await window.storage.set("cl_q",JSON.stringify(q));}catch{}}

  async function saveName(){
    if(!nameDraft.trim())return;
    setReporter(nameDraft.trim());
    try{await window.storage.set("cl_reporter",nameDraft.trim());}catch{}
    setNameModal(false);
  }

  // ── GPS & region ───────────────────────────────────────────────────────────
  function applyRegion(lat,lng){
    const region=detectRegion(lat,lng);
    setOwnerList(OWNERS[region]);
    setRegionLabel(region==="cleveland"?"Cleveland Area":region==="chicago"?"Chicago Area":"National");
  }

  function captureGPS(onDone){
    setGpsLoading(true);
    const tryH=()=>{window.addEventListener("deviceorientationabsolute",function h(e){if(e.alpha!=null)setHeading(Math.round(e.alpha));window.removeEventListener("deviceorientationabsolute",h);},{once:true});setTimeout(()=>setHeading(hh=>hh??Math.round(Math.random()*360)),1500);};
    const fb=()=>{const g={lat:41.4993+(Math.random()-.5)*.02,lng:-81.6944+(Math.random()-.5)*.02};setGps(g);applyRegion(g.lat,g.lng);setGpsLoading(false);tryH();onDone&&onDone(g);};
    if(navigator.geolocation){navigator.geolocation.getCurrentPosition(p=>{const g={lat:p.coords.latitude,lng:p.coords.longitude};setGps(g);applyRegion(g.lat,g.lng);setGpsLoading(false);tryH();onDone&&onDone(g);},fb,{timeout:6000});}else fb();
  }

  function resolvedGps(){
    if(locMode==="manual"){const la=parseFloat(manLat),ln=parseFloat(manLng);if(!isNaN(la)&&!isNaN(ln))return{lat:la,lng:ln};return null;}
    return gps;
  }

  // ── Nearby ─────────────────────────────────────────────────────────────────
  function toggleNearby(){
    if(nearbyActive){setNearbyActive(false);return;}
    setNearbyLoading(true);
    const fb=()=>{const loc={lat:41.4993,lng:-81.6944};setUserLoc(loc);setNearbyActive(true);setNearbyLoading(false);};
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(p=>{const loc={lat:p.coords.latitude,lng:p.coords.longitude};setUserLoc(loc);setNearbyActive(true);setNearbyLoading(false);},fb,{timeout:6000});
    }else fb();
  }

  // ── Photo handlers ─────────────────────────────────────────────────────────
  async function handlePhoto(e){
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();rd.onload=ev=>setPreview(ev.target.result);rd.readAsDataURL(f);
    if(locMode==="photo"){setGpsLoading(true);const g=await extractExifGPS(f);if(g){setGps(g);applyRegion(g.lat,g.lng);setGpsLoading(false);}else{setGpsLoading(false);setLocMode("manual");}}
    else if(locMode==="gps")captureGPS();
    e.target.value="";
  }
  async function handleUpdPhoto(e){
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();rd.onload=ev=>setUpdPreview(ev.target.result);rd.readAsDataURL(f);e.target.value="";
  }

  // ── Toggle damage type ─────────────────────────────────────────────────────
  function toggleDtype(label){
    setDtypes(prev=>prev.includes(label)?prev.filter(x=>x!==label):[...prev,label]);
  }

  // ── Proximity watch ────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!navigator.geolocation)return;
    const id=navigator.geolocation.watchPosition(p=>{
      const loc={lat:p.coords.latitude,lng:p.coords.longitude};
      for(const r of reports){if(alerted.current.has(r.report_id)||r.status==="Resolved")continue;if(haversine(loc.lat,loc.lng,r.latitude,r.longitude)<=PROX_M){alerted.current.add(r.report_id);setProxAlert(r);return;}}
    },()=>{},{enableHighAccuracy:true});
    return()=>navigator.geolocation.clearWatch(id);
  },[reports]);

  // ── Map ────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(tab!=="dashboard"||dashView==="list"){if(lmap.current&&dashView==="list"){lmap.current.remove();lmap.current=null;markersRef.current=null;}return;}
    if(!mapDiv.current)return;
    const init=()=>{
      if(!window.L||!mapDiv.current||lmap.current)return;
      const L=window.L,map=L.map(mapDiv.current,{center:[41.4993,-81.6944],zoom:13});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OSM"}).addTo(map);
      lmap.current=map;markersRef.current=L.layerGroup().addTo(map);drawMarkers(reports,map);
    };
    if(window.L){setTimeout(init,80);return;}
    const lnk=document.createElement("link");lnk.rel="stylesheet";lnk.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(lnk);
    const scr=document.createElement("script");scr.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";scr.onload=()=>setTimeout(init,80);document.head.appendChild(scr);
  },[tab,dashView]);

  useEffect(()=>{if(lmap.current&&window.L)drawMarkers(reports);},[reports]);

  // Invalidate map size when view changes
  useEffect(()=>{
    if(lmap.current&&window.L&&tab==="dashboard"&&dashView!=="list"){
      setTimeout(()=>lmap.current?.invalidateSize(),100);
    }
  },[dashView,tab]);

  function drawMarkers(rpts,map=lmap.current){
    if(!map||!window.L||!markersRef.current)return;
    const L=window.L;markersRef.current.clearLayers();
    rpts.forEach(r=>{
      const isUrgent=dtUrgent(r.damage_types);
      const c=isUrgent?"#ef4444":(SC[r.status]?.fg||"#f97316"),h=r.heading,sz=h!=null?52:22,cx=sz/2,cy=sz/2;
      let cone="";
      if(h!=null){const rad=(h-90)*Math.PI/180,L1=22,a1=rad-.44,a2=rad+.44;const x1=(cx+Math.cos(a1)*L1).toFixed(1),y1=(cy+Math.sin(a1)*L1).toFixed(1),x2=(cx+Math.cos(a2)*L1).toFixed(1),y2=(cy+Math.sin(a2)*L1).toFixed(1);cone=`<polygon points="${cx},${cy} ${x1},${y1} ${x2},${y2}" fill="${c}" opacity="0.28" stroke="${c}" stroke-width="0.5"/>`;}
      const ub=r.updates?.length?`<circle cx="${cx+(h!=null?9:7)}" cy="${cy-(h!=null?9:7)}" r="5" fill="#3b82f6"/><text x="${cx+(h!=null?9:7)}" y="${cy-(h!=null?5:5)}" text-anchor="middle" font-size="6" fill="#fff" font-weight="bold">${r.updates.length}</text>`:"";
      const ring=isUrgent?`<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="#ef4444" stroke-width="1.5" opacity="0.5"/>`:"";
      const svg=`<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" xmlns="http://www.w3.org/2000/svg">${cone}${ring}<circle cx="${cx}" cy="${cy}" r="7" fill="${c}" stroke="#fff" stroke-width="2.5"/>${ub}</svg>`;
      const ico=L.divIcon({html:svg,iconSize:[sz,sz],iconAnchor:[cx,cy],className:""});
      const types=(r.damage_types||[r.damage_type]).join(", ");
      L.marker([r.latitude,r.longitude],{icon:ico}).addTo(markersRef.current)
        .bindPopup(`<div style="font-family:sans-serif;min-width:180px;line-height:1.6">${isUrgent?'<b style="color:#ef4444">⚠ URGENT</b><br/>':""}
          <b>${types}</b><br/><small style="color:#666">${r.notes||"No notes"}</small><br/>
          <span style="color:${c};font-weight:bold">${r.status}</span> · ${r.reporter||"?"}
          ${r.owner?`<br/><small>🏢 ${r.owner}</small>`:""}${r.asset_id?`<br/><small>🔖 ${r.asset_id}</small>`:""}
          ${h!=null?`<br/><small style="color:#888">📷 ${h}°</small>`:""}
          ${r.updates?.length?`<br/><small style="color:#3b82f6">${r.updates.length} update${r.updates.length>1?"s":""}</small>`:""}</div>`)
        .on("click",()=>setSelected(r));
    });
  }

  // ── Submit report ──────────────────────────────────────────────────────────
  async function submitReport(){
    const loc=resolvedGps();
    if(!preview||!dtypes.length||!loc||submitting)return;
    if(!reporter){setNameModal(true);return;}
    setSubmitting(true);
    const of=owner==="__custom__"?ownerCustom:owner;
    const rep={report_id:uid(),photo_url:preview,damage_types:dtypes,damage_type:dtypes[0],latitude:loc.lat,longitude:loc.lng,heading:heading??null,notes:notesTxt,status:"New",submitted_at:new Date().toISOString(),sync_status:online?"Synced":"Pending",reporter,owner:of,asset_id:assetId,updates:[]};
    const upd=online?[...reports,rep]:reports,nq=online?queue:[...queue,rep];
    setReports(upd);setQueue(nq);await persist(upd,nq);
    setPreview(null);setDtypes([]);setNotesTxt("");setGps(null);setHeading(null);setManLat("");setManLng("");setOwner("");setOwnerCustom("");setAssetId("");
    setSubmitting(false);setSubmitDone(true);setTimeout(()=>setSubmitDone(false),4000);
  }

  // ── Submit update ──────────────────────────────────────────────────────────
  async function submitUpdate(){
    if((!updNotes.trim()&&!updPreview)||!selected||updSubmitting)return;
    setUpdSubmitting(true);
    const u={update_id:uid(),photo_url:updPreview||null,notes:updNotes.trim(),reporter,updated_at:new Date().toISOString()};
    const upd=reports.map(r=>r.report_id===selected.report_id?{...r,updates:[...(r.updates||[]),u]}:r);
    setReports(upd);setSelected(s=>({...s,updates:[...(s.updates||[]),u]}));
    await persist(upd,queue);
    setUpdPreview(null);setUpdNotes("");setShowUpdForm(false);setUpdSubmitting(false);
  }

  async function updateStatus(id,status){
    const upd=reports.map(r=>r.report_id===id?{...r,status}:r);
    setReports(upd);if(selected?.report_id===id)setSelected(s=>({...s,status}));
    await persist(upd,queue);
  }

  // ── Filtered & sorted reports ──────────────────────────────────────────────
  const allReports=[...reports,...queue];
  let filtered=allReports.filter(r=>{
    const typeMatch=ftFilter==="All"||(r.damage_types||[r.damage_type]).includes(ftFilter);
    const statMatch=stFilter==="All"||r.status===stFilter;
    return typeMatch&&statMatch;
  });

  // Sort urgent to top, then by date
  filtered.sort((a,b)=>{
    const au=dtUrgent(a.damage_types),bu=dtUrgent(b.damage_types);
    if(au&&!bu)return -1;if(bu&&!au)return 1;
    return new Date(b.submitted_at)-new Date(a.submitted_at);
  });

  // Nearby filter
  let nearbyFiltered=filtered;
  if(nearbyActive&&userLoc){
    nearbyFiltered=filtered
      .map(r=>({...r,_dist:haversine(userLoc.lat,userLoc.lng,r.latitude,r.longitude)}))
      .filter(r=>r._dist<=1609) // 1mi
      .sort((a,b)=>a._dist-b._dist);
  }
  const displayReports=nearbyActive?nearbyFiltered:filtered;

  const newCount=allReports.filter(r=>r.status==="New").length;
  const urgentCount=allReports.filter(r=>r.status==="New"&&dtUrgent(r.damage_types)).length;
  const loc=resolvedGps();
  const canSubmit=preview&&dtypes.length>0&&loc&&!submitting;

  // ─────────────────────────────────────────────────────────────────────────
  if(!loaded)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#080B0F",fontFamily:"'Barlow Condensed',Arial,sans-serif"}}>
      <div style={{textAlign:"center",color:"#f97316"}}>
        <div style={{fontSize:40,animation:"pulse 1.2s infinite",marginBottom:12}}>◉</div>
        <div style={{fontSize:18,fontWeight:700,letterSpacing:".1em"}}>LOADING CLEARLINE</div>
      </div>
    </div>
  );

  const inp={width:"100%",background:"rgba(255,255,255,.05)",border:"1.5px solid rgba(255,255,255,.08)",borderRadius:9,padding:"10px 12px",color:"#E8EDF2",fontFamily:"'Barlow Condensed',Arial,sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"};

  return(
    <div style={{fontFamily:"'Barlow Condensed',Arial,sans-serif",background:"#080B0F",color:"#E8EDF2",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* FULLSCREEN PHOTO */}
      {fsPhoto&&(
        <div onClick={()=>setFsPhoto(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.96)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={fsPhoto} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:6}}/>
          <button onClick={()=>setFsPhoto(null)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:8,color:"#fff",width:38,height:38,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
      )}

      {/* NAME MODAL */}
      {nameModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#0D1117",border:"1px solid rgba(249,115,22,.3)",borderRadius:16,padding:"28px 24px",width:"100%",maxWidth:360,animation:"slideUp .25s ease"}}>
            <div style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:4}}>WHO ARE YOU?</div>
            <div style={{fontSize:14,color:"#555",marginBottom:20}}>Your name appears on all reports and updates you submit.</div>
            <input value={nameDraft} onChange={e=>setNameDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveName()} placeholder="e.g. Brian J." autoFocus style={{...inp,fontSize:16,marginBottom:14}}/>
            <button onClick={saveName} disabled={!nameDraft.trim()}
              style={{width:"100%",padding:14,borderRadius:9,border:"none",background:nameDraft.trim()?"#f97316":"rgba(249,115,22,.12)",color:nameDraft.trim()?"#fff":"rgba(249,115,22,.3)",cursor:nameDraft.trim()?"pointer":"not-allowed",fontFamily:"inherit",fontWeight:800,fontSize:15,letterSpacing:".08em"}}>
              SAVE & CONTINUE
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={{background:"#0D1117",borderBottom:`1px solid ${urgentCount>0?"rgba(239,68,68,.4)":"rgba(249,115,22,.2)"}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:100,transition:"border-color .3s"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:9,height:9,borderRadius:"50%",background:urgentCount>0?"#ef4444":"#f97316",animation:"glow 2s infinite"}}/>
          <span style={{fontSize:24,fontWeight:800,letterSpacing:".06em",color:"#fff",lineHeight:1}}>CLEAR<span style={{color:urgentCount>0?"#ef4444":"#f97316"}}>LINE</span></span>
          <span style={{fontSize:11,color:"#555",fontWeight:600,letterSpacing:".06em"}}>FIELD INTEL</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {urgentCount>0&&<div style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.4)",borderRadius:20,padding:"3px 10px",fontSize:12,color:"#ef4444",fontWeight:800,animation:"urgentPulse 2s infinite"}}>🚨 {urgentCount} URGENT</div>}
          {reporter&&<div onClick={()=>{setNameDraft(reporter);setNameModal(true);}} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"3px 8px",borderRadius:20,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"}}>
            <Avatar name={reporter} size={20}/>
            <span style={{fontSize:12,color:"#888",fontWeight:600}}>{reporter}</span>
          </div>}
          {queue.length>0&&<div style={{background:"rgba(249,115,22,.15)",border:"1px solid rgba(249,115,22,.35)",borderRadius:20,padding:"3px 9px",fontSize:12,color:"#f97316",fontWeight:700}}>⏳{queue.length}</div>}
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:online?"#22c55e":"#ef4444",fontWeight:700}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:online?"#22c55e":"#ef4444",animation:online?"":"pulse 1s infinite"}}/>
            {online?"ON":"OFF"}
          </div>
        </div>
      </header>

      {/* PROXIMITY ALERT */}
      {proxAlert&&(
        <div style={{position:"absolute",top:56,left:0,right:0,zIndex:500,padding:"0 12px",animation:"slideUp .3s ease"}}>
          <div style={{background:dtUrgent(proxAlert.damage_types)?"#150000":"#120800",border:`2px solid ${dtUrgent(proxAlert.damage_types)?"#ef4444":"#f97316"}`,borderRadius:12,padding:"14px 16px",boxShadow:`0 8px 32px ${dtUrgent(proxAlert.damage_types)?"rgba(239,68,68,.4)":"rgba(249,115,22,.35)"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontSize:11,color:dtUrgent(proxAlert.damage_types)?"#ef4444":"#f97316",fontWeight:800,letterSpacing:".12em",marginBottom:4}}>
                  {dtUrgent(proxAlert.damage_types)?"🚨 URGENT — ":"⚠ "}DAMAGE WITHIN 250ft
                </div>
                <TypeBadges types={proxAlert.damage_types} max={3}/>
                {proxAlert.notes&&<div style={{fontSize:13,color:"#888",marginTop:6}}>{proxAlert.notes}</div>}
              </div>
              <button onClick={()=>setProxAlert(null)} style={{background:"rgba(255,255,255,.06)",border:"none",color:"#555",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
              {[{label:"Still Present",color:"#f97316",bg:"rgba(249,115,22,.15)",border:"rgba(249,115,22,.4)",st:"New"},{label:"Worsened",color:"#ef4444",bg:"rgba(239,68,68,.15)",border:"rgba(239,68,68,.4)",st:"New"},{label:"Repaired ✓",color:"#22c55e",bg:"rgba(34,197,94,.15)",border:"rgba(34,197,94,.4)",st:"Resolved"}].map(o=>(
                <button key={o.label} onClick={async()=>{await updateStatus(proxAlert.report_id,o.st);setProxAlert(null);}}
                  style={{padding:"9px 6px",borderRadius:8,border:`1.5px solid ${o.border}`,background:o.bg,color:o.color,cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:12,lineHeight:1.2}}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main style={{flex:1,overflow:"auto",paddingBottom:64,minHeight:0}}>

        {/* ═══ REPORTER TAB ═══ */}
        {tab==="report"&&(
          <div style={{padding:"14px 16px",maxWidth:500,margin:"0 auto"}}>
            {submitDone&&<div style={{background:"rgba(34,197,94,.12)",border:"1px solid rgba(34,197,94,.4)",borderRadius:10,padding:"12px 16px",marginBottom:14,textAlign:"center",color:"#22c55e",fontWeight:800,fontSize:15,letterSpacing:".06em",animation:"slideUp .3s ease"}}>✓ REPORT SUBMITTED {!online&&"— QUEUED FOR SYNC"}</div>}

            {/* Location mode */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",color:"#555",marginBottom:7}}>LOCATION SOURCE</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                {[{id:"gps",l:"📍 GPS",s:"Auto-detect"},{id:"photo",l:"📷 EXIF",s:"From image"},{id:"manual",l:"✏️ Manual",s:"Enter coords"}].map(m=>(
                  <button key={m.id} onClick={()=>{setLocMode(m.id);setGps(null);setManLat("");setManLng("");}}
                    style={{padding:"8px",borderRadius:9,border:`1.5px solid ${locMode===m.id?"rgba(249,115,22,.6)":"rgba(255,255,255,.08)"}`,background:locMode===m.id?"rgba(249,115,22,.12)":"rgba(255,255,255,.02)",color:locMode===m.id?"#f97316":"#666",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:12,textAlign:"center",lineHeight:1.4,transition:"all .15s"}}>
                    <div>{m.l}</div><div style={{fontSize:10,fontWeight:400,opacity:.7}}>{m.s}</div>
                  </button>
                ))}
              </div>
            </div>

            {locMode==="manual"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                {[{l:"LATITUDE",v:manLat,s:setManLat,p:"41.4993"},{l:"LONGITUDE",v:manLng,s:setManLng,p:"-81.6944"}].map(f=>(
                  <div key={f.l}><div style={{fontSize:11,fontWeight:800,letterSpacing:".08em",color:"#555",marginBottom:4}}>{f.l}</div><input value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.p} style={inp}/></div>
                ))}
              </div>
            )}

            {/* Photo */}
            <div onClick={()=>!preview&&fileRef.current?.click()}
              style={{border:`2px dashed ${preview?"rgba(249,115,22,.5)":"rgba(255,255,255,.1)"}`,borderRadius:14,overflow:"hidden",marginBottom:12,cursor:preview?"default":"pointer",background:"rgba(255,255,255,.02)",minHeight:185,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,position:"relative",transition:"border-color .2s"}}>
              {preview?(
                <>
                  <img src={preview} onClick={()=>setFsPhoto(preview)} style={{width:"100%",height:195,objectFit:"cover",display:"block",cursor:"zoom-in"}}/>
                  <div style={{position:"absolute",top:10,left:10,background:"rgba(0,0,0,.7)",borderRadius:6,padding:"3px 9px",fontSize:11,color:"#aaa",fontWeight:600}}>⛶ FULLSCREEN</div>
                  <button onClick={e=>{e.stopPropagation();setPreview(null);setGps(null);setHeading(null);}} style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,.75)",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,color:"#fff",padding:"4px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700}}>RETAKE</button>
                  {(gps||(locMode==="manual"&&manLat&&manLng))&&(
                    <div style={{position:"absolute",bottom:10,left:10,background:"rgba(0,0,0,.8)",borderRadius:6,padding:"4px 10px",fontSize:12,color:"#22c55e",fontWeight:600,display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",flexShrink:0}}/>
                      {gps?`${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`:`${parseFloat(manLat).toFixed(5)}, ${parseFloat(manLng).toFixed(5)}`}
                      {heading!=null&&<span style={{color:"#f97316"}}>· 📷 {heading}°</span>}
                      {regionLabel&&<span style={{color:"#3b82f6"}}>· {regionLabel}</span>}
                    </div>
                  )}
                </>
              ):(
                <><div style={{fontSize:46,lineHeight:1}}>📷</div>
                <div style={{fontSize:16,fontWeight:800,letterSpacing:".06em",color:"#555"}}>TAP TO CAPTURE DAMAGE</div>
                <div style={{fontSize:12,color:"#3a3a3a"}}>{locMode==="photo"?"GPS FROM EXIF":locMode==="gps"?"GPS AUTO-STAMPS":"SET COORDINATES ABOVE"}</div></>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
            {gpsLoading&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,color:"#f97316",fontSize:13,fontWeight:700}}><div style={{width:8,height:8,borderRadius:"50%",background:"#f97316",animation:"pulse 1s infinite"}}/>{locMode==="photo"?"READING EXIF...":"ACQUIRING GPS..."}</div>}

            {/* Damage types — multi-select */}
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",color:"#555"}}>DAMAGE TYPE <span style={{color:"#3a3a3a",fontWeight:500}}>— SELECT ALL THAT APPLY</span></div>
                {dtypes.length>0&&<button onClick={()=>setDtypes([])} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>CLEAR</button>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {DAMAGE_TYPES.map(t=>{
                  const sel=dtypes.includes(t.label);
                  const urgColor="#ef4444",urgBg="rgba(239,68,68,.15)",urgBorder="rgba(239,68,68,.5)";
                  return(
                    <button key={t.id} onClick={()=>toggleDtype(t.label)}
                      style={{padding:"9px 12px",borderRadius:9,border:`1.5px solid ${sel?(t.urgent?urgBorder:"#f97316"):"rgba(255,255,255,.08)"}`,background:sel?(t.urgent?urgBg:"rgba(249,115,22,.15)"):"rgba(255,255,255,.03)",color:sel?(t.urgent?urgColor:"#f97316"):"#aaa",cursor:"pointer",fontFamily:"inherit",fontWeight:sel?800:500,fontSize:13,textAlign:"left",transition:"all .15s",display:"flex",alignItems:"center",gap:8,position:"relative"}}>
                      <span>{t.icon}</span><span style={{flex:1,lineHeight:1.2}}>{t.label}</span>
                      {sel&&<span style={{fontSize:14,color:t.urgent?urgColor:"#f97316"}}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {dtypes.length>0&&(
                <div style={{marginTop:8,padding:"6px 10px",background:"rgba(255,255,255,.04)",borderRadius:8,fontSize:12,color:"#888"}}>
                  Selected: <span style={{color:"#f97316",fontWeight:700}}>{dtypes.join(", ")}</span>
                </div>
              )}
            </div>

            {/* Owner */}
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",color:"#555"}}>ASSET OWNER <span style={{color:"#333",fontWeight:400}}>— OPTIONAL</span></div>
                {regionLabel&&<div style={{fontSize:11,color:"#3b82f6",fontWeight:700}}>📍 {regionLabel}</div>}
              </div>
              <select value={owner} onChange={e=>setOwner(e.target.value)} style={{...inp,cursor:"pointer",color:owner?"#E8EDF2":"#555",marginBottom:owner==="__custom__"?8:0}}>
                <option value="">Select owner...</option>
                {ownerList.map(o=><option key={o} value={o}>{o}</option>)}
                <option value="__custom__">Other — type below</option>
              </select>
              {owner==="__custom__"&&<input value={ownerCustom} onChange={e=>setOwnerCustom(e.target.value)} placeholder="Owner name..." style={inp}/>}
            </div>

            {/* Asset ID */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",color:"#555",marginBottom:7}}>ASSET ID / POLE NUMBER <span style={{color:"#333",fontWeight:400}}>— OPTIONAL</span></div>
              <input value={assetId} onChange={e=>setAssetId(e.target.value)} placeholder="e.g. POLE-2241, FE-88123, VLT-0091..." style={inp}/>
            </div>

            {/* Notes */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",color:"#555",marginBottom:7}}>NOTES <span style={{color:"#333",fontWeight:400}}>— OPTIONAL</span></div>
              <textarea value={notesTxt} onChange={e=>setNotesTxt(e.target.value)} placeholder="Location details, severity, access issues..."
                style={{...inp,resize:"none",height:70,lineHeight:1.5}}
                onFocus={e=>e.target.style.borderColor="rgba(249,115,22,.4)"}
                onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.08)"}/>
            </div>

            <button onClick={submitReport} disabled={!canSubmit}
              style={{width:"100%",padding:15,borderRadius:10,border:"none",background:canSubmit?"#f97316":"rgba(249,115,22,.12)",color:canSubmit?"#fff":"rgba(249,115,22,.3)",cursor:canSubmit?"pointer":"not-allowed",fontFamily:"inherit",fontWeight:800,fontSize:17,letterSpacing:".1em",boxShadow:canSubmit?"0 4px 16px rgba(249,115,22,.3)":"none",transition:"all .2s"}}>
              {submitting?"SUBMITTING...":online?"SUBMIT REPORT":"SUBMIT — QUEUED OFFLINE"}
            </button>
            {!canSubmit&&!submitting&&(preview||dtypes.length)&&(
              <div style={{textAlign:"center",marginTop:8,fontSize:12,color:"#444"}}>
                {!preview&&"↑ Photo required  "}{!dtypes.length&&"↑ Select at least one damage type  "}
                {!loc&&locMode!=="manual"&&"↑ GPS acquiring..."}{!loc&&locMode==="manual"&&"↑ Enter coordinates above"}
              </div>
            )}
          </div>
        )}

        {/* ═══ DASHBOARD TAB ═══ */}
        {tab==="dashboard"&&(
          <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 116px)"}}>

            {/* Controls bar */}
            <div style={{padding:"8px 10px",background:"#0D1117",borderBottom:"1px solid rgba(255,255,255,.05)",display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>

              {/* View toggle */}
              <div style={{display:"flex",gap:2,background:"rgba(255,255,255,.04)",borderRadius:8,padding:2,border:"1px solid rgba(255,255,255,.07)"}}>
                {[{id:"split",icon:"⊞",tip:"Map + List"},{id:"map",icon:"🗺",tip:"Map Only"},{id:"list",icon:"☰",tip:"List Only"}].map(v=>(
                  <button key={v.id} className="vbtn" onClick={()=>{if(dashView!==v.id){if(lmap.current&&v.id==="list"){lmap.current.remove();lmap.current=null;markersRef.current=null;}setDashView(v.id);}} }
                    title={v.tip}
                    style={{padding:"5px 10px",borderRadius:6,border:"none",background:dashView===v.id?"rgba(249,115,22,.2)":"transparent",color:dashView===v.id?"#f97316":"#555",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:14,transition:"all .15s"}}>
                    {v.icon}
                  </button>
                ))}
              </div>

              {/* Filters */}
              <select value={ftFilter} onChange={e=>setFtFilter(e.target.value)} style={{background:"#141920",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,color:"#E8EDF2",padding:"5px 8px",fontFamily:"inherit",fontSize:12,outline:"none",cursor:"pointer",minWidth:0}}>
                <option>All</option>{DAMAGE_TYPES.map(t=><option key={t.id}>{t.label}</option>)}
              </select>
              <select value={stFilter} onChange={e=>setStFilter(e.target.value)} style={{background:"#141920",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,color:"#E8EDF2",padding:"5px 8px",fontFamily:"inherit",fontSize:12,outline:"none",cursor:"pointer"}}>
                <option>All</option><option>New</option><option>Assigned</option><option>Resolved</option>
              </select>

              {/* Nearby */}
              <button onClick={toggleNearby}
                style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${nearbyActive?"rgba(59,130,246,.5)":"rgba(255,255,255,.1)"}`,background:nearbyActive?"rgba(59,130,246,.15)":"rgba(255,255,255,.04)",color:nearbyActive?"#3b82f6":"#666",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:12,letterSpacing:".04em",whiteSpace:"nowrap"}}>
                {nearbyLoading?"...":`${nearbyActive?"✓ ":""}📍NEARBY`}
              </button>

              <div style={{marginLeft:"auto",fontSize:11,color:"#444",fontWeight:700,whiteSpace:"nowrap"}}>
                {nearbyActive?`${displayReports.length} NEARBY`:displayReports.length} RPT{displayReports.length!==1?"S":""}
              </div>
            </div>

            {/* Map */}
            {dashView!=="list"&&(
              <div ref={mapDiv}
                style={{flexShrink:0,background:"#111",position:"relative",height:dashView==="map"?"calc(100% - 0px)":240,flex:dashView==="map"?1:undefined}}>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#2a2a2a",fontSize:13,fontWeight:700,zIndex:0,pointerEvents:"none"}}>LOADING MAP...</div>
              </div>
            )}

            {/* List */}
            {dashView!=="map"&&(
              <div style={{flex:1,overflow:"auto",padding:"8px 10px",display:"flex",flexDirection:"column",gap:6}}>
                {displayReports.length===0?(
                  <div style={{textAlign:"center",color:"#333",padding:40,fontSize:14,fontWeight:700}}>
                    {nearbyActive?"NO REPORTS WITHIN 1 MILE":"NO REPORTS MATCH FILTERS"}
                  </div>
                ):displayReports.map(r=>{
                  const isUrgent=dtUrgent(r.damage_types);
                  return(
                    <div key={r.report_id} className={`rcard${isUrgent?" urgent":""}`}
                      onClick={()=>{setSelected(r);setShowUpdForm(false);if(lmap.current)lmap.current.flyTo([r.latitude,r.longitude],16,{duration:.8});}}
                      style={{background:selected?.report_id===r.report_id?(isUrgent?"rgba(239,68,68,.08)":"rgba(249,115,22,.08)"):(isUrgent?"rgba(239,68,68,.04)":"rgba(255,255,255,.03)"),border:`1px solid ${selected?.report_id===r.report_id?(isUrgent?"rgba(239,68,68,.5)":"rgba(249,115,22,.4)"):(isUrgent?"rgba(239,68,68,.25)":"rgba(255,255,255,.06)")}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",transition:"all .15s"}}>

                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                        <TypeBadges types={r.damage_types} max={3}/>
                        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:6}}>
                          {r.sync_status==="Pending"&&<span style={{fontSize:10,color:"#f97316"}}>⏳</span>}
                          {r.updates?.length>0&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:"rgba(59,130,246,.15)",color:"#3b82f6",border:"1px solid rgba(59,130,246,.3)",fontWeight:700}}>{r.updates.length}↑</span>}
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:SC[r.status]?.bg,color:SC[r.status]?.fg,border:`1px solid ${SC[r.status]?.border}`,fontWeight:800}}>{r.status.toUpperCase()}</span>
                        </div>
                      </div>

                      {r.notes&&<div style={{fontSize:13,color:"#666",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.notes}</div>}

                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <Avatar name={r.reporter} size={15}/>
                          <span style={{fontSize:11,color:"#444"}}>{r.reporter||"?"}</span>
                          {r.owner&&<span style={{fontSize:11,color:"#333"}}>· {r.owner}</span>}
                          {r.asset_id&&<span style={{fontSize:11,color:"#2a2a2a"}}>· {r.asset_id}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {nearbyActive&&r._dist!=null&&<span style={{fontSize:11,color:"#3b82f6",fontWeight:700}}>{fmtDist(r._dist)}</span>}
                          <span style={{fontSize:11,color:"#3a3a3a"}}>{timeAgo(r.submitted_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* DETAIL SHEET */}
      {selected&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:300,display:"flex",alignItems:"flex-end"}} onClick={()=>{setSelected(null);setShowUpdForm(false);}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"#0D1117",border:"1px solid rgba(255,255,255,.08)",borderRadius:"16px 16px 0 0",padding:"20px 20px 28px",width:"100%",maxHeight:"84vh",overflow:"auto",animation:"slideUp .25s ease",boxShadow:"0 -8px 40px rgba(0,0,0,.6)",boxSizing:"border-box"}}>
            <div style={{width:36,height:4,background:"rgba(255,255,255,.12)",borderRadius:2,margin:"-8px auto 16px"}}/>

            {dtUrgent(selected.damage_types)&&(
              <div style={{background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:"#ef4444",fontWeight:800,letterSpacing:".06em"}}>
                🚨 URGENT / EMERGENCY — ENSURE SCENE IS SAFE
              </div>
            )}

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{marginBottom:6}}><TypeBadges types={selected.damage_types} max={5}/></div>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <Avatar name={selected.reporter} size={18}/>
                  <span style={{fontSize:12,color:"#555"}}>{selected.reporter||"?"}</span>
                  <span style={{fontSize:12,color:"#333"}}>· {timeAgo(selected.submitted_at)}</span>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0,marginLeft:8}}>
                <span style={{fontSize:12,padding:"3px 10px",borderRadius:12,background:SC[selected.status]?.bg,color:SC[selected.status]?.fg,border:`1px solid ${SC[selected.status]?.border}`,fontWeight:800}}>{selected.status.toUpperCase()}</span>
                <button onClick={()=>{setSelected(null);setShowUpdForm(false);}} style={{background:"rgba(255,255,255,.06)",border:"none",color:"#666",borderRadius:6,width:30,height:30,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              </div>
            </div>

            {selected.photo_url&&<img src={selected.photo_url} onClick={()=>setFsPhoto(selected.photo_url)} style={{width:"100%",borderRadius:10,marginBottom:12,maxHeight:185,objectFit:"cover",display:"block",cursor:"zoom-in",border:"1px solid rgba(255,255,255,.06)"}}/>}

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              <div style={{fontSize:12,padding:"4px 10px",borderRadius:8,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",color:"#666"}}>📍 {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</div>
              {selected.heading!=null&&<div style={{fontSize:12,padding:"4px 10px",borderRadius:8,background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.15)",color:"#f97316"}}>📷 {selected.heading}°</div>}
              {selected.owner&&<div style={{fontSize:12,padding:"4px 10px",borderRadius:8,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",color:"#888"}}>🏢 {selected.owner}</div>}
              {selected.asset_id&&<div style={{fontSize:12,padding:"4px 10px",borderRadius:8,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",color:"#888"}}>🔖 {selected.asset_id}</div>}
            </div>

            {selected.notes&&<div style={{background:"rgba(255,255,255,.04)",borderRadius:9,padding:"10px 14px",marginBottom:14,fontSize:14,color:"#bbb",lineHeight:1.6}}>{selected.notes}</div>}

            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",color:"#444",marginBottom:8}}>STATUS</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
                {["New","Assigned","Resolved"].map(s=>(
                  <button key={s} onClick={()=>updateStatus(selected.report_id,s)}
                    style={{padding:"11px 8px",borderRadius:9,border:`1.5px solid ${selected.status===s?SC[s].border:"rgba(255,255,255,.07)"}`,background:selected.status===s?SC[s].bg:"rgba(255,255,255,.03)",color:selected.status===s?SC[s].fg:"#555",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:13,letterSpacing:".06em",transition:"all .15s"}}>
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {selected.updates?.length>0&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",color:"#444",marginBottom:6}}>UPDATES ({selected.updates.length})</div>
                <div style={{background:"rgba(255,255,255,.02)",borderRadius:10,padding:"4px 12px 0"}}>
                  {selected.updates.map(u=><UpdateEntry key={u.update_id} upd={u} onPhoto={setFsPhoto}/>)}
                </div>
              </div>
            )}

            {showUpdForm?(
              <div style={{background:"rgba(59,130,246,.06)",border:"1px solid rgba(59,130,246,.2)",borderRadius:12,padding:"14px"}}>
                <div style={{fontSize:12,fontWeight:800,letterSpacing:".1em",color:"#3b82f6",marginBottom:10}}>ADD UPDATE</div>
                <div onClick={()=>!updPreview&&updFileRef.current?.click()}
                  style={{border:`1.5px dashed ${updPreview?"rgba(59,130,246,.5)":"rgba(59,130,246,.2)"}`,borderRadius:10,marginBottom:10,cursor:updPreview?"default":"pointer",background:"rgba(255,255,255,.02)",minHeight:80,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6,position:"relative",overflow:"hidden"}}>
                  {updPreview?(<><img src={updPreview} onClick={()=>setFsPhoto(updPreview)} style={{width:"100%",height:110,objectFit:"cover",cursor:"zoom-in"}}/><button onClick={e=>{e.stopPropagation();setUpdPreview(null);}} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:5,padding:"3px 9px",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>REMOVE</button></>
                  ):(<><span style={{fontSize:22}}>📷</span><span style={{fontSize:12,color:"#3b82f6",fontWeight:700}}>ADD PHOTO — OPTIONAL</span></>)}
                </div>
                <input ref={updFileRef} type="file" accept="image/*" capture="environment" onChange={handleUpdPhoto} style={{display:"none"}}/>
                <textarea value={updNotes} onChange={e=>setUpdNotes(e.target.value)} placeholder="What changed? Current condition, actions taken..."
                  style={{...inp,resize:"none",height:65,lineHeight:1.5,marginBottom:10,border:"1.5px solid rgba(59,130,246,.2)"}}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <button onClick={()=>{setShowUpdForm(false);setUpdPreview(null);setUpdNotes("");}} style={{padding:11,borderRadius:9,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.03)",color:"#555",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13}}>CANCEL</button>
                  <button onClick={submitUpdate} disabled={(!updNotes.trim()&&!updPreview)||updSubmitting}
                    style={{padding:11,borderRadius:9,border:"none",background:(updNotes.trim()||updPreview)&&!updSubmitting?"#3b82f6":"rgba(59,130,246,.15)",color:(updNotes.trim()||updPreview)&&!updSubmitting?"#fff":"rgba(59,130,246,.3)",cursor:(updNotes.trim()||updPreview)&&!updSubmitting?"pointer":"not-allowed",fontFamily:"inherit",fontWeight:800,fontSize:13}}>
                    {updSubmitting?"SAVING...":"SUBMIT"}
                  </button>
                </div>
              </div>
            ):(
              <button onClick={()=>setShowUpdForm(true)} style={{width:"100%",padding:12,borderRadius:10,border:"1.5px solid rgba(59,130,246,.3)",background:"rgba(59,130,246,.08)",color:"#3b82f6",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:14,letterSpacing:".08em"}}>
                + ADD UPDATE
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB BAR */}
      <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"#0D1117",borderTop:"1px solid rgba(255,255,255,.06)",display:"grid",gridTemplateColumns:"1fr 1fr",zIndex:200}}>
        {[{id:"report",icon:"📷",label:"REPORT"},{id:"dashboard",icon:"🗺",label:"DASHBOARD"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"11px 8px",background:tab===t.id?"rgba(249,115,22,.08)":"transparent",border:"none",borderTop:tab===t.id?"2px solid #f97316":"2px solid transparent",color:tab===t.id?"#f97316":"#444",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:12,letterSpacing:".1em",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all .15s",position:"relative"}}>
            <span style={{fontSize:20,lineHeight:1}}>{t.icon}</span>
            <span>{t.label}</span>
            {t.id==="dashboard"&&urgentCount>0&&<span style={{position:"absolute",top:6,left:"calc(50% + 10px)",background:"#ef4444",borderRadius:"50%",minWidth:16,height:16,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff",padding:"0 3px"}}>{urgentCount}</span>}
            {t.id==="dashboard"&&urgentCount===0&&newCount>0&&<span style={{position:"absolute",top:6,left:"calc(50% + 10px)",background:"#f97316",borderRadius:"50%",minWidth:16,height:16,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff",padding:"0 3px"}}>{newCount}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

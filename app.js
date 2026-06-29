/* Briq - responsive web app, BGS design language. Talks to the live Railway API. */
const API = (window.BRIK_CONFIG && window.BRIK_CONFIG.API_BASE) || "http://localhost:4000";
const FEE = 0.06;
const SLOTS = ["Tomorrow AM", "Tomorrow PM", "In 2 days AM", "In 2 days PM"];
const STATUS = ["Placed", "Confirming", "Out for delivery", "Delivered"];
const GROUPS = ["Cement", "Steel", "Blocks", "Aggregates", "Roofing"];
const ACC = { Cement: "amber", Steel: "blue", Blocks: "green", Aggregates: "violet", Roofing: "pink" };
const GICON = { Cement: "cement", Steel: "steel", Blocks: "block", Aggregates: "aggregate", Roofing: "roof" };
const VIEWS = {
  materials: { title: "Products", icon: "grid" },
  equipment: { title: "Equipment", icon: "wrench" },
  orders: { title: "My orders", icon: "receipt" },
  requests: { title: "My requests", icon: "clipboard" },
  why: { title: "Why Briq", icon: "shield" },
};
// Sidebar groups: BROWSE (the two layers) + ACTIVITY (your own history).
const NAV = ["materials", "equipment"];
const NAV2 = ["orders", "requests"];
const EQGROUPS = ["Mixing", "Compaction", "Access", "Power", "Hand tools"];

const FB = [
  ["cem-hima","Cement - Hima","50kg · OPC 42.5N","Cement","bag",38000,44000,1],
  ["cem-tororo","Cement - Tororo","50kg · OPC 42.5N","Cement","bag",36000,42000,1],
  ["bar-y10","Iron bar Y10","10mm deformed · 12m","Steel","length",27000,32000,1],
  ["bar-y12","Iron bar Y12","12mm deformed · 12m","Steel","length",38000,44000,1],
  ["bar-y16","Iron bar Y16","16mm deformed · 12m","Steel","length",68000,78000,1],
  ["brc","BRC mesh A142","Standard sheet","Steel","sheet",95000,110000,1],
  ["wire","Binding wire","Galvanised · per kg","Steel","kg",6500,7800,0],
  ["block-6",'Hollow block 6"',"Vibrated · 400×200×150","Blocks","block",2200,2600,1],
  ["block-9",'Hollow block 9"',"Vibrated · 400×200×225","Blocks","block",3000,3500,1],
  ["sand-river","River sand","Concrete sand · per tonne","Aggregates","tonne",45000,53000,0],
  ["sand-lake","Plaster sand","Fine lake sand · per tonne","Aggregates","tonne",60000,70000,0],
  ["ballast","Aggregate / ballast",'3/4" stone · per tonne',"Aggregates","tonne",75000,88000,1],
  ["hardcore","Hardcore","Foundation fill · per tonne","Aggregates","tonne",35000,41000,0],
  ["sheet-28","Iron sheets G28","Box profile · 3m","Roofing","sheet",38000,45000,0],
  ["nails","Nails","Assorted · per kg","Roofing","kg",6000,7200,0],
].map(([id,name,spec,group,unit,supplier,retail,v]) => {
  const brik = Math.round(supplier*(1+FEE));
  return { id,name,spec,group,unit,supplier,retail,verified:!!v,brik,fee:Math.round(supplier*FEE),save:retail-brik };
});
// TODO: fetch from /api/equipment once the backend exposes it. Shape mirrors materials.
const EQUIP = [
  ["mixer-350","Concrete mixer 350L","Diesel · tip drum","Mixing",80000,1],
  ["mixer-electric","Concrete mixer (electric)","240L · single phase","Mixing",60000,1],
  ["poker-45","Poker vibrator","45mm · petrol drive","Compaction",45000,1],
  ["plate-compactor","Plate compactor","90kg · reversible","Compaction",70000,1],
  ["rammer","Rammer (jumping jack)","Trench compaction","Compaction",65000,0],
  ["scaffold-set","Scaffold set","2m frame + braces · per set","Access",25000,1],
  ["ladder-ext","Extension ladder","6m aluminium","Access",15000,1],
  ["acrow-props","Acrow props","Adjustable · per 10","Access",18000,0],
  ["gen-5kva","Generator 5kVA","Petrol · key start","Power",90000,1],
  ["gen-15kva","Generator 15kVA","Diesel · 3-phase","Power",180000,1],
  ["breaker","Demolition breaker","1500W · hex chisel","Power",55000,1],
  ["drill-hammer","Hammer drill","SDS · 850W","Hand tools",20000,1],
  ["angle-grinder","Angle grinder","230mm · heavy duty","Hand tools",15000,0],
  ["laser-level","Laser level","Self-levelling · tripod","Hand tools",30000,1],
].map(([id,name,spec,category,rate,v]) => ({ id,name,spec,category,unit:"day",rate,verified:!!v }));
const FB_PACKS = [
  { id:"foundation", name:"Foundation", note:"Strip footing", items:{ "cem-hima":20, hardcore:6, ballast:4, "sand-river":4, "bar-y12":15, wire:3 } },
  { id:"slab", name:"Slab", note:"Suspended floor", items:{ "cem-hima":25, ballast:5, "sand-river":4, "bar-y12":20, brc:8, wire:4 } },
  { id:"walling", name:"Walling", note:"Block work", items:{ "block-9":400, "cem-hima":15, "sand-lake":6, "bar-y10":10 } },
  { id:"roofing", name:"Roofing", note:"Iron sheet cover", items:{ "sheet-28":40, nails:10 } },
];

let clientId = localStorage.getItem("briq-client");
if (!clientId) { clientId = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("briq-client", clientId); }

const S = { view:"materials", cart:{}, materials:[], equipment:[], packs:[], projects:[], active:"", orders:[], slot:SLOTS[0], loading:true, offline:false, adding:false, cat:"all", query:"", eqCat:"all", eqQuery:"", days:1, startDate:"", _lc:0 };
const IMGBAD = new Set();
function imgFail(id,el){ IMGBAD.add(id); if(el)el.remove(); }
function pulse(el){ if(!el)return; el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }

/* ── CUSTOMER PROFILE (phase 1: on-device, attaches to orders) ── */
S.profile = (function(){ try{ return JSON.parse(localStorage.getItem("briq-profile")||"null"); }catch(e){ return null; } })();
S.requests = (function(){ try{ return JSON.parse(localStorage.getItem("briq-requests")||"[]"); }catch(e){ return []; } })();
let _afterProfile=null;
function saveProfileObj(p){ try{ localStorage.setItem("briq-profile",JSON.stringify(p)); }catch(e){} }
function saveRequests(){ try{ localStorage.setItem("briq-requests",JSON.stringify(S.requests)); }catch(e){} }
function reqDate(){ try{ return new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short"}); }catch(e){ return ""; } }
function initials(name){ const p=String(name||"").trim().split(/\s+/); return (((p[0]||"")[0]||"")+((p[1]||"")[0]||"")).toUpperCase()||"?"; }

/* ── ROUTER (client-side, deep-linkable) ── */
const FILE = location.protocol === "file:";
const VIEW_PATH = { materials:"/products", equipment:"/equipment", orders:"/orders", requests:"/requests", why:"/why" };
function currentPath(){
  if(FILE) return (location.hash || "").replace(/^#/,"") || "/products";
  return location.pathname.replace(/\/index\.html$/,"") || "/products";
}
function routeHref(path){ return FILE ? "#"+path : path; }
function navigate(path,replace){
  if(FILE){ if(replace) location.replace("#"+path); else location.hash=path; }
  else { history[replace?"replaceState":"pushState"]({},"",path); route(); }
}
function navClick(e,path){ if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button) return true; e.preventDefault(); navigate(path); return false; }
function openProduct(id){ navigate("/products/"+encodeURIComponent(id)); }
function route(){
  const path=currentPath();
  const pm=path.match(/^\/products\/(.+)$/);
  const em=path.match(/^\/equipment\/(.+)$/);
  if(pm){ S.view="detail"; S.detailId=decodeURIComponent(pm[1]); }
  else if(em){ S.view="eqdetail"; S.detailId=decodeURIComponent(em[1]); S.days=1; S.startDate=""; }
  else if(path==="/equipment") S.view="equipment";
  else if(path==="/orders") S.view="orders";
  else if(path==="/requests") S.view="requests";
  else if(path==="/why") S.view="why";
  else S.view="materials";
  closeSidebar();
  render();
  window.scrollTo(0,0);
  const c=$("content"); if(c){ c.classList.remove("enter"); void c.offsetWidth; c.classList.add("enter"); }
}

const fmt = (n) => "UGX " + Math.round(n).toLocaleString("en-UG");
const sh = (n) => Math.round(n).toLocaleString("en-UG");
const M = (id) => S.materials.find((m) => m.id === id);
const E = (id) => S.equipment.find((e) => e.id === id);
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { "Content-Type": "application/json", "x-client-id": clientId, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

function I(name, s = 16) {
  const P = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    receipt:'<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h5"/>',
    shield:'<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    check:'<path d="M5 12l4.5 4.5L19 7"/>', plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
    cement:'<path d="M6 8l1-3h10l1 3"/><rect x="5" y="8" width="14" height="12" rx="2"/><path d="M9 13h6"/>',
    steel:'<path d="M4 7h16M4 12h16M4 17h16"/>', block:'<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M9 6v12M15 6v12"/>',
    aggregate:'<circle cx="8" cy="9" r="2.4"/><circle cx="15" cy="11" r="2.4"/><circle cx="11" cy="16" r="2.4"/>',
    roof:'<path d="M3 11l9-6 9 6"/><path d="M5 10v9h14v-9"/>',
    truck:'<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    spark:'<path d="M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4z"/>',
    cart:'<path d="M4 5h2l2 11h9l2-7H7"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
    box:'<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    tag:'<path d="M4 12V5a1 1 0 011-1h7l8 8-8 8z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    back:'<path d="M19 12H5M11 18l-6-6 6-6"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    wrench:'<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.1-3.1a6 6 0 01-7.9 7.9l-6.2 6.2a2.1 2.1 0 01-3-3l6.2-6.2a6 6 0 017.9-7.9z"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="8.5" y="2.5" width="7" height="3.5" rx="1"/><path d="M9 11h6M9 15h4"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="${s}" height="${s}" aria-hidden="true" focusable="false">${P[name]||""}</svg>`;
}

const lines = () => Object.entries(S.cart).map(([id,q]) => { const m=M(id); return m?{...m,qty:q,lt:m.brik*q,ls:m.save*q}:null; }).filter(Boolean);
const supTot = () => lines().reduce((s,l)=>s+l.supplier*l.qty,0);
const grand = () => lines().reduce((s,l)=>s+l.lt,0);
const saveTot = () => lines().reduce((s,l)=>s+l.ls,0);
const count = () => lines().reduce((s,l)=>s+l.qty,0);

function setQty(id,q){
  q=Math.max(0,Math.floor(q||0));
  if(q===0)delete S.cart[id]; else S.cart[id]=q;
  render();
}
function bump(id,d){ setQty(id,(S.cart[id]||0)+d); }
function addPack(pid){ const p=S.packs.find(x=>x.id===pid); if(!p)return; for(const[id,q]of Object.entries(p.items))S.cart[id]=(S.cart[id]||0)+q; toast(`${p.name} pack added`); render(); }
function go(v){ navigate(VIEW_PATH[v]||"/products"); }
function setSlot(s){ S.slot=s; renderModal(); const b=[...$("reviewCard").querySelectorAll(".slot")].find(x=>x.textContent===s); if(b)b.focus(); }
function paintGrid(){ const cb=$("catBar"); if(cb)cb.innerHTML=catBar(); const g=$("mGrid"); if(g)g.innerHTML=gridSection(); }
function setCat(g){ S.cat=g; S.query=""; const si=$("mSearch"); if(si)si.value=""; paintGrid(); }
function setQuery(v){ S.query=v; paintGrid(); }
function clearSearch(){ S.query=""; const si=$("mSearch"); if(si){ si.value=""; si.focus(); } paintGrid(); }
function toggleAdd(){ S.adding=!S.adding; render(); }
function openSidebar(){ $("sidebar").classList.add("open"); $("overlay").classList.add("show"); document.querySelector(".mob-sidebar-btn").setAttribute("aria-expanded","true"); }
function closeSidebar(){ $("sidebar").classList.remove("open"); $("overlay").classList.remove("show"); document.querySelector(".mob-sidebar-btn").setAttribute("aria-expanded","false"); }
let _lastFocus=null;
function openReview(){ if(count()===0)return; _lastFocus=document.activeElement; renderModal(); $("reviewModal").classList.add("open"); document.addEventListener("keydown",modalKey); setTimeout(()=>{ const f=$("reviewCard").querySelector(".modal-close"); if(f)f.focus(); },60); }
function closeReview(){ $("reviewModal").classList.remove("open"); document.removeEventListener("keydown",modalKey); if(_lastFocus&&_lastFocus.focus)_lastFocus.focus(); }
function modalKey(e){
  if(e.key==="Escape"){ closeReview(); return; }
  if(e.key!=="Tab")return;
  const f=$("reviewCard").querySelectorAll('button,[href],input,select,[tabindex]:not([tabindex="-1"])');
  if(!f.length)return;
  const first=f[0], last=f[f.length-1];
  if(e.shiftKey&&document.activeElement===first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey&&document.activeElement===last){ e.preventDefault(); first.focus(); }
}
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2400); }

function renderProfile(){
  const p=S.profile||{}, esc=v=>String(v||"").replace(/"/g,"&quot;");
  const roles=["Contractor","Engineer","Builder","Homeowner","Supplier"];
  $("profileCard").innerHTML = `<div class="modal-head"><div class="modal-title" id="profileTitle">Your details</div><button class="modal-close" onclick="closeProfile()" aria-label="Close">×</button></div>
    <div class="modal-body">
      <div class="pfield"><label class="form-label" for="pfName">Full name</label><input id="pfName" class="pf-input" value="${esc(p.name)}" placeholder="e.g. Isaac Ntegeka"></div>
      <div class="pfield"><label class="form-label" for="pfPhone">Phone</label><input id="pfPhone" class="pf-input" inputmode="tel" value="${esc(p.phone)}" placeholder="e.g. 0772 123 456"></div>
      <div class="pfield"><label class="form-label" for="pfRole">You are a</label><select id="pfRole" class="pf-input">${roles.map(r=>`<option ${p.role===r?"selected":""}>${r}</option>`).join("")}</select></div>
      <div class="pfield"><label class="form-label" for="pfTown">Town / site</label><input id="pfTown" class="pf-input" value="${esc(p.town)}" placeholder="e.g. Jinja"></div>
      <button class="btn btn-green btn-block" style="margin-top:8px" onclick="saveProfile()">Save details</button>
      <p style="text-align:center;font-size:.72rem;font-weight:600;color:var(--muted);margin-top:10px">Stored on your device, used to deliver your orders.</p>
    </div>`;
}
function openProfile(){ closeSidebar(); _lastFocus=document.activeElement; renderProfile(); $("profileModal").classList.add("open"); document.addEventListener("keydown",profileKey); setTimeout(()=>{ const f=$("profileCard").querySelector("input"); if(f)f.focus(); },60); }
function closeProfile(){ $("profileModal").classList.remove("open"); document.removeEventListener("keydown",profileKey); if(_lastFocus&&_lastFocus.focus)_lastFocus.focus(); }
function profileKey(e){
  if(e.key==="Escape"){ closeProfile(); return; }
  if(e.key!=="Tab")return;
  const f=$("profileCard").querySelectorAll('button,input,select,[href]'); if(!f.length)return;
  const a=f[0], b=f[f.length-1];
  if(e.shiftKey&&document.activeElement===a){ e.preventDefault(); b.focus(); }
  else if(!e.shiftKey&&document.activeElement===b){ e.preventDefault(); a.focus(); }
}
function saveProfile(){
  const name=$("pfName").value.trim();
  if(!name){ toast("Please add your name"); $("pfName").focus(); return; }
  S.profile={ name, phone:$("pfPhone").value.trim(), role:$("pfRole").value, town:$("pfTown").value.trim() };
  saveProfileObj(S.profile);
  closeProfile(); renderChrome(); toast("Profile saved");
  if(_afterProfile){ const fn=_afterProfile; _afterProfile=null; fn(); }
}

async function createProject(){
  const name=$("npName").value.trim(), site=$("npSite").value.trim();
  if(!name)return;
  if(S.offline){ const id="p"+Date.now().toString(36); S.projects.push({id,name,site}); S.active=id; }
  else{ const r=await api("/api/projects",{method:"POST",body:JSON.stringify({name,site})}); S.projects.push(r.project); S.active=r.project.id; }
  S.adding=false; toast("Project created"); render();
}
async function placeOrder(){
  const items=lines().map(l=>({id:l.id,qty:l.qty})); if(!items.length)return;
  if(!S.profile){ closeReview(); _afterProfile=placeOrder; toast("Add your details so we can deliver"); openProfile(); return; }
  try{
    if(S.offline){
      S.orders.unshift({ id:"BRK-"+Date.now().toString().slice(-6), total:grand(), save:saveTot(), slot:S.slot, statusIdx:1,
        date:new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
        project:(S.projects.find(p=>p.id===S.active)||{}).name||S.profile.name, site:S.profile.town||"",
        items:lines().map(l=>({name:l.name,qty:l.qty,unit:l.unit})) });
    } else {
      await api("/api/orders",{method:"POST",body:JSON.stringify({projectId:S.active||null,slot:S.slot,items,customer:S.profile})});
      await loadOrders();
    }
    S.cart={}; closeReview(); toast("Order placed · we'll confirm your slot"); go("orders");
  }catch(e){ toast("Could not place order: "+e.message); }
}
function reorder(id){ const o=S.orders.find(x=>x.id===id); if(!o)return; S.cart={}; o.items.forEach(it=>{const m=S.materials.find(x=>x.name===it.name); if(m)S.cart[m.id]=it.qty;}); toast("Items added to cart"); go("materials"); }

async function loadOrders(){ try{ const r=await api("/api/orders"); S.orders=r.orders; }catch(e){} }
async function boot(){
  S.loading=true; render();
  try{
    const [m,p]=await Promise.all([api("/api/materials"),api("/api/packs")]);
    S.materials=m.materials; S.packs=p.packs;
    try{ const pr=await api("/api/projects"); S.projects=pr.projects; if(pr.projects[0])S.active=pr.projects[0].id; }catch(e){}
    await loadOrders();
  }catch(e){ S.offline=true; S.materials=FB; S.packs=FB_PACKS; }
  // Equipment. TODO: real endpoint /api/equipment; falls back to bundled list for now.
  try{ const eq=await api("/api/equipment"); S.equipment=(eq&&eq.equipment&&eq.equipment.length)?eq.equipment:EQUIP; }
  catch(e){ S.equipment=EQUIP; }
  S.loading=false; render();
}

window.addEventListener("online",()=>{ if(S.offline){ S.offline=false; toast("Back online"); boot(); } });
window.addEventListener("offline",()=>{ S.offline=true; toast("You're offline - showing saved data"); render(); });

/* ── RENDER ── */
function renderChrome(){
  const av = S.view==="detail" ? "materials" : S.view==="eqdetail" ? "equipment" : S.view;
  // topbar
  const pageTitle = S.view==="detail" ? ((M(S.detailId)||{}).name || "Product")
    : S.view==="eqdetail" ? ((E(S.detailId)||{}).name || "Equipment")
    : VIEWS[S.view].title;
  $("tbTitle").textContent = pageTitle;
  document.title = pageTitle + " · Briq";
  $("tbSub").textContent = S.offline ? "Briq · Jinja · sample data" : "Briq · Jinja";
  // sidebar identity block
  const pr=S.profile;
  $("sbUser").innerHTML = pr
    ? `<span class="sb-avatar">${initials(pr.name)}</span><span class="sb-user-txt"><span class="sb-user-name">${pr.name}</span><span class="sb-user-role">${[pr.role,pr.town].filter(Boolean).join(" · ")||"Briq customer"}</span></span>`
    : `<span class="sb-avatar sb-avatar-empty">${I("user",16)}</span><span class="sb-user-txt"><span class="sb-user-name">Set up your profile</span><span class="sb-user-role">Name, phone &amp; site</span></span>`;
  // cart top button (desktop)
  const ct=$("cartTop");
  if(count()>0){ ct.style.display="inline-flex"; ct.setAttribute("aria-label",`Review order, ${count()} item${count()>1?"s":""}, total ${fmt(grand())}`); ct.innerHTML=`${I("cart",14)} ${fmt(grand())} · ${count()}`; }
  else ct.style.display="none";
  // sidebar nav
  const navItem = (v)=>{
    const cnt = v==="materials"?count():(v==="orders"?S.orders.length:(v==="requests"?S.requests.length:0));
    const badge = cnt>0?`<span class="nav-badge">${cnt}</span>`:"";
    const lbl = cnt>0?` aria-label="${VIEWS[v].title}, ${cnt}"`:"";
    return `<button class="nav-item ${av===v?"active":""}"${av===v?' aria-current="page"':""}${lbl} onclick="go('${v}')"><span class="nav-icon">${I(VIEWS[v].icon,14)}</span><span class="nav-label">${VIEWS[v].title}</span>${badge}</button>`;
  };
  $("sbNav").innerHTML = `<div class="nav-section">Browse</div>` + NAV.map(navItem).join("") + `<div class="nav-section">Activity</div>` + NAV2.map(navItem).join("");
  // bottom nav
  $("bottomNav").innerHTML = `<div class="bn-row">` + NAV.map(v=>{
    const cnt = v==="materials"?count():(v==="orders"?S.orders.length:0);
    const badge=(v==="materials"&&count()>0)?`<span class="bn-badge">${count()}</span>`:"";
    const lbl = cnt>0?` aria-label="${VIEWS[v].title}, ${cnt}"`:"";
    return `<button class="bn-item ${av===v?"on":""}"${av===v?' aria-current="page"':""}${lbl} onclick="go('${v}')"><span class="bi">${I(VIEWS[v].icon,21)}${badge}</span>${VIEWS[v].title}</button>`;
  }).join("") + `</div>`;
  // cart bar (mobile)
  $("cartBar").innerHTML = count()>0 ? `<button class="in" onclick="openReview()" aria-label="Review order, ${count()} item${count()>1?"s":""}, total ${fmt(grand())}"><div class="c1"><b>${fmt(grand())}</b><span>${count()} item${count()>1?"s":""} · save ${fmt(saveTot())}</span></div><div class="go">Review ${I("check",15)}</div></button>` : "";
  // light motion when the cart total grows
  const cNow=count();
  if(cNow>S._lc){ pulse($("cartTop")); pulse($("cartBar").firstElementChild); }
  S._lc=cNow;
}
function render(){
  renderChrome();
  // content
  const c=$("content");
  c.setAttribute("aria-busy", S.loading?"true":"false");
  if(S.loading && ["materials","detail","equipment","eqdetail"].includes(S.view)) c.innerHTML = ["detail","eqdetail"].includes(S.view) ? viewDetailSkeleton() : viewSkeleton();
  else if(S.view==="materials") c.innerHTML=viewMaterials();
  else if(S.view==="detail") c.innerHTML=viewDetail();
  else if(S.view==="equipment") c.innerHTML=viewEquipment();
  else if(S.view==="eqdetail") c.innerHTML=viewEquipDetail();
  else if(S.view==="orders") c.innerHTML=viewOrders();
  else if(S.view==="requests") c.innerHTML=viewRequests();
  else c.innerHTML=viewWhy();
}

function viewSkeleton(){
  const cards=Array.from({length:6},()=>`<div class="sk-card"><div class="skel sk-img"></div><div class="sk-body"><div class="skel sk-line" style="width:70%;height:13px"></div><div class="skel sk-line" style="width:45%;margin-top:9px"></div><div class="skel sk-line" style="width:40%;height:18px;margin-top:13px"></div><div class="skel sk-line" style="width:100%;height:42px;border-radius:12px;margin-top:14px"></div></div></div>`).join("");
  return `<div class="skel" style="height:48px;border-radius:12px;margin-bottom:14px"></div>
    <div class="mgrid">${cards}</div>`;
}


function matFor(){
  const q=S.query.trim().toLowerCase();
  if(q) return S.materials.filter(m=>(m.name+" "+m.spec+" "+m.group).toLowerCase().includes(q));
  if(S.cat==="all") return S.materials;
  return S.materials.filter(m=>m.group===S.cat);
}
const ART = {
  bag:'<path d="M18 13c0-3 2-5 6-5s6 2 6 5l1.6 22c.2 2.8-1.8 4.5-4.6 4.5h-5c-2.8 0-4.8-1.7-4.6-4.5z"/><path d="M19 12.5h10"/><rect x="20" y="19" width="8" height="7" rx="1.5"/>',
  rebar:'<path d="M11 17h26M11 24h26M11 31h26"/><path d="M17 17l2-3M25 24l2-3M21 31l2-3"/>',
  mesh:'<rect x="13" y="14" width="22" height="20" rx="1.5"/><path d="M13 20.7h22M13 27.3h22M20.3 14v20M27.7 14v20"/>',
  wire:'<path d="M30 14c-9 0-9 5.5 0 5.5s9 5.5 0 5.5-9 5.5 0 5.5-9 5.5 0 5.5"/>',
  block:'<rect x="11" y="18" width="26" height="14" rx="1.5"/><rect x="15" y="22" width="6" height="6" rx="1"/><rect x="27" y="22" width="6" height="6" rx="1"/>',
  sand:'<path d="M9 34h30"/><path d="M11 34c3-12 7-16 13-16s10 4 13 16"/><circle cx="20" cy="29" r="1"/><circle cx="24" cy="32" r="1"/><circle cx="28" cy="28" r="1"/>',
  aggregate:'<circle cx="18" cy="28" r="6"/><circle cx="29" cy="26" r="6"/><circle cx="24" cy="34" r="5"/>',
  roof:'<path d="M9 20c2.3-3 4.7-3 7 0s4.7 3 7 0 4.7-3 7 0"/><path d="M9 28c2.3-3 4.7-3 7 0s4.7 3 7 0 4.7-3 7 0"/>',
  nails:'<path d="M19 13v15l2 4 2-4V13"/><path d="M16 13h10"/><path d="M28 17v11l1.5 3 1.5-3V17"/><path d="M25.5 17h7"/>',
};
function artKind(id){
  id=String(id);
  if(id.startsWith("cem")) return "bag";
  if(id.startsWith("bar")) return "rebar";
  if(id==="brc") return "mesh";
  if(id==="wire") return "wire";
  if(id.startsWith("block")) return "block";
  if(id.startsWith("sand")) return "sand";
  if(id.startsWith("sheet")) return "roof";
  if(id==="nails") return "nails";
  return "aggregate"; // ballast, hardcore, anything stony
}
function artFor(m){
  return `<svg class="art-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ART[artKind(m.id)]}</svg>`;
}
function ctrlHTML(m){
  const q=S.cart[m.id]||0;
  return q===0
    ? `<button class="add-order-btn" onclick="bump('${m.id}',1)" aria-label="Add ${m.name} to order">${I("plus",16)} Add to order</button>`
    : `<div class="qstep" role="group" aria-label="Quantity, ${m.name}"><button onclick="bump('${m.id}',-1)" aria-label="Remove one ${m.name}">${I("minus",16)}</button><input value="${q}" inputmode="numeric" aria-label="${m.name} quantity" onchange="setQty('${m.id}',parseInt(this.value.replace(/\\D/g,''))||0)"><button onclick="bump('${m.id}',1)" aria-label="Add one ${m.name}">${I("plus",16)}</button></div>`;
}
function pcard(m){
  const g=m.group, q=S.cart[m.id]||0;
  const img = IMGBAD.has(m.id) ? "" : `<img src="images/${m.id}.jpg" alt="${m.name}" loading="lazy" onerror="imgFail('${m.id}',this)">`;
  const seal = m.verified ? `<span class="seal" role="img" aria-label="Engineer-verified" title="Engineer-verified">${I("check",13)}</span>` : "";
  return `<a class="pcard ${q>0?"on":""}" href="${routeHref('/products/'+m.id)}" onclick="return navClick(event,'/products/${m.id}')" aria-label="${m.name}, ${fmt(m.brik)} per ${m.unit}">
    <div class="pcard-img"><span class="pcard-art" aria-hidden="true">${artFor(m)}</span>${img}<span class="pcard-cat">${g}</span>${seal}</div>
    <div class="pcard-body">
      <div class="pcard-name">${m.name}</div>
      <div class="pcard-spec">${m.spec}</div>
      <div class="pcard-price"><b>${fmt(m.brik)}</b><span class="pcard-unit">/ ${m.unit}</span><s>${sh(m.retail)}</s></div>
      <div class="pcard-save">${I("tag",11)} Save ${sh(m.save)} vs retail</div>
    </div>
  </a>`;
}
function catBar(){
  const searching=S.query.trim().length>0;
  const allOn=!searching && S.cat==="all";
  let out=`<button class="cft ${allOn?"on":""}"${allOn?' aria-current="true"':""} onclick="setCat('all')">All</button>`;
  out+=GROUPS.map(g=>{
    const on=!searching && S.cat===g;
    return `<button class="cft ${on?"on":""}"${on?' aria-current="true"':""} onclick="setCat('${g}')">${g}</button>`;
  }).join("");
  return out;
}
function gridSection(){
  const searching=S.query.trim().length>0;
  const list=matFor();
  const title=searching?"Results":(S.cat==="all"?"All materials":S.cat);
  const head=`<div class="grid-head"><h2 class="card-title">${title}</h2>${searching?`<button class="link-btn" onclick="clearSearch()">Clear search</button>`:`<span class="grid-count">${list.length} item${list.length!==1?"s":""}</span>`}</div>`;
  if(!list.length) return head+`<div class="card"><div class="empty-state"><div class="empty-icon">${I("search",24)}</div><div class="empty-title">No materials match “${S.query.trim()}”</div><div class="empty-sub">Try another term, or pick a category above.</div></div></div>`;
  return head+`<div class="mgrid">${list.map(pcard).join("")}</div>`;
}
function viewMaterials(){
  return `
    <div class="search-wrap">${I("search",18)}<input id="mSearch" class="search-input" type="search" placeholder="Search materials - cement, Y12, blocks, ballast…" aria-label="Search materials" autocomplete="off" oninput="setQuery(this.value)" value="${S.query.replace(/"/g,"&quot;")}"></div>
    <div class="catfilter" id="catBar">${catBar()}</div>
    <div id="mGrid">${gridSection()}</div>`;
}

function viewDetailSkeleton(){
  return `<div class="skel" style="width:120px;height:20px;border-radius:100px;margin-bottom:16px"></div>
  <div class="detail">
    <div class="detail-media"><div class="skel" style="aspect-ratio:4/3;border-radius:var(--radius)"></div></div>
    <div class="detail-info">
      <div class="skel" style="width:84px;height:22px;border-radius:100px"></div>
      <div class="skel sk-line" style="width:72%;height:26px;margin-top:14px"></div>
      <div class="skel sk-line" style="width:46%;margin-top:12px"></div>
      <div class="skel" style="width:55%;height:32px;margin-top:22px"></div>
      <div class="skel" style="width:100%;height:44px;border-radius:12px;margin-top:18px"></div>
      <div class="skel" style="width:100%;height:120px;border-radius:12px;margin-top:18px"></div>
    </div>
  </div>`;
}
function viewDetail(){
  if(S.loading) return viewDetailSkeleton();
  const m=M(S.detailId);
  if(!m) return `<a class="back-link" href="${routeHref('/products')}" onclick="return navClick(event,'/products')">${I("back",16)} All products</a>
    <div class="card"><div class="empty-state"><div class="empty-icon">${I("search",24)}</div><div class="empty-title">Product not found</div><div class="empty-sub">This item may have been removed. Browse the full catalogue instead.</div></div></div>`;
  const img = IMGBAD.has(m.id) ? "" : `<img src="images/${m.id}.jpg" alt="${m.name}" onerror="imgFail('${m.id}',this)">`;
  const seal = m.verified ? `<span class="seal" role="img" aria-label="Engineer-verified">${I("check",13)}</span>` : "";
  const verified = m.verified ? `<div class="detail-verified">${I("check",14)} Engineer-verified quality mark</div>` : "";
  const cta = count()>0 ? `<button class="btn btn-green btn-block detail-cta" onclick="openReview()">Review order (${count()}) ${I("check",15)}</button>` : "";
  return `
  <a class="back-link" href="${routeHref('/products')}" onclick="return navClick(event,'/products')">${I("back",16)} All products</a>
  <div class="detail">
    <div class="detail-media">
      <div class="detail-photo"><span class="pcard-art" aria-hidden="true">${artFor(m)}</span>${img}${seal}</div>
    </div>
    <div class="detail-info">
      <span class="detail-cat">${m.group}</span>
      <h1 class="detail-name">${m.name}</h1>
      <div class="detail-spec">${m.spec}</div>
      ${verified}
      <div class="detail-price-row"><b>${fmt(m.brik)}</b><span class="du">/ ${m.unit}</span><s>${fmt(m.retail)}</s><span class="pcard-save">${I("tag",11)} Save ${sh(m.save)}</span></div>
      <div class="detail-ctrl" id="ctrl-${m.id}">${ctrlHTML(m)}</div>
      ${cta}
      <div class="transparency">
        <div class="tot"><span>Supplier cost</span><span>${fmt(m.supplier)}</span></div>
        <div class="tot"><span>Briq fee (${Math.round(FEE*100)}%)</span><span>${fmt(m.fee)}</span></div>
        <div class="tot grand"><span>Briq price</span><span>${fmt(m.brik)}</span></div>
        <div class="tot sv"><span>You save vs retail</span><span>${fmt(m.save)}</span></div>
      </div>
      <div class="guarantee">${I("shield",15)}<span><strong>Briq Guarantee.</strong> Wrong spec or it fails, we replace it free.</span></div>
      <div class="detail-note">${I("truck",15)} Pay on delivery, delivered to your site.</div>
    </div>
  </div>`;
}

/* ── EQUIPMENT (rental twin of Products) ── */
const EQART = {
  "Mixing":'<ellipse cx="10" cy="9" rx="5" ry="4"/><path d="M6 12l-2 8M14 12l2 8"/><path d="M8 7l4 4"/><path d="M15 9h4l-2 3"/>',
  "Compaction":'<rect x="4" y="16" width="12" height="3.5" rx="1"/><path d="M10 16V9l6-4"/><path d="M14 4.5h4"/>',
  "Access":'<rect x="4" y="4" width="14" height="16" rx="1"/><path d="M4 9.3h14M4 14.6h14M11 4v16"/>',
  "Power":'<rect x="3" y="9" width="16" height="10" rx="1.5"/><circle cx="8.5" cy="14" r="2.6"/><path d="M15 12v4"/><path d="M6 9l1.3-2h7L16 9"/>',
  "Hand tools":'<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.1-3.1a6 6 0 01-7.9 7.9l-6.2 6.2a2.1 2.1 0 01-3-3l6.2-6.2a6 6 0 017.9-7.9z"/>',
};
function eqArt(e){ return `<svg class="art-svg eq-art" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EQART[e.category]||EQART["Hand tools"]}</svg>`; }
function ecard(e){
  const img = IMGBAD.has(e.id) ? "" : `<img src="images/${e.id}.jpg" alt="${e.name}" loading="lazy" onerror="imgFail('${e.id}',this)">`;
  const seal = e.verified ? `<span class="seal" role="img" aria-label="Briq-checked, working condition" title="Briq-checked, working condition">${I("check",13)}</span>` : "";
  return `<a class="pcard" href="${routeHref('/equipment/'+e.id)}" onclick="return navClick(event,'/equipment/${e.id}')" aria-label="${e.name}, ${fmt(e.rate)} per day">
    <div class="pcard-img"><span class="pcard-art" aria-hidden="true">${eqArt(e)}</span>${img}<span class="pcard-cat">${e.category}</span>${seal}</div>
    <div class="pcard-body">
      <div class="pcard-name">${e.name}</div>
      <div class="pcard-spec">${e.spec}</div>
      <div class="pcard-price"><b>${fmt(e.rate)}</b><span class="pcard-unit">/ day</span></div>
    </div>
  </a>`;
}
function eqCatBar(){
  const searching=S.eqQuery.trim().length>0;
  const allOn=!searching && S.eqCat==="all";
  let out=`<button class="cft ${allOn?"on":""}"${allOn?' aria-current="true"':""} onclick="setEqCat('all')">All</button>`;
  out+=EQGROUPS.map(g=>{
    const on=!searching && S.eqCat===g;
    return `<button class="cft ${on?"on":""}"${on?' aria-current="true"':""} onclick="setEqCat('${g}')">${g}</button>`;
  }).join("");
  return out;
}
function eqMatFor(){
  const q=S.eqQuery.trim().toLowerCase();
  if(q) return S.equipment.filter(e=>(e.name+" "+e.spec+" "+e.category).toLowerCase().includes(q));
  if(S.eqCat==="all") return S.equipment;
  return S.equipment.filter(e=>e.category===S.eqCat);
}
function eqGridSection(){
  const searching=S.eqQuery.trim().length>0;
  const list=eqMatFor();
  const title=searching?"Results":(S.eqCat==="all"?"All equipment":S.eqCat);
  const head=`<div class="grid-head"><h2 class="card-title">${title}</h2>${searching?`<button class="link-btn" onclick="eqClearSearch()">Clear search</button>`:`<span class="grid-count">${list.length} item${list.length!==1?"s":""}</span>`}</div>`;
  if(!list.length) return head+`<div class="card"><div class="empty-state"><div class="empty-icon">${I("search",24)}</div><div class="empty-title">No equipment matches “${S.eqQuery.trim()}”</div><div class="empty-sub">Try another term, or pick a category above.</div></div></div>`;
  return head+`<div class="mgrid">${list.map(ecard).join("")}</div>`;
}
function viewEquipment(){
  return `
    <div class="search-wrap">${I("search",18)}<input id="eqSearch" class="search-input" type="search" placeholder="Search equipment - mixer, scaffold, generator…" aria-label="Search equipment" autocomplete="off" oninput="setEqQuery(this.value)" value="${S.eqQuery.replace(/"/g,"&quot;")}"></div>
    <div class="catfilter" id="eqCatBar">${eqCatBar()}</div>
    <div id="eqGrid">${eqGridSection()}</div>`;
}
function eqPaintGrid(){ const cb=$("eqCatBar"); if(cb)cb.innerHTML=eqCatBar(); const g=$("eqGrid"); if(g)g.innerHTML=eqGridSection(); }
function setEqCat(g){ S.eqCat=g; S.eqQuery=""; const si=$("eqSearch"); if(si)si.value=""; eqPaintGrid(); }
function setEqQuery(v){ S.eqQuery=v; eqPaintGrid(); }
function eqClearSearch(){ S.eqQuery=""; const si=$("eqSearch"); if(si){ si.value=""; si.focus(); } eqPaintGrid(); }

function setDays(n){
  S.days=Math.max(1,Math.floor(n||1));
  const e=E(S.detailId); if(!e)return;
  const di=$("eqDays"); if(di)di.value=S.days;
  const t=$("eqTotal"); if(t)t.textContent=fmt(e.rate*S.days);
  const td=$("eqTotalDays"); if(td)td.textContent=`${S.days} day${S.days>1?"s":""}`;
}
function bumpDays(d){ setDays((S.days||1)+d); }
function setStart(v){ S.startDate=v; }
async function requestEquipment(){
  const e=E(S.detailId); if(!e)return;
  if(!S.profile){ _afterProfile=requestEquipment; toast("Add your details so we can confirm"); openProfile(); return; }
  const payload={ equipmentId:e.id, name:e.name, days:S.days||1, startDate:S.startDate||null, customer:S.profile };
  // TODO: POST to /api/equipment-requests once the backend exposes it; this is a manual request, no availability engine.
  try{ await api("/api/equipment-requests",{method:"POST",body:JSON.stringify(payload)}); }catch(err){}
  S.requests.unshift({ type:"equipment", id:e.id, name:e.name, days:S.days||1, startDate:S.startDate||"", date:reqDate() });
  saveRequests(); renderChrome();
  toast("Request sent - we'll confirm availability & deposit");
}
function viewEquipDetail(){
  if(S.loading) return viewDetailSkeleton();
  const e=E(S.detailId);
  if(!e) return `<a class="back-link" href="${routeHref('/equipment')}" onclick="return navClick(event,'/equipment')">${I("back",16)} All equipment</a>
    <div class="card"><div class="empty-state"><div class="empty-icon">${I("search",24)}</div><div class="empty-title">Equipment not found</div><div class="empty-sub">This item may no longer be listed. Browse all equipment instead.</div></div></div>`;
  const img = IMGBAD.has(e.id) ? "" : `<img src="images/${e.id}.jpg" alt="${e.name}" onerror="imgFail('${e.id}',this)">`;
  const seal = e.verified ? `<span class="seal" role="img" aria-label="Briq-checked">${I("check",13)}</span>` : "";
  const verified = e.verified ? `<div class="detail-verified">${I("check",14)} Briq-checked, working condition</div>` : "";
  const days=S.days||1;
  return `
  <a class="back-link" href="${routeHref('/equipment')}" onclick="return navClick(event,'/equipment')">${I("back",16)} All equipment</a>
  <div class="detail">
    <div class="detail-media">
      <div class="detail-photo"><span class="pcard-art" aria-hidden="true">${eqArt(e)}</span>${img}${seal}</div>
    </div>
    <div class="detail-info">
      <span class="detail-cat">${e.category}</span>
      <h1 class="detail-name">${e.name}</h1>
      <div class="detail-spec">${e.spec}</div>
      ${verified}
      <div class="detail-price-row"><b>${fmt(e.rate)}</b><span class="du">/ day</span></div>
      <div class="rental">
        <div class="rental-row">
          <label class="form-label" for="eqDays">How many days?</label>
          <div class="qstep rental-step" role="group" aria-label="Number of days">
            <button onclick="bumpDays(-1)" aria-label="One day fewer">${I("minus",16)}</button>
            <input id="eqDays" value="${days}" inputmode="numeric" aria-label="Number of days" onchange="setDays(parseInt(this.value.replace(/\\D/g,''))||1)">
            <button onclick="bumpDays(1)" aria-label="One day more">${I("plus",16)}</button>
          </div>
        </div>
        <div class="rental-row">
          <label class="form-label" for="eqStart">Preferred start date</label>
          <input id="eqStart" class="pf-input" type="date" value="${S.startDate||""}" aria-label="Preferred start date" onchange="setStart(this.value)" oninput="setStart(this.value)">
        </div>
        <div class="rental-total"><span>Estimated total</span><span class="rt-val"><b id="eqTotal">${fmt(e.rate*days)}</b><span class="rt-sub">${fmt(e.rate)} × <span id="eqTotalDays">${days} day${days>1?"s":""}</span></span></span></div>
      </div>
      <button class="btn btn-green btn-block" onclick="requestEquipment()">Request this equipment</button>
      <p class="detail-fineprint">A refundable deposit may apply, confirmed on booking.</p>
      <div class="guarantee">${I("shield",15)}<span><strong>Working-condition guarantee.</strong> Every unit is Briq-checked before it leaves; if it fails on site we swap it.</span></div>
      <div class="detail-note">${I("truck",15)} Delivered to your site or picked up - your choice, confirmed on booking.</div>
    </div>
  </div>`;
}


function viewOrders(){
  if(S.loading) return `<div class="empty-state"><div class="empty-icon">${I("receipt",24)}</div><div class="empty-title">Loading…</div></div>`;
  if(!S.orders.length) return `<div class="card"><div class="empty-state"><div class="empty-icon">${I("receipt",24)}</div><div class="empty-title">No orders yet</div><div class="empty-sub">Place your first order and it'll show here, ready to track and reorder in a tap.</div></div></div>`;
  const cum=S.orders.reduce((s,o)=>s+(o.save||0),0);
  const moved=S.orders.reduce((s,o)=>s+o.items.reduce((a,i)=>a+i.qty,0),0);
  const cards=S.orders.map(o=>{
    const track=STATUS.map((_,i)=>`${i>0?`<div class="seg ${i<=o.statusIdx?"on":""}"></div>`:""}<div class="dot ${i<=o.statusIdx?"on":""}"></div>`).join("");
    const labs=STATUS.map((s,i)=>`<span class="${i===o.statusIdx?"now":""}">${s}</span>`).join("");
    const its=o.items.map(it=>`<div class="ord-item">${it.qty} × ${it.name} <span>(${it.unit})</span></div>`).join("");
    return `<div class="card"><div class="ord-head"><span class="ord-id">${o.id}</span><span class="pill pill-green">${STATUS[o.statusIdx]}</span></div>
      <div class="ord-meta">${o.project||"No project"}${o.site?` · ${o.site}`:""} · ${o.date||""} · ${o.slot||""}</div>
      <div class="track">${track}</div><div class="tlab">${labs}</div>${its}
      <div class="ord-foot"><div class="ord-tot"><b>${fmt(o.total)}</b>${o.save>0?`<span>saved ${fmt(o.save)}</span>`:""}</div><button class="btn btn-sm" onclick="reorder('${o.id}')">${I("cart",13)} Reorder</button></div></div>`;
  }).join("");
  return `<div class="member-hero"><div class="hero-lbl">Saved with Briq</div><div class="hero-val">${fmt(cum)}</div><div class="hero-note">vs buying at retail, across ${S.orders.length} order${S.orders.length>1?"s":""}</div>
    <div class="hero-stats"><div class="hero-stat"><div class="hero-stat-val">${S.orders.length}</div><div class="hero-stat-lbl">Orders</div></div><div class="hero-stat"><div class="hero-stat-val">${moved}</div><div class="hero-stat-lbl">Items moved</div></div></div></div>
    <h2 class="card-title" style="margin:2px 2px 12px">Recent orders</h2>${cards}`;
}

function viewRequests(){
  if(!S.requests.length) return `<div class="card"><div class="empty-state"><div class="empty-icon">${I("clipboard",24)}</div><div class="empty-title">No requests yet</div><div class="empty-sub">Rent equipment and it'll show here, ready for Briq to confirm.</div></div></div>`;
  const cards=S.requests.map(r=>{
    const sub=`Rental · ${r.days} day${r.days>1?"s":""}${r.startDate?` · from ${r.startDate}`:""}`;
    return `<div class="card req-card">
      <span class="req-ic">${I("wrench",16)}</span>
      <div class="req-body"><div class="req-name">${r.name}</div><div class="req-sub">${sub}</div><div class="req-date">Requested ${r.date||""}</div></div>
      <span class="pill pill-green">${I("check",11)}Requested</span>
    </div>`;
  }).join("");
  return `<h2 class="card-title" style="margin:2px 2px 14px">My requests</h2>${cards}`;
}

function viewWhy(){
  return `<div class="card">
    <div class="vrow"><div class="vi">${I("shield",18)}</div><div><b>Engineer-verified quality</b><p>We measure the bars and check the cement, so fake and underweight never reach your site.</p></div></div>
    <div class="vrow"><div class="vi">${I("spark",18)}</div><div><b>Transparent pricing, below retail</b><p>You see our fee on every item, and still pay less than buying alone.</p></div></div>
    <div class="vrow"><div class="vi">${I("truck",18)}</div><div><b>We handle sourcing and delivery</b><p>You order, we run the rest to your site. Pay on delivery, no deposit.</p></div></div>
    <div class="gbox"><b>The Briq Guarantee</b><p>If any material fails spec or arrives wrong, we replace it free. You never pay for a mistake.</p></div>
    <button class="btn btn-green btn-block" style="margin-top:14px" onclick="go('materials')">Start an order</button></div>`;
}

function renderModal(){
  const ls=lines().map(l=>`<div class="line"><div><div class="ln">${l.name}</div><div class="lq">${l.qty} × ${fmt(l.brik)} / ${l.unit}</div></div><div class="lp">${fmt(l.lt)}</div></div>`).join("");
  const slots=SLOTS.map(s=>`<button class="slot ${S.slot===s?"on":""}" role="radio" aria-checked="${S.slot===s}" onclick="setSlot('${s}')">${s}</button>`).join("");
  const sv=saveTot()>0?`<div class="tot sv"><span>You save vs retail</span><span>${fmt(saveTot())}</span></div>`:"";
  $("reviewCard").innerHTML = `<div class="modal-head"><div class="modal-title" id="reviewTitle">Review order</div><button class="modal-close" onclick="closeReview()" aria-label="Close review">×</button></div>
    <div class="modal-body">${ls}
      <div style="margin-top:8px"><div class="tot"><span>Supplier cost</span><span>${fmt(supTot())}</span></div>
      <div class="tot"><span>Briq fee (${Math.round(FEE*100)}%)</span><span>${fmt(grand()-supTot())}</span></div>${sv}
      <div class="tot grand"><span>Total</span><span>${fmt(grand())}</span></div></div>
      <div class="form-label" style="margin:18px 0 9px">Delivery slot</div><div class="slot-grid" role="radiogroup" aria-label="Delivery slot">${slots}</div>
      <div class="guarantee">${I("shield",15)}<span><strong>Briq Guarantee</strong> - if any material fails spec or arrives wrong, we replace it free.</span></div>
      <button class="btn btn-green btn-block" style="margin-top:14px" onclick="placeOrder()">Place order</button>
      <p style="text-align:center;font-size:.72rem;font-weight:600;color:var(--muted);margin-top:12px">No deposit · pay on delivery</p></div>`;
}

Object.assign(window,{go,bump,setQty,addPack,toggleAdd,createProject,openReview,closeReview,setSlot,placeOrder,reorder,openSidebar,closeSidebar,setCat,setQuery,clearSearch,imgFail,navigate,navClick,openProduct,openProfile,closeProfile,saveProfile,setEqCat,setEqQuery,eqClearSearch,bumpDays,setDays,setStart,requestEquipment,S});
window.addEventListener("popstate",route);
window.addEventListener("hashchange",()=>{ if(FILE) route(); });
route();
boot();

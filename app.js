/* Briq — responsive web app, BGS design language. Talks to the live Railway API. */
const API = (window.BRIK_CONFIG && window.BRIK_CONFIG.API_BASE) || "http://localhost:4000";
const FEE = 0.06;
const SLOTS = ["Tomorrow AM", "Tomorrow PM", "In 2 days AM", "In 2 days PM"];
const STATUS = ["Placed", "Confirming", "Out for delivery", "Delivered"];
const GROUPS = ["Cement", "Steel", "Blocks", "Aggregates", "Roofing"];
const ACC = { Cement: "amber", Steel: "blue", Blocks: "green", Aggregates: "violet", Roofing: "pink" };
const GICON = { Cement: "cement", Steel: "steel", Blocks: "block", Aggregates: "aggregate", Roofing: "roof" };
const VIEWS = {
  materials: { title: "Order materials", icon: "grid" },
  orders: { title: "My orders", icon: "receipt" },
  why: { title: "Why Briq", icon: "shield" },
};

const FB = [
  ["cem-hima","Cement — Hima","50kg · OPC 42.5N","Cement","bag",38000,44000,1],
  ["cem-tororo","Cement — Tororo","50kg · OPC 42.5N","Cement","bag",36000,42000,1],
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
const FB_PACKS = [
  { id:"foundation", name:"Foundation", note:"Strip footing", items:{ "cem-hima":20, hardcore:6, ballast:4, "sand-river":4, "bar-y12":15, wire:3 } },
  { id:"slab", name:"Slab", note:"Suspended floor", items:{ "cem-hima":25, ballast:5, "sand-river":4, "bar-y12":20, brc:8, wire:4 } },
  { id:"walling", name:"Walling", note:"Block work", items:{ "block-9":400, "cem-hima":15, "sand-lake":6, "bar-y10":10 } },
  { id:"roofing", name:"Roofing", note:"Iron sheet cover", items:{ "sheet-28":40, nails:10 } },
];

let clientId = localStorage.getItem("briq-client");
if (!clientId) { clientId = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("briq-client", clientId); }

const S = { view:"materials", cart:{}, materials:[], packs:[], projects:[], active:"", orders:[], slot:SLOTS[0], loading:true, offline:false, adding:false };

const fmt = (n) => "UGX " + Math.round(n).toLocaleString("en-UG");
const sh = (n) => Math.round(n).toLocaleString("en-UG");
const M = (id) => S.materials.find((m) => m.id === id);
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
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="${s}" height="${s}">${P[name]||""}</svg>`;
}

const lines = () => Object.entries(S.cart).map(([id,q]) => { const m=M(id); return m?{...m,qty:q,lt:m.brik*q,ls:m.save*q}:null; }).filter(Boolean);
const supTot = () => lines().reduce((s,l)=>s+l.supplier*l.qty,0);
const grand = () => lines().reduce((s,l)=>s+l.lt,0);
const saveTot = () => lines().reduce((s,l)=>s+l.ls,0);
const count = () => lines().reduce((s,l)=>s+l.qty,0);

function setQty(id,q){ q=Math.max(0,Math.floor(q||0)); if(q===0)delete S.cart[id]; else S.cart[id]=q; render(); }
function bump(id,d){ setQty(id,(S.cart[id]||0)+d); }
function addPack(pid){ const p=S.packs.find(x=>x.id===pid); if(!p)return; for(const[id,q]of Object.entries(p.items))S.cart[id]=(S.cart[id]||0)+q; toast(`${p.name} pack added`); render(); }
function go(v){ S.view=v; closeSidebar(); window.scrollTo(0,0); render(); }
function setSlot(s){ S.slot=s; renderModal(); }
function toggleAdd(){ S.adding=!S.adding; render(); }
function openSidebar(){ $("sidebar").classList.add("open"); $("overlay").classList.add("show"); }
function closeSidebar(){ $("sidebar").classList.remove("open"); $("overlay").classList.remove("show"); }
function openReview(){ if(count()===0)return; renderModal(); $("reviewModal").classList.add("open"); }
function closeReview(){ $("reviewModal").classList.remove("open"); }
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2400); }

async function createProject(){
  const name=$("npName").value.trim(), site=$("npSite").value.trim();
  if(!name)return;
  if(S.offline){ const id="p"+Date.now().toString(36); S.projects.push({id,name,site}); S.active=id; }
  else{ const r=await api("/api/projects",{method:"POST",body:JSON.stringify({name,site})}); S.projects.push(r.project); S.active=r.project.id; }
  S.adding=false; toast("Project created"); render();
}
async function placeOrder(){
  const items=lines().map(l=>({id:l.id,qty:l.qty})); if(!items.length)return;
  try{
    if(S.offline){
      S.orders.unshift({ id:"BRK-"+Date.now().toString().slice(-6), total:grand(), save:saveTot(), slot:S.slot, statusIdx:1,
        date:new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
        project:(S.projects.find(p=>p.id===S.active)||{}).name||"No project", site:"",
        items:lines().map(l=>({name:l.name,qty:l.qty,unit:l.unit})) });
    } else {
      await api("/api/orders",{method:"POST",body:JSON.stringify({projectId:S.active||null,slot:S.slot,items})});
      await loadOrders();
    }
    S.cart={}; closeReview(); toast("Order placed · we'll confirm your slot"); go("orders");
  }catch(e){ toast("Could not place order: "+e.message); }
}
function reorder(id){ const o=S.orders.find(x=>x.id===id); if(!o)return; S.cart={}; o.items.forEach(it=>{const m=S.materials.find(x=>x.name===it.name); if(m)S.cart[m.id]=it.qty;}); toast("Items added to cart"); go("materials"); }

async function loadOrders(){ try{ const r=await api("/api/orders"); S.orders=r.orders; }catch(e){} }
async function boot(){
  try{
    const [m,p]=await Promise.all([api("/api/materials"),api("/api/packs")]);
    S.materials=m.materials; S.packs=p.packs;
    try{ const pr=await api("/api/projects"); S.projects=pr.projects; if(pr.projects[0])S.active=pr.projects[0].id; }catch(e){}
    await loadOrders();
  }catch(e){ S.offline=true; S.materials=FB; S.packs=FB_PACKS; }
  S.loading=false; render();
}

/* ── RENDER ── */
function render(){
  // topbar
  $("tbTitle").textContent = VIEWS[S.view].title;
  $("tbSub").textContent = S.offline ? "Briq · Jinja · sample data" : "Briq · Jinja";
  // cart top button (desktop)
  const ct=$("cartTop");
  if(count()>0){ ct.style.display="inline-flex"; ct.innerHTML=`${I("cart",14)} ${fmt(grand())} · ${count()}`; }
  else ct.style.display="none";
  // sidebar nav
  $("sbNav").innerHTML = `<div class="nav-section">Browse</div>` + Object.keys(VIEWS).map(v=>{
    const badge = (v==="materials"&&count()>0)?`<span class="nav-badge">${count()}</span>`:(v==="orders"&&S.orders.length?`<span class="nav-badge">${S.orders.length}</span>`:"");
    return `<button class="nav-item ${S.view===v?"active":""}" onclick="go('${v}')"><span class="nav-icon">${I(VIEWS[v].icon,14)}</span><span class="nav-label">${VIEWS[v].title}</span>${badge}</button>`;
  }).join("");
  // project panel
  renderProjectPanel();
  // bottom nav
  $("bottomNav").innerHTML = `<div class="bn-row">` + Object.keys(VIEWS).map(v=>{
    const badge=(v==="materials"&&count()>0)?`<span class="bn-badge">${count()}</span>`:"";
    return `<button class="bn-item ${S.view===v?"on":""}" onclick="go('${v}')"><span class="bi">${I(VIEWS[v].icon,21)}${badge}</span>${VIEWS[v].title}</button>`;
  }).join("") + `</div>`;
  // cart bar (mobile)
  $("cartBar").innerHTML = count()>0 ? `<div class="in" onclick="openReview()"><div class="c1"><b>${fmt(grand())}</b><span>${count()} item${count()>1?"s":""} · save ${fmt(saveTot())}</span></div><div class="go">Review ${I("check",15)}</div></div>` : "";
  // content
  const c=$("content");
  if(S.view==="materials") c.innerHTML=viewMaterials();
  else if(S.view==="orders") c.innerHTML=viewOrders();
  else c.innerHTML=viewWhy();
}

function renderProjectPanel(){
  const sel = S.projects.length
    ? `<select class="psel" onchange="S.active=this.value">${S.projects.map(p=>`<option value="${p.id}" ${p.id===S.active?"selected":""}>${p.name}</option>`).join("")}</select>`
    : `<div class="panel-note">No project yet. Add one to group your orders by site.</div>`;
  const form = S.adding
    ? `<div class="pform"><input id="npName" placeholder="Project name (e.g. Wanyange duplex)"><input id="npSite" placeholder="Site (e.g. Plot 14, Wanyange)"><button class="btn btn-green btn-sm" onclick="createProject()">Save project</button></div>` : "";
  $("projPanel").innerHTML = `<div class="panel-title">Project</div>${sel}<button class="btn btn-sm" style="width:100%;justify-content:center" onclick="toggleAdd()">${S.adding?"Cancel":"+ New project"}</button>${form}`;
}

function viewMaterials(){
  const packs = S.packs.map(p=>{
    const tot=Object.entries(p.items).reduce((s,[id,q])=>{const m=M(id);return s+(m?m.brik*q:0);},0);
    return `<button class="pack" onclick="addPack('${p.id}')"><div class="pc">${I("spark",16)}</div><b>${p.name}</b><span>${p.note}</span><em>≈ ${fmt(tot)} · add</em></button>`;
  }).join("");
  const groups = GROUPS.map(g=>{
    const rows = S.materials.filter(m=>m.group===g).map(m=>{
      const q=S.cart[m.id]||0;
      const ctrl = q===0
        ? `<button class="add-btn" onclick="bump('${m.id}',1)" aria-label="Add ${m.name}">${I("plus",17)}</button>`
        : `<div class="qbox"><button onclick="bump('${m.id}',-1)">${I("minus",15)}</button><input value="${q}" inputmode="numeric" onchange="setQty('${m.id}',parseInt(this.value.replace(/\\D/g,''))||0)"><button onclick="bump('${m.id}',1)">${I("plus",15)}</button></div>`;
      return `<div class="mrow"><div class="m-icon ${ACC[g]}">${I(GICON[g],18)}</div>
        <div class="m-info"><div class="m-name">${m.name} ${m.verified?`<span class="pill pill-green">${I("check",11)}Verified</span>`:""}</div>
        <div class="m-spec">${m.spec}</div>
        <div class="m-price"><b>${fmt(m.brik)}</b> / ${m.unit} <span class="m-save">save ${sh(m.save)}</span></div></div>${ctrl}</div>`;
    }).join("");
    return `<div class="card"><div class="card-head"><div class="card-title"><span class="ci m-icon ${ACC[g]}" style="width:28px;height:28px">${I(GICON[g],15)}</span>${g}</div></div>${rows}</div>`;
  }).join("");
  return `${S.offline?`<div class="info-banner">${I("box",17)}<div class="info-banner-text">Showing sample data — backend not reachable right now.</div></div>`:`<div class="info-banner">${I("shield",17)}<div class="info-banner-text">Engineer-verified materials, priced openly, delivered to site. Pay on delivery.</div></div>`}
    <div class="card-title" style="margin:4px 2px 12px">Quick packs</div>
    <div class="pack-rail">${packs}</div>
    ${groups}`;
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
    <div class="card-title" style="margin:2px 2px 12px">Recent orders</div>${cards}`;
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
  const slots=SLOTS.map(s=>`<button class="slot ${S.slot===s?"on":""}" onclick="setSlot('${s}')">${s}</button>`).join("");
  const sv=saveTot()>0?`<div class="tot sv"><span>You save vs retail</span><span>${fmt(saveTot())}</span></div>`:"";
  $("reviewCard").innerHTML = `<div class="modal-head"><div class="modal-title">Review order</div><button class="modal-close" onclick="closeReview()">×</button></div>
    <div class="modal-body">${ls}
      <div style="margin-top:8px"><div class="tot"><span>Supplier cost</span><span>${fmt(supTot())}</span></div>
      <div class="tot"><span>Briq fee (${Math.round(FEE*100)}%)</span><span>${fmt(grand()-supTot())}</span></div>${sv}
      <div class="tot grand"><span>Total</span><span>${fmt(grand())}</span></div></div>
      <div class="form-label" style="margin:18px 0 9px">Delivery slot</div><div class="slot-grid">${slots}</div>
      <button class="btn btn-green btn-block" style="margin-top:18px" onclick="placeOrder()">Place order</button>
      <p style="text-align:center;font-size:.72rem;font-weight:600;color:var(--muted);margin-top:12px">No deposit · pay on delivery · wrong spec replaced free</p></div>`;
}

Object.assign(window,{go,bump,setQty,addPack,toggleAdd,createProject,openReview,closeReview,setSlot,placeOrder,reorder,openSidebar,closeSidebar,S});
boot();

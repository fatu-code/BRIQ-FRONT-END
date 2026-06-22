/* Brik frontend — vanilla, talks to the Express API. */
const API = (window.BRIK_CONFIG && window.BRIK_CONFIG.API_BASE) || "http://localhost:4000";
const FEE = 0.06;
const SLOTS = ["Tomorrow AM", "Tomorrow PM", "In 2 days AM", "In 2 days PM"];
const STATUS = ["Placed", "Confirming", "Out for delivery", "Delivered"];
const GROUPS = ["Cement", "Steel", "Blocks", "Aggregates", "Roofing"];
const META = {
  Cement: { accent: "amber", icon: "cement" }, Steel: { accent: "blue", icon: "steel" },
  Blocks: { accent: "green", icon: "block" }, Aggregates: { accent: "teal", icon: "aggregate" },
  Roofing: { accent: "violet", icon: "roof" },
};
const FG = { green: "var(--gfg)", blue: "var(--bfg)", amber: "var(--afg)", teal: "var(--tfg)", violet: "var(--vfg)" };
const BG = { green: "var(--g50)", blue: "var(--b50)", amber: "var(--a50)", teal: "var(--t50)", violet: "var(--v50)" };

// fallback catalogue so the UI renders even if the API is unreachable
const FALLBACK = [
  ["cem-hima","Cement — Hima","50kg · OPC 42.5N","Cement","bag",38000,44000,true],
  ["cem-tororo","Cement — Tororo","50kg · OPC 42.5N","Cement","bag",36000,42000,true],
  ["bar-y10","Iron bar Y10","10mm deformed · 12m","Steel","length",27000,32000,true],
  ["bar-y12","Iron bar Y12","12mm deformed · 12m","Steel","length",38000,44000,true],
  ["bar-y16","Iron bar Y16","16mm deformed · 12m","Steel","length",68000,78000,true],
  ["brc","BRC mesh A142","Standard sheet","Steel","sheet",95000,110000,true],
  ["wire","Binding wire","Galvanised · per kg","Steel","kg",6500,7800,false],
  ["block-6",'Hollow block 6"',"Vibrated · 400×200×150","Blocks","block",2200,2600,true],
  ["block-9",'Hollow block 9"',"Vibrated · 400×200×225","Blocks","block",3000,3500,true],
  ["sand-river","River sand","Concrete sand · per tonne","Aggregates","tonne",45000,53000,false],
  ["sand-lake","Plaster sand","Fine lake sand · per tonne","Aggregates","tonne",60000,70000,false],
  ["ballast","Aggregate / ballast",'3/4" stone · per tonne',"Aggregates","tonne",75000,88000,true],
  ["hardcore","Hardcore","Foundation fill · per tonne","Aggregates","tonne",35000,41000,false],
  ["sheet-28","Iron sheets G28","Box profile · 3m","Roofing","sheet",38000,45000,false],
  ["nails","Nails","Assorted · per kg","Roofing","kg",6000,7200,false],
].map(([id,name,spec,group,unit,supplier,retail,verified]) => {
  const brik = Math.round(supplier * (1 + FEE));
  return { id, name, spec, group, unit, supplier, retail, verified, brik, fee: Math.round(supplier*FEE), save: retail - brik };
});
const FALLBACK_PACKS = [
  { id:"foundation", name:"Foundation", note:"Strip footing", items:{ "cem-hima":20, hardcore:6, ballast:4, "sand-river":4, "bar-y12":15, wire:3 } },
  { id:"slab", name:"Slab", note:"Suspended floor", items:{ "cem-hima":25, ballast:5, "sand-river":4, "bar-y12":20, brc:8, wire:4 } },
  { id:"walling", name:"Walling", note:"Block work", items:{ "block-9":400, "cem-hima":15, "sand-lake":6, "bar-y10":10 } },
  { id:"roofing", name:"Roofing", note:"Iron sheet cover", items:{ "sheet-28":40, nails:10 } },
];

// client identity (device id)
let clientId = localStorage.getItem("brik-client");
if (!clientId) { clientId = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("brik-client", clientId); }

const S = { tab:"materials", cart:{}, materials:[], packs:[], projects:[], active:"", orders:[], slot:SLOTS[0], confirmed:null, loading:true, adding:false, offline:false, reviewing:false };

const fmt = (n) => "UGX " + Math.round(n).toLocaleString("en-UG");
const sh = (n) => Math.round(n).toLocaleString("en-UG");
const mat = (id) => S.materials.find((m) => m.id === id);

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-client-id": clientId, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function icon(name, size = 22) {
  const P = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    receipt:'<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h6"/>',
    shield:'<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    check:'<path d="M5 12l4.5 4.5L19 7"/>', plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
    cement:'<path d="M6 8l1-3h10l1 3"/><rect x="5" y="8" width="14" height="12" rx="2"/><path d="M9 13h6"/>',
    steel:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    block:'<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M9 6v12M15 6v12"/>',
    aggregate:'<circle cx="8" cy="9" r="2.4"/><circle cx="15" cy="11" r="2.4"/><circle cx="11" cy="16" r="2.4"/>',
    roof:'<path d="M3 11l9-6 9 6"/><path d="M5 10v9h14v-9"/>',
    truck:'<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    spark:'<path d="M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4z"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[name]||""}</svg>`;
}

// ---- derived ----
function lines() {
  return Object.entries(S.cart).map(([id, q]) => {
    const m = mat(id); if (!m) return null;
    return { ...m, qty: q, lineTotal: m.brik * q, lineSave: m.save * q };
  }).filter(Boolean);
}
const supplierTotal = () => lines().reduce((s, l) => s + l.supplier * l.qty, 0);
const grand = () => lines().reduce((s, l) => s + l.lineTotal, 0);
const saveTotal = () => lines().reduce((s, l) => s + l.lineSave, 0);
const count = () => lines().reduce((s, l) => s + l.qty, 0);

// ---- mutations ----
function setQty(id, q) { q = Math.max(0, Math.floor(q || 0)); if (q === 0) delete S.cart[id]; else S.cart[id] = q; render(); }
function bump(id, d) { setQty(id, (S.cart[id] || 0) + d); }
function addPack(pid) { const pk = S.packs.find((p) => p.id === pid); if (!pk) return; for (const [id, q] of Object.entries(pk.items)) S.cart[id] = (S.cart[id] || 0) + q; render(); }
function setTab(t) { S.tab = t; S.confirmed = null; render(); }
function setSlot(s) { S.slot = s; render(); }
function toggleAdd() { S.adding = !S.adding; render(); }
function openReview() { S.reviewing = true; render(); }
function closeReview() { S.reviewing = false; render(); }

async function createProject() {
  const name = document.getElementById("np-name").value.trim();
  const site = document.getElementById("np-site").value.trim();
  if (!name) return;
  if (S.offline) { const id = "p" + Date.now().toString(36); S.projects.push({ id, name, site }); S.active = id; }
  else { const r = await api("/api/projects", { method: "POST", body: JSON.stringify({ name, site }) }); S.projects.push(r.project); S.active = r.project.id; }
  S.adding = false; render();
}

async function placeOrder() {
  const items = lines().map((l) => ({ id: l.id, qty: l.qty }));
  if (!items.length) return;
  let order;
  if (S.offline) {
    order = { id: "BRK-" + Date.now().toString().slice(-6), total: grand(), save: saveTotal(), slot: S.slot, status: "Confirming", statusIdx: 1,
      date: new Date().toLocaleDateString("en-GB", { day:"numeric", month:"short" }),
      project: (S.projects.find(p=>p.id===S.active)||{}).name || "No project", site:"",
      items: lines().map(l => ({ name:l.name, qty:l.qty, unit:l.unit })) };
    S.orders.unshift(order);
  } else {
    const r = await api("/api/orders", { method: "POST", body: JSON.stringify({ projectId: S.active || null, slot: S.slot, items }) });
    order = r;
    await loadOrders();
  }
  S.cart = {}; S.reviewing = false; S.confirmed = order; render();
}

function reorder(id) {
  const o = S.orders.find((x) => x.id === id); if (!o) return;
  S.cart = {}; o.items.forEach((it) => { const m = S.materials.find((x) => x.name === it.name); if (m) S.cart[m.id] = it.qty; });
  S.tab = "materials"; S.confirmed = null; render();
}

// ---- load ----
async function loadOrders() { try { const r = await api("/api/orders"); S.orders = r.orders; } catch (e) {} }
async function boot() {
  try {
    const [m, p] = await Promise.all([api("/api/materials"), api("/api/packs")]);
    S.materials = m.materials; S.packs = p.packs;
    try { const pr = await api("/api/projects"); S.projects = pr.projects; if (pr.projects[0]) S.active = pr.projects[0].id; } catch (e) {}
    await loadOrders();
  } catch (e) {
    S.offline = true; S.materials = FALLBACK; S.packs = FALLBACK_PACKS;
  }
  S.loading = false; render();
}

// ---- render ----
function render() {
  const view = document.getElementById("view");
  if (S.confirmed) view.innerHTML = viewConfirmed();
  else if (S.tab === "materials") view.innerHTML = viewMaterials();
  else if (S.tab === "orders") view.innerHTML = viewOrders();
  else view.innerHTML = viewWhy();

  document.getElementById("cartbar").innerHTML =
    (count() > 0 && S.tab === "materials" && !S.confirmed)
      ? `<div class="cartbar"><div class="in" onclick="openReview()"><div class="c1"><b>${fmt(grand())}</b><span>${count()} item${count()>1?"s":""} · save ${fmt(saveTotal())}</span></div><div class="go">Review ${icon("check",16)}</div></div></div>` : "";

  document.getElementById("tabs").outerHTML = tabsHTML();   // replace to refresh
  document.getElementById("sheet").innerHTML = S.reviewing ? sheetHTML() : "";
}

function tabsHTML() {
  const t = (id, ic, label) => `<button class="tab ${S.tab===id?"on":""}" onclick="setTab('${id}')"><span class="ic">${icon(ic)}${id==="materials"&&count()>0?`<span class="badge">${count()}</span>`:""}</span>${label}</button>`;
  return `<nav class="tabs" id="tabs">${t("materials","grid","Materials")}${t("orders","receipt","Orders")}${t("why","shield","Why Brik")}</nav>`;
}

function viewMaterials() {
  const proj = S.adding
    ? `<div class="pform"><input id="np-name" placeholder="Project name (e.g. Wanyange duplex)"><input id="np-site" placeholder="Site (e.g. Plot 14, Wanyange)"><button class="btn" style="margin-top:2px" onclick="createProject()">Save project</button></div>` : "";
  const sel = S.projects.length
    ? `<select class="ps" onchange="S.active=this.value">${S.projects.map(p=>`<option value="${p.id}" ${p.id===S.active?"selected":""}>${p.name}</option>`).join("")}</select>`
    : (!S.adding ? `<span style="color:var(--soft);font-size:13.5px">None yet</span>` : "");
  const packs = S.packs.map((pk) => {
    const tot = Object.entries(pk.items).reduce((s,[id,q]) => { const m = mat(id); return s + (m? m.brik*q : 0); }, 0);
    return `<button class="pack" onclick="addPack('${pk.id}')"><div class="pc">${icon("spark",18)}</div><b>${pk.name}</b><span>${pk.note}</span><em>≈ ${fmt(tot)}</em></button>`;
  }).join("");
  const groups = GROUPS.map((g) => {
    const items = S.materials.filter((m) => m.group === g).map((m) => {
      const q = S.cart[m.id] || 0, a = META[g].accent;
      const stepper = q === 0
        ? `<button class="add" onclick="bump('${m.id}',1)" aria-label="Add">${icon("plus",18)}</button>`
        : `<div class="stp"><div class="qbox"><button onclick="bump('${m.id}',-1)">${icon("minus",16)}</button><input value="${q}" inputmode="numeric" onchange="setQty('${m.id}',parseInt(this.value.replace(/\\D/g,''))||0)"><button onclick="bump('${m.id}',1)">${icon("plus",16)}</button></div></div>`;
      return `<div class="item"><div class="acc" style="background:${FG[a]}"></div><div class="chip" style="background:${BG[a]};color:${FG[a]}">${icon(META[g].icon,21)}</div>
        <div class="info"><div class="nm">${m.name}${m.verified?`<span class="vtag">${icon("check",11)}Verified</span>`:""}</div><div class="sp">${m.spec}</div>
        <div class="pr"><b>${fmt(m.brik)}</b> / ${m.unit} <span class="save">save ${sh(m.save)}</span></div></div>${stepper}</div>`;
    }).join("");
    return `<div class="seclbl">${g}</div>${items}`;
  }).join("");
  return `<div class="scroll fade">
    ${S.offline ? `<div class="banner">Showing sample data — start the backend to go live.</div>` : ""}
    <div class="trust">${icon("shield",17)}Engineer-verified materials · pay on delivery · we deliver to site</div>
    <div class="proj"><span class="pl">Project</span>${sel}<button class="addp" onclick="toggleAdd()">${S.adding?"Cancel":"+ New"}</button>${proj}</div>
    <div class="seclbl">Quick packs · your stage, pre-loaded</div>
    <div class="packs">${packs}</div>
    ${groups}
  </div>`;
}

function viewOrders() {
  if (S.loading) return `<div class="scroll fade"><div class="empty">Loading…</div></div>`;
  if (!S.orders.length) return `<div class="scroll fade"><div class="empty"><div class="ei">${icon("receipt",26)}</div>No orders yet. Your orders will live here, ready to reorder in a tap.</div></div>`;
  const cum = S.orders.reduce((s,o)=>s+(o.save||0),0);
  const moved = S.orders.reduce((s,o)=>s+o.items.reduce((a,it)=>a+it.qty,0),0);
  const cards = S.orders.map((o) => {
    const track = STATUS.map((_,i)=>`${i>0?`<div class="seg ${i<=o.statusIdx?"on":""}"></div>`:""}<div class="dot ${i<=o.statusIdx?"on":""}"></div>`).join("");
    const labs = STATUS.map((s,i)=>`<span class="${i===o.statusIdx?"now":""}">${s}</span>`).join("");
    const its = o.items.map((it)=>`<div class="oi">${it.qty} × ${it.name} <span>(${it.unit})</span></div>`).join("");
    return `<div class="ocard"><div class="oh"><span class="oid">${o.id}</span><span class="ost">${STATUS[o.statusIdx]}</span></div>
      <div class="opj">${o.project||"No project"}${o.site?` · ${o.site}`:""} · ${o.date||""} · ${o.slot||""}</div>
      <div class="track">${track}</div><div class="tlab">${labs}</div>${its}
      <div class="ofoot"><div class="t"><b>${fmt(o.total)}</b>${o.save>0?`<span>saved ${fmt(o.save)}</span>`:""}</div><button class="reord" onclick="reorder('${o.id}')">Reorder</button></div></div>`;
  }).join("");
  return `<div class="scroll fade">
    <div class="hero"><div class="hl">SAVED WITH BRIK</div><div class="hv">${fmt(cum)}</div><div class="hs">vs buying at retail, across ${S.orders.length} order${S.orders.length>1?"s":""}</div></div>
    <div class="stats">
      <div class="stat"><div class="bar" style="background:var(--bfg)"></div><div class="si" style="background:var(--b50);color:var(--bfg)">${icon("receipt",19)}</div><div class="sv">${S.orders.length}</div><div class="sl">Orders</div></div>
      <div class="stat"><div class="bar" style="background:var(--afg)"></div><div class="si" style="background:var(--a50);color:var(--afg)">${icon("truck",19)}</div><div class="sv">${moved}</div><div class="sl">Items moved</div></div>
    </div>
    <div class="seclbl">Recent orders</div>${cards}</div>`;
}

function viewWhy() {
  return `<div class="scroll fade why">
    <h2>Your materials. Verified by an engineer. Delivered to site.</h2>
    <p class="sub">Order in two minutes. Every load quality-checked, priced openly, dropped at your site on a slot you confirm.</p>
    <div class="vrow"><div class="vi">${icon("shield",20)}</div><div><b>Engineer-verified quality</b><p>We measure the bars and check the cement. Fake and underweight never reach your site.</p></div></div>
    <div class="vrow"><div class="vi">${icon("spark",20)}</div><div><b>Transparent pricing, below retail</b><p>You see our fee on every item, and still pay less than buying alone.</p></div></div>
    <div class="vrow"><div class="vi">${icon("truck",20)}</div><div><b>We handle sourcing and delivery</b><p>You order, we run the rest to your site. Pay on delivery, no deposit.</p></div></div>
    <div class="gbox"><b>The Brik Guarantee</b><p>If any material fails spec or arrives wrong, we replace it free. You never pay for a mistake.</p></div>
    <button class="btn" onclick="setTab('materials')">Start an order</button></div>`;
}

function viewConfirmed() {
  const o = S.confirmed;
  return `<div class="scroll done fade"><div class="seal">${icon("check",34)}</div>
    <h2>Order ${o.id} placed</h2>
    <p>We're confirming your slot (${o.slot}) and will message you the time. Pay on delivery, nothing upfront.</p>
    ${o.save>0?`<div class="svp">You saved ${fmt(o.save)} vs retail</div>`:""}
    <div class="doneb"><button class="g" onclick="setTab('materials')">Order again</button><button class="p" onclick="setTab('orders')">Track order</button></div></div>`;
}

function sheetHTML() {
  const ls = lines().map((l)=>`<div class="line"><div><div class="ln">${l.name}</div><div class="lq">${l.qty} × ${fmt(l.brik)} / ${l.unit}</div></div><div class="lp">${fmt(l.lineTotal)}</div></div>`).join("");
  const slots = SLOTS.map((s)=>`<button class="slot ${S.slot===s?"on":""}" onclick="setSlot('${s}')">${s}</button>`).join("");
  const sv = saveTotal()>0?`<div class="trow sv"><span>You save vs retail</span><span>${fmt(saveTotal())}</span></div>`:"";
  return `<div class="scrim" onclick="if(event.target.classList.contains('scrim'))closeReview()"><div class="sheet">
    <div class="shead"><h2>Review order</h2><button class="x" onclick="closeReview()">×</button></div>
    <div class="sbody">${ls}
      <div class="totals"><div class="trow"><span>Supplier cost</span><span>${fmt(supplierTotal())}</span></div>
      <div class="trow"><span>Brik fee (${Math.round(FEE*100)}%)</span><span>${fmt(grand()-supplierTotal())}</span></div>${sv}
      <div class="trow gr"><span>Total</span><span>${fmt(grand())}</span></div></div>
      <div class="flabel">Delivery slot</div><div class="slots">${slots}</div>
      <button class="btn" onclick="placeOrder()">Place order</button>
      <p class="reassure">No deposit · pay on delivery · wrong spec or it fails, replaced free</p></div></div></div>`;
}

// expose handlers for inline onclick
Object.assign(window, { setTab, bump, setQty, addPack, toggleAdd, createProject, openReview, closeReview, setSlot, placeOrder, reorder, S });

boot();

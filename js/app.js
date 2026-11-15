/* Dosis Bar — application (mode essai local + mode en ligne Supabase) */
"use strict";

/* ================= Configuration ================= */
const CFG = window.DOSIS_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
const sb = CLOUD ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

let MODE = "demo";          // "demo" (tout dans ce navigateur) ou "cloud" (compte en ligne)
let ME = null;              // utilisateur connecté
let ETAB = null;            // {id, nom, role}
const isPatron = () => MODE === "demo" || (ETAB && ETAB.role === "patron");
const isBarman = () => MODE === "cloud" && ETAB && ETAB.role === "barman";

/* ================= Données ================= */
const CATS = {Rhum:"🥃",Whisky:"🥃",Gin:"🍸",Vodka:"🍸",Anisé:"🌿",Bière:"🍺",Vin:"🍷",Soft:"🥤",Jus:"🍊",Sirop:"🍒",Eau:"💧",Autre:"🍶"};
const KEY = "dosisbar.v2", QKEY = "dosisbar.queue", CKEY = "dosisbar.cache", EKEY = "dosisbar.etab", MKEY = "dosisbar.mode";
const SAMPLE_P = [
  {n:"Rhum Ambré Caribe",c:"Rhum",a:1,b:15,cap:70,d:5,s:7,st:2,m:3},
  {n:"Whisky Glenfinil",c:"Whisky",a:1,b:24,cap:70,d:4,s:10,st:5,m:2},
  {n:"Gin Botanique",c:"Gin",a:1,b:22,cap:70,d:4,s:9,st:4,m:2},
  {n:"Vodka Nordik",c:"Vodka",a:1,b:16,cap:70,d:4,s:6.5,st:1,m:2},
  {n:"Pastis Provence",c:"Anisé",a:1,b:14,cap:100,d:2,s:4,st:6,m:2},
  {n:"Bière Artisanale Blonde",c:"Bière",a:1,b:2.4,cap:33,d:33,s:6,st:24,m:24},
  {n:"Coca-Cola 33cl",c:"Soft",a:0,b:0.9,cap:33,d:33,s:4.5,st:48,m:24},
  {n:"Jus d'orange pressé",c:"Jus",a:0,b:3.2,cap:100,d:20,s:4.5,st:6,m:3},
  {n:"Sirop de Grenadine",c:"Sirop",a:0,b:6,cap:100,d:3,s:2.5,st:3,m:1},
  {n:"Eau minérale gazeuse",c:"Eau",a:0,b:1.1,cap:50,d:50,s:4,st:30,m:12}
];
function seed() {
  const t = Date.now();
  const products = SAMPLE_P.map((p, i) => ({id: "d" + (t + i), ...p}));
  const id = n => products.find(p => p.n === n).id;
  const cocktails = [
    {id:"d"+(t+100),n:"Cuba Libre",s:11,x:0.3,ing:[{p:id("Rhum Ambré Caribe"),cl:5},{p:id("Coca-Cola 33cl"),cl:20}]},
    {id:"d"+(t+101),n:"Mojito",s:12,x:0.9,ing:[{p:id("Rhum Ambré Caribe"),cl:5},{p:id("Eau minérale gazeuse"),cl:8}]},
    {id:"d"+(t+102),n:"Gin Tonic",s:12,x:0.8,ing:[{p:id("Gin Botanique"),cl:5}]},
    {id:"d"+(t+103),n:"Virgin Sunrise",s:7,x:0.2,ing:[{p:id("Jus d'orange pressé"),cl:15},{p:id("Sirop de Grenadine"),cl:2}]}
  ];
  const history = [], base = [212,188,264,301,176,342];
  for (let i = 6; i >= 1; i--) { const d = new Date(); d.setDate(d.getDate() - i);
    history.push({date:d.toISOString(),marg:base[6-i],ca:Math.round(base[6-i]*1.55),qty:Math.round(base[6-i]/5.2),demo:true}); }
  return {v:3,bar:"",target:80,target2:65,vol:60,products,cocktails,live:{},history,lastInv:null};
}
function emptyState() { return {v:3,bar:"",target:80,target2:65,vol:60,products:[],cocktails:[],live:{},history:[],lastInv:null,carte:[]}; }
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function loadDemo() {
  const x = lsGet(KEY);
  if (x && Array.isArray(x.products)) {
    // migration depuis le prototype (identifiants numériques)
    x.products.forEach(p => p.id = String(p.id));
    (x.cocktails || []).forEach(k => { k.id = String(k.id); k.ing.forEach(g => g.p = String(g.p)); });
    x.cocktails = x.cocktails || []; x.live = x.live || {}; x.history = x.history || [];
    x.target2 = x.target2 ?? 65; x.v = 3;
    return x;
  }
  return seed();
}
let S = emptyState();
function save() {
  if (MODE === "demo") lsSet(KEY, S);
  else if (ETAB) lsSet(CKEY + "." + ETAB.id, S);
}

/* ================= Outils ================= */
const $ = id => document.getElementById(id);
const num = v => { const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, "")); return isFinite(n) ? n : 0; };
const eur = (v, d = 2) => isFinite(v) ? v.toLocaleString("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d}) + " €" : "—";
const pct = v => isFinite(v) ? Math.round(v).toLocaleString("fr-FR") + " %" : "—";
const f1 = v => (Math.round(v * 10) / 10).toLocaleString("fr-FR");
const f1x = v => v === "" || v == null ? "" : String(Math.round(num(v) * 100) / 100).replace(".", ",");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const byId = id => S.products.find(p => String(p.id) === String(id));
const ceil10 = x => Math.ceil(x * 10 - 1e-9) / 10;
const tone = (r, t = S.target) => r >= t ? "var(--ok)" : r >= t - 10 ? "var(--amber)" : "var(--bad)";
const tgtP = p => p && p.d >= p.cap ? (S.target2 ?? 65) : S.target;
const tgtI = i => i.kind === "p" ? tgtP(i.o) : S.target;
function frErr(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Invalid login credentials/i.test(m)) return "Email ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Confirmez d'abord votre adresse avec le lien reçu par email.";
  if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cet email.";
  if (/Password should be|at least/i.test(m)) return "Mot de passe trop court (8 caractères minimum).";
  if (/rate limit|too many|security purposes/i.test(m)) return "Trop d'essais. Patientez une minute.";
  if (/fetch|network|Load failed|NetworkError/i.test(m)) return "Pas de connexion internet.";
  if (/JWT|session/i.test(m)) return "Session expirée. Reconnectez-vous.";
  return m;
}
const isNetErr = e => !navigator.onLine || /fetch|network|Load failed|NetworkError/i.test((e && e.message) || "");

/* ================= Calculs ================= */
const pcost = (p, cl) => p && p.cap > 0 ? p.b / p.cap * cl : 0;
function prodCalc(p) { const tva = p.a ? .2 : .1, ht = p.s / (1 + tva), cost = pcost(p, p.d), marg = ht - cost;
  return {tva, ht, cost, marg, rate: ht > 0 ? marg / ht * 100 : NaN, alc: !!p.a}; }
function cockCalc(k) { let cost = num(k.x), alc = false;
  k.ing.forEach(i => { const p = byId(i.p); if (p) { cost += pcost(p, i.cl); if (p.a) alc = true; } });
  const tva = alc ? .2 : .1, ht = k.s / (1 + tva), marg = ht - cost;
  return {tva, ht, cost, marg, rate: ht > 0 ? marg / ht * 100 : NaN, alc}; }
function suggest(cost, alc, target) { const ht = cost / (1 - target / 100); return ceil10(ht * (alc ? 1.2 : 1.1)); }
function status(c, p, t = S.target) {
  if (p && p.st < p.m) return ["Stock bas", "b-bad"];
  if (c.rate < t - 10) return ["Marge faible", "b-bad"];
  if (c.rate < t) return ["À ajuster", "b-warn"];
  return ["Rentable", "b-ok"];
}
function allItems() { return [...S.products.map(p => ({key:"p"+p.id,kind:"p",o:p,c:prodCalc(p)})),
                             ...S.cocktails.map(k => ({key:"k"+k.id,kind:"k",o:k,c:cockCalc(k)}))]; }
function opportunities() {
  return allItems().filter(i => i.c.rate < tgtI(i) && i.c.ht > 0).map(i => {
    const t = tgtI(i); let np = suggest(i.c.cost, i.c.alc, t), step = false;
    if (np > i.o.s * 1.2) { np = ceil10(i.o.s * 1.2); step = true; }
    const gainHT = np / (1 + i.c.tva) - i.c.ht;
    return {...i, t, np, step, gainHT, month: gainHT * S.vol};
  }).filter(i => i.gainHT > 0.005).sort((a, b) => b.month - a.month);
}
function scoreData() {
  const it = allItems(), n = it.length || 1;
  const avgRate = it.reduce((s, i) => s + (isFinite(i.c.rate) ? i.c.rate : 0), 0) / n;
  const avgEur = it.reduce((s, i) => s + (isFinite(i.c.marg) ? i.c.marg : 0), 0) / n;
  const np = S.products.length || 1, low = S.products.filter(p => p.st < p.m).length;
  const under = it.filter(i => i.c.rate < tgtI(i)).length;
  const score = it.length ? Math.round(Math.max(0, Math.min(100,
    60 * Math.min(1, it.reduce((s, i) => s + Math.min(1, Math.max(0, i.c.rate || 0) / tgtI(i)), 0) / n)
    + 25 * (1 - low / np) + 15 * (1 - under / n)))) : 0;
  return {avgRate, avgEur, low, under, score, empty: !it.length};
}

/* ================= Dessins : verre et bouteille ================= */
let gid = 0;
const GLASS = "M7 4h26l-3.3 40.4A3 3 0 0 1 26.7 47H13.3a3 3 0 0 1-3-2.6z";
function glass(level, {w = 28, col = "var(--amber)", wave = false} = {}) {
  const id = "gl" + (++gid), l = Math.max(0, Math.min(1, level || 0)), y = 46 - 41 * l;
  const liquid = wave
    ? `<g class="liquid" style="transform:translateY(${y}px)"><path class="wave" fill="${col}" d="M-40 0q5 -2.4 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0V60H-40z"/></g>`
    : `<rect x="0" y="${y}" width="40" height="50" fill="${col}"/><rect x="0" y="${y}" width="40" height="1.4" fill="#fff" opacity=".28"/>`;
  return `<svg width="${w}" height="${w*1.25}" viewBox="0 0 40 50" aria-hidden="true"><defs><clipPath id="${id}"><path d="${GLASS}"/></clipPath></defs><g clip-path="url(#${id})"><rect width="40" height="50" fill="rgba(244,237,228,.05)"/>${liquid}</g><path d="${GLASS}" fill="none" stroke="rgba(244,237,228,.4)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
const BOTTLE = "M16.5 2h7v7.5c0 2.4 6.5 4 6.5 10.5v23a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V20c0-6.5 6.5-8.1 6.5-10.5z";
function bottle(level, col) { const id = "bt" + (++gid), l = Math.max(0, Math.min(1, level)), y = 47 - 33 * l;
  return `<svg width="30" height="38" viewBox="0 0 40 50" aria-hidden="true"><defs><clipPath id="${id}"><path d="${BOTTLE}"/></clipPath></defs><g clip-path="url(#${id})"><rect width="40" height="50" fill="rgba(244,237,228,.05)"/><rect x="0" y="${y}" width="40" height="50" fill="${col}"/></g><path d="${BOTTLE}" fill="none" stroke="rgba(244,237,228,.4)" stroke-width="1.6" stroke-linejoin="round"/></svg>`; }

/* ================= Base en ligne : lecture ================= */
const fromDbP = r => ({id:r.id,n:r.nom,c:r.categorie,a:r.alcool?1:0,b:+r.prix_achat_ht,cap:+r.contenance_cl,d:+r.dose_cl,s:+r.prix_vente_ttc,st:+r.stock,m:+r.stock_min,code:r.code_barre||""});
const toDbP = p => ({etab_id:ETAB.id,nom:p.n,categorie:p.c,alcool:!!p.a,prix_achat_ht:p.b,contenance_cl:p.cap,dose_cl:p.d,
  prix_vente_ttc:p.s,stock:Math.round(p.st*1000)/1000,stock_min:p.m,code_barre:p.code||null,modifie_le:new Date().toISOString()});
async function q(promise) { const r = await promise; if (r.error) throw r.error; return r.data; }
let lastLoad = 0;
async function loadCloud() {
  const e = ETAB.id;
  if (isBarman()) {
    const carte = await q(sb.rpc("carte_service", {p_etab: e}));
    S.carte = carte.map(r => ({key: r.item_type + r.item_id, kind: r.item_type, n: r.nom, c: r.categorie, s: +r.prix_ttc, dispo: r.disponible}));
  } else {
    const [et, pr, ck, sv, inv] = await Promise.all([
      q(sb.from("etablissements").select("*").eq("id", e).single()),
      q(sb.from("produits").select("*").eq("etab_id", e).order("nom")),
      q(sb.from("cocktails").select("*").eq("etab_id", e).order("nom")),
      q(sb.from("services").select("ouvert_le,ca_ttc,marge_ht,verres").eq("etab_id", e).not("clos_le", "is", null).order("ouvert_le", {ascending: false}).limit(14)),
      q(sb.from("inventaires").select("le,perte_ventes_ht").eq("etab_id", e).order("le", {ascending: false}).limit(1))]);
    const ci = ck.length ? await q(sb.from("cocktail_ingredients").select("cocktail_id,produit_id,cl").in("cocktail_id", ck.map(c => c.id))) : [];
    Object.assign(S, {bar: et.nom, target: et.objectif_spiritueux, target2: et.objectif_bouteilles, vol: et.volume_mois,
      products: pr.map(fromDbP),
      cocktails: ck.map(c => ({id:c.id,n:c.nom,s:+c.prix_vente_ttc,x:+c.extras_ht,
        ing: ci.filter(i => i.cocktail_id === c.id).map(i => ({p:i.produit_id,cl:+i.cl}))})),
      history: sv.reverse().map(s => ({date:s.ouvert_le,marg:+s.marge_ht,ca:+s.ca_ttc,qty:s.verres})),
      lastInv: inv[0] ? {date: inv[0].le, loss: +inv[0].perte_ventes_ht} : null});
    S.alias = et.alias_caisse || {};
    ETAB.nom = et.nom;
  }
  await refreshLive();
  lastLoad = Date.now(); save(); setSync("ok");
}
async function refreshLive() {
  if (MODE !== "cloud" || queueLen()) return;
  const r = await q(sb.rpc("service_en_cours", {p_etab: ETAB.id}));
  S.live = r.items || {};
}
async function bgReload() {
  if (MODE !== "cloud" || !navigator.onLine || Date.now() - lastLoad < 20000) return;
  try { await loadCloud(); render(); } catch (e) { if (isNetErr(e)) setSync("off"); }
}

/* ================= File d'attente des ventes (hors ligne) ================= */
const queue = () => lsGet(QKEY) || [];
const queueLen = () => queue().length;
let flushing = false;
async function flush() {
  if (flushing || MODE !== "cloud") return;
  flushing = true;
  try {
    let Q = queue();
    while (Q.length) {
      const it = Q[0];
      try {
        await q(sb.rpc("vendre", {p_etab: it.e, p_type: it.t, p_id: it.id, p_delta: it.d}));
      } catch (e) {
        if (isNetErr(e)) { setSync("off"); break; }
        toast(frErr(e));               // erreur métier : on abandonne cette vente
      }
      Q = queue(); Q.shift(); lsSet(QKEY, Q);
    }
    if (!Q.length) setSync("ok");
  } finally { flushing = false; }
}
window.addEventListener("online", () => { flush(); bgReload(); });
window.addEventListener("offline", () => setSync("off"));
function setSync(s) {
  const el = $("sync"); if (!el) return;
  el.hidden = MODE !== "cloud";
  const n = queueLen();
  el.className = "sync" + (s === "off" ? " off" : s === "err" ? " err" : "");
  el.textContent = s === "off" ? (n ? `Hors ligne · ${n} en attente` : "Hors ligne") : s === "err" ? "Erreur" : "Synchronisé";
}

/* ================= Actions (écrivent en local ou en ligne) ================= */
async function act(fn, okMsg) {
  try { await fn(); save(); render(); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast(frErr(e)); if (isNetErr(e)) setSync("off"); return false; }
}
const cloud = () => MODE === "cloud";
async function actSaveProduct(id, x) {
  if (cloud()) {
    if (id) { await q(sb.from("produits").update(toDbP(x)).eq("id", id)); Object.assign(byId(id), x); }
    else { const r = await q(sb.from("produits").insert(toDbP(x)).select().single()); S.products.unshift(fromDbP(r)); }
  } else { if (id) Object.assign(byId(id), x); else S.products.unshift({id: "d" + Date.now(), ...x}); }
}
async function actDeleteProduct(id) {
  if (cloud()) await q(sb.from("produits").delete().eq("id", id));
  S.products = S.products.filter(x => x.id !== id);
  S.cocktails.forEach(k => k.ing = k.ing.filter(g => g.p !== id));
  delete S.live["p" + id];
}
async function actSaveCocktail(id, x) {
  if (cloud()) {
    const row = {etab_id: ETAB.id, nom: x.n, prix_vente_ttc: x.s, extras_ht: x.x, modifie_le: new Date().toISOString()};
    let cid = id;
    if (id) await q(sb.from("cocktails").update(row).eq("id", id));
    else cid = (await q(sb.from("cocktails").insert(row).select("id").single())).id;
    await q(sb.from("cocktail_ingredients").delete().eq("cocktail_id", cid));
    if (x.ing.length) await q(sb.from("cocktail_ingredients").insert(x.ing.map(g => ({cocktail_id: cid, produit_id: g.p, cl: g.cl}))));
    if (id) Object.assign(S.cocktails.find(c => c.id === id), x); else S.cocktails.unshift({id: cid, ...x});
  } else { if (id) Object.assign(S.cocktails.find(c => c.id === id), x); else S.cocktails.unshift({id: "d" + Date.now(), ...x}); }
}
async function actDeleteCocktail(id) {
  if (cloud()) await q(sb.from("cocktails").delete().eq("id", id));
  S.cocktails = S.cocktails.filter(c => c.id !== id); delete S.live["k" + id];
}
async function actSetPrices(list) { // [{kind, o, price}]
  if (cloud()) for (const it of list)
    await q(sb.from(it.kind === "p" ? "produits" : "cocktails").update({prix_vente_ttc: it.price, modifie_le: new Date().toISOString()}).eq("id", it.o.id));
  list.forEach(it => it.o.s = it.price);
}
async function actSetCode(id, code) {
  if (cloud()) await q(sb.from("produits").update({code_barre: code, modifie_le: new Date().toISOString()}).eq("id", id));
  byId(id).code = code; save();
}
const stockTimers = {};
function actStock(id, st) {
  const p = byId(id); p.st = Math.max(0, st); save();
  if (!cloud()) return;
  clearTimeout(stockTimers[id]);
  stockTimers[id] = setTimeout(async () => {
    try { await q(sb.from("produits").update({stock: Math.round(p.st * 1000) / 1000, modifie_le: new Date().toISOString()}).eq("id", id)); setSync("ok"); }
    catch (e) { toast(frErr(e)); if (isNetErr(e)) setSync("off"); }
  }, 600);
}
async function actInventory(counts, loss, details) {
  if (cloud()) {
    for (const [id, st] of counts) await q(sb.from("produits").update({stock: Math.round(st * 1000) / 1000}).eq("id", id));
    await q(sb.from("inventaires").insert({etab_id: ETAB.id, fait_par: ME.id, perte_ventes_ht: Math.round(loss * 100) / 100, details}));
  }
  counts.forEach(([id, st]) => byId(id).st = st);
  S.lastInv = {date: new Date().toISOString(), loss};
}
async function actImport(list, dateISO, ref, aliases) {
  const le = new Date(dateISO + "T23:00:00");
  let res;
  if (cloud()) {
    res = await q(sb.rpc("importer_ventes", {p_etab: ETAB.id, p_le: le.toISOString(), p_ref: ref,
      p_items: list.map(x => ({t: x.key[0], id: x.key.slice(1), q: x.q, ttc: x.hasTtc ? x.ttc : null}))}));
    await q(sb.from("etablissements").update({alias_caisse: aliases}).eq("id", ETAB.id));
    S.alias = aliases; lastLoad = 0;
    try { await loadCloud(); } catch (e) {}
    return {ca: +res.ca_ttc, ht: +res.ca_ht, marg: +res.marge_ht, qty: +res.verres};
  }
  S.importRefs = S.importRefs || [];
  if (S.importRefs.includes(ref)) throw new Error("Ce fichier a déjà été importé");
  res = importEstimate(list);
  list.forEach(x => consume(x.key, x.q));
  S.history.push({date: le.toISOString(), marg: res.marg, ca: res.ca, qty: res.qty});
  S.history.sort((a, b) => new Date(a.date) - new Date(b.date)); S.history = S.history.slice(-14);
  S.importRefs.push(ref); S.alias = aliases; save();
  return res;
}
function importEstimate(list) {
  let ca = 0, ht = 0, marg = 0, qty = 0;
  list.forEach(x => { const i = allItems().find(a => a.key === x.key); if (!i) return;
    const unit = x.hasTtc && x.q ? x.ttc / x.q : i.o.s, h = unit / (1 + i.c.tva);
    ca += unit * x.q; ht += h * x.q; marg += (h - i.c.cost) * x.q; qty += x.q; });
  return {ca, ht, marg, qty};
}
async function actSettings(x) {
  if (cloud()) {
    await q(sb.from("etablissements").update({nom: x.bar || ETAB.nom, objectif_spiritueux: x.target, objectif_bouteilles: x.target2, volume_mois: x.vol}).eq("id", ETAB.id));
    ETAB.nom = x.bar || ETAB.nom; lsSet(EKEY, ETAB);
  }
  Object.assign(S, x);
}

/* ================= Navigation ================= */
let view = "home";
document.querySelectorAll("nav button").forEach(b => b.onclick = () => go(b.dataset.v));
document.querySelectorAll("[data-go]").forEach(a => a.onclick = () => go(a.dataset.go));
function go(v) {
  if (isBarman()) v = "service";
  view = v;
  document.querySelectorAll(".view").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  document.querySelectorAll("nav button").forEach(b => { b.classList.toggle("on", b.dataset.v === v); b.hidden = isBarman() && b.dataset.v !== "service"; });
  $("fab").style.display = v === "menu" ? "block" : "none";
  $("main").scrollTop = 0; render(); bgReload();
}
function render() {
  if (view === "home") renderHome();
  if (view === "menu") renderMenu();
  if (view === "service") renderService();
  if (view === "calc") renderCalc();
  if (view === "stock") renderStock();
}

/* ================= Accueil ================= */
function liveTotals() {
  let ca = 0, ht = 0, marg = 0, qty = 0;
  for (const k in S.live) {
    const qn = S.live[k]; if (!qn) continue;
    if (isBarman()) { const c = (S.carte || []).find(x => x.key === k); if (c) { ca += qn * c.s; qty += qn; } continue; }
    const i = allItems().find(x => x.key === k); if (!i) continue;
    ca += qn * i.o.s; ht += qn * i.c.ht; marg += qn * i.c.marg; qty += qn;
  }
  return {ca, ht, marg, qty};
}
function renderHome() {
  const h = new Date().getHours();
  $("hello").textContent = (h < 5 || h >= 18 ? "Bonsoir" : "Bonjour") + (S.bar ? ", " + S.bar : "");
  $("today").textContent = new Date().toLocaleDateString("fr-FR", {weekday:"long",day:"numeric",month:"long"});
  const d = scoreData();
  const col = d.score >= 55 ? "var(--amber)" : "var(--bad)";
  $("scoreGlass").innerHTML = glass(d.score / 100, {w:74, col, wave:true});
  $("score").textContent = d.empty ? "—" : d.score;
  const v = d.empty ? ["À remplir","b-warn"] : d.score >= 85 ? ["Excellent","b-ok"] : d.score >= 70 ? ["Bon","b-ok"] : d.score >= 55 ? ["À surveiller","b-warn"] : ["Critique","b-bad"];
  $("verdict").textContent = v[0]; $("verdict").className = "verdict " + v[1];
  const tips = []; if (d.under) tips.push(`${d.under} prix sous l'objectif`); if (d.low) tips.push(`${d.low} stock${d.low > 1 ? "s" : ""} bas`);
  $("scoreTip").textContent = d.empty ? "Ajoutez vos produits dans l'onglet Carte pour obtenir votre score." : tips.length ? tips.join(" · ") : "Carte rentable et stock en ordre. Bravo.";
  $("kRate").innerHTML = d.empty ? "—" : pct(d.avgRate); $("kRate").style.color = tone(d.avgRate);
  $("kEur").innerHTML = d.empty ? "—" : eur(d.avgEur) + " <small>HT</small>";

  const t = liveTotals();
  $("tonight").innerHTML = t.qty
    ? `<div class="tonight"><div><span class="live">Service en cours</span><div class="big h">${eur(t.marg)}</div><div class="meta">de marge · ${t.qty} verre${t.qty > 1 ? "s" : ""} · ${eur(t.ca)} TTC</div></div><button class="mini" data-go2>Continuer</button></div>`
    : `<div class="tonight"><div><div class="name">Prêt pour le service ?</div><div class="meta" style="white-space:normal">Suivez la marge du soir en direct, verre par verre, ou <a class="link" data-imp style="padding:0;font-size:12px">importez le fichier de votre caisse</a>.</div></div><button class="mini" data-go2 style="flex:none">Démarrer</button></div>`;
  $("tonight").querySelector("[data-go2]").onclick = () => go("service");
  const im = $("tonight").querySelector("[data-imp]"); if (im) im.onclick = importSheet;

  const o = opportunities();
  $("oppTotal").textContent = o.length ? "+" + eur(o.reduce((s, i) => s + i.month, 0), 0) + " / mois" : "";
  $("opps").innerHTML = o.length ? o.slice(0, 4).map(i => `
    <div class="row"><div class="emoji">${i.kind === "k" ? "🍹" : CATS[i.o.c] || "🍶"}</div>
    <div class="grow"><div class="name">${esc(i.o.n)}</div><div class="meta">${eur(i.o.s)} → <b style="color:var(--txt)">${eur(i.np)}</b> · ${i.step ? "1er palier vers " + i.t + " %" : "marge " + pct(i.c.rate) + " → " + i.t + " %"}</div></div>
    <div class="right"><div class="gain">+${eur(i.month, 0)}</div><div class="meta" style="margin:0">par mois</div><button class="mini" data-k="${i.key}" data-np="${i.np}">Appliquer</button></div></div>`).join("")
    + `<p class="tip" style="padding:0 0 12px">Estimation sur ${S.vol} verres vendus par mois et par produit (modifiable dans les réglages).</p>`
    : `<div class="empty">${d.empty ? "Rien à calculer pour l'instant." : "✅ Tous vos prix atteignent vos objectifs"}</div>`;
  $("opps").querySelectorAll("[data-k]").forEach(b => b.onclick = async () => {
    const it = allItems().find(x => x.key === b.dataset.k); b.classList.add("busy");
    await act(() => actSetPrices([{kind: it.kind, o: it.o, price: +b.dataset.np}]), `${it.o.n} : ${eur(+b.dataset.np)} ✓`);
  });

  const low = S.products.filter(p => p.st < p.m);
  $("alerts").innerHTML = low.length ? low.map(p => `
    <div class="row"><div>${bottle(p.st / (p.m * 2 || 1), "var(--bad)")}</div><div class="grow"><div class="name">${esc(p.n)}</div><div class="meta">Reste ${f1(p.st)} bt · minimum ${f1(p.m)}</div></div><span class="badge b-bad">Commander ${Math.ceil(p.m * 2 - p.st)}</span></div>`).join("")
    : `<div class="empty">✅ Aucun stock bas</div>`;

  const hist = S.history.slice(-6), bars = hist.map(x => ({d: new Date(x.date), m: x.marg, now: false}));
  if (t.qty) bars.push({d: new Date(), m: t.marg, now: true});
  const mx = Math.max(1, ...bars.map(b => b.m));
  $("chart").innerHTML = bars.length ? bars.map((b, i) => `<div class="c"><em>${Math.round(b.m)}€</em><div class="bar ${b.now ? "now" : ""}" style="height:${Math.max(4, b.m / mx * 78)}%;animation-delay:${i * 50}ms"></div><span>${b.now ? "Ce soir" : b.d.toLocaleDateString("fr-FR", {weekday:"short"}).replace(".", "")}</span></div>`).join("")
    : `<div class="empty" style="width:100%">Clôturez un service pour voir l'historique</div>`;
}

/* ================= Carte ================= */
let menuKind = "p", sortBy = "marg", cat = "Toutes";
$("menuSeg").querySelectorAll("button").forEach(b => b.onclick = () => { menuKind = b.dataset.v; $("menuSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); renderMenu(); });
$("q").oninput = () => renderMenu();
function renderMenu() {
  const sorts = [["marg","Marge €"],["rate","Marge %"],["name","A → Z"]];
  const cats = menuKind === "p" ? ["Toutes", ...new Set(S.products.map(p => p.c))] : [];
  if (!cats.includes(cat)) cat = "Toutes";
  $("sortChips").innerHTML = sorts.map(([k, l]) => `<button class="chip ${sortBy === k ? "on" : ""}" data-s="${k}">${l}</button>`).join("")
    + (cats.length ? `<span style="width:1px;background:var(--line);flex:none;margin:4px 2px"></span>` + cats.map(c => `<button class="chip ${cat === c ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("") : "");
  $("sortChips").querySelectorAll("[data-s]").forEach(b => b.onclick = () => { sortBy = b.dataset.s; renderMenu(); });
  $("sortChips").querySelectorAll("[data-c]").forEach(b => b.onclick = () => { cat = b.dataset.c; renderMenu(); });
  const qs = $("q").value.trim().toLowerCase();
  let it = allItems().filter(i => i.kind === menuKind && i.o.n.toLowerCase().includes(qs) && (menuKind === "k" || cat === "Toutes" || i.o.c === cat));
  it.sort((a, b) => sortBy === "name" ? a.o.n.localeCompare(b.o.n) : sortBy === "rate" ? b.c.rate - a.c.rate : b.c.marg - a.c.marg);
  $("menuList").innerHTML = it.length ? it.map(i => { const t = tgtI(i), st = status(i.c, i.kind === "p" ? i.o : null, t);
    const meta = i.kind === "p" ? `${f1(i.o.d)} cl · ${eur(i.o.s)} TTC · coût ${eur(i.c.cost)}`
      : `${i.o.ing.map(g => { const p = byId(g.p); return p ? p.n.split(" ")[0] : "?"; }).join(" + ")} · ${eur(i.o.s)}`;
    return `<div class="row tap" data-k="${i.key}"><div style="flex:none">${glass(i.c.rate / 100, {w:26, col:tone(i.c.rate, t)})}</div>
    <div class="grow"><div class="name">${esc(i.o.n)}</div><div class="meta">${esc(meta)}</div></div>
    <div class="right"><div class="m h">${eur(i.c.marg)}</div><div style="font-size:12px;color:${tone(i.c.rate, t)};font-weight:600">${pct(i.c.rate)}</div><span class="badge ${st[1]}">${st[0]}</span></div></div>`; }).join("")
    : `<div class="empty">${menuKind === "k" ? "Aucun cocktail. Touchez + pour créer votre première recette." : S.products.length ? "Aucun produit trouvé" : "Votre carte est vide. Touchez + pour ajouter votre premier produit."}</div>`;
  $("menuList").querySelectorAll("[data-k]").forEach(r => r.onclick = () => { const k = r.dataset.k; k[0] === "p" ? productSheet(k.slice(1)) : cocktailSheet(k.slice(1)); });
}
$("fab").onclick = () => menuKind === "p" ? productSheet(null) : cocktailSheet(null);

/* ================= Service ================= */
let svcCat = "Tout";
function consume(key, dir) {
  const id = key.slice(1);
  if (key[0] === "p") { const p = byId(id); if (p) p.st = Math.max(0, p.st - dir * p.d / p.cap); }
  else { const k = S.cocktails.find(c => c.id === id); if (k) k.ing.forEach(g => { const p = byId(g.p); if (p) p.st = Math.max(0, p.st - dir * g.cl / p.cap); }); }
}
function serviceItems() {
  if (isBarman()) return (S.carte || []).map(c => ({key: c.key, kind: c.kind, n: c.n, c: c.c, s: c.s, out: !c.dispo}));
  return allItems().map(i => ({key: i.key, kind: i.kind, n: i.o.n, c: i.kind === "k" ? "Cocktails" : i.o.c, s: i.o.s,
    out: i.kind === "p" ? i.o.st * i.o.cap < i.o.d : i.o.ing.some(g => { const p = byId(g.p); return p && p.st * p.cap < g.cl; })}));
}
function renderService() {
  const t = liveTotals(), barman = isBarman();
  const ks = document.querySelectorAll(".svc .k");
  ks[0].textContent = barman ? "Ventes ce soir (TTC)" : "Marge ce soir (HT)";
  ks[1].textContent = barman ? "Verres" : "Ventes TTC";
  ks[2].parentElement.hidden = barman;
  $("sMarg").textContent = barman ? eur(t.ca) : eur(t.marg);
  $("sCA").textContent = barman ? t.qty : eur(t.ca, 0);
  $("sQty").textContent = t.qty;
  $("importBtn").hidden = barman;
  $("svcLive").style.visibility = t.qty ? "visible" : "hidden";
  const items = serviceItems();
  const cats = ["Tout", ...new Set(items.map(i => i.c))];
  if (!cats.includes(svcCat)) svcCat = "Tout";
  $("svcChips").innerHTML = cats.map(c => `<button class="chip ${svcCat === c ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  $("svcChips").querySelectorAll(".chip").forEach(b => b.onclick = () => { svcCat = b.dataset.c; renderService(); });
  const list = items.filter(i => svcCat === "Tout" || i.c === svcCat);
  $("tiles").innerHTML = list.length ? list.map(i => { const qn = S.live[i.key] || 0;
    return `<div class="tile ${qn ? "has" : ""} ${i.out ? "out" : ""}" data-k="${i.key}" role="button" tabindex="0" aria-label="${esc(i.n)}">
      <button class="minus" data-m="1" aria-label="Retirer un ${esc(i.n)}">−</button><span class="q">${qn}</span>
      <div class="e">${i.kind === "k" ? "🍹" : CATS[i.c] || "🍶"}</div><div class="t">${esc(i.n)}</div><div class="p">${eur(i.s)}</div></div>`; }).join("")
    : `<div class="empty" style="grid-column:1/-1">La carte est vide.${barman ? " Le patron doit d'abord ajouter les produits." : " Ajoutez vos produits dans l'onglet Carte."}</div>`;
  $("tiles").querySelectorAll(".tile").forEach(el => el.onclick = e => tap(el.dataset.k, e.target.dataset.m ? -1 : 1));
}
function tap(k, dir) {
  if (dir < 0 && !S.live[k]) return;
  S.live[k] = (S.live[k] || 0) + dir; if (!S.live[k]) delete S.live[k];
  if (!isBarman()) consume(k, dir);
  if (cloud()) { const Q = queue(); Q.push({e: ETAB.id, t: k[0], id: k.slice(1), d: dir}); lsSet(QKEY, Q); flush(); }
  save(); renderService();
  const n = $("tiles").querySelector(`[data-k="${k}"]`); if (n) n.classList.add("pop");
}
let poll = null;
function startPoll() {
  clearInterval(poll);
  poll = setInterval(async () => {
    if (MODE !== "cloud" || view !== "service" || document.hidden || queueLen() || !navigator.onLine) return;
    try { await refreshLive(); save(); renderService(); } catch (e) { if (isNetErr(e)) setSync("off"); }
  }, 8000);
}
$("closeSvc").onclick = () => {
  const t = liveTotals(); if (!t.qty) return toast("Aucun verre vendu pour l'instant");
  const barman = isBarman();
  const rows = Object.entries(S.live).map(([k, qn]) => ({it: serviceItems().find(x => x.key === k), i: allItems().find(x => x.key === k), q: qn})).filter(r => r.it);
  const top = rows.slice().sort((a, b) => barman ? b.q * b.it.s - a.q * a.it.s : b.q * b.i.c.marg - a.q * a.i.c.marg).slice(0, 3);
  openSheet(`<h2 class="h">Fin du service</h2><div class="sub">${new Date().toLocaleDateString("fr-FR", {weekday:"long",day:"numeric",month:"long"})}</div>
    <div class="res" style="margin-bottom:14px">
    ${barman ? `<div class="hl"><div><div class="l">Ventes du soir (TTC)</div><div class="v h">${eur(t.ca)}</div></div>${glass(.7, {w:40})}</div><div><div class="l">Verres servis</div><div class="v h">${t.qty}</div></div>`
    : `<div class="hl"><div><div class="l">Marge du soir (HT)</div><div class="v h">${eur(t.marg)}</div></div>${glass(t.ht ? t.marg / t.ht : 0, {w:40})}</div>
    <div><div class="l">Ventes TTC</div><div class="v h">${eur(t.ca)}</div></div><div><div class="l">Ventes HT</div><div class="v h">${eur(t.ht)}</div></div>
    <div><div class="l">Verres servis</div><div class="v h">${t.qty}</div></div><div><div class="l">Taux de marge</div><div class="v h">${pct(t.ht ? t.marg / t.ht * 100 : NaN)}</div></div>`}</div>
    <div class="lbl" style="margin-top:4px"><span>${barman ? "Les plus vendus" : "Ce qui a le plus rapporté"}</span></div>
    <div class="card list">${top.map(r => `<div class="row"><div class="grow"><div class="name">${esc(r.it.n)}</div><div class="meta">${r.q} vendu${r.q > 1 ? "s" : ""}</div></div><div class="right m h">${barman ? eur(r.q * r.it.s) : eur(r.q * r.i.c.marg)}</div></div>`).join("")}</div>
    <button class="btn" id="doClose">Clôturer et archiver</button><div class="gap"></div><button class="btn ghost" id="keepOpen">Continuer le service</button>`, () => {
    $("doClose").onclick = async () => {
      const b = $("doClose"); b.classList.add("busy");
      if (cloud()) {
        try {
          await flush(); if (queueLen()) throw new Error("Pas de connexion internet.");
          await q(sb.rpc("cloturer_service", {p_etab: ETAB.id}));
        } catch (e) { b.classList.remove("busy"); return toast(frErr(e)); }
        S.live = {}; lastLoad = 0;
        if (!barman) S.history.push({date: new Date().toISOString(), marg: t.marg, ca: t.ca, qty: t.qty});
      } else {
        S.history.push({date: new Date().toISOString(), marg: t.marg, ca: t.ca, qty: t.qty}); S.history = S.history.slice(-14); S.live = {};
      }
      save(); closeSheet(); go(barman ? "service" : "home"); toast("Service archivé ✓");
    };
    $("keepOpen").onclick = closeSheet;
  });
};

/* ================= Calculs ================= */
let calcTab = "glass", cAlc = 1;
$("calcSeg").querySelectorAll("button").forEach(b => b.onclick = () => { calcTab = b.dataset.v; $("calcSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); renderCalc(); });
$("cAlc").querySelectorAll("button").forEach(b => b.onclick = () => { cAlc = +b.dataset.v; $("cAlc").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); calcGlass(); });
["cBuy","cCap","cDose","cSell","tRange"].forEach(i => $(i).oninput = calcGlass);
["pPlan","pReal","pGlass","pDays"].forEach(i => $(i).oninput = calcPour);
$("pProd").onchange = () => { const p = byId($("pProd").value); if (p) { $("pPlan").value = f1(p.d); $("pReal").value = f1(p.d + 1); } calcPour(); };
["xCat","xUp","xVol"].forEach(i => $(i).oninput = calcPrice);
function renderCalc() {
  ["glass","pour","price"].forEach(t => $("c-" + t).style.display = t === calcTab ? "block" : "none");
  const opts = S.products.filter(p => p.a && p.d < p.cap).map(p => `<option value="${esc(p.id)}">${esc(p.n)}</option>`).join("");
  const cur = $("pProd").value; $("pProd").innerHTML = opts;
  if (cur && byId(cur)) $("pProd").value = cur; else { const p = byId($("pProd").value); if (p) { $("pPlan").value = f1(p.d); $("pReal").value = f1(p.d + 1); } }
  const xc = $("xCat").value || "Spiritueux";
  $("xCat").innerHTML = ["Spiritueux", "Toute la carte", ...new Set(S.products.map(p => p.c)), "Cocktails"].map(c => `<option>${esc(c)}</option>`).join(""); $("xCat").value = xc;
  if (!$("xVol").value) $("xVol").value = S.vol;
  calcGlass(); calcPour(); calcPrice();
}
function calcGlass() {
  const p = {a:cAlc,b:num($("cBuy").value),cap:num($("cCap").value),d:num($("cDose").value),s:num($("cSell").value)}, c = prodCalc(p);
  const coef = c.cost > 0 ? c.ht / c.cost : NaN, gl = p.d > 0 ? Math.floor(p.cap / p.d) : NaN;
  $("cRes").innerHTML = `<div class="hl"><div><div class="l">Vous gagnez par verre (HT)</div><div class="v h">${eur(c.marg)}</div></div>${glass((c.rate || 0) / 100, {w:40, col:tone(c.rate)})}</div>
    <div><div class="l">Coût du verre</div><div class="v h">${eur(c.cost)}</div></div><div><div class="l">Prix de vente HT</div><div class="v h">${eur(c.ht)}</div></div>
    <div><div class="l">Taux de marge</div><div class="v h" style="color:${tone(c.rate)}">${pct(c.rate)}</div></div><div><div class="l">Coefficient</div><div class="v h">${isFinite(coef) ? "× " + coef.toFixed(1).replace(".", ",") : "—"}</div></div>
    <div><div class="l">Verres par bouteille</div><div class="v h">${isFinite(gl) ? gl : "—"}</div></div><div><div class="l">Bouteille vendue (HT)</div><div class="v h">${isFinite(gl) ? eur(gl * c.ht, 0) : "—"}</div></div>`;
  $("cTip").innerHTML = !isFinite(c.rate) ? "Remplissez les champs." : c.rate >= S.target ? "Excellent : ce verre atteint votre objectif." : c.rate >= S.target - 10 ? `Correct, mais <b>${eur(suggest(c.cost, !!cAlc, S.target))}</b> vous mettrait à ${S.target} %.` : `Marge trop faible : <b>augmentez le prix ou réduisez la dose</b>.`;
  const t = +$("tRange").value; $("tLbl").textContent = t + " %"; $("tPrice").textContent = eur(suggest(c.cost, !!cAlc, t));
}
$("cSave").onclick = () => productSheet(null, {n:"",c:cAlc?"Rhum":"Soft",a:cAlc,b:num($("cBuy").value),cap:num($("cCap").value),d:num($("cDose").value),s:num($("cSell").value),st:0,m:2});
function calcPour() {
  const p = byId($("pProd").value);
  if (!p) { $("pRes").innerHTML = `<div class="empty" style="grid-column:1/-1">Ajoutez d'abord un spiritueux à votre carte.</div>`; $("pTip").textContent = ""; return; }
  const plan = num($("pPlan").value), real = num($("pReal").value), g = num($("pGlass").value), days = num($("pDays").value);
  const extra = Math.max(0, real - plan), clMonth = extra * g * days * 52 / 12, btMonth = clMonth / p.cap;
  const costMonth = clMonth * p.b / p.cap, lostGlasses = plan > 0 ? clMonth / plan : 0, lostSales = lostGlasses * prodCalc(p).ht;
  $("pRes").innerHTML = `<div class="hl" style="background:var(--badT);border-color:rgba(229,96,77,.35)"><div><div class="l">Manque à gagner sur l'année (HT)</div><div class="v h" style="color:var(--bad)">${eur(lostSales * 12, 0)}</div></div>${glass(real > 0 ? plan / real : 0, {w:36, col:"var(--bad)"})}</div>
    <div><div class="l">En trop par verre</div><div class="v h">${f1(extra)} cl</div></div><div><div class="l">Bouteilles perdues / mois</div><div class="v h">${f1(btMonth)}</div></div>
    <div><div class="l">Coût d'achat perdu / mois</div><div class="v h">${eur(costMonth, 0)}</div></div><div><div class="l">Verres non vendus / mois</div><div class="v h">${Math.round(lostGlasses)}</div></div>`;
  $("pTip").innerHTML = extra ? `Avec un doseur ou un bec verseur calibré, vous récupérez <b>${eur(lostSales, 0)} par mois</b> sur ce seul produit.` : "Dose respectée : aucune perte. 👌";
}
function xItems() { const c = $("xCat").value;
  return allItems().filter(i => c === "Toute la carte" || (c === "Cocktails" ? i.kind === "k" : i.kind === "p" && (c === "Spiritueux" ? i.o.a && i.o.d < i.o.cap : i.o.c === c))); }
function calcPrice() {
  const up = num($("xUp").value), vol = num($("xVol").value); $("xLbl").textContent = "+" + eur(up);
  const it = xItems(), gain = it.reduce((s, i) => s + up / (1 + i.c.tva) * vol, 0);
  const before = it.length ? it.reduce((s, i) => s + i.c.rate, 0) / it.length : NaN;
  const after = it.length ? it.reduce((s, i) => { const ht = (i.o.s + up) / (1 + i.c.tva); return s + (ht - i.c.cost) / ht * 100; }, 0) / it.length : NaN;
  $("xRes").innerHTML = `<div class="hl"><div><div class="l">Gain en plus par mois (HT)</div><div class="v h">+${eur(gain, 0)}</div></div><div class="right"><div class="l">par an</div><div class="h" style="font-weight:700;font-size:17px">+${eur(gain * 12, 0)}</div></div></div>
    <div><div class="l">Produits concernés</div><div class="v h">${it.length}</div></div><div><div class="l">Marge moyenne</div><div class="v h" style="font-size:16px">${pct(before)} → <span style="color:var(--ok)">${pct(after)}</span></div></div>`;
  $("xTip").innerHTML = `Une hausse de ${eur(up)} passe souvent inaperçue pour le client, mais pas pour votre compte en banque.`;
}
armBtn($("xApply"), "Toucher encore pour confirmer", async () => {
  const up = num($("xUp").value), it = xItems(); if (!it.length) return toast("Aucun produit concerné");
  await act(() => actSetPrices(it.map(i => ({kind: i.kind, o: i.o, price: Math.round((i.o.s + up) * 100) / 100}))), `${it.length} prix augmentés de ${eur(up)} ✓`);
});

/* ================= Stock ================= */
function orderList() { return S.products.filter(p => p.st < p.m).map(p => ({p, q: Math.max(1, Math.ceil(p.m * 2 - p.st))})); }
function renderStock() {
  $("stVal").textContent = eur(S.products.reduce((s, p) => s + p.b * p.st, 0), 0);
  const o = orderList(); $("stLow").textContent = o.length; $("stLow").style.color = o.length ? "var(--bad)" : "var(--ok)";
  $("lastInv").textContent = S.lastInv ? `Inventaire du ${new Date(S.lastInv.date).toLocaleDateString("fr-FR")}` : "";
  $("stockList").innerHTML = S.products.length ? S.products.map(p => { const low = p.st < p.m; return `
    <div class="row"><div style="flex:none">${bottle(p.st / Math.max(1, p.m * 2), low ? "var(--bad)" : "var(--amber)")}</div>
    <div class="grow"><div class="name">${esc(p.n)}</div><div class="meta" style="color:${low ? "var(--bad)" : "var(--mut)"}">minimum ${f1(p.m)}${low ? " · à commander" : ""}</div></div>
    <div class="stepper"><button data-id="${esc(p.id)}" data-d="-1" aria-label="Moins">−</button><span>${f1(p.st)}</span><button data-id="${esc(p.id)}" data-d="1" aria-label="Plus">+</button></div></div>`; }).join("")
    : `<div class="empty">Aucun produit</div>`;
  $("stockList").querySelectorAll(".stepper button").forEach(b => b.onclick = () => { const p = byId(b.dataset.id); actStock(p.id, Math.round((p.st + +b.dataset.d) * 10) / 10); renderStock(); });
  $("order").innerHTML = o.length ? o.map(x => `<div class="row"><div class="grow"><div class="name">${esc(x.p.n)}</div><div class="meta">${eur(x.p.b)} HT la bouteille</div></div><div class="right"><div class="m h">× ${x.q}</div><div class="meta" style="margin:0">${eur(x.q * x.p.b)}</div></div></div>`).join("")
    + `<div class="row"><div class="grow name">Total estimé HT</div><div class="m h" style="color:var(--amber2)">${eur(o.reduce((s, x) => s + x.q * x.p.b, 0))}</div></div>`
    : `<div class="empty">✅ Rien à commander</div>`;
}
$("copyOrder").onclick = async () => { const o = orderList(); if (!o.length) return toast("Rien à commander");
  const txt = `Bonjour,\n\nVoici ma commande${S.bar ? " pour " + S.bar : ""} :\n` + o.map(x => `- ${x.p.n} : ${x.q} bouteille${x.q > 1 ? "s" : ""}`).join("\n") + "\n\nMerci !";
  try { await navigator.clipboard.writeText(txt); toast("Commande copiée ✓"); } catch (e) { toast("Copie impossible ici"); } };
$("invBtn").onclick = () => openInventory(false);
$("invScanBtn").onclick = () => openInventory(true);
function openInventory(autoScan) {
  if (!S.products.length) return toast("Ajoutez d'abord des produits");
  openSheet(`<h2 class="h">Inventaire</h2><div class="sub">Comptez vos bouteilles (0,5 = une demie). On compare avec ce qui devrait rester d'après vos ventes.</div>
    <button class="btn" id="invScan" style="margin-bottom:12px">📷 Compter en scannant les bouteilles</button>
    <div class="card list">${S.products.map(p => `<div class="row" data-row="${esc(p.id)}"><div class="grow"><div class="name">${esc(p.n)}</div><div class="meta">Théorique : ${f1(p.st)} bt</div></div>
      <input data-id="${esc(p.id)}" inputmode="decimal" value="${f1(p.st)}" aria-label="Bouteilles comptées : ${esc(p.n)}" style="width:76px;text-align:center;background:var(--card2);border:1px solid var(--line);border-radius:11px;padding:10px;outline:none"></div>`).join("")}</div>
    <div class="card" id="invRes"></div><button class="btn" id="invOk">Valider l'inventaire</button>`, () => {
    const ins = [...$("sBody").querySelectorAll("input[data-id]")];
    const calc = () => { let lossCost = 0, lossSales = 0; const rows = [], details = [];
      ins.forEach(i => { const p = byId(i.dataset.id), diff = num(i.value) - p.st;
        if (diff < -0.04) { const c = prodCalc(p); lossCost += -diff * p.b; lossSales += -diff * p.cap / p.d * c.ht; rows.push(`${esc(p.n)} : ${f1(diff)} bt`); details.push({produit: p.n, ecart_bt: Math.round(diff * 100) / 100}); } });
      $("invRes").innerHTML = rows.length ? `<div class="res"><div class="hl" style="background:var(--badT);border-color:rgba(229,96,77,.35)"><div><div class="l">Ventes manquées (HT)</div><div class="v h" style="color:var(--bad)">${eur(lossSales, 0)}</div></div><div class="right"><div class="l">coût d'achat</div><div class="h" style="font-weight:700">${eur(lossCost, 0)}</div></div></div></div><p class="tip" style="margin-top:10px">Écarts : ${rows.join(" · ")}. Pensez casse, verres offerts, surdosage ou ventes non saisies.</p>`
        : `<p class="tip">✅ Aucun écart pour l'instant. Modifiez les quantités comptées.</p>`;
      return {lossSales, details}; };
    ins.forEach(i => i.oninput = calc); calc();
    $("invScan").onclick = () => scanInventory(ins, calc);
    if (autoScan) scanInventory(ins, calc);
    $("invOk").onclick = async () => { const r = calc(); $("invOk").classList.add("busy");
      const ok = await act(() => actInventory(ins.map(i => [i.dataset.id, Math.max(0, num(i.value))]), r.lossSales, r.details), "Inventaire enregistré ✓");
      $("invOk") && $("invOk").classList.remove("busy"); if (ok) closeSheet(); };
  });
}

/* ================= Import des ventes de caisse ================= */
const CAISSES = "SumUp, Flatpay, Zelty, Lightspeed, L'Addition, Square, Tiller, Innovorder…";
function importSheet() {
  if (isBarman()) return;
  if (!allItems().length) return toast("Ajoutez d'abord vos produits à la carte");
  openSheet(`<h2 class="h">Ventes de la caisse</h2><div class="sub">Importez le fichier des ventes de votre caisse : la marge de la soirée et le stock se calculent tout seuls.</div>
    <label class="drop" id="impDrop"><input type="file" id="impFile" accept=".csv,.txt,.xlsx,.xls,.xlsm,.ods,text/csv" hidden>
      <div class="e">📄</div><div class="name">Choisir le fichier</div><div class="meta" style="white-space:normal">CSV ou Excel · ${CAISSES}</div></label>
    <div class="card"><div class="name" style="font-size:14px">Où trouver ce fichier ?</div>
      <p class="tip" style="margin-top:6px">Dans l'espace en ligne de votre caisse : <b>Rapports</b> ou <b>Statistiques</b> → <b>Ventes par produit</b> (ou par article) → <b>Exporter</b> en CSV ou Excel, pour la journée voulue.</p></div>
    <div class="center"><button class="link" id="impDemo">Pas de caisse ? Essayer avec un fichier d'exemple</button></div>`, () => {
    $("impDemo").onclick = async () => { try { const r = await fetch("exemples/ventes-exemple.csv"); const b = await r.blob(); impRead(new File([b], "exemple-caisse.csv", {type: "text/csv"})); } catch (e) { toast("Exemple indisponible hors connexion"); } };
    $("impFile").onchange = e => { const f = e.target.files[0]; if (f) impRead(f); };
    const d = $("impDrop");
    d.ondragover = e => { e.preventDefault(); d.classList.add("over"); };
    d.ondragleave = () => d.classList.remove("over");
    d.ondrop = e => { e.preventDefault(); d.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) impRead(f); };
  });
}
$("importBtn").onclick = importSheet;
async function impRead(file) {
  try {
    toast("Lecture du fichier…");
    const {rows, ref} = await Import.readFile(file);
    const det = Import.detect(rows);
    const saved = (lsGet("dosisbar.colmap") || {})[det.header.map(h => Import.normName(h)).join("|")];
    const map = saved || det.map;
    if (saved || det.sure) impMatch(det, map, ref, file.name); else impColumns(det, map, ref, file.name);
  } catch (e) { toast(frErr(e)); }
}
function impColumns(det, map, ref, fname) {
  const cols = det.header.map((h, i) => [i, h || "Colonne " + (i + 1)]);
  const sel = (id, v, none) => `<select id="${id}">${none ? `<option value="">${none}</option>` : ""}${opts(cols, v ?? "")}</select>`;
  const prev = det.data.slice(0, 3);
  openSheet(`<h2 class="h">Les colonnes du fichier</h2><div class="sub">${esc(fname)} · Dites-nous quelle colonne correspond à quoi. Ce sera retenu pour la prochaine fois.</div>
    <div class="field"><label for="cName">Nom du produit</label>${sel("cName", map.name, "— Choisir —")}</div>
    <div class="two"><div class="field"><label for="cQty">Quantité vendue</label>${sel("cQty", map.qty, "1 par ligne")}</div>
    <div class="field"><label for="cTot">Montant encaissé TTC</label>${sel("cTot", map.total, "Prix de la carte")}</div>
    <div class="field"><label for="cUnit">Prix unitaire TTC</label>${sel("cUnit", map.unit, "—")}</div>
    <div class="field"><label for="cDate">Date</label>${sel("cDate", map.date, "—")}</div></div>
    <div class="card list" id="cPrev"></div><button class="btn" id="cOk">Continuer</button>`, () => {
    const read = () => { const m = {}; [["name","cName"],["qty","cQty"],["total","cTot"],["unit","cUnit"],["date","cDate"]].forEach(([k, id]) => { const v = $(id).value; if (v !== "") m[k] = +v; }); return m; };
    const show = () => { const m = read();
      $("cPrev").innerHTML = prev.map(r => `<div class="row"><div class="grow"><div class="name">${esc(m.name != null ? r[m.name] : "?")}</div><div class="meta">quantité ${esc(m.qty != null ? r[m.qty] : "1")} · montant ${esc(m.total != null ? r[m.total] : m.unit != null ? r[m.unit] + " l'unité" : "prix carte")}</div></div></div>`).join("") || `<div class="empty">Aucune ligne</div>`; };
    $("sBody").querySelectorAll("select").forEach(s => s.onchange = show); show();
    $("cOk").onclick = () => { const m = read(); if (m.name == null) return toast("Choisissez la colonne du nom du produit");
      const all = lsGet("dosisbar.colmap") || {}; all[det.header.map(h => Import.normName(h)).join("|")] = m; lsSet("dosisbar.colmap", all);
      impMatch(det, m, ref, fname); };
  });
}
function impMatch(det, map, ref, fname) {
  const g = Import.group(det, map);
  if (!g.items.length) { toast("Aucune vente trouvée avec ces colonnes"); return impColumns(det, map, ref, fname); }
  const catalog = allItems().map(i => ({key: i.key, label: i.o.n}));
  const rows = Import.match(g.items, catalog, S.alias || {});
  const choices = [["", "— Relier à… —"], ...allItems().map(i => [i.key, (i.kind === "k" ? "🍹 " : "") + i.o.n]), ["ignore", "Ignorer (pas suivi dans Dosis Bar)"]];
  const today = new Date().toISOString().slice(0, 10);
  const badge = st => st === "ok" || st === "memo" ? `<span class="badge b-ok">Reconnu</span>` : st === "check" ? `<span class="badge b-warn">À vérifier</span>` : `<span class="badge b-bad">À relier</span>`;
  const colTxt = ["name","qty","total","date"].filter(k => map[k] != null).map(k => ({name:"produit",qty:"quantité",total:"montant",date:"date"})[k] + " = « " + esc(det.header[map[k]]) + " »").join(" · ");
  openSheet(`<h2 class="h">Ventes à importer</h2><div class="sub">${esc(fname)} · ${g.lines} ligne${g.lines > 1 ? "s" : ""} lue${g.lines > 1 ? "s" : ""}</div>
    <div class="card" style="padding:12px 14px"><div class="meta" style="white-space:normal">Colonnes : ${colTxt}</div><button class="link" id="mCols" style="padding:6px 0 0">Modifier les colonnes</button></div>
    <div class="field"><label for="mDate">Date du service</label><input id="mDate" type="date" value="${g.date || today}" max="${today}"></div>
    <div class="lbl" style="margin-top:6px"><span>Produits de la caisse</span><span id="mLeft" style="text-transform:none;letter-spacing:0"></span></div>
    <div class="card list">${rows.map((r, i) => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="name">${esc(r.label)}</div><div class="meta">× ${r.q}${r.hasTtc ? " · " + eur(r.ttc) : ""}</div></div>${badge(r.status)}
      <div class="field" style="flex-basis:100%;margin:8px 0 0"><select data-i="${i}" aria-label="Produit de la carte pour ${esc(r.label)}">${opts(choices, r.choice)}</select></div></div>`).join("")}</div>
    <div class="card"><div class="res" id="mSum"></div></div>
    <button class="btn" id="mGo">Importer la soirée</button>`, () => {
    $("mCols").onclick = () => impColumns(det, map, ref, fname);
    const resolved = () => { const agg = new Map();
      rows.forEach(r => { if (!r.choice || r.choice === "ignore") return;
        const a = agg.get(r.choice) || {key: r.choice, q: 0, ttc: 0, hasTtc: true};
        a.q += r.q; a.ttc += r.ttc; a.hasTtc = a.hasTtc && r.hasTtc; agg.set(r.choice, a); });
      return [...agg.values()].filter(a => a.q !== 0); };
    const upd = () => { const list = resolved(), e = importEstimate(list), left = rows.filter(r => !r.choice).length;
      $("mLeft").textContent = left ? `${left} à relier` : "tout est relié ✓"; $("mLeft").style.color = left ? "var(--amber2)" : "var(--ok)";
      $("mSum").innerHTML = `<div class="hl"><div><div class="l">Marge de la soirée (HT)</div><div class="v h">${eur(e.marg)}</div></div>${glass(e.ht ? e.marg / e.ht : 0, {w:36})}</div>
        <div><div class="l">Ventes TTC</div><div class="v h">${eur(e.ca)}</div></div><div><div class="l">Verres</div><div class="v h">${e.qty}</div></div>`;
      $("mGo").textContent = left ? `Importer (${left} ligne${left > 1 ? "s" : ""} non reliée${left > 1 ? "s" : ""} ignorée${left > 1 ? "s" : ""})` : `Importer la soirée · ${e.qty} verres`; };
    $("sBody").querySelectorAll("select[data-i]").forEach(s => s.onchange = () => { const r = rows[+s.dataset.i]; r.choice = s.value; r.status = s.value ? "memo" : "unknown"; upd(); });
    upd();
    $("mGo").onclick = async () => {
      const list = resolved(); if (!list.length) return toast("Reliez au moins un produit");
      const aliases = Object.assign({}, S.alias || {}); rows.forEach(r => { if (r.choice) aliases[r.key] = r.choice; });
      $("mGo").classList.add("busy");
      try {
        const res = await actImport(list, $("mDate").value || today, ref, aliases);
        save(); render();
        openSheet(`<div style="text-align:center;padding:6px 0 4px">${glass(res.ht ? res.marg / res.ht : .7, {w:60, wave:true})}</div>
          <h2 class="h" style="text-align:center">Soirée importée ✓</h2><div class="sub" style="text-align:center">${new Date($("mDate") ? $("mDate").value : today).toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"})}</div>
          <div class="res" style="margin-bottom:14px"><div class="hl"><div><div class="l">Marge de la soirée (HT)</div><div class="v h">${eur(res.marg)}</div></div></div>
          <div><div class="l">Ventes TTC</div><div class="v h">${eur(res.ca)}</div></div><div><div class="l">Verres</div><div class="v h">${res.qty}</div></div>
          <div><div class="l">Taux de marge</div><div class="v h">${pct(res.ht ? res.marg / res.ht * 100 : NaN)}</div></div><div><div class="l">Stock</div><div class="v h" style="font-size:15px">mis à jour</div></div></div>
          <p class="tip" style="margin-bottom:14px">Les noms de votre caisse sont retenus : la prochaine fois, tout sera relié automatiquement.</p>
          <button class="btn" id="impHome">Voir l'accueil</button>`, () => { $("impHome").onclick = () => { closeSheet(); go("home"); }; });
      } catch (e) { $("mGo").classList.remove("busy"); toast(frErr(e)); }
    };
  });
}

/* ================= Lecteur de code-barres ================= */
let scanHandler = null;
function openScanner(title, onCode) {
  scanHandler = onCode;
  $("scanTitle").textContent = title; $("scanTorch").hidden = true;
  $("scanner").classList.add("on");
  scanPanel(`<p class="scan-msg">Placez le code-barres de la bouteille dans le cadre.<br>Il est lu tout seul.</p>${manualBlock()}`);
  Scan.start($("scanVideo"), code => { const f = $("scanFrame"); f.classList.remove("hit"); void f.offsetWidth; f.classList.add("hit"); scanHandler && scanHandler(code); })
    .then(r => { $("scanTorch").hidden = !r.torch; })
    .catch(e => {
      const n = e && (e.name || e.message);
      const msg = n === "NotAllowedError" ? "L'accès à l'appareil photo est refusé. Autorisez-le dans les réglages du navigateur pour dosisbar.com, ou tapez le code à la main."
        : n === "NotFoundError" || n === "OverconstrainedError" ? "Aucun appareil photo trouvé sur cet appareil. Tapez le code à la main."
        : n === "NO_CAMERA" ? "Le lecteur a besoin de l'appareil photo et d'une connexion sécurisée (https). Tapez le code à la main."
        : "Impossible d'ouvrir l'appareil photo. Tapez le code à la main.";
      scanPanel(`<p class="scan-msg">${msg}</p>${manualBlock(true)}`);
    });
}
function closeScanner() { Scan.stop(); scanHandler = null; $("scanner").classList.remove("on"); }
function scanPanel(html) { $("scanPanel").innerHTML = html; bindManual(); }
function manualBlock(open) {
  return `<div id="manBox" ${open ? "" : "hidden"}><div class="codefield" style="margin-top:6px"><input id="manCode" inputmode="numeric" placeholder="Chiffres sous le code-barres" maxlength="40" aria-label="Code-barres"><button id="manOk" aria-label="Valider le code">✓</button></div></div>
    ${open ? "" : `<div class="center"><button class="link" id="manShow">Saisir le code à la main</button></div>`}`;
}
function bindManual() {
  const sh = $("manShow"); if (sh) sh.onclick = () => { $("manBox").hidden = false; sh.parentElement.hidden = true; $("manCode").focus(); };
  const ok = $("manOk"); if (!ok) return;
  const go = () => { const c = Scan.normalize($("manCode").value.replace(/\s/g, "")); if (c.length < 4) return toast("Code trop court"); scanHandler && scanHandler(c); };
  ok.onclick = go; $("manCode").onkeydown = e => { if (e.key === "Enter") go(); };
}
$("scanClose").onclick = closeScanner;
$("scanTorch").onclick = async () => { const on = await Scan.toggleTorch(); $("scanTorch").style.background = on ? "var(--amber)" : ""; };
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("scanner").classList.contains("on")) closeScanner(); });

function scanInventory(ins, calc) {
  const counted = new Set(); let lastDone = "", doneAt = 0;
  const input = id => ins.find(i => i.dataset.id === String(id));
  const ready = () => { Scan.pause(false); scanPanel(`<div class="center" style="margin-bottom:8px">${counted.size ? `<span class="scan-count">✓ ${counted.size} produit${counted.size > 1 ? "s" : ""} compté${counted.size > 1 ? "s" : ""}</span>` : ""}</div>
    <p class="scan-msg">Visez la bouteille suivante.</p>${manualBlock()}<div class="gap"></div><button class="btn ghost" id="scEnd">Terminer et voir les écarts</button>`); $("scEnd").onclick = finish; };
  const finish = () => { closeScanner(); calc(); const r = document.querySelector("#invRes"); if (r) r.scrollIntoView({block: "center"}); };
  const count = p => {
    const el = input(p.id); if (!el) return ready();
    scanPanel(`<div class="name">${esc(p.n)}</div><div class="meta">Théorique : ${f1(p.st)} bt${counted.has(p.id) ? " · déjà compté" : ""}</div>
      <div class="qty"><button data-q="-1">−1</button><button data-q="-0.5">−½</button><input id="scQ" inputmode="decimal" value="${esc(el.value)}" aria-label="Bouteilles comptées"><button data-q="0.5">+½</button><button data-q="1">+1</button></div>
      <button class="btn" id="scOk">Valider · bouteille suivante</button><div class="gap"></div><button class="btn ghost" id="scEnd">Terminer et voir les écarts</button>`);
    $("scanPanel").querySelectorAll("[data-q]").forEach(b => b.onclick = () => { $("scQ").value = f1(Math.max(0, num($("scQ").value) + +b.dataset.q)); });
    $("scOk").onclick = () => {
      el.value = f1(Math.max(0, num($("scQ").value))); counted.add(p.id); lastDone = p.code || ""; doneAt = Date.now();
      const row = el.closest(".row"); if (row) row.classList.add("done");
      calc(); toast(`${p.n} : ${el.value} bt ✓`); ready();
    };
    $("scEnd").onclick = () => { $("scOk").click(); finish(); };
    setTimeout(() => $("scQ") && $("scQ").select(), 50);
  };
  const unknown = code => {
    const free = S.products.filter(x => !x.code), list = free.length ? free : S.products;
    scanPanel(`<div class="name">Code inconnu</div><div class="meta">${esc(code)} n'est relié à aucun produit de votre carte.</div>
      <div class="field" style="margin-top:12px"><label for="scLink">C'est quelle bouteille ?</label><select id="scLink">${opts(list.map(x => [x.id, x.n]), "")}</select></div>
      <button class="btn" id="scLinkOk">Relier ce code et compter</button><div class="gap"></div><button class="btn ghost" id="scSkip">Ignorer</button>`);
    $("scSkip").onclick = ready;
    $("scLinkOk").onclick = async () => {
      const pid = $("scLink").value; $("scLinkOk").classList.add("busy");
      try { await actSetCode(pid, code); toast("Code relié ✓ La prochaine fois, il sera reconnu"); count(byId(pid)); }
      catch (e) { $("scLinkOk").classList.remove("busy"); toast(frErr(e)); }
    };
  };
  openScanner("Inventaire : visez une bouteille", code => {
    if (code === lastDone && Date.now() - doneAt < 6000) return;   // la bouteille qu'on vient de compter
    Scan.pause(true);
    const p = S.products.find(x => x.code === code);
    if (p) count(p); else unknown(code);
  });
  ready();
}

/* ================= Fiches produit et cocktail ================= */
function opts(list, sel) { return list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? "selected" : ""}>${esc(l)}</option>`).join(""); }
function productSheet(id, preset) {
  const p = id ? byId(id) : (preset || {n:"",c:"Rhum",a:1,b:"",cap:70,d:4,s:"",st:0,m:2});
  openSheet(`<h2 class="h">${id ? esc(p.n) : "Nouveau produit"}</h2><div class="sub">${id ? "Modifiez, tout se recalcule" : "Les calculs se font tout seuls"}</div>
    ${id ? "" : `<button class="btn ghost" id="fScanTop" style="margin-bottom:14px">📷 Scanner la bouteille pour remplir la fiche</button>`}
    <div class="field"><label for="fN">Nom</label><input id="fN" value="${esc(p.n)}" placeholder="Ex : Rhum ambré 7 ans" maxlength="80"></div>
    <div class="field"><label for="fCode">Code-barres</label><div class="codefield"><input id="fCode" inputmode="numeric" value="${esc(p.code || "")}" placeholder="Scannez ou tapez le code" maxlength="40"><button id="fScan" type="button" aria-label="Scanner le code-barres">📷</button></div></div>
    <div class="two">
      <div class="field"><label for="fC">Catégorie</label><select id="fC">${opts(Object.keys(CATS).map(c => [c, CATS[c] + "  " + c]), p.c)}</select></div>
      <div class="field"><label for="fA">Type</label><select id="fA">${opts([[1,"Alcool · 20 %"],[0,"Sans alcool · 10 %"]], p.a)}</select></div>
      <div class="field"><label for="fB">Prix bouteille HT (€)</label><input id="fB" inputmode="decimal" value="${p.b === "" ? "" : f1x(p.b)}"></div>
      <div class="field"><label for="fCap">Contenance (cl)</label><input id="fCap" inputmode="decimal" value="${f1x(p.cap)}"></div>
      <div class="field"><label for="fD">Dose servie (cl)</label><input id="fD" inputmode="decimal" value="${f1x(p.d)}"></div>
      <div class="field"><label for="fS">Prix de vente TTC (€)</label><input id="fS" inputmode="decimal" value="${p.s === "" ? "" : f1x(p.s)}"></div>
      <div class="field"><label for="fSt">Stock (bouteilles)</label><input id="fSt" inputmode="decimal" value="${f1x(p.st)}"></div>
      <div class="field"><label for="fM">Stock minimum</label><input id="fM" inputmode="decimal" value="${f1x(p.m)}"></div>
    </div>
    <div class="card" style="background:var(--card2)"><div class="res" id="fRes"></div></div>
    <button class="btn" id="fSave">Enregistrer</button>${id ? `<div class="gap"></div><button class="btn danger" id="fDel">Supprimer ce produit</button>` : ""}`, () => {
    const read = () => ({n:$("fN").value.trim(),c:$("fC").value,a:+$("fA").value,b:num($("fB").value),cap:num($("fCap").value),d:num($("fD").value),s:num($("fS").value),st:num($("fSt").value),m:num($("fM").value),code:$("fCode").value.trim()});
    const scanFill = () => openScanner("Visez le code-barres de la bouteille", async code => {
      closeScanner(); $("fCode").value = code;
      const other = S.products.find(x => x.code === code && x.id !== id);
      if (other) toast(`Attention : ce code est déjà celui de « ${other.n} »`);
      if (!id && !$("fN").value.trim()) {
        toast("Recherche du produit…");
        const info = await Scan.lookup(code);
        if (info && info.nom) {
          $("fN").value = info.nom; $("fC").value = CATS[info.categorie] ? info.categorie : "Autre"; $("fA").value = info.alcool ? "1" : "0";
          if (info.cap) { $("fCap").value = f1x(info.cap); if (["Bière", "Soft", "Eau"].includes(info.categorie) && info.cap <= 75) $("fD").value = f1x(info.cap); }
          toast("Produit trouvé ✓ Vérifiez et ajoutez vos prix");
        } else toast("Produit inconnu : tapez le nom, le code est enregistré");
      }
      upd(); setTimeout(() => ($("fN").value ? $("fB") : $("fN")).focus(), 300);
    });
    $("fScan").onclick = scanFill; if ($("fScanTop")) $("fScanTop").onclick = scanFill;
    const upd = () => { const x = read(), c = prodCalc(x), T = tgtP(x), sg = suggest(c.cost, !!x.a, T);
      $("fRes").innerHTML = `<div><div class="l">Coût du verre</div><div class="v h">${eur(c.cost)}</div></div><div><div class="l">Gagné par verre</div><div class="v h">${eur(c.marg)}</div></div>
      <div><div class="l">Taux de marge</div><div class="v h" style="color:${tone(c.rate, T)}">${pct(c.rate)}</div></div>
      <div><div class="l">Prix conseillé (${T} %)</div><div class="v h">${eur(sg)}</div>${isFinite(c.rate) && c.rate < T ? `<button class="mini" id="useSg">Utiliser</button>` : ""}</div>`;
      const u = $("useSg"); if (u) u.onclick = () => { $("fS").value = f1x(sg); upd(); }; };
    $("sBody").querySelectorAll("input,select").forEach(e => e.oninput = upd); upd();
    $("fSave").onclick = async () => { const x = read();
      if (!x.n) return toast("Donnez un nom au produit");
      if (!(x.cap > 0 && x.d > 0)) return toast("Contenance et dose obligatoires");
      $("fSave").classList.add("busy");
      if (await act(() => actSaveProduct(id, x), id ? "Produit mis à jour ✓" : "Produit ajouté ✓")) closeSheet();
      else $("fSave").classList.remove("busy"); };
    if (id) armBtn($("fDel"), "Toucher encore pour supprimer", async () => { if (await act(() => actDeleteProduct(id), "Produit supprimé")) closeSheet(); });
  });
}
function cocktailSheet(id) {
  if (!S.products.length) return toast("Ajoutez d'abord des produits à votre carte");
  const k = id ? S.cocktails.find(c => c.id === id) : {n:"",s:"",x:0.3,ing:[{p:S.products[0].id,cl:5}]};
  let ing = k.ing.map(g => ({...g}));
  const prodOpts = sel => opts(S.products.map(p => [p.id, p.n]), sel);
  openSheet(`<h2 class="h">${id ? esc(k.n) : "Nouveau cocktail"}</h2><div class="sub">Le coût se calcule ingrédient par ingrédient</div>
    <div class="field"><label for="kN">Nom du cocktail</label><input id="kN" value="${esc(k.n)}" placeholder="Ex : Daïquiri" maxlength="80"></div>
    <div class="two"><div class="field"><label for="kS">Prix de vente TTC (€)</label><input id="kS" inputmode="decimal" value="${f1x(k.s)}"></div>
    <div class="field"><label for="kX">Garniture, sucre, glace (€)</label><input id="kX" inputmode="decimal" value="${f1x(k.x)}"></div></div>
    <div class="lbl" style="margin-top:4px"><span>Ingrédients de la carte</span></div><div id="kIng"></div>
    <button class="btn ghost" id="kAdd" style="margin-bottom:12px">+ Ajouter un ingrédient</button>
    <div class="card" style="background:var(--card2)"><div class="res" id="kRes"></div></div>
    <button class="btn" id="kSave">Enregistrer</button>${id ? `<div class="gap"></div><button class="btn danger" id="kDel">Supprimer ce cocktail</button>` : ""}`, () => {
    const drawIng = () => { $("kIng").innerHTML = ing.map((g, i) => `<div class="ing"><div class="field"><select data-i="${i}" data-f="p" aria-label="Ingrédient">${prodOpts(g.p)}</select></div>
      <div class="field"><input data-i="${i}" data-f="cl" inputmode="decimal" value="${f1x(g.cl)}" aria-label="Quantité en cl"></div><button class="x" data-del="${i}" aria-label="Retirer l'ingrédient">✕</button></div>`).join("");
      $("kIng").querySelectorAll("[data-f]").forEach(e => e.oninput = () => { const g = ing[+e.dataset.i]; if (e.dataset.f === "p") g.p = e.value; else g.cl = num(e.value); upd(); });
      $("kIng").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { ing.splice(+b.dataset.del, 1); drawIng(); upd(); }); };
    const read = () => ({n:$("kN").value.trim(),s:num($("kS").value),x:num($("kX").value),ing:ing.filter(g => byId(g.p) && g.cl > 0).map(g => ({...g}))});
    const upd = () => { const x = read(), c = cockCalc(x), sg = suggest(c.cost, c.alc, S.target);
      const lines = x.ing.map(g => { const p = byId(g.p); return `${esc(p.n.split(" ")[0])} ${eur(pcost(p, g.cl))}`; }).join(" + ");
      $("kRes").innerHTML = `<div><div class="l">Coût du cocktail</div><div class="v h">${eur(c.cost)}</div></div><div><div class="l">Gagné par verre</div><div class="v h">${eur(c.marg)}</div></div>
       <div><div class="l">Taux de marge</div><div class="v h" style="color:${tone(c.rate)}">${pct(c.rate)}</div></div><div><div class="l">Prix conseillé (${S.target} %)</div><div class="v h">${eur(sg)}</div></div>
       <div style="grid-column:1/-1"><div class="l">Détail du coût · TVA ${c.alc ? 20 : 10} %</div><div style="font-size:12px;margin-top:3px">${lines || "—"}${x.x ? " + extras " + eur(x.x) : ""}</div></div>`; };
    drawIng(); upd(); ["kN","kS","kX"].forEach(i => $(i).oninput = upd);
    $("kAdd").onclick = () => { const u = S.products.find(p => !ing.some(g => g.p === p.id)) || S.products[0]; ing.push({p: u.id, cl: 2}); drawIng(); upd(); };
    $("kSave").onclick = async () => { const x = read();
      if (!x.n) return toast("Donnez un nom au cocktail");
      if (!x.ing.length) return toast("Ajoutez au moins un ingrédient");
      $("kSave").classList.add("busy");
      if (await act(() => actSaveCocktail(id, x), id ? "Cocktail mis à jour ✓" : "Cocktail créé ✓")) closeSheet();
      else $("kSave").classList.remove("busy"); };
    if (id) armBtn($("kDel"), "Toucher encore pour supprimer", async () => { if (await act(() => actDeleteCocktail(id), "Cocktail supprimé")) closeSheet(); });
  });
}

/* ================= Réglages ================= */
function settingsSheet() {
  if (isBarman()) return accountSheet();
  const acc = MODE === "cloud"
    ? `<div class="lbl"><span>Équipe</span></div><div class="card list" id="team"><div class="empty">Chargement…</div></div>
       <div class="two"><button class="btn ghost" id="invB">Inviter un barman</button><button class="btn ghost" id="invP">Inviter un associé</button></div>
       <div class="lbl"><span>Compte</span></div><div class="card list"><div class="row"><div class="grow"><div class="name">${esc(ME.email)}</div><div class="meta">Patron · ${esc(ETAB.nom)}</div></div></div></div>
       <button class="btn ghost" id="swEtab">Changer d'établissement ou rejoindre</button><div class="gap"></div>
       <button class="btn danger" id="logout">Se déconnecter</button>`
    : (CLOUD ? `<div class="card" style="margin-top:16px"><div class="name">Sauvegardez votre carte en ligne</div><p class="tip" style="margin:4px 0 12px">Pour la retrouver sur tous vos appareils et la partager avec votre équipe.</p><button class="btn" id="goAcc">Créer un compte ou se connecter</button></div>` : "")
      + `<div class="gap"></div><button class="btn danger" id="sReset">Remettre les données d'exemple</button>`;
  openSheet(`<h2 class="h">Réglages</h2><div class="sub">${MODE === "cloud" ? "Enregistré en ligne pour toute l'équipe" : "Mode essai : données gardées dans ce navigateur"}</div>
    <div class="field"><label for="sBar">Nom de l'établissement</label><input id="sBar" value="${esc(S.bar)}" placeholder="Ex : Le Comptoir" maxlength="80"></div>
    <div class="field"><label for="sT">Objectif spiritueux et cocktails : <b id="sTl" style="color:var(--amber2)">${S.target} %</b></label><input id="sT" class="range" type="range" min="60" max="90" value="${S.target}"></div>
    <div class="field"><label for="sT2">Objectif bouteilles et canettes servies entières (bière, soft, eau) : <b id="sT2l" style="color:var(--amber2)">${S.target2 ?? 65} %</b></label><input id="sT2" class="range" type="range" min="40" max="85" value="${S.target2 ?? 65}"></div>
    <div class="field"><label for="sV">Verres vendus par mois et par produit (pour les estimations)</label><input id="sV" inputmode="decimal" value="${S.vol}"></div>
    <button class="btn" id="sSave">Enregistrer</button>${avisBtns()}${acc}${`<div class="center" style="margin-top:18px;font-size:12px;color:var(--mut)"><a href="mentions-legales.html" style="color:var(--mut)">Mentions légales</a> · <a href="confidentialite.html" style="color:var(--mut)">Confidentialité</a> · <a href="conditions.html" style="color:var(--mut)">Conditions</a></div>`}`, () => {
    armAvis();
    $("sT").oninput = () => $("sTl").textContent = $("sT").value + " %";
    $("sT2").oninput = () => $("sT2l").textContent = $("sT2").value + " %";
    $("sSave").onclick = async () => { $("sSave").classList.add("busy");
      if (await act(() => actSettings({bar: $("sBar").value.trim(), target: +$("sT").value, target2: +$("sT2").value, vol: Math.max(1, Math.round(num($("sV").value)))}), "Réglages enregistrés ✓")) closeSheet();
      else $("sSave").classList.remove("busy"); };
    if (MODE === "cloud") {
      loadTeam();
      $("invB").onclick = () => invite("barman"); $("invP").onclick = () => invite("patron");
      $("swEtab").onclick = () => { closeSheet(); showAuth("etab"); };
      $("logout").onclick = logout;
    } else {
      if ($("goAcc")) $("goAcc").onclick = () => { closeSheet(); showAuth("login"); };
      armBtn($("sReset"), "Toucher encore : tout sera effacé", () => { const bar = S.bar; S = seed(); S.bar = bar; save(); closeSheet(); go("home"); toast("Données d'exemple restaurées"); });
    }
  });
}
async function loadTeam() {
  try {
    const rows = await q(sb.from("membres").select("user_id,role,email").eq("etab_id", ETAB.id).order("role"));
    const el = $("team"); if (!el) return;
    el.innerHTML = rows.map(r => `<div class="row"><div class="grow"><div class="name">${esc(r.email || "Membre")}</div></div><span class="role">${r.role === "patron" ? "Patron" : "Barman"}</span>${r.user_id !== ME.id ? `<button class="mini" style="margin:0 0 0 8px;background:var(--card2);color:var(--bad)" data-u="${esc(r.user_id)}">Retirer</button>` : ""}</div>`).join("");
    el.querySelectorAll("[data-u]").forEach(b => armBtn(b, "Confirmer", async () => {
      try { await q(sb.from("membres").delete().eq("etab_id", ETAB.id).eq("user_id", b.dataset.u)); toast("Membre retiré"); loadTeam(); } catch (e) { toast(frErr(e)); } }));
  } catch (e) { const el = $("team"); if (el) el.innerHTML = `<div class="empty">${esc(frErr(e))}</div>`; }
}
async function invite(role) {
  try {
    const code = await q(sb.rpc("inviter", {p_etab: ETAB.id, p_role: role}));
    openSheet(`<h2 class="h">Code d'invitation</h2><div class="sub">À donner à votre ${role === "barman" ? "barman" : "associé"}. Valable 7 jours, une seule fois.</div>
      <div class="code">${esc(code)}</div>
      <p class="tip" style="margin:12px 0">Il ouvre <b>${esc(location.host || "dosisbar.com")}</b>, crée son compte, puis choisit « J'ai un code d'invitation ».${role === "barman" ? " Il verra uniquement le mode Service, sans vos prix d'achat ni vos marges." : ""}</p>
      <button class="btn" id="cpCode">Copier le message</button><div class="gap"></div><button class="btn ghost" id="okCode">Terminé</button>`, () => {
      $("cpCode").onclick = async () => { try { await navigator.clipboard.writeText(`Rejoins ${ETAB.nom} sur Dosis Bar : ouvre ${location.origin + location.pathname}, crée ton compte puis entre le code ${code}`); toast("Message copié ✓"); } catch (e) { toast("Copie impossible ici"); } };
      $("okCode").onclick = closeSheet; });
  } catch (e) { toast(frErr(e)); }
}
function accountSheet() {
  openSheet(`<h2 class="h">Mon compte</h2><div class="sub">${esc(ME.email)}</div>
    <div class="card list"><div class="row"><div class="grow"><div class="name">${esc(ETAB.nom)}</div><div class="meta">Vous êtes barman : mode Service uniquement</div></div></div></div>
    <button class="btn ghost" id="swEtab">Changer d'établissement ou rejoindre</button><div class="gap"></div>
    <button class="btn danger" id="logout">Se déconnecter</button>${avisBtns()}${`<div class="center" style="margin-top:18px;font-size:12px;color:var(--mut)"><a href="mentions-legales.html" style="color:var(--mut)">Mentions légales</a> · <a href="confidentialite.html" style="color:var(--mut)">Confidentialité</a> · <a href="conditions.html" style="color:var(--mut)">Conditions</a></div>`}`, () => {
    armAvis();
    $("swEtab").onclick = () => { closeSheet(); showAuth("etab"); }; $("logout").onclick = logout; });
}
$("setBtn").onclick = settingsSheet;

/* ================= Avis des testeurs ================= */
let IS_ADMIN = false;
function avisBtns() {
  return `<div class="avis-cta"><div class="grow"><div class="name">Votre avis compte</div><div class="meta">Une idée, un manque, un bug : dites-le-nous, on corrige vite.</div></div><button class="mini" id="avisGo">Donner mon avis</button></div>`
    + (IS_ADMIN ? `<button class="btn ghost" id="avisRead">Avis reçus</button>` : "");
}
function armAvis() {
  if ($("avisGo")) $("avisGo").onclick = avisSheet;
  if ($("avisRead")) $("avisRead").onclick = avisList;
}
function avisSheet() {
  const ecran = (document.querySelector(".view.on") || {}).id || "";
  openSheet(`<h2 class="h">Donner mon avis</h2><div class="sub">Votre message arrive directement chez l'équipe Dosis Bar.</div>
    <div class="chips" role="radiogroup" aria-label="Type d'avis" id="avH">
      <button class="chip" role="radio" aria-checked="false" data-h="aime">👍 J'aime</button>
      <button class="chip" role="radio" aria-checked="false" data-h="manque">💡 Il manque quelque chose</button>
      <button class="chip" role="radio" aria-checked="false" data-h="bloque">⚠️ Quelque chose bloque</button>
    </div>
    <div class="field"><label for="avM">Votre message</label><textarea id="avM" rows="5" maxlength="2000" placeholder="Ex : j'aimerais pouvoir gérer le vin au verre…"></textarea></div>
    <button class="btn" id="avSend">Envoyer</button>`, () => {
    let h = "";
    $("avH").querySelectorAll("[data-h]").forEach(b => b.onclick = () => { h = b.dataset.h;
      $("avH").querySelectorAll("[data-h]").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); }); });
    $("avM").focus();
    $("avSend").onclick = async () => {
      const m = $("avM").value.trim(); if (!m) { toast("Écrivez quelques mots avant d'envoyer"); $("avM").focus(); return; }
      const app = navigator.userAgent.replace(/\s+/g, " ").slice(0, 200);
      if (MODE === "cloud") {
        $("avSend").classList.add("busy");
        try { await q(sb.rpc("donner_avis", {p_etab: ETAB ? ETAB.id : null, p_humeur: h, p_message: m, p_ecran: ecran, p_appareil: app}));
          closeSheet(); toast("Merci, avis envoyé ✓"); return; }
        catch (e) { $("avSend").classList.remove("busy"); if (navigator.onLine) { toast(frErr(e)); return; } }
      }
      const lbl = {aime: "J'aime", manque: "Il manque quelque chose", bloque: "Quelque chose bloque"}[h] || "Avis";
      location.href = "mailto:contact@dosisbar.com?subject=" + encodeURIComponent("Avis Dosis Bar : " + lbl) + "&body=" + encodeURIComponent(m + "\n\n(" + (S.bar || "") + ")");
      closeSheet();
    };
  });
}
async function avisList() {
  openSheet(`<h2 class="h">Avis reçus</h2><div class="sub">Les messages de vos testeurs, du plus récent au plus ancien.</div><div class="card list" id="avL"><div class="empty">Chargement…</div></div>`, async () => {
    try {
      const rows = await q(sb.rpc("lire_avis"));
      const ic = {aime: "👍", manque: "💡", bloque: "⚠️"};
      $("avL").innerHTML = rows.length ? rows.map(r => `<div class="row avis-row${r.lu ? "" : " neuf"}" data-id="${r.id}"><div class="grow">
        <div class="meta">${ic[r.humeur] || "💬"} ${esc(new Date(r.cree_le).toLocaleString("fr-FR", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}))} · ${esc(r.etab_nom || "Sans établissement")}${r.role ? " · " + (r.role === "patron" ? "Patron" : "Barman") : ""}</div>
        <div class="avis-msg">${esc(r.message)}</div><div class="meta">${esc(r.email || "")}</div></div></div>`).join("")
        : `<div class="empty">Aucun avis pour l'instant.</div>`;
      rows.filter(r => !r.lu).forEach(r => sb.rpc("marquer_avis_lu", {p_id: r.id}));
    } catch (e) { $("avL").innerHTML = `<div class="empty">${esc(frErr(e))}</div>`; }
  });
}
function checkAdmin() { if (MODE === "cloud" && sb) sb.rpc("est_admin").then(({data}) => { IS_ADMIN = !!data; }, () => {}); }


/* ================= Connexion, compte, établissement ================= */
function showAuth(screen, msg) {
  const A = $("auth"), brand = `<div class="brand">${glass(.62, {w:56, wave:true})}<h1 class="h">Dosis <span>Bar</span></h1><p>Ce que chaque verre vous rapporte vraiment.</p></div>`;
  const demoLink = `<div class="center" style="margin-top:14px"><button class="link" id="aDemo">Essayer sans compte</button></div>`;
  let html = "";
  if (screen === "login") html = `${brand}<h2 class="h" id="authTitle">Connexion</h2><div class="sub">Retrouvez votre bar sur tous vos appareils.</div>
    <form id="aForm"><div class="field"><label for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" required></div>
    <div class="field"><label for="aPass">Mot de passe</label><input id="aPass" type="password" autocomplete="current-password" required></div>
    <div class="err" id="aErr" role="alert">${esc(msg || "")}</div><button class="btn" type="submit">Se connecter</button></form>
    <div class="center" style="margin-top:10px"><button class="link" id="aForgot">Mot de passe oublié ?</button></div>
    <div class="gap"></div><button class="btn ghost" id="aSignup">Créer un compte</button>${demoLink}`;
  if (screen === "signup") html = `${brand}<h2 class="h" id="authTitle">Créer un compte</h2><div class="sub">Essai gratuit, sans carte bancaire.</div>
    <form id="aForm"><div class="field"><label for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" required></div>
    <div class="field"><label for="aPass">Mot de passe (8 caractères minimum)</label><input id="aPass" type="password" autocomplete="new-password" minlength="8" required></div>
    <label class="check" style="align-items:flex-start;font-size:13px;line-height:1.45"><input type="checkbox" id="aCgu" required style="margin-top:1px;flex:none"> <span>J'accepte les <a href="conditions.html" target="_blank" style="color:var(--amber2)">conditions d'utilisation</a> et j'ai lu la <a href="confidentialite.html" target="_blank" style="color:var(--amber2)">politique de confidentialité</a>.</span></label>
    <div class="err" id="aErr" role="alert"></div><button class="btn" type="submit">Créer mon compte</button></form>
    <div class="center" style="margin-top:10px"><button class="link" id="aLogin">J'ai déjà un compte</button></div>${demoLink}`;
  if (screen === "forgot") html = `${brand}<h2 class="h" id="authTitle">Mot de passe oublié</h2><div class="sub">Nous vous envoyons un lien pour en choisir un nouveau.</div>
    <form id="aForm"><div class="field"><label for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" required></div>
    <div class="err" id="aErr" role="alert"></div><button class="btn" type="submit">Recevoir le lien</button></form>
    <div class="center" style="margin-top:10px"><button class="link" id="aLogin">Retour à la connexion</button></div>`;
  if (screen === "newpass") html = `${brand}<h2 class="h" id="authTitle">Nouveau mot de passe</h2><div class="sub">Choisissez un nouveau mot de passe.</div>
    <form id="aForm"><div class="field"><label for="aPass">Nouveau mot de passe (8 caractères minimum)</label><input id="aPass" type="password" autocomplete="new-password" minlength="8" required></div>
    <div class="err" id="aErr" role="alert"></div><button class="btn" type="submit">Enregistrer</button></form>`;
  if (screen === "check") html = `${brand}<h2 class="h" id="authTitle">Vérifiez vos emails</h2>
    <p class="tip" style="margin:8px 0 18px">${esc(msg || "")}</p><button class="btn ghost" id="aLogin">Retour à la connexion</button>`;
  if (screen === "etab") html = `${brand}<h2 class="h" id="authTitle">Votre établissement</h2><div class="sub" id="aWho">${esc(ME ? ME.email : "")}</div>
    <div id="aList"></div>
    <div class="card"><div class="name">Créer mon établissement</div><p class="tip" style="margin:4px 0 12px">Vous en serez le patron.</p>
      <form id="aForm"><div class="field"><label for="aNom">Nom du bar ou du restaurant</label><input id="aNom" required maxlength="80" placeholder="Ex : Le Comptoir"></div>
      <label class="check"><input type="checkbox" id="aImport" checked> Reprendre la carte d'essai (${loadDemo().products.length} produits)</label>
      <div class="err" id="aErr" role="alert"></div><button class="btn" type="submit">Créer</button></form></div>
    <div class="card"><div class="name">J'ai un code d'invitation</div><p class="tip" style="margin:4px 0 12px">Donné par le patron de l'établissement.</p>
      <form id="aJoin"><div class="field"><label for="aCode">Code à 6 caractères</label><input id="aCode" required maxlength="6" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.2em;text-align:center"></div>
      <div class="err" id="aErr2" role="alert"></div><button class="btn ghost" type="submit">Rejoindre</button></form></div>
    <div class="center"><button class="link" id="aOut">Se déconnecter</button></div>`;
  $("authBody").innerHTML = html + `<div class="center" style="margin-top:18px;font-size:12px;color:var(--mut)"><a href="mentions-legales.html" style="color:var(--mut)">Mentions légales</a> · <a href="confidentialite.html" style="color:var(--mut)">Confidentialité</a> · <a href="conditions.html" style="color:var(--mut)">Conditions</a></div>`; A.classList.add("on"); A.scrollTop = 0;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on("aSignup", () => showAuth("signup")); on("aLogin", () => showAuth("login")); on("aForgot", () => showAuth("forgot"));
  on("aDemo", () => { lsSet(MKEY, "demo"); hideAuth(); startDemo(); });
  on("aOut", logout);
  const form = $("aForm"), err = m => { const e = $("aErr"); if (e) e.textContent = m; };
  const busy = (f, b) => f.querySelector("[type=submit]").classList.toggle("busy", b);
  if (screen === "login") form.onsubmit = async ev => { ev.preventDefault(); busy(form, true); err("");
    const {data, error} = await sb.auth.signInWithPassword({email: $("aEmail").value.trim(), password: $("aPass").value});
    busy(form, false); if (error) return err(frErr(error)); ME = data.user; enterCloud(); };
  if (screen === "signup") form.onsubmit = async ev => { ev.preventDefault(); err("");
    if ($("aPass").value.length < 8) return err("Mot de passe trop court (8 caractères minimum).");
    if (!$("aCgu").checked) return err("Merci d'accepter les conditions d'utilisation.");
    busy(form, true);
    const {data, error} = await sb.auth.signUp({email: $("aEmail").value.trim(), password: $("aPass").value, options: {emailRedirectTo: location.origin + location.pathname}});
    busy(form, false); if (error) return err(frErr(error));
    if (data.session) { ME = data.user; enterCloud(); }
    else showAuth("check", `Nous avons envoyé un lien de confirmation à ${$("aEmail") ? "" : ""}${data.user ? data.user.email : "votre adresse"}. Cliquez dessus, puis connectez-vous.`); };
  if (screen === "forgot") form.onsubmit = async ev => { ev.preventDefault(); busy(form, true); err("");
    const {error} = await sb.auth.resetPasswordForEmail($("aEmail").value.trim(), {redirectTo: location.origin + location.pathname});
    busy(form, false); if (error) return err(frErr(error));
    showAuth("check", "Si un compte existe avec cette adresse, vous allez recevoir un lien pour choisir un nouveau mot de passe."); };
  if (screen === "newpass") form.onsubmit = async ev => { ev.preventDefault(); err("");
    if ($("aPass").value.length < 8) return err("Mot de passe trop court (8 caractères minimum).");
    busy(form, true); const {error} = await sb.auth.updateUser({password: $("aPass").value});
    busy(form, false); if (error) return err(frErr(error)); toast("Mot de passe modifié ✓"); enterCloud(); };
  if (screen === "etab") {
    sb.rpc("mes_etablissements").then(({data}) => { const el = $("aList"); if (!el || !data || !data.length) return;
      el.innerHTML = `<div class="lbl"><span>Mes établissements</span></div><div class="card list">${data.map(e => `<div class="row tap" data-e="${esc(e.id)}"><div class="grow"><div class="name">${esc(e.nom)}</div></div><span class="role">${e.role === "patron" ? "Patron" : "Barman"}</span></div>`).join("")}</div>`;
      el.querySelectorAll("[data-e]").forEach(r => r.onclick = () => { const e = data.find(x => x.id === r.dataset.e); chooseEtab(e); }); });
    form.onsubmit = async ev => { ev.preventDefault(); busy(form, true); err("");
      try {
        const id = await q(sb.rpc("creer_etablissement", {p_nom: $("aNom").value.trim()}));
        ETAB = {id, nom: $("aNom").value.trim(), role: "patron"};
        if ($("aImport").checked) await importDemo();
        await chooseEtab(ETAB);
      } catch (e) { busy(form, false); err(frErr(e)); } };
    const j = $("aJoin"); j.onsubmit = async ev => { ev.preventDefault(); const e2 = $("aErr2"); e2.textContent = ""; busy(j, true);
      try { const id = await q(sb.rpc("rejoindre", {p_code: $("aCode").value.trim()}));
        const list = await q(sb.rpc("mes_etablissements")); await chooseEtab(list.find(x => x.id === id));
      } catch (e) { busy(j, false); e2.textContent = frErr(e); } };
  }
  setTimeout(() => { const f = A.querySelector("input"); if (f && screen !== "etab") f.focus(); }, 50);
}
function hideAuth() { $("auth").classList.remove("on"); }
async function importDemo() {
  const D = loadDemo(), map = {};
  for (const p of D.products) {
    const r = await q(sb.from("produits").insert(toDbP(p)).select("id").single()); map[p.id] = r.id;
  }
  for (const k of D.cocktails) {
    const r = await q(sb.from("cocktails").insert({etab_id: ETAB.id, nom: k.n, prix_vente_ttc: k.s, extras_ht: k.x}).select("id").single());
    const ing = k.ing.filter(g => map[g.p]).map(g => ({cocktail_id: r.id, produit_id: map[g.p], cl: g.cl}));
    if (ing.length) await q(sb.from("cocktail_ingredients").insert(ing));
  }
  await q(sb.from("etablissements").update({objectif_spiritueux: D.target, objectif_bouteilles: D.target2 ?? 65, volume_mois: D.vol}).eq("id", ETAB.id));
}
async function chooseEtab(e) {
  ETAB = {id: e.id, nom: e.nom, role: e.role}; lsSet(EKEY, ETAB);
  MODE = "cloud"; lsSet(MKEY, "cloud");
  S = Object.assign(emptyState(), lsGet(CKEY + "." + e.id) || {}); S.bar = e.nom;
  hideAuth(); closeSheet(); checkAdmin(); setSync("ok"); go(isBarman() ? "service" : "home");
  try { await loadCloud(); render(); } catch (err) { toast(frErr(err)); setSync(isNetErr(err) ? "off" : "err"); }
  flush(); startPoll();
}
async function enterCloud() {
  MODE = "cloud";
  try {
    const list = await q(sb.rpc("mes_etablissements"));
    if (!list.length) return showAuth("etab");
    const saved = lsGet(EKEY), e = (saved && list.find(x => x.id === saved.id)) || list[0];
    await chooseEtab(e);
  } catch (err) {
    const saved = lsGet(EKEY);
    if (isNetErr(err) && saved) { await chooseEtab(saved); setSync("off"); }   // démarrage hors ligne
    else showAuth("login", frErr(err));
  }
}
async function logout() {
  if (queueLen() && !confirmLeave()) return;
  try { await sb.auth.signOut(); } catch (e) {}
  ME = null; ETAB = null; IS_ADMIN = false; MODE = "demo"; localStorage.removeItem(EKEY); localStorage.removeItem(MKEY);
  closeSheet(); startDemo(true); showAuth("login");
}
let leaveArmed = false;
function confirmLeave() { if (leaveArmed) return true; leaveArmed = true; setTimeout(() => leaveArmed = false, 3000);
  toast("Des ventes ne sont pas encore envoyées. Touchez encore pour vous déconnecter quand même."); return false; }
function startDemo(quiet) {
  MODE = "demo"; ETAB = null; S = loadDemo(); setSync("ok"); go("home");
  if (!quiet && !S.bar && !S.welcomed) { S.welcomed = true; save();
    openSheet(`<div style="text-align:center;padding:6px 0 4px">${glass(.62, {w:64, wave:true})}</div><h2 class="h" style="text-align:center">Bienvenue sur Dosis Bar</h2>
    <div class="sub" style="text-align:center">Votre carte est déjà remplie avec des exemples. Comment s'appelle votre établissement ?</div>
    <div class="field"><input id="wBar" placeholder="Ex : Le Comptoir" style="text-align:center" aria-label="Nom de l'établissement" maxlength="80"></div>
    <button class="btn" id="wGo">C'est parti</button><div class="gap"></div><button class="btn ghost" id="wSkip">Plus tard</button>`, () => {
      $("wGo").onclick = () => { S.bar = $("wBar").value.trim(); save(); closeSheet(); renderHome(); }; $("wSkip").onclick = closeSheet; });
  }
}

/* ================= Feuille, confirmations, toast ================= */
let lastFocus = null;
function openSheet(html, mount) { lastFocus = document.activeElement; $("sBody").innerHTML = html; $("sheet").scrollTop = 0; $("veil").classList.add("on");
  requestAnimationFrame(() => $("sheet").classList.add("on")); if (mount) mount(); }
function closeSheet() { $("sheet").classList.remove("on"); $("veil").classList.remove("on"); if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {} }
$("veil").onclick = closeSheet;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet();
  if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("tile")) { e.preventDefault(); tap(e.target.dataset.k, 1); } });
function armBtn(btn, armedLabel, fn) { const orig = btn.textContent; let t;
  btn.onclick = () => { if (btn.dataset.armed) { clearTimeout(t); delete btn.dataset.armed; btn.classList.remove("armed"); btn.textContent = orig; fn(); return; }
    btn.dataset.armed = 1; btn.classList.add("armed"); btn.textContent = armedLabel;
    t = setTimeout(() => { delete btn.dataset.armed; btn.classList.remove("armed"); btn.textContent = orig; }, 2600); }; }
let tt; function toast(m) { $("toast").textContent = m; $("toast").classList.add("on"); clearTimeout(tt); tt = setTimeout(() => $("toast").classList.remove("on"), 2400); }

/* ================= Démarrage ================= */
$("logoGlass").innerHTML = glass(.62, {w:24});
$("sideGlass").innerHTML = glass(.62, {w:40});
if (!CLOUD) { const n = $("sideNote"); if (n) n.textContent = "Version d'essai : les données restent dans ce navigateur."; }
document.addEventListener("visibilitychange", () => { if (!document.hidden) { flush(); bgReload(); } });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

(async function boot() {
  if (!CLOUD) return startDemo();
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") { ME = session && session.user; showAuth("newpass"); }
    if (ev === "SIGNED_OUT" && MODE === "cloud") { MODE = "demo"; showAuth("login"); }
  });
  const {data: {session}} = await sb.auth.getSession();
  if (session && !/type=recovery/.test(location.hash)) { ME = session.user; return enterCloud(); }
  if (lsGet(MKEY) === "demo") return startDemo();
  startDemo(true); showAuth("login");
})();

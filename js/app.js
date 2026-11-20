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
const CATS = {Rhum:"🥃",Whisky:"🥃",Gin:"🍸",Vodka:"🍸",Anisé:"🌿",Liqueur:"🥃",Bière:"🍺","Bière pression":"🍺",Cidre:"🍏",Vin:"🍷",Champagne:"🍾",Soft:"🥤",Jus:"🍊",Sirop:"🍒",Eau:"💧",Café:"☕",Thé:"🍵",Chocolat:"🍫",Lait:"🥛",Autre:"🍶"};
/* Unités : liquides en cl, café et poudres en g, sachets et pièces à l'unité */
const UNITS = {cl: ["cl", "centilitres (liquides)"], g: ["g", "grammes (café, poudre)"], pce: ["pièce", "pièces (bouteilles, canettes, sachets, capsules)"]};
const uOf = p => p && UNITS[p.u] ? p.u : "cl";
const uTxt = (p, n) => { const u = uOf(p); return u === "pce" ? (n > 1 ? "pièces" : "pièce") : u; };
const CAT_UNIT = {Café: ["g", 1000, 7], Chocolat: ["g", 1000, 25], Thé: ["pce", 100, 1], Lait: ["cl", 100, 15]};
const REC_CATS = [["Cocktails", "🍹 Cocktail"], ["Sans alcool", "🧃 Cocktail sans alcool"], ["Boissons chaudes", "☕ Boisson chaude"]];
const recEmoji = c => c === "Boissons chaudes" ? "☕" : c === "Sans alcool" ? "🧃" : "🍹";
/* Formats de vente types, par catégorie : [nom, cl (0 = toute la bouteille)] */
const FMT_TYPES = {Vin: [["Verre 12 cl", 12], ["Pichet 25 cl", 25], ["Pichet 50 cl", 50], ["Bouteille", 0]], Champagne: [["Coupe 12 cl", 12], ["Bouteille", 0]],
  "Bière pression": [["Galopin 12,5 cl", 12.5], ["Demi 25 cl", 25], ["Pinte 50 cl", 50], ["Pichet 1 L", 100]], Cidre: [["Bolée 25 cl", 25], ["Bouteille", 0]],
  _spirit: [["Double", -2], ["Bouteille entière", 0]], Café: [["Double", -2], ["Allongé", -1], ["Ristretto", -1]], Thé: [["Théière (2 sachets)", -2]], Soft: [["Verre 25 cl", 25], ["Carafe 1 L", 100]], Jus: [["Verre 25 cl", 25], ["Carafe 1 L", 100]]};
const SPIRITS = ["Rhum", "Whisky", "Gin", "Vodka", "Anisé", "Liqueur"];
const contName = p => !p ? "bouteille" : p.c === "Bière pression" ? "fût" : ["Café", "Chocolat"].includes(p.c) ? "paquet" : p.c === "Thé" ? "boîte" : "bouteille";
const KEY = "dosisbar.v2", QKEY = "dosisbar.queue", CKEY = "dosisbar.cache", EKEY = "dosisbar.etab", MKEY = "dosisbar.mode";
const SAMPLE_P = [
  {n:"Rhum Ambré Caribe",c:"Rhum",a:1,b:15,cap:70,d:5,s:7,st:2,m:3},
  {n:"Whisky Glenfinil",c:"Whisky",a:1,b:24,cap:70,d:4,s:10,st:5,m:2},
  {n:"Gin Botanique",c:"Gin",a:1,b:22,cap:70,d:4,s:9,st:4,m:2},
  {n:"Vodka Nordik",c:"Vodka",a:1,b:16,cap:70,d:4,s:6.5,st:1,m:2},
  {n:"Pastis Provence",c:"Anisé",a:1,b:14,cap:100,d:2,s:4,st:6,m:2},
  {n:"Bière Artisanale Blonde",c:"Bière",a:1,b:2.4,cap:33,d:33,s:6,st:24,m:24,al:["gluten"]},
  {n:"Bière pression blonde",c:"Bière pression",a:1,b:95,cap:3000,d:25,s:4,st:2,m:1,al:["gluten"],fn:"Demi 25 cl",pt:8,fm:[{id:"fmd1",n:"Pinte 50 cl",d:50,s:7.5},{id:"fmd2",n:"Galopin 12,5 cl",d:12.5,s:2.5},{id:"fmd3",n:"Pichet 1 L",d:100,s:14}]},
  {n:"Côtes-du-Rhône rouge",c:"Vin",a:1,b:6.5,cap:75,d:12,s:5,st:12,m:6,al:["sulfites"],fn:"Verre 12 cl",pt:4,fm:[{id:"fmd4",n:"Pichet 25 cl",d:25,s:9},{id:"fmd5",n:"Pichet 50 cl",d:50,s:16},{id:"fmd6",n:"Bouteille",d:75,s:26}]},
  {n:"Coca-Cola 33cl",c:"Soft",a:0,b:0.9,cap:33,d:33,s:4.5,st:48,m:24},
  {n:"Jus d'orange pressé",c:"Jus",a:0,b:3.2,cap:100,d:20,s:4.5,st:6,m:3},
  {n:"Sirop de Grenadine",c:"Sirop",a:0,b:6,cap:100,d:3,s:2.5,st:3,m:1},
  {n:"Eau minérale gazeuse",c:"Eau",a:0,b:1.1,cap:50,d:50,s:4,st:30,m:12},
  {n:"Café en grains",c:"Café",a:0,b:21,cap:1000,d:7,s:2.2,st:3,m:2,u:"g",fn:"Expresso",fm:[{id:"fmd7",n:"Double",d:14,s:3.8},{id:"fmd8",n:"Allongé",d:7,s:2.4}]},
  {n:"Lait entier",c:"Lait",a:0,b:1.05,cap:100,d:15,s:0,st:12,m:6,al:["lait"]},
  {n:"Thé (sachets)",c:"Thé",a:0,b:9,cap:100,d:1,s:3.5,st:2,m:1,u:"pce"}
];
function seed() {
  const t = Date.now();
  const products = SAMPLE_P.map((p, i) => ({id: "d" + (t + i), ...p}));
  const id = n => products.find(p => p.n === n).id;
  const cocktails = [
    {id:"d"+(t+100),n:"Cuba Libre",s:11,x:0.3,ing:[{p:id("Rhum Ambré Caribe"),cl:5},{p:id("Coca-Cola 33cl"),cl:20}]},
    {id:"d"+(t+101),n:"Mojito",s:12,x:0.9,ing:[{p:id("Rhum Ambré Caribe"),cl:5},{p:id("Eau minérale gazeuse"),cl:8}]},
    {id:"d"+(t+102),n:"Gin Tonic",s:12,x:0.8,ing:[{p:id("Gin Botanique"),cl:5}]},
    {id:"d"+(t+103),n:"Virgin Sunrise",s:7,x:0.2,cat:"Sans alcool",ing:[{p:id("Jus d'orange pressé"),cl:15},{p:id("Sirop de Grenadine"),cl:2}]},
    {id:"d"+(t+104),n:"Cappuccino",s:4.5,x:0.05,cat:"Boissons chaudes",ing:[{p:id("Café en grains"),cl:7},{p:id("Lait entier"),cl:15}]},
    {id:"d"+(t+105),n:"Café crème",s:3.8,x:0.05,cat:"Boissons chaudes",ing:[{p:id("Café en grains"),cl:7},{p:id("Lait entier"),cl:10}]},
    {id:"d"+(t+106),n:"Noisette",s:2.6,x:0.03,cat:"Boissons chaudes",ing:[{p:id("Café en grains"),cl:7},{p:id("Lait entier"),cl:2}]}
  ];
  const history = [], base = [212,188,264,301,176,342];
  for (let i = 6; i >= 1; i--) { const d = new Date(); d.setDate(d.getDate() - i);
    history.push({date:d.toISOString(),marg:base[6-i],ca:Math.round(base[6-i]*1.55),qty:Math.round(base[6-i]/5.2),demo:true}); }
  return {v:3,bar:"",target:80,target2:65,vol:60,products,cocktails,live:{},history,lastInv:null,
    ch:{loyer:1800,energie:380,salaires:2600,assur:120,compta:150,abo:90,pret:0,autres:160,v:2600,net:15}};
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
const tgtI = i => i.kind === "p" || i.kind === "f" ? tgtP(i.o) : S.target;
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
const pcost = (p, cl) => p && p.cap > 0 ? p.b / p.cap * cl / (1 - Math.min(60, Math.max(0, num(p.pt))) / 100) : 0;
/* Charges fixes : réparties de façon égale sur chaque verre vendu */
const CH_LINES = [["loyer","Loyer et charges locatives"],["energie","Électricité, chauffage, eau"],["salaires","Salaires chargés (barmen, extras)"],
  ["assur","Assurances"],["compta","Comptable et banque"],["abo","Abonnements (caisse, internet, logiciels)"],["pret","Remboursement de prêt"],["autres","Autres charges"]];
const chTotal = (c = S.ch) => c ? CH_LINES.reduce((t, [k]) => t + num(c[k]), 0) : 0;
const cpv = (c = S.ch) => c && num(c.v) > 0 && chTotal(c) > 0 ? chTotal(c) / num(c.v) : 0;
const chOn = () => cpv() > 0;
const netTarget = () => S.ch && isFinite(num(S.ch.net)) ? num(S.ch.net) : 15;
function withCh(r) { const ch = cpv(), full = r.cost + ch, net = r.ht - full;
  return Object.assign(r, {ch, full, net, netRate: r.ht > 0 ? net / r.ht * 100 : NaN}); }
const tvaOf = a => typeof a === "number" ? a : (a ? .2 : .1);
function suggestNet(cost, alc, netPct = netTarget()) { const ht = (cost + cpv()) / (1 - netPct / 100); return ceil10(ht * (1 + tvaOf(alc))); }
function minPrice(cost, alc) { return ceil10((cost + cpv()) * (1 + tvaOf(alc))); }
function realVolume() { // verres réellement vendus par mois, d'après les services clôturés
  const h = (S.history || []).filter(x => !x.demo && x.qty > 0); if (h.length < 3) return null;
  const t = h.map(x => +new Date(x.date)), days = Math.max(7, (Math.max(...t) - Math.min(...t)) / 864e5 + 1);
  return Math.round(h.reduce((a, x) => a + x.qty, 0) / days * 30); }
function prodCalc(p) { const tva = p.a ? .2 : .1, ht = p.s / (1 + tva), cost = pcost(p, p.d), marg = ht - cost;
  return withCh({tva, ht, cost, marg, rate: ht > 0 ? marg / ht * 100 : NaN, alc: !!p.a}); }
function cockCalc(k) { let cost = num(k.x), alc = false;
  k.ing.forEach(i => { const p = byId(i.p); if (p) { cost += pcost(p, i.cl); if (p.a) alc = true; } });
  const tva = alc ? .2 : .1, ht = k.s / (1 + tva), marg = ht - cost;
  return withCh({tva, ht, cost, marg, rate: ht > 0 ? marg / ht * 100 : NaN, alc}); }
function suggest(cost, alc, target) { const ht = cost / (1 - target / 100); return ceil10(ht * (alc ? 1.2 : 1.1)); }
function status(c, p, t = S.target) {
  if (p && !(p.s > 0)) return ["Ingrédient", "b-ok"];
  if (chOn() && c.ht > 0 && c.net < 0) return ["À perte", "b-bad"];
  if (p && p.st < p.m) return ["Stock bas", "b-bad"];
  if (c.rate < t - 10) return ["Marge faible", "b-bad"];
  if (c.rate < t) return ["À ajuster", "b-warn"];
  return ["Rentable", "b-ok"];
}
/* ================= Zones de prix, pertes, allergènes ================= */
const ZONES = [["comptoir","Comptoir"],["salle","Salle"],["terrasse","Terrasse"],["hh","Happy hour"]];
const LOSS = {offert: ["Offert", "🎁"], casse: ["Casse", "💥"], perso: ["Repas du personnel", "🍽️"], jete: ["Produit jeté", "🗑️"], autre: ["Autre perte", "➖"]};
const SVC_LOSS = ["offert", "casse", "perso"];
const isLoss = z => SVC_LOSS.includes(z);
const zoneRules = () => (S.opts && S.opts.zones) || {};
const zoneOn = z => z === "comptoir" || !!(zoneRules()[z] && zoneRules()[z].on);
function zonePrice(base, z) {
  if (isLoss(z)) return 0; if (z === "comptoir") return base;
  const r = zoneRules()[z]; if (!r || !r.on) return base;
  const sg = z === "hh" ? -1 : 1, v = num(r.v);
  return Math.max(0, Math.round((r.t === "pct" ? base * (1 + sg * v / 100) : base + sg * v) * 100) / 100);
}
const zoneLabel = z => (ZONES.find(x => x[0] === z) || [z, (LOSS[z] || [z])[0]])[1];
const liveSplit = lk => { const i = lk.indexOf("@"); return i < 0 ? [lk, "comptoir"] : [lk.slice(0, i), lk.slice(i + 1)]; };
const liveTotal = key => Object.entries(S.live || {}).reduce((t, [lk, n]) => liveSplit(lk)[0] === key ? t + n : t, 0);
function liveNorm() { const L = {}; for (const k in S.live || {}) { const [a, z] = liveSplit(k); L[a + "@" + z] = (L[a + "@" + z] || 0) + S.live[k]; } S.live = L; }
const ALG = [["gluten","Gluten"],["crustaces","Crustacés"],["oeufs","Œufs"],["poissons","Poissons"],["arachides","Arachides"],["soja","Soja"],["lait","Lait"],
  ["fruits_coque","Fruits à coque"],["celeri","Céleri"],["moutarde","Moutarde"],["sesame","Sésame"],["sulfites","Sulfites"],["lupin","Lupin"],["mollusques","Mollusques"]];
const algName = k => (ALG.find(a => a[0] === k) || [k, k])[1];
function algChips(sel) { return `<div class="algs" id="algBox">${ALG.map(([k, l]) => `<button type="button" class="chip ${sel.includes(k) ? "on" : ""}" data-al="${k}" aria-pressed="${sel.includes(k)}">${l}</button>`).join("")}</div>`; }
function algRead() { return [...document.querySelectorAll("#algBox [data-al].on")].map(b => b.dataset.al); }
function algArm(cb) { document.querySelectorAll("#algBox [data-al]").forEach(b => b.onclick = () => { b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on")); if (cb) cb(); }); }
function linesAlg(lines, seen = new Set()) { const out = new Set();
  (lines || []).forEach(l => { const o = cuFind(l.t, l.id); if (!o) return;
    if (l.t === "i") (o.al || []).forEach(a => out.add(a));
    else if (!seen.has(o.id)) { seen.add(o.id); linesAlg(o.lines, seen).forEach(a => out.add(a)); } });
  return [...out]; }
const cockAlg = k => [...new Set(k.ing.flatMap(g => (byId(g.p) || {}).al || []))];
const algText = a => a.length ? a.map(algName).join(", ") : "Aucun allergène déclaré";

/* ================= Restauration : calculs ================= */
const CU_U = {kg: ["g", 1000, "kg"], L: ["cl", 100, "L"], pce: ["pce", 1, "pièce"]};
const BUY_U = {kg: ["kg", 1, "kg"], g: ["kg", 1000, "g"], L: ["L", 1, "L"], cl: ["L", 100, "cl"], ml: ["L", 1000, "ml"], pce: ["pce", 1, "pièces"]};
function buyInfo(o) { // quantité et prix tels qu'achetés → prix par kg / L / pièce
  const ua = BUY_U[o.ua] ? o.ua : (o.u || "kg"), qa = num(o.qa) > 0 ? num(o.qa) : 1, pa = o.pa != null && o.pa !== "" ? num(o.pa) : num(o.prix);
  const b = BUY_U[ua], base = qa / b[1]; return {ua, qa, pa, u: b[0], prix: base > 0 ? pa / base : 0}; }
const CU_CATS = {"Entrée":"🥗","Plat":"🍽️","Dessert":"🍰","Burger, sandwich":"🍔","Pizza":"🍕","Accompagnement":"🍟","Planche, tapas":"🧀","Menu, formule":"🍱","Autre":"🍴"};
const cu = () => S.cu || (S.cu = {i: [], r: [], d: []});
/* Accès selon l'abonnement (essai 14 jours, abonné, lecture seule) — calculé par la base : acces_etab */
const ACC = () => MODE === "cloud" ? (S.acces || {etat: "essai", resto: true}) : {etat: "demo", resto: true};
const canEdit = () => ACC().etat !== "lecture";
const restoAllowed = () => ACC().resto !== false;
const LOCK = "LECTURE_SEULE";
function needEdit() { if (!canEdit()) throw new Error(LOCK); }
const isLock = e => /LECTURE_SEULE|Essai gratuit terminé/.test((e && e.message) || String(e));
const daysLeft = d => Math.max(0, Math.ceil((new Date(d + "T00:00:00") - new Date(new Date().toDateString())) / 864e5));
function lockSheet() {
  if (isBarman()) return toast("L'essai gratuit de l'établissement est terminé : demandez au patron de s'abonner.");
  aboSheet(); toast("Essai gratuit terminé : abonnez-vous pour continuer");
}
async function accRefresh() { if (!cloud()) return; try { S.acces = await q(sb.rpc("acces_etab", {p_etab: ETAB.id})); save(); } catch (e) {} }
const restoOn = () => !!(S.resto && S.resto.on) && restoAllowed();
const cuTarget = () => (S.resto && S.resto.target) || 70;
const cuFind = (t, id) => (cu()[t] || []).find(x => String(x.id) === String(id));
function cuUnit(t, id) { const o = cuFind(t, id); if (!o) return ""; return t === "i" ? (CU_U[o.u] || CU_U.kg)[0] : o.ru || "g"; }
function cuUnitCost(t, id, seen = new Set()) { // coût HT d'une petite unité (g, cl ou pièce)
  const o = cuFind(t, id); if (!o) return 0;
  if (t === "i") { const u = CU_U[o.u] || CU_U.kg, perte = Math.min(90, Math.max(0, num(o.perte))); return num(o.prix) / u[1] / (1 - perte / 100); }
  if (seen.has(o.id)) return 0; seen.add(o.id);
  const r = num(o.rend); return r > 0 ? linesCost(o.lines, seen) / r : 0;
}
function linesCost(lines, seen) { return (lines || []).reduce((t, l) => t + cuUnitCost(l.t, l.id, new Set(seen)) * num(l.q), 0); }
function platCalc(d) { const tva = num(d.tva || 10) / 100, cost = linesCost(d.lines) + num(d.x), ht = num(d.s) / (1 + tva), marg = ht - cost;
  return withCh({tva, ht, cost, marg, rate: ht > 0 ? marg / ht * 100 : NaN, alc: false}); }
function suggestPlat(cost, tva, t = cuTarget()) { return ceil10(cost / (1 - t / 100) * (1 + tva)); }
function prepUses(r, target, seen = new Set()) { // la préparation r utilise-t-elle target (directement ou non) ?
  if (seen.has(r.id)) return false; seen.add(r.id);
  return (r.lines || []).some(l => l.t === "r" && (String(l.id) === String(target) || (cuFind("r", l.id) && prepUses(cuFind("r", l.id), target, seen))));
}
function seedCuisine() {
  const t = Date.now(), I = [
    ["Bœuf haché 15 %","kg",13.9,0],["Pain burger brioché","pce",0.42,0],["Cheddar en tranches","pce",0.16,0],["Tomate","kg",2.9,10],
    ["Salade iceberg","pce",1.1,30],["Pommes de terre","kg",1.1,20],["Huile de friture","L",2.6,0],["Crème fraîche","L",4.2,0],
    ["Oignon","kg",1.4,15],["Citron","pce",0.35,0],["Poulet (filets)","kg",9.8,5],["Parmesan","kg",18,0]];
  const Q = {"Bœuf haché 15 %":5,"Pain burger brioché":48,"Cheddar en tranches":84,"Tomate":6,"Salade iceberg":12,"Pommes de terre":25,"Huile de friture":10,"Crème fraîche":2,"Oignon":5,"Citron":30,"Poulet (filets)":2.5,"Parmesan":1};
  const AL = {"Pain burger brioché":["gluten","oeufs","lait","sesame"],"Cheddar en tranches":["lait"],"Crème fraîche":["lait"],"Parmesan":["lait"]};
  const i = I.map(([n, u, prix, perte], k) => ({id: "ci" + (t + k), n, u, prix, perte, qa: Q[n] || 1, ua: u, pa: Math.round(prix * (Q[n] || 1) * 100) / 100, al: AL[n] || []}));
  const id = n => i.find(x => x.n === n).id;
  const r = [
    {id: "cr" + t, n: "Frites maison", rend: 800, ru: "g", lines: [{t:"i",id:id("Pommes de terre"),q:1000},{t:"i",id:id("Huile de friture"),q:8}]},
    {id: "cr" + (t + 1), n: "Sauce maison", rend: 300, ru: "g", lines: [{t:"i",id:id("Crème fraîche"),q:25},{t:"i",id:id("Oignon"),q:60},{t:"i",id:id("Citron"),q:1}]}];
  const d = [
    {id: "cd" + t, n: "Burger maison et frites", c: "Burger, sandwich", s: 16, tva: 10, x: 0.15, lines: [{t:"i",id:id("Bœuf haché 15 %"),q:150},{t:"i",id:id("Pain burger brioché"),q:1},{t:"i",id:id("Cheddar en tranches"),q:2},{t:"i",id:id("Tomate"),q:30},{t:"i",id:id("Salade iceberg"),q:0.1},{t:"r",id:r[1].id,q:30},{t:"r",id:r[0].id,q:200}]},
    {id: "cd" + (t + 1), n: "Salade César", c: "Entrée", s: 13, tva: 10, x: 0.2, lines: [{t:"i",id:id("Poulet (filets)"),q:120},{t:"i",id:id("Salade iceberg"),q:0.3},{t:"i",id:id("Parmesan"),q:20},{t:"r",id:r[1].id,q:40}]},
    {id: "cd" + (t + 2), n: "Portion de frites", c: "Accompagnement", s: 4.5, tva: 10, x: 0.08, lines: [{t:"r",id:r[0].id,q:180}]}];
  return {i, r, d};
}
const fmObj = (p, f) => ({id: f.id, n: p.n + " · " + f.n, s: f.s, c: p.c, a: p.a, d: f.d, cap: p.cap, b: p.b, pt: p.pt, st: p.st, m: p.m, al: p.al, pid: p.id, fm0: f});
function fmById(fid) { for (const p of S.products) { const f = (p.fm || []).find(x => x.id === fid); if (f) return {p, f}; } return null; }
const pName = p => p.fn && (p.fm || []).length ? p.n + " · " + p.fn : p.n;
function allItems() { return [...S.products.flatMap(p => [{key:"p"+p.id,kind:"p",o:p,c:prodCalc(p)},
                               ...(p.fm || []).map(f => { const o = fmObj(p, f); return {key: "f" + f.id, kind: "f", o, c: prodCalc(o)}; })]),
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
const fromDbP = r => ({id:r.id,n:r.nom,c:r.categorie,a:r.alcool?1:0,b:+r.prix_achat_ht,cap:+r.contenance_cl,d:+r.dose_cl,s:+r.prix_vente_ttc,st:+r.stock,m:+r.stock_min,code:r.code_barre||"",al:r.allergenes||[],f:r.fournisseur_id||"",fn:r.format_nom||"",pt:+r.perte_pct||0,u:r.unite||"cl",fm:[]});
const toDbP = p => ({etab_id:ETAB.id,nom:p.n,categorie:p.c,alcool:!!p.a,prix_achat_ht:p.b,contenance_cl:p.cap,dose_cl:p.d,allergenes:p.al||[],
  prix_vente_ttc:p.s,stock:Math.round(p.st*1000)/1000,stock_min:p.m,code_barre:p.code||null,modifie_le:new Date().toISOString(),
  ...("f" in p ? {fournisseur_id: p.f || null} : {}), ...("fn" in p ? {format_nom: p.fn || null} : {}), ...("pt" in p ? {perte_pct: num(p.pt)} : {}), ...("u" in p ? {unite: uOf(p)} : {})});
async function q(promise) { const r = await promise; if (r.error) throw r.error; return r.data; }
let lastLoad = 0;
async function loadCloud() {
  const e = ETAB.id;
  try { S.acces = await q(sb.rpc("acces_etab", {p_etab: e})); } catch (x) { if (isNetErr(x)) throw x; }
  if (isBarman()) {
    const carte = await q(sb.rpc("carte_service", {p_etab: e}));
    try { const eo = await q(sb.from("etablissements").select("options").eq("id", e).single()); S.opts = eo.options || {}; } catch (x) { S.opts = S.opts || {}; }
    S.carte = carte.map(r => ({key: r.item_type + r.item_id, kind: r.item_type, n: r.nom, c: r.categorie, s: +r.prix_ttc, dispo: r.disponible}));
  } else {
    const [et, pr, ck, sv, inv] = await Promise.all([
      q(sb.from("etablissements").select("*").eq("id", e).single()),
      q(sb.from("produits").select("*").eq("etab_id", e).order("nom")),
      q(sb.from("cocktails").select("*").eq("etab_id", e).order("nom")),
      q(sb.from("services").select("ouvert_le,ca_ttc,marge_ht,verres,pertes").eq("etab_id", e).not("clos_le", "is", null).order("ouvert_le", {ascending: false}).limit(14)),
      q(sb.from("inventaires").select("le,perte_ventes_ht").eq("etab_id", e).order("le", {ascending: false}).limit(1))]);
    const ci = ck.length ? await q(sb.from("cocktail_ingredients").select("cocktail_id,produit_id,cl").in("cocktail_id", ck.map(c => c.id))) : [];
    let pf = []; try { pf = await q(sb.from("produit_formats").select("id,produit_id,nom,dose_cl,prix_ttc,ordre").eq("etab_id", e).order("ordre")); } catch (x) {}
    Object.assign(S, {bar: et.nom, target: et.objectif_spiritueux, target2: et.objectif_bouteilles, vol: et.volume_mois,
      products: pr.map(fromDbP).map(p => ({...p, fm: pf.filter(f => f.produit_id === p.id).map(f => ({id: f.id, n: f.nom, d: +f.dose_cl, s: +f.prix_ttc}))})),
      cocktails: ck.map(c => ({id:c.id,n:c.nom,s:+c.prix_vente_ttc,x:+c.extras_ht,cat:c.categorie||"Cocktails",
        ing: ci.filter(i => i.cocktail_id === c.id).map(i => ({p:i.produit_id,cl:+i.cl}))})),
      history: sv.reverse().map(s => ({date:s.ouvert_le,marg:+s.marge_ht,ca:+s.ca_ttc,qty:s.verres,pertes:s.pertes||null})),
      lastInv: inv[0] ? {date: inv[0].le, loss: +inv[0].perte_ventes_ht} : null});
    S.alias = et.alias_caisse || {};
    S.opts = et.options || {}; S.resto = S.opts.resto || null;
    try { const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
      S.pertes = (await q(sb.from("pertes").select("id,le,type,libelle,qte,unite,cout_ht").eq("etab_id", e).gte("le", m0.toISOString()).order("le", {ascending: false})))
        .map(x => ({id: x.id, le: x.le, type: x.type, n: x.libelle, q: +x.qte, u: x.unite, c: +x.cout_ht})); } catch (x) { S.pertes = S.pertes || []; }
    try { const cr = await q(sb.from("cuisine").select("id,type,data").eq("etab_id", e));
      S.cu = {i: [], r: [], d: []}; cr.forEach(x => (S.cu[x.type] || []).push({...x.data, id: x.id})); } catch (x) { S.cu = S.cu || {i: [], r: [], d: []}; }
    try { const m3 = new Date(); m3.setMonth(m3.getMonth() - 3); m3.setDate(1);
      const [fr, cr2, rr] = await Promise.all([q(sb.from("fournisseurs").select("id,data").eq("etab_id", e)),
        q(sb.from("commandes").select("id,le,statut,recue_le,total_ht,data").eq("etab_id", e).gte("le", m3.toISOString()).order("le", {ascending: false})),
        q(sb.from("stock_releves").select("le,valeur_ht,origine").eq("etab_id", e).gte("le", m3.toISOString()).order("le"))]);
      S.fours = fr.map(x => ({...x.data, id: x.id}));
      S.cmds = cr2.map(x => ({...x.data, id: x.id, le: x.le, statut: x.statut, recue_le: x.recue_le, total: +x.total_ht}));
      S.releves = rr.map(x => ({le: x.le, v: +x.valeur_ht, o: x.origine}));
    } catch (x) { S.fours = S.fours || []; S.cmds = S.cmds || []; S.releves = S.releves || []; }
    try { S.abo = await q(sb.from("abonnements").select("formule,resto,statut,montant_ttc,paye_jusqu").eq("etab_id", e).maybeSingle()); } catch (x) { S.abo = S.abo || null; }
    try { S.caisse = await q(sb.from("caisse_connexions").select("fournisseur,nom_compte,derniere_synchro,erreur").eq("etab_id", e).maybeSingle()); } catch (x) { S.caisse = S.caisse || null; }
    try { const chr = await q(sb.from("etab_charges").select("data").eq("etab_id", e).maybeSingle()); S.ch = chr ? chr.data : null; } catch (x) { S.ch = S.ch || null; }
    ETAB.nom = et.nom;
  }
  await refreshLive();
  lastLoad = Date.now(); save(); setSync("ok");
}
async function refreshLive() {
  if (MODE !== "cloud" || queueLen()) return;
  const r = await q(sb.rpc("service_en_cours", {p_etab: ETAB.id}));
  S.live = r.items_z || r.items || {}; liveNorm();
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
        await q(sb.rpc("vendre2", {p_etab: it.e, p_type: it.t, p_id: it.id, p_delta: it.d, p_zone: it.z || "comptoir"}));
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
  catch (e) { if (isLock(e)) { lockSheet(); return false; } toast(frErr(e)); if (isNetErr(e)) setSync("off"); return false; }
}
const cloud = () => MODE === "cloud";
async function actSaveProduct(id, x) { needEdit();
  const fm = x.fm; x = {...x}; delete x.fm;
  if (cloud()) {
    if (id) { await q(sb.from("produits").update(toDbP(x)).eq("id", id)); Object.assign(byId(id), x); }
    else { const r = await q(sb.from("produits").insert(toDbP(x)).select().single()); S.products.unshift(fromDbP(r)); id = r.id; }
  } else { if (id) Object.assign(byId(id), x); else { id = "d" + Date.now(); S.products.unshift({id, ...x, fm: []}); } }
  if (fm) await actSaveFormats(id, fm);
}
async function actSaveFormats(pid, list) { needEdit();
  const p = byId(pid), old = p.fm || [], keep = list.filter(f => f.id && !String(f.id).startsWith("n"));
  if (cloud()) {
    const gone = old.filter(o => !keep.some(f => f.id === o.id)).map(o => o.id);
    if (gone.length) await q(sb.from("produit_formats").delete().in("id", gone));
    for (const [k, f] of list.entries()) {
      const row = {nom: f.n, dose_cl: f.d, prix_ttc: f.s, ordre: k};
      if (f.id && !String(f.id).startsWith("n")) await q(sb.from("produit_formats").update(row).eq("id", f.id));
      else f.id = (await q(sb.from("produit_formats").insert({...row, etab_id: ETAB.id, produit_id: pid}).select("id").single())).id;
    }
  } else list.forEach(f => { if (!f.id || String(f.id).startsWith("n")) f.id = "fm" + Date.now() + Math.random().toString(36).slice(2, 6); });
  for (const o of old) if (!list.some(f => f.id === o.id)) for (const k in S.live) if (liveSplit(k)[0] === "f" + o.id) delete S.live[k];
  p.fm = list.map(f => ({id: f.id, n: f.n, d: f.d, s: f.s}));
}
async function actDeleteProduct(id) { needEdit();
  if (cloud()) await q(sb.from("produits").delete().eq("id", id));
  const fidsDel = ((byId(id) || {}).fm || []).map(f => "f" + f.id);
  for (const k in S.live) if (fidsDel.includes(liveSplit(k)[0])) delete S.live[k];
  S.products = S.products.filter(x => x.id !== id);
  S.cocktails.forEach(k => k.ing = k.ing.filter(g => g.p !== id));
  const fids = ((S.products.find(x => x.id === id) || {}).fm || []).map(f => "f" + f.id);
  for (const k in S.live) if (liveSplit(k)[0] === "p" + id || fids.includes(liveSplit(k)[0])) delete S.live[k];
}
async function actSaveCocktail(id, x) { needEdit();
  if (cloud()) {
    const row = {etab_id: ETAB.id, nom: x.n, prix_vente_ttc: x.s, extras_ht: x.x, categorie: x.cat || "Cocktails", modifie_le: new Date().toISOString()};
    let cid = id;
    if (id) await q(sb.from("cocktails").update(row).eq("id", id));
    else cid = (await q(sb.from("cocktails").insert(row).select("id").single())).id;
    await q(sb.from("cocktail_ingredients").delete().eq("cocktail_id", cid));
    if (x.ing.length) await q(sb.from("cocktail_ingredients").insert(x.ing.map(g => ({cocktail_id: cid, produit_id: g.p, cl: g.cl}))));
    if (id) Object.assign(S.cocktails.find(c => c.id === id), x); else S.cocktails.unshift({id: cid, ...x});
  } else { if (id) Object.assign(S.cocktails.find(c => c.id === id), x); else S.cocktails.unshift({id: "d" + Date.now(), ...x}); }
}
async function actDeleteCocktail(id) { needEdit();
  if (cloud()) await q(sb.from("cocktails").delete().eq("id", id));
  S.cocktails = S.cocktails.filter(c => c.id !== id); for (const k in S.live) if (liveSplit(k)[0] === "k" + id) delete S.live[k];
}
async function actSetPrices(list) { needEdit(); // [{kind, o, price}]
  if (cloud()) for (const it of list)
    await q(it.kind === "f" ? sb.from("produit_formats").update({prix_ttc: it.price}).eq("id", it.o.id)
      : sb.from(it.kind === "p" ? "produits" : "cocktails").update({prix_vente_ttc: it.price, modifie_le: new Date().toISOString()}).eq("id", it.o.id));
  list.forEach(it => { it.o.s = it.price; if (it.o.fm0) it.o.fm0.s = it.price; });
}
async function actSetCode(id, code) { needEdit();
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
async function actInventory(counts, loss, details) { needEdit();
  if (cloud()) {
    for (const [id, st] of counts) await q(sb.from("produits").update({stock: Math.round(st * 1000) / 1000}).eq("id", id));
    await q(sb.from("inventaires").insert({etab_id: ETAB.id, fait_par: ME.id, perte_ventes_ht: Math.round(loss * 100) / 100, details}));
  }
  counts.forEach(([id, st]) => byId(id).st = st);
  S.lastInv = {date: new Date().toISOString(), loss};
  try { await actReleve("inventaire"); } catch (e) {}
}
async function actImport(list, dateISO, ref, aliases) { needEdit();
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
  S.history.push({date: le.toISOString(), marg: res.marg, ca: res.ca, ht: res.ht, qty: res.qty}); if (!cloud()) (S.histAll = S.histAll || []).push(S.history[S.history.length - 1]);
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
async function actSaveCu(t, id, x) { needEdit();
  const list = cu()[t];
  if (cloud()) {
    const data = {...x}; delete data.id;
    if (id) { await q(sb.from("cuisine").update({data, modifie_le: new Date().toISOString()}).eq("id", id)); Object.assign(list.find(o => o.id === id), x); }
    else { const r = await q(sb.from("cuisine").insert({etab_id: ETAB.id, type: t, data}).select("id").single()); list.unshift({...x, id: r.id}); }
  } else { if (id) Object.assign(list.find(o => o.id === id), x); else list.unshift({...x, id: "c" + t + Date.now()}); }
}
async function actDeleteCu(t, id) { needEdit();
  if (cloud()) await q(sb.from("cuisine").delete().eq("id", id));
  const c = cu(); c[t] = c[t].filter(o => o.id !== id);
  [...c.r, ...c.d].forEach(o => o.lines = (o.lines || []).filter(l => !(l.t === t && l.id === id)));
}
async function actOpts(patch) {
  if (Object.keys(patch).some(k => k !== "facturation")) needEdit();
  const o = {...(S.opts || {}), ...patch};
  if (cloud()) await q(sb.from("etablissements").update({options: o}).eq("id", ETAB.id));
  S.opts = o;
}
async function actResto(r) { needEdit();
  await actOpts({resto: r});
  S.resto = r;
  if (r && r.on && MODE === "demo" && !(cu().i.length || cu().d.length)) S.cu = seedCuisine();
}
/* Fournisseurs, commandes, relevés de stock */
const stockValue = () => Math.round(S.products.reduce((t, p) => t + p.b * p.st, 0) * 100) / 100;
async function actSaveFour(id, x) { needEdit();
  const L = S.fours = S.fours || [];
  if (cloud()) {
    const data = {...x}; delete data.id;
    if (id) await q(sb.from("fournisseurs").update({data, modifie_le: new Date().toISOString()}).eq("id", id));
    else id = (await q(sb.from("fournisseurs").insert({etab_id: ETAB.id, data}).select("id").single())).id;
  } else id = id || "f" + Date.now();
  const o = L.find(f => f.id === id); if (o) Object.assign(o, x); else L.unshift({...x, id});
  return id;
}
async function actDeleteFour(id) { needEdit();
  if (cloud()) await q(sb.from("fournisseurs").delete().eq("id", id));
  S.fours = (S.fours || []).filter(f => f.id !== id);
  S.products.forEach(p => { if (p.f === id) p.f = ""; }); cu().i.forEach(i => { if (i.f === id) i.f = ""; });
}
async function actLinkProduct(pid, fid) { needEdit();
  const p = byId(pid); if (!p) return; p.f = fid || "";
  if (cloud()) await q(sb.from("produits").update({fournisseur_id: fid || null}).eq("id", pid));
}
async function actSaveCmd(id, x) { needEdit();
  const L = S.cmds = S.cmds || [], total = Math.round(cmdTotal(x) * 100) / 100;
  if (cloud()) {
    const data = {f: x.f, lignes: x.lignes, note: x.note || ""}, row = {statut: x.statut, total_ht: total, recue_le: x.recue_le || null, data, modifie_le: new Date().toISOString()};
    if (id) await q(sb.from("commandes").update(row).eq("id", id));
    else { const r = await q(sb.from("commandes").insert({etab_id: ETAB.id, le: x.le || new Date().toISOString(), ...row}).select("id,le").single()); id = r.id; x.le = r.le; }
  } else id = id || "c" + Date.now() + Math.random().toString(36).slice(2, 5);
  const o = L.find(c => c.id === id), v = {...x, id, total, le: x.le || new Date().toISOString()};
  if (o) Object.assign(o, v); else L.unshift(v);
  return id;
}
async function actDeleteCmd(id) { needEdit();
  if (cloud()) await q(sb.from("commandes").delete().eq("id", id));
  S.cmds = (S.cmds || []).filter(c => c.id !== id);
}
async function actReleve(origine = "auto") { needEdit();
  const v = stockValue(), le = new Date().toISOString();
  if (cloud()) await q(sb.from("stock_releves").insert({etab_id: ETAB.id, valeur_ht: v, origine}));
  (S.releves = S.releves || []).push({le, v, o: origine});
}
async function actPerte(x) { needEdit(); // {type, n, q, u, c, stock:{id, st}}
  let id = "d" + Date.now();
  if (cloud()) id = (await q(sb.from("pertes").insert({etab_id: ETAB.id, type: x.type, libelle: x.n.slice(0, 120), qte: x.q, unite: x.u, cout_ht: Math.round(x.c * 100) / 100, par: ME.id}).select("id").single())).id;
  (S.pertes = S.pertes || []).unshift({id, le: new Date().toISOString(), type: x.type, n: x.n, q: x.q, u: x.u, c: x.c});
  if (x.stock) actStock(x.stock.id, x.stock.st);
}
async function actDeletePerte(id) { needEdit();
  if (cloud()) await q(sb.from("pertes").delete().eq("id", id));
  S.pertes = (S.pertes || []).filter(x => x.id !== id);
}
async function actCharges(c) { needEdit();
  if (cloud()) await q(c ? sb.from("etab_charges").upsert({etab_id: ETAB.id, data: c, maj: new Date().toISOString()})
                         : sb.from("etab_charges").delete().eq("etab_id", ETAB.id));
  S.ch = c;
}
async function actSettings(x) { needEdit();
  if (cloud()) {
    await q(sb.from("etablissements").update({nom: x.bar || ETAB.nom, objectif_spiritueux: x.target, objectif_bouteilles: x.target2, volume_mois: x.vol}).eq("id", ETAB.id));
    ETAB.nom = x.bar || ETAB.nom; lsSet(EKEY, ETAB);
  }
  Object.assign(S, x);
}

/* ================= Navigation ================= */
let view = "home";
document.querySelectorAll("nav button").forEach(b => b.onclick = () => go(b.dataset.v));
document.querySelectorAll(".dtabs button").forEach(b => b.onclick = () => b.dataset.v === "cuisine" && !restoOn() ? restoSheet() : go(b.dataset.v));
$("dSvc").onclick = () => go("service"); $("dBilan").onclick = () => bilanSheet();
document.querySelectorAll("[data-go]").forEach(a => a.onclick = () => go(a.dataset.go));
function navSync() {
  const cur = view === "menu" && menuKind === "c" ? "cuisine" : view;
  document.querySelectorAll("nav button").forEach(b => { b.classList.toggle("on", b.dataset.v === cur);
    b.hidden = (isBarman() && b.dataset.v !== "service") || (b.dataset.v === "cuisine" && !restoOn()); });
  document.querySelectorAll(".dtabs button").forEach(b => { b.classList.toggle("on", b.dataset.v === cur);
    b.classList.toggle("opt", b.dataset.v === "cuisine" && !restoOn()); b.hidden = isBarman(); });
  document.querySelectorAll(".dk.dsvc,.dk.dlink").forEach(b => b.hidden = isBarman() || (b.id === "dSvc" && view === "service"));
  const t = document.querySelector("#v-menu > h2"), st = document.querySelector("#v-menu > .sub");
  if (t) t.innerHTML = menuKind === "c" ? `<img src="icons/logo-resto.svg" width="24" height="28" alt="" style="vertical-align:-4px;margin-right:8px">Ma cuisine` : "Ma carte";
  if (st) st.textContent = menuKind === "c" ? "Plats, préparations et ingrédients" : "Touchez un produit pour le modifier";
}
function go(v) {
  if (isBarman()) v = "service";
  if (v === "cuisine") { menuKind = "c"; v = "menu"; }
  else if (v === "menu" && menuKind === "c") menuKind = "p";
  view = v;
  document.querySelectorAll(".view").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  navSync();
  $("fab").style.display = v === "menu" ? "block" : "none";
  $("main").scrollTop = 0; render(); bgReload();
}
function render() {
  navSync();
  if (view === "home") renderHome();
  if (view === "menu") renderMenu();
  if (view === "service") renderService();
  if (view === "calc") renderCalc();
  if (view === "stock") renderStock();
}

/* ================= Accueil ================= */
function liveTotals() {
  let ca = 0, ht = 0, marg = 0, qty = 0, pertes = 0; const loss = {};
  for (const lk in S.live) {
    const qn = S.live[lk]; if (!qn) continue; const [k, z] = liveSplit(lk), L = isLoss(z);
    if (isBarman()) { const c = (S.carte || []).find(x => x.key === k); if (!c) continue;
      if (L) { (loss[z] = loss[z] || {n: 0, c: 0}).n += qn; } else { ca += qn * zonePrice(c.s, z); qty += qn; } continue; }
    const i = allItems().find(x => x.key === k); if (!i) continue;
    const price = zonePrice(i.o.s, z), h = price / (1 + i.c.tva);
    ca += qn * price; ht += qn * h; marg += qn * (h - i.c.cost);
    if (L) { pertes += qn * i.c.cost; const e = (loss[z] = loss[z] || {n: 0, c: 0}); e.n += qn; e.c += qn * i.c.cost; } else qty += qn;
  }
  return {ca, ht, marg, qty, pertes, loss};
}
function renderAccBan() {
  const el = $("accBan"); if (!el) return; const A = ACC(); let h = "";
  if (A.etat === "lecture") h = `<div class="accban lock"><div><b>Votre essai gratuit est terminé.</b><span>Vos données sont gardées, mais plus rien ne peut être modifié ni encaissé dans le mode Service.</span></div><button class="mini" data-abo>S'abonner</button></div>`;
  else if (A.etat === "essai" && A.fin_essai) { const d = daysLeft(A.fin_essai);
    h = `<div class="accban"><div><b>Essai gratuit : ${d > 1 ? `encore ${d} jours` : d === 1 ? "dernier jour" : "se termine aujourd'hui"}</b><span>Tout est ouvert jusqu'au ${new Date(A.fin_essai + "T12:00:00").toLocaleDateString("fr-FR", {day: "numeric", month: "long"})}. Abonnez-vous pour continuer ensuite.</span></div><button class="mini" data-abo>Voir les offres</button></div>`; }
  else if (A.etat === "abonne" && A.statut === "impaye" && A.paye_jusqu) { const lim = new Date(A.paye_jusqu + "T12:00:00"); lim.setDate(lim.getDate() + 15);
    h = `<div class="accban lock"><div><b>Paiement refusé</b><span>Mettez à jour votre carte avant le ${lim.toLocaleDateString("fr-FR", {day: "numeric", month: "long"})} pour garder l'accès.</span></div><button class="mini" data-abo>Régulariser</button></div>`; }
  el.innerHTML = h; el.hidden = !h; const b = el.querySelector("[data-abo]"); if (b) b.onclick = aboSheet;
}
/* ================= Accueil ordinateur : le mot du jour + deux comptoirs ================= */
const isDesk = () => matchMedia("(min-width:1100px)").matches;
function oppSheet() {
  const o = opportunities();
  openSheet(`<h2 class="h">Prix à corriger</h2><div class="sub">Les boissons sous votre objectif de marge, avec le prix conseillé et ce qu'il rapporterait chaque mois.</div>
    ${o.length ? o.map(i => `<div class="row"><div class="grow"><div class="name">${esc(i.o.n)}</div><div class="meta">${eur(i.o.s)} → <b style="color:var(--txt)">${eur(i.np)}</b> · marge ${pct(i.c.rate)} → ${i.t} %</div></div>
      <div class="right"><div class="gain">+${eur(i.month, 0)}</div><button class="mini" data-k="${i.key}" data-np="${i.np}">Appliquer</button></div></div>`).join("") : `<div class="empty">Tous vos prix atteignent vos objectifs.</div>`}`, () => {
    $("sBody").querySelectorAll("[data-k]").forEach(b => b.onclick = async () => { const it = allItems().find(x => x.key === b.dataset.k); b.classList.add("busy");
      if (await act(() => actSetPrices([{kind: it.kind, o: it.o, price: +b.dataset.np}]), `${it.o.n} : ${eur(+b.dataset.np)} ✓`)) oppSheet(); });
  });
}
function renderDHome() {
  const el = $("dHome"); if (!el || !isDesk()) return;
  const d = scoreData(), o = opportunities(), gain = o.reduce((s, i) => s + i.month, 0), low = S.products.filter(p => p.st < p.m);
  const hr = new Date().getHours(), hi = hr < 5 || hr >= 18 ? "Bonsoir" : "Bonjour", nm = esc(S.bar || (ETAB && ETAB.nom) || "votre établissement");
  const ro = restoOn(), plats = ro ? cu().d.map(x => ({x, k: platCalc(x)})).filter(p => p.k.ht > 0) : [], T = cuTarget();
  const pAvg = plats.length ? plats.reduce((s, p) => s + p.k.rate, 0) / plats.length : NaN, pCost = plats.length ? plats.reduce((s, p) => s + p.k.cost / p.k.ht * 100, 0) / plats.length : NaN;
  const pLow = plats.filter(p => p.k.rate < T).sort((a, b) => a.k.rate - b.k.rate);
  let msg, sub = "";
  if (d.empty) { msg = `${hi}. Ajoutez votre carte pour voir ce que rapporte ${nm}.`; sub = `Commencez par l'onglet Bar : chaque boisson ajoutée calcule sa marge.`; }
  else if (chOn()) { const tot = chTotal(), vol = num(S.ch.v), res = vol * d.avgEur - tot, need = d.avgEur > 0 ? Math.ceil(tot / d.avgEur) : 0;
    msg = res >= 0 ? `${hi}. Ce mois, ${nm} devrait gagner <em>${eur(res, 0)}</em>.` : `${hi}. Ce mois, il manque <em class="neg">${eur(-res, 0)}</em> pour couvrir vos charges.`;
    sub = `${eur(tot, 0)} de charges fixes, couvertes à partir de ${need.toLocaleString("fr-FR")} ventes par mois. Vous en faites environ ${vol.toLocaleString("fr-FR")}.`; }
  else { msg = `${hi}. Vos boissons vous rapportent en moyenne <em>${pct(d.avgRate)}</em> de marge.`; sub = `<button class="link" data-a="ch">Ajoutez vos charges fixes</button> pour connaître votre vrai bénéfice du mois.`; }
  const todo = [];
  if (o.length) todo.push([`Corriger ${o.length} prix de boisson${o.length > 1 ? "s" : ""}`, `<span class="pos">+${eur(gain, 0)} / mois</span>`, "opp"]);
  if (pLow.length) todo.push([pLow.length === 1 ? `Revoir le prix : ${esc(pLow[0].x.n || "plat")}` : `Revoir le prix de ${pLow.length} plats`, `<span class="warn">marge ${pct(pLow[0].k.rate)}</span>`, "cu"]);
  if (low.length) todo.push([`Commander ${low.length} produit${low.length > 1 ? "s" : ""}`, esc(low.slice(0, 2).map(p => p.n).join(", ")) + (low.length > 2 ? "…" : ""), "stock"]);
  const D = `<img src="icons/logo-bar.svg" width="15" height="17" alt="">`, R = `<img src="icons/logo-resto.svg" width="15" height="17" alt="">`;
  el.innerHTML = `<div class="dmot"><p class="h">${msg}</p><div class="mut">${sub}</div></div>
    <div class="dcomp">
      <section class="dc"><div class="dch">${D}Bar</div>
        <div class="dbig h">${d.empty ? "—" : pct(d.avgRate)}</div><div class="mut">${d.empty ? "Aucune boisson pour l'instant" : `de marge moyenne · ${eur(d.avgEur)} HT par verre`}</div>
        <div class="dfoot"><button class="dsvc" data-a="svc">Démarrer le service</button><button class="dghost" data-a="menu">Ma carte</button></div></section>
      ${ro ? `<section class="dc"><div class="dch">${R}Resto</div>
        <div class="dbig h">${plats.length ? pct(pAvg) : "—"}</div><div class="mut">${plats.length ? `de marge moyenne · coût matière ${pct(pCost)}` : "Aucun plat pour l'instant"}</div>
        <div class="dfoot"><button class="dghost" data-a="cu">Mes plats</button></div></section>`
      : `<section class="dc dopt"><div class="dch">${R}Resto<span class="dtag">Option</span></div>
        <p class="h dask">Vous servez aussi à manger ?</p><div class="mut">Le coût de chaque plat, la marge de votre cuisine et les allergènes, dans la même app.</div>
        <div class="dfoot"><button class="dghost" data-a="resto">Découvrir Dosis Resto</button></div></section>`}
    </div>
    <div class="dtodo"><div class="mut">${todo.length ? "Trois choses pour gagner plus" : "À faire"}</div>
      ${todo.length ? todo.slice(0, 3).map(t => `<button class="drow" data-a="${t[2]}"><span>${t[0]}</span><span class="mut">${t[1]}</span></button>`).join("") : `<div class="drow none">Rien à faire : tout est en ordre.</div>`}</div>`;
  const A = {ch: chargesSheet, svc: () => go("service"), menu: () => go("menu"), cu: () => go("cuisine"), resto: restoSheet, opp: oppSheet, stock: () => go("stock")};
  el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => A[b.dataset.a]());
}
addEventListener("resize", () => { if (view === "home") renderDHome(); });
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
  renderAccBan(); renderDHome();
  const im = $("tonight").querySelector("[data-imp]"); if (im) im.onclick = importSheet;

  renderCharges(d); renderPertes();
  const o = opportunities();
  $("oppTotal").textContent = o.length ? "+" + eur(o.reduce((s, i) => s + i.month, 0), 0) + " / mois" : "";
  $("opps").innerHTML = o.length ? o.slice(0, 4).map(i => `
    <div class="row"><div class="emoji">${i.kind === "k" ? recEmoji(i.o.cat) : CATS[i.o.c] || "🍶"}</div>
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
function armSeg() { $("menuSeg").querySelectorAll("button").forEach(b => { b.classList.toggle("on", b.dataset.v === menuKind);
  b.onclick = () => { menuKind = b.dataset.v; $("menuSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); navSync(); renderMenu(); }; }); }
armSeg();
$("q").oninput = () => renderMenu();
let cuTab = "d";
/* ================= Fournisseur partenaire : Paris Rhum Club ================= */
const PRC = {n: "Paris Rhum Club", contact: "", email: window.PRC_EMAIL || "", tel: "06 61 81 99 81", jours: "", site: "rhumcubain.com (espace professionnel en bas de la page d'accueil)", prc: true,
  note: "Fournisseur partenaire de Dosis Bar : rhums, liqueurs, bières et cocktails cubains"};
const prcFour = () => fours().find(f => f.prc || /paris rhum club/i.test(f.n || ""));
async function ensurePrc() {
  const ex = prcFour();
  if (ex && ex.prc && !isBarman() && canEdit() && ((!ex.email && PRC.email) || !ex.tel)) {   // compléter les coordonnées des fiches déjà créées
    try { await actSaveFour(ex.id, {...ex, email: ex.email || PRC.email, tel: ex.tel || PRC.tel, site: PRC.site}); save(); } catch (e) {}
  }
  if (isBarman() || !canEdit() || ex) return ex;
  if (cloud() && S.opts && S.opts.prcInit) return null;     // retiré volontairement par le patron
  try { await actSaveFour(null, {...PRC}); if (cloud()) await actOpts({prcInit: true}); else { S.opts = S.opts || {}; S.opts.prcInit = true; } save(); } catch (e) {}
  return prcFour();
}
const normN = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function prcDose(x) { return x.c === "Bière" ? x.cl : 4; }
function prcSheet() {
  const L = window.CATALOGUE_PRC || [], have = new Set(S.products.map(p => normN(p.n))), sel = new Set();
  const marques = [...new Set(L.map(x => x.m))];
  const row = (x, i) => { const in_ = have.has(normN(x.full));
    return `<label class="row prcrow${in_ ? " dim" : ""}" data-m="${esc(x.m)}" data-t="${esc(normN(x.full + " " + x.m))}"><input type="checkbox" data-i="${i}" ${in_ ? "disabled" : ""}>
      <div class="grow"><div class="name">${esc(x.n)}</div><div class="meta">${f1(x.cl)} cl${x.deg ? " · " + f1(x.deg) + " %" : ""} · carton de ${x.k}${in_ ? " · déjà dans votre carte" : ""}</div></div>
      <div class="right"><b>${x.b ? eur(x.b) + " HT" : `<span style="color:var(--mut);font-weight:500">prix sur demande</span>`}</b></div></label>`; };
  openSheet(`<h2 class="h"><img src="icons/prc.svg" width="26" height="26" alt="" style="vertical-align:-5px;margin-right:8px">Catalogue Paris Rhum Club</h2>
    <div class="sub">Fournisseur partenaire de Dosis Bar. Cochez ce que vous vendez : les produits arrivent dans votre carte avec leur prix d'achat, une dose de 4 cl et un prix de vente conseillé, à ajuster.</div>
    <div class="search" style="margin-bottom:8px"><input id="prcQ" placeholder="Rechercher une marque, un rhum…" autocomplete="off"></div>
    <div id="prcL">${marques.map(m => `<div class="lbl prcm" data-mg="${esc(m)}"><span>${esc(m)}</span></div><div class="card list">${L.map((x, i) => x.m === m ? row(x, i) : "").join("")}</div>`).join("")}</div>
    <p class="tip">Prix HT par bouteille, tarif professionnel 2026. Pour « prix sur demande », complétez le prix d'achat dans la fiche du produit.</p>
    <div class="prcbar"><button class="btn" id="prcGo" disabled>Cochez des produits</button></div>`, () => {
    const upd = () => { const n = sel.size; $("prcGo").disabled = !n; $("prcGo").textContent = n ? `Ajouter ${n} produit${n > 1 ? "s" : ""} à ma carte` : "Cochez des produits"; };
    $("prcL").querySelectorAll("input[data-i]").forEach(c => c.onchange = () => { c.checked ? sel.add(+c.dataset.i) : sel.delete(+c.dataset.i); upd(); });
    $("prcQ").oninput = () => { const t = normN($("prcQ").value);
      $("prcL").querySelectorAll(".prcrow").forEach(r => r.hidden = !!t && !r.dataset.t.includes(t));
      $("prcL").querySelectorAll(".prcm").forEach(h => { const card = h.nextElementSibling; const vis = [...card.children].some(r => !r.hidden); h.hidden = card.hidden = !vis; }); };
    $("prcGo").onclick = async () => { if (!sel.size) return; needEditUI(async () => {
      $("prcGo").classList.add("busy"); $("prcGo").textContent = "Ajout en cours…";
      const four = await ensurePrc(); let n = 0;
      try {
        for (const i of sel) { const x = L[i], d = prcDose(x), p = {n: x.full, c: x.c, a: x.a, b: x.b, cap: x.cl, d, st: 0, m: 1, u: "cl", al: x.c === "Bière" ? ["gluten"] : []};
          p.s = x.b ? suggest(pcost(p, d), !!x.a, x.c === "Bière" ? (S.target2 ?? 65) : S.target) : 0;
          if (four) p.f = four.id;
          await actSaveProduct(null, p); n++; }
        save(); closeSheet(); render(); toast(`${n} produit${n > 1 ? "s" : ""} Paris Rhum Club ajouté${n > 1 ? "s" : ""} ✓`);
      } catch (e) { $("prcGo").classList.remove("busy"); upd(); if (isLock(e)) lockSheet(); else toast(frErr(e) + (n ? ` (${n} ajoutés)` : "")); }
    }); };
  });
}
function needEditUI(fn) { if (!canEdit()) return lockSheet(); return fn(); }
function renderMenu() {
  if ($("prcBtn")) { $("prcBtn").hidden = !(menuKind === "p" && !isBarman() && (window.CATALOGUE_PRC || []).length); $("prcBtn").onclick = prcSheet; }
  const segC = $("menuSeg").querySelector('[data-v="c"]');
  if (restoOn() && !segC) { const b = document.createElement("button"); b.dataset.v = "c"; b.textContent = "Cuisine"; $("menuSeg").appendChild(b); armSeg(); }
  if (!restoOn() && segC) { segC.remove(); if (menuKind === "c") menuKind = "p"; armSeg(); }
  if (menuKind === "c") return renderCuisine();
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
    const meta = (i.kind === "p" ? `${i.o.fn && (i.o.fm || []).length ? esc(i.o.fn) + " · " : f1(i.o.d) + " " + uTxt(i.o, i.o.d) + " · "}${eur(i.o.s)} TTC · coût ${eur(i.c.cost)}${(i.o.fm || []).length ? ` · +${i.o.fm.length} format${i.o.fm.length > 1 ? "s" : ""}` : ""}`
      : `${i.o.ing.map(g => { const p = byId(g.p); return p ? p.n.split(" ")[0] : "?"; }).join(" + ")} · ${eur(i.o.s)}`)
      ;
    return `<div class="row tap" data-k="${i.key}"><div style="flex:none">${glass(i.c.rate / 100, {w:26, col:tone(i.c.rate, t)})}</div>
    <div class="grow"><div class="name">${esc(i.o.n)}</div><div class="meta">${esc(meta)}</div></div>
    <div class="right"><div class="m h">${eur(i.c.marg)}</div>${chOn() && i.c.ht > 0 ? `<div style="font-size:12px;font-weight:600;color:${i.c.net < 0 ? "var(--bad)" : i.c.netRate >= netTarget() ? "var(--ok)" : "var(--amber)"}">réel ${eur(i.c.net)}</div>` : `<div style="font-size:12px;color:${tone(i.c.rate, t)};font-weight:600">${pct(i.c.rate)}</div>`}<span class="badge ${st[1]}">${st[0]}</span></div></div>`; }).join("")
    : `<div class="empty">${menuKind === "k" ? "Aucun cocktail. Touchez + pour créer votre première recette." : S.products.length ? "Aucun produit trouvé" : "Votre carte est vide. Touchez + pour ajouter votre premier produit."}</div>`;
  $("menuList").querySelectorAll("[data-k]").forEach(r => r.onclick = () => { const k = r.dataset.k; k[0] === "p" ? productSheet(k.slice(1)) : k[0] === "f" ? productSheet((fmById(k.slice(1)) || {p: {}}).p.id) : cocktailSheet(k.slice(1)); });
}
$("fab").onclick = () => menuKind === "p" ? productSheet(null) : menuKind === "k" ? cocktailSheet(null) : cuTab === "d" ? platSheet(null) : cuTab === "r" ? prepSheet(null) : ingSheet(null);

/* ================= Service ================= */
let svcCat = "Tout";
function consume(key, dir) {
  const id = key.slice(1);
  if (key[0] === "p") { const p = byId(id); if (p) p.st = Math.max(0, p.st - dir * p.d / p.cap); }
  else if (key[0] === "f") { const x = fmById(id); if (x) x.p.st = Math.max(0, x.p.st - dir * x.f.d / x.p.cap); }
  else { const k = S.cocktails.find(c => c.id === id); if (k) k.ing.forEach(g => { const p = byId(g.p); if (p) p.st = Math.max(0, p.st - dir * g.cl / p.cap); }); }
}
function serviceItems() {
  if (isBarman()) return (S.carte || []).map(c => ({key: c.key, kind: c.kind, n: c.n, c: c.c, s: c.s, out: !c.dispo}));
  return allItems().filter(i => i.o.s > 0).map(i => ({key: i.key, kind: i.kind, n: i.kind === "p" ? pName(i.o) : i.o.n, c: i.kind === "k" ? (i.o.cat || "Cocktails") : i.o.c, s: i.o.s,
    out: i.kind === "p" || i.kind === "f" ? i.o.st * i.o.cap < i.o.d : i.o.ing.some(g => { const p = byId(g.p); return p && p.st * p.cap < g.cl; })}));
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
  $("svcLive").style.visibility = t.qty || Object.keys(t.loss).length ? "visible" : "hidden";
  if (!zoneOn(S.zone) && !isLoss(S.zone)) S.zone = "comptoir";
  const zs = ZONES.filter(([k]) => zoneOn(k));
  $("svcZones").innerHTML = (zs.length > 1 ? zs.map(([k, l]) => `<button class="chip ${S.zone === k ? "on" : ""}" data-z="${k}">${l}</button>`).join("") + `<span class="zsep"></span>` : "")
    + SVC_LOSS.map(k => `<button class="chip loss ${S.zone === k ? "on" : ""}" data-z="${k}">${LOSS[k][1]} ${k === "perso" ? "Personnel" : LOSS[k][0]}</button>`).join("");
  $("svcZones").querySelectorAll("[data-z]").forEach(b => b.onclick = () => { S.zone = S.zone === b.dataset.z && isLoss(b.dataset.z) ? "comptoir" : b.dataset.z; lsSet("dosisbar.zone", S.zone); renderService(); });
  const lossN = Object.values(t.loss).reduce((a, x) => a + x.n, 0);
  $("svcMode").hidden = !isLoss(S.zone) && !lossN;
  $("svcMode").className = "svcmode" + (isLoss(S.zone) ? " on" : "");
  $("svcMode").innerHTML = isLoss(S.zone) ? `<b>Mode ${LOSS[S.zone][0].toLowerCase()}</b> : chaque verre touché est noté ${S.zone === "offert" ? "offert" : S.zone === "casse" ? "cassé" : "pour le personnel"}, à 0 €. Le stock baisse. <button class="link" id="svcBack">Revenir aux ventes</button>`
    : `${lossN} offert${lossN > 1 ? "s" : ""} ou perte${lossN > 1 ? "s" : ""} ce soir${barman ? "" : " · " + eur(t.pertes) + " de marchandise"}`;
  if ($("svcBack")) $("svcBack").onclick = () => { S.zone = "comptoir"; lsSet("dosisbar.zone", S.zone); renderService(); };
  const items = serviceItems();
  const cats = ["Tout", ...new Set(items.map(i => i.c))];
  if (!cats.includes(svcCat)) svcCat = "Tout";
  $("svcChips").innerHTML = cats.map(c => `<button class="chip ${svcCat === c ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  $("svcChips").querySelectorAll(".chip").forEach(b => b.onclick = () => { svcCat = b.dataset.c; renderService(); });
  const list = items.filter(i => svcCat === "Tout" || i.c === svcCat);
  $("tiles").classList.toggle("lossmode", isLoss(S.zone));
  $("tiles").innerHTML = list.length ? list.map(i => { const qn = liveTotal(i.key);
    return `<div class="tile ${qn ? "has" : ""} ${i.out ? "out" : ""}" data-k="${i.key}" role="button" tabindex="0" aria-label="${esc(i.n)}">
      <button class="minus" data-m="1" aria-label="Retirer un ${esc(i.n)}">−</button><span class="q">${qn}</span>
      <div class="e">${i.kind === "k" ? recEmoji(i.c) : CATS[i.c] || "🍶"}</div><div class="t">${esc(i.n)}</div><div class="p">${isLoss(S.zone) ? "0 €" : eur(zonePrice(i.s, S.zone))}</div></div>`; }).join("")
    : `<div class="empty" style="grid-column:1/-1">La carte est vide.${barman ? " Le patron doit d'abord ajouter les produits." : " Ajoutez vos produits dans l'onglet Carte."}</div>`;
  $("tiles").querySelectorAll(".tile").forEach(el => el.onclick = e => tap(el.dataset.k, e.target.dataset.m ? -1 : 1));
}
function tap(k, dir) {
  if (!canEdit()) return lockSheet();
  const z = S.zone || "comptoir", lk = k + "@" + z;
  if (dir < 0 && !S.live[lk]) { if (liveTotal(k)) toast(`Rien à retirer en « ${zoneLabel(z)} »`); return; }
  S.live[lk] = (S.live[lk] || 0) + dir; if (!S.live[lk]) delete S.live[lk];
  if (!isBarman()) consume(k, dir);
  if (cloud()) { const Q = queue(); Q.push({e: ETAB.id, t: k[0], id: k.slice(1), d: dir, z}); lsSet(QKEY, Q); flush(); }
  save(); renderService();
  const n = $("tiles").querySelector(`[data-k="${k}"]`); if (n) n.classList.add("pop");
}
const lossObj = l => { const o = {}; for (const z in l) o[z] = {n: l[z].n, c: Math.round(l[z].c * 100) / 100}; return Object.keys(o).length ? o : null; };
let poll = null;
function startPoll() {
  clearInterval(poll);
  poll = setInterval(async () => {
    if (MODE !== "cloud" || view !== "service" || document.hidden || queueLen() || !navigator.onLine) return;
    try { await refreshLive(); save(); renderService(); } catch (e) { if (isNetErr(e)) setSync("off"); }
  }, 8000);
}
$("closeSvc").onclick = () => {
  const t = liveTotals(); if (!t.qty && !Object.keys(t.loss).length) return toast("Aucun verre vendu pour l'instant");
  const barman = isBarman();
  const agg = {}; for (const lk in S.live) { const [k, z] = liveSplit(lk); if (isLoss(z)) continue; const i = allItems().find(x => x.key === k);
    const a = agg[k] = agg[k] || {q: 0, m: 0, ca: 0}; a.q += S.live[lk];
    if (i) { const pz = zonePrice(i.o.s, z); a.m += S.live[lk] * (pz / (1 + i.c.tva) - i.c.cost); a.ca += S.live[lk] * pz; } }
  const rows = Object.entries(agg).map(([k, a]) => ({it: serviceItems().find(x => x.key === k), q: a.q, m: a.m, ca: a.ca})).filter(r => r.it).map(r => ({...r, ca: r.ca || r.q * zonePrice(r.it.s, "comptoir")}));
  const top = rows.slice().sort((a, b) => barman ? b.ca - a.ca : b.m - a.m).slice(0, 3);
  const lossTxt = Object.entries(t.loss).map(([z, x]) => `${LOSS[z][1]} ${x.n} ${z === "perso" ? "personnel" : LOSS[z][0].toLowerCase()}${!barman && x.c ? " (" + eur(x.c) + ")" : ""}`).join(" · ");
  openSheet(`<h2 class="h">Fin du service</h2><div class="sub">${new Date().toLocaleDateString("fr-FR", {weekday:"long",day:"numeric",month:"long"})}</div>
    <div class="res" style="margin-bottom:14px">
    ${barman ? `<div class="hl"><div><div class="l">Ventes du soir (TTC)</div><div class="v h">${eur(t.ca)}</div></div>${glass(.7, {w:40})}</div><div><div class="l">Verres servis</div><div class="v h">${t.qty}</div></div>`
    : `<div class="hl"><div><div class="l">Marge du soir (HT)</div><div class="v h">${eur(t.marg)}</div></div>${glass(t.ht ? t.marg / t.ht : 0, {w:40})}</div>
    <div><div class="l">Ventes TTC</div><div class="v h">${eur(t.ca)}</div></div><div><div class="l">Ventes HT</div><div class="v h">${eur(t.ht)}</div></div>
    <div><div class="l">Verres servis</div><div class="v h">${t.qty}</div></div><div><div class="l">Taux de marge</div><div class="v h">${pct(t.ht ? t.marg / t.ht * 100 : NaN)}</div></div>`}
    ${lossTxt ? `<div style="grid-column:1/-1"><div class="l">Offerts et pertes${barman ? "" : " (déjà déduits de la marge)"}</div><div style="font-size:13px;margin-top:3px">${lossTxt}</div></div>` : ""}</div>
    <div class="lbl" style="margin-top:4px"><span>${barman ? "Les plus vendus" : "Ce qui a le plus rapporté"}</span></div>
    <div class="card list">${top.map(r => `<div class="row"><div class="grow"><div class="name">${esc(r.it.n)}</div><div class="meta">${r.q} vendu${r.q > 1 ? "s" : ""}</div></div><div class="right m h">${barman ? eur(r.ca) : eur(r.m)}</div></div>`).join("")}</div>
    <button class="btn" id="doClose">Clôturer et archiver</button><div class="gap"></div><button class="btn ghost" id="keepOpen">Continuer le service</button>`, () => {
    $("doClose").onclick = async () => {
      const b = $("doClose"); b.classList.add("busy");
      if (cloud()) {
        try {
          await flush(); if (queueLen()) throw new Error("Pas de connexion internet.");
          await q(sb.rpc("cloturer_service", {p_etab: ETAB.id}));
        } catch (e) { b.classList.remove("busy"); return toast(frErr(e)); }
        S.live = {}; lastLoad = 0;
        if (!barman) S.history.push({date: new Date().toISOString(), marg: t.marg, ca: t.ca, ht: t.ht, qty: t.qty, pertes: lossObj(t.loss)});
      } else {
        S.history.push({date: new Date().toISOString(), marg: t.marg, ca: t.ca, ht: t.ht, qty: t.qty, pertes: lossObj(t.loss)}); (S.histAll = S.histAll || []).push(S.history[S.history.length - 1]); S.history = S.history.slice(-14); S.live = {};
      }
      save(); closeSheet(); go(barman ? "service" : "home"); toast("Service archivé ✓");
    };
    $("keepOpen").onclick = closeSheet;
  });
};

/* ================= Calculs ================= */
let calcTab = "glass", cAlc = 1, qAlc = 1;
$("calcSeg").querySelectorAll("button").forEach(b => b.onclick = () => { calcTab = b.dataset.v; $("calcSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); renderCalc(); });
$("cAlc").querySelectorAll("button").forEach(b => b.onclick = () => { cAlc = +b.dataset.v; $("cAlc").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); calcGlass(); });
["cBuy","cCap","cDose","cSell","tRange"].forEach(i => $(i).oninput = calcGlass);
["qBuy","qNb","qSell","qRange"].forEach(i => $(i).oninput = calcPiece);
$("qAlc").querySelectorAll("button").forEach(b => b.onclick = () => { qAlc = +b.dataset.v; $("qAlc").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); calcPiece(); });
["pPlan","pReal","pGlass","pDays"].forEach(i => $(i).oninput = calcPour);
$("pProd").onchange = () => { const p = byId($("pProd").value); if (p) { $("pPlan").value = f1(p.d); $("pReal").value = f1(p.d + 1); } calcPour(); };
["xCat","xUp","xVol"].forEach(i => $(i).oninput = calcPrice);
function renderCalc() {
  ["glass","piece","pour","price"].forEach(t => $("c-" + t).style.display = t === calcTab ? "block" : "none");
  const opts = S.products.filter(p => p.a && p.d < p.cap).map(p => `<option value="${esc(p.id)}">${esc(p.n)}</option>`).join("");
  const cur = $("pProd").value; $("pProd").innerHTML = opts;
  if (cur && byId(cur)) $("pProd").value = cur; else { const p = byId($("pProd").value); if (p) { $("pPlan").value = f1(p.d); $("pReal").value = f1(p.d + 1); } }
  const xc = $("xCat").value || "Spiritueux";
  $("xCat").innerHTML = ["Spiritueux", "Toute la carte", ...new Set(S.products.map(p => p.c)), "Cocktails"].map(c => `<option>${esc(c)}</option>`).join(""); $("xCat").value = xc;
  if (!$("xVol").value) $("xVol").value = S.vol;
  calcGlass(); calcPiece(); calcPour(); calcPrice();
}
/* Vente à la pièce : bouteille entière, bière, soda, canette (achat au lot possible) */
function calcPiece() {
  const nb = Math.max(1, Math.round(num($("qNb").value)) || 1), p = {a: qAlc, b: num($("qBuy").value), cap: nb, d: 1, u: "pce", s: num($("qSell").value)}, c = prodCalc(p);
  const coef = c.cost > 0 ? c.ht / c.cost : NaN;
  $("qRes").innerHTML = `<div class="hl"><div><div class="l">Vous gagnez par pièce vendue (HT)</div><div class="v h">${eur(c.marg)}</div></div>${glass((c.rate || 0) / 100, {w:40, col:tone(c.rate)})}</div>
    <div><div class="l">Coût d'une pièce</div><div class="v h">${eur(c.cost)}</div></div><div><div class="l">Prix de vente HT</div><div class="v h">${eur(c.ht)}</div></div>
    <div><div class="l">Taux de marge</div><div class="v h" style="color:${tone(c.rate)}">${pct(c.rate)}</div></div><div><div class="l">Coefficient</div><div class="v h">${isFinite(coef) ? "× " + coef.toFixed(1).replace(".", ",") : "—"}</div></div>
    ${nb > 1 ? `<div><div class="l">Le lot de ${nb}, vendu (HT)</div><div class="v h">${eur(nb * c.ht, 0)}</div></div><div><div class="l">Gagné sur le lot (HT)</div><div class="v h">${eur(nb * c.marg, 0)}</div></div>` : ""}${chBlock(c, !!qAlc)}`;
  $("qTip").innerHTML = !isFinite(c.rate) ? "Remplissez les champs." : c.rate >= S.target ? "Excellent : cette pièce atteint votre objectif." : `Pour atteindre votre objectif de ${S.target} %, vendez-la <b>${eur(suggest(c.cost, !!qAlc, S.target))}</b>.`;
  const t = +$("qRange").value; $("qtLbl").textContent = t + " %"; $("qtPrice").textContent = eur(suggest(c.cost, !!qAlc, t));
}
$("qSave").onclick = () => { const nb = Math.max(1, Math.round(num($("qNb").value)) || 1);
  productSheet(null, {n: $("qName").value.trim(), c: qAlc ? "Bière" : "Soft", a: qAlc, u: "pce", b: num($("qBuy").value), cap: nb, d: 1, s: num($("qSell").value), st: 0, m: Math.min(nb, 6)}); };
function calcGlass() {
  const p = {a:cAlc,b:num($("cBuy").value),cap:num($("cCap").value),d:num($("cDose").value),s:num($("cSell").value)}, c = prodCalc(p);
  const coef = c.cost > 0 ? c.ht / c.cost : NaN, gl = p.d > 0 ? Math.floor(p.cap / p.d) : NaN;
  $("cRes").innerHTML = `<div class="hl"><div><div class="l">Vous gagnez par verre (HT)</div><div class="v h">${eur(c.marg)}</div></div>${glass((c.rate || 0) / 100, {w:40, col:tone(c.rate)})}</div>
    <div><div class="l">Coût du verre</div><div class="v h">${eur(c.cost)}</div></div><div><div class="l">Prix de vente HT</div><div class="v h">${eur(c.ht)}</div></div>
    <div><div class="l">Taux de marge</div><div class="v h" style="color:${tone(c.rate)}">${pct(c.rate)}</div></div><div><div class="l">Coefficient</div><div class="v h">${isFinite(coef) ? "× " + coef.toFixed(1).replace(".", ",") : "—"}</div></div>
    <div><div class="l">Verres par bouteille</div><div class="v h">${isFinite(gl) ? gl : "—"}</div></div><div><div class="l">Bouteille vendue (HT)</div><div class="v h">${isFinite(gl) ? eur(gl * c.ht, 0) : "—"}</div></div>${chBlock(c, !!cAlc)}`;
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
  renderCmds();
  $("order").innerHTML = o.length ? o.map(x => `<div class="row"><div class="grow"><div class="name">${esc(x.p.n)}</div><div class="meta">${eur(x.p.b)} HT la bouteille</div></div><div class="right"><div class="m h">× ${x.q}</div><div class="meta" style="margin:0">${eur(x.q * x.p.b)}</div></div></div>`).join("")
    + `<div class="row"><div class="grow name">Total estimé HT</div><div class="m h" style="color:var(--amber2)">${eur(o.reduce((s, x) => s + x.q * x.p.b, 0))}</div></div>`
    : `<div class="empty">✅ Rien à commander</div>`;
}
$("copyOrder").onclick = prepareOrders;
$("fourBtn").onclick = foursSheet;
$("achatBtn").onclick = () => cmdSheet(null, true);
$("newCmdBtn").onclick = () => { if (!fours().length) { toast("Ajoutez d'abord vos fournisseurs"); return foursSheet(); } cmdSheet(null); };
$("invBtn").onclick = () => openInventory(false);
$("perteBtn").onclick = () => perteSheet();
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
  const yest = new Date(Date.now() - 864e5 + 6 * 36e5).toISOString().slice(0, 10), today0 = new Date().toISOString().slice(0, 10);
  const conn = cloud() && S.caisse ? `<div class="card"><div class="name">${esc(CAISSE_NOMS[S.caisse.fournisseur] || "Caisse")} connectée ✓</div>
      <div class="meta" style="white-space:normal;margin-top:4px">Les ventes arrivent directement de votre caisse, sans fichier.</div>
      <div class="field" style="margin-top:10px"><label for="caDate">Journée</label><input id="caDate" type="date" value="${yest}" max="${today0}"></div>
      <button class="btn" id="caFetch">Récupérer les ventes</button></div><div class="lbl" style="margin-top:4px"><span>Ou avec un fichier</span></div>`
    : cloud() && !isBarman() ? `<button class="link" id="caLink" style="padding:0 0 12px">🔌 Connecter ma caisse pour ne plus importer de fichier</button>` : "";
  openSheet(`<h2 class="h">Ventes de la caisse</h2><div class="sub">Importez les ventes de votre caisse : la marge de la soirée et le stock se calculent tout seuls.</div>
    ${conn}<label class="drop" id="impDrop"><input type="file" id="impFile" accept=".csv,.txt,.xlsx,.xls,.xlsm,.ods,text/csv" hidden>
      <div class="e">📄</div><div class="name">Choisir le fichier</div><div class="meta" style="white-space:normal">CSV ou Excel · ${CAISSES}</div></label>
    <div class="card"><div class="name" style="font-size:14px">Où trouver ce fichier ?</div>
      <p class="tip" style="margin-top:6px">Dans l'espace en ligne de votre caisse : <b>Rapports</b> ou <b>Statistiques</b> → <b>Ventes par produit</b> (ou par article) → <b>Exporter</b> en CSV ou Excel, pour la journée voulue.</p></div>
    <div class="center"><button class="link" id="impDemo">Pas de caisse ? Essayer avec un fichier d'exemple</button></div>`, () => {
    $("impDemo").onclick = async () => { try { const r = await fetch("exemples/ventes-exemple.csv"); const b = await r.blob(); impRead(new File([b], "exemple-caisse.csv", {type: "text/csv"})); } catch (e) { toast("Exemple indisponible hors connexion"); } };
    $("impFile").onchange = e => { const f = e.target.files[0]; if (f) impRead(f); };
    if ($("caFetch")) $("caFetch").onclick = caisseVentes;
    if ($("caLink")) $("caLink").onclick = () => { closeSheet(); setTimeout(caisseSheet, 250); };
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
  const g = det.pre || Import.group(det, map);
  if (!g.items.length) { toast("Aucune vente trouvée avec ces colonnes"); return impColumns(det, map, ref, fname); }
  const catalog = allItems().map(i => ({key: i.key, label: i.o.n}));
  const rows = Import.match(g.items, catalog, S.alias || {});
  const choices = [["", "— Relier à… —"], ...allItems().map(i => [i.key, (i.kind === "k" ? "🍹 " : "") + i.o.n]), ["ignore", "Ignorer (pas suivi dans Dosis Bar)"]];
  const today = new Date().toISOString().slice(0, 10);
  const badge = st => st === "ok" || st === "memo" ? `<span class="badge b-ok">Reconnu</span>` : st === "check" ? `<span class="badge b-warn">À vérifier</span>` : `<span class="badge b-bad">À relier</span>`;
  const colTxt = det.pre ? "" : ["name","qty","total","date"].filter(k => map[k] != null).map(k => ({name:"produit",qty:"quantité",total:"montant",date:"date"})[k] + " = « " + esc(det.header[map[k]]) + " »").join(" · ");
  openSheet(`<h2 class="h">Ventes à importer</h2><div class="sub">${esc(fname)} · ${g.lines} ligne${g.lines > 1 ? "s" : ""} lue${g.lines > 1 ? "s" : ""}</div>
    ${det.pre ? (det.sansDetail ? `<div class="card" style="padding:12px 14px"><div class="meta" style="white-space:normal;color:var(--amber2)">${det.sansDetail} paiement${det.sansDetail > 1 ? "s" : ""} sans détail des produits (${eur(det.totalSansDetail)}) : saisis en montant libre dans la caisse, ils ne peuvent pas être comptés.</div></div>` : "")
      : `<div class="card" style="padding:12px 14px"><div class="meta" style="white-space:normal">Colonnes : ${colTxt}</div><button class="link" id="mCols" style="padding:6px 0 0">Modifier les colonnes</button></div>`}
    <div class="field"><label for="mDate">Date du service</label><input id="mDate" type="date" value="${g.date || today}" max="${today}"></div>
    <div class="lbl" style="margin-top:6px"><span>Produits de la caisse</span><span id="mLeft" style="text-transform:none;letter-spacing:0"></span></div>
    <div class="card list">${rows.map((r, i) => `<div class="row" style="flex-wrap:wrap"><div class="grow"><div class="name">${esc(r.label)}</div><div class="meta">× ${r.q}${r.hasTtc ? " · " + eur(r.ttc) : ""}</div></div>${badge(r.status)}
      <div class="field" style="flex-basis:100%;margin:8px 0 0"><select data-i="${i}" aria-label="Produit de la carte pour ${esc(r.label)}">${opts(choices, r.choice)}</select></div></div>`).join("")}</div>
    <div class="card"><div class="res" id="mSum"></div></div>
    <button class="btn" id="mGo">Importer la soirée</button>`, () => {
    if ($("mCols")) $("mCols").onclick = () => impColumns(det, map, ref, fname);
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
      <div class="field"><label for="fB" id="fBl">Prix ${contName(p) === "fût" ? "du fût" : "bouteille"} HT (€)</label><input id="fB" inputmode="decimal" value="${p.b === "" ? "" : f1x(p.b)}"></div>
      <div class="field"><label for="fCap" id="fCapl">Contenance (${uOf(p)})</label><input id="fCap" inputmode="decimal" value="${f1x(p.cap)}"><div class="tip" id="fCapT" style="padding:4px 0 0">${contName(p) === "fût" ? "Fût de 30 L = 3000 cl" : ""}</div></div>
      <div class="field" style="grid-column:1/-1"><label for="fU">Se mesure en</label><select id="fU">${opts(Object.entries(UNITS).map(([k, v]) => [k, v[1]]), uOf(p))}</select></div>
    </div>
    <div class="fmtbox">
      <div class="lbl" style="margin:2px 0 8px"><span>Formats de vente</span></div>
      <div class="fmrow fmmain"><input id="fFn" value="${esc(p.fn || "")}" placeholder="Verre, demi…" maxlength="40" aria-label="Nom du format principal">
        <div class="field"><label for="fD" id="fDl">${uOf(p)} servis</label><input id="fD" inputmode="decimal" value="${f1x(p.d)}"></div>
        <div class="field"><label for="fS">Prix TTC</label><input id="fS" inputmode="decimal" value="${p.s === "" ? "" : f1x(p.s)}"></div><span class="fmr" id="fmr_main"></span></div>
      <div id="fmL"></div>
      <div class="fmadd"><button type="button" class="mini ghostmini" id="fmAdd">+ Ajouter un format</button><span id="fmTypes"></span></div>
      <div class="field" style="margin-top:12px"><label for="fPt">Perte au service : <b id="fPtl" style="color:var(--amber2)">${f1(num(p.pt))} %</b></label><input id="fPt" class="range" type="range" min="0" max="20" step="1" value="${num(p.pt)}">
        <div class="tip" style="padding:4px 0 0">Mousse et purge du fût (5 à 10 %), vin ouvert qui s'oxyde (3 à 5 %). Comptée dans le coût de chaque verre.</div></div>
    </div>
    <div class="two">
      <div class="field"><label for="fSt" id="fStl">Stock (${contName(p)}s)</label><input id="fSt" inputmode="decimal" value="${f1x(p.st)}"></div>
      <div class="field"><label for="fM">Stock minimum</label><input id="fM" inputmode="decimal" value="${f1x(p.m)}"></div>
      ${fours().length ? `<div class="field"><label for="fF">Fournisseur</label><select id="fF">${opts([["", "— Aucun —"], ...fours().map(f => [f.id, f.n])], p.f || "")}</select></div>` : ""}
    </div>
    <div class="field"><label>Allergènes (sulfites pour le vin, gluten pour la bière…)</label>${algChips(p.al || [])}</div>
    <div class="card" style="background:var(--card2)"><div class="res" id="fRes"></div></div>
    <button class="btn" id="fSave">Enregistrer</button>${id ? `<div class="gap"></div><button class="btn danger" id="fDel">Supprimer ce produit</button>` : ""}`, () => {
    let fm = (p.fm || []).map(f => ({...f}));
    const read = () => ({n:$("fN").value.trim(),c:$("fC").value,a:+$("fA").value,b:num($("fB").value),cap:num($("fCap").value),d:num($("fD").value),s:num($("fS").value),st:num($("fSt").value),m:num($("fM").value),code:$("fCode").value.trim(),al:algRead(),...($("fF") ? {f: $("fF").value} : {}),
      fn: $("fFn").value.trim(), pt: +$("fPt").value, u: $("fU").value, fm: fm.filter(f => f.n && f.d > 0).map(f => ({...f}))});
    algArm();
    const fmDraw = () => {
      $("fmL").innerHTML = fm.map((f, k) => `<div class="fmrow"><input data-k="${k}" data-f="n" value="${esc(f.n)}" placeholder="Nom" maxlength="40" aria-label="Nom du format">
        <div class="field"><input data-k="${k}" data-f="d" inputmode="decimal" value="${f1x(f.d)}" aria-label="Centilitres servis"></div>
        <div class="field"><input data-k="${k}" data-f="s" inputmode="decimal" value="${f1x(f.s)}" aria-label="Prix TTC"></div><span class="fmr" id="fmr_${k}"></span>
        <button type="button" class="x" data-del="${k}" aria-label="Retirer ce format">✕</button></div>`).join("");
      $("fmL").querySelectorAll("[data-f]").forEach(e => e.oninput = () => { const f = fm[+e.dataset.k]; f[e.dataset.f] = e.dataset.f === "n" ? e.value : num(e.value); upd(); });
      $("fmL").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { fm.splice(+b.dataset.del, 1); fmDraw(); upd(); });
      const x = read(), types = [...(FMT_TYPES[x.c] || (SPIRITS.includes(x.c) ? FMT_TYPES._spirit : []))];
      if (contName(x) === "bouteille" && uOf(x) !== "pce" && !types.some(t => t[1] === 0)) types.push(["Bouteille entière", 0]);
      $("fmTypes").innerHTML = types.filter(([n]) => !fm.some(f => f.n === n) && n !== x.fn).map(([n, cl]) => `<button type="button" class="chip" data-t="${esc(n)}" data-cl="${cl}">+ ${esc(n)}</button>`).join("");
      $("fmTypes").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { const y = read(), cl = +b.dataset.cl, d = cl === 0 ? y.cap : cl < 0 ? y.d * -cl : cl;
        const c0 = pcost(y, d), sg = d >= y.cap ? suggest(c0, !!y.a, S.target2 ?? 65) : suggest(c0, !!y.a, S.target);
        fm.push({id: "n" + Date.now(), n: b.dataset.t === "Bouteille" || b.dataset.t === "Bouteille (VIP)" ? b.dataset.t : b.dataset.t, d, s: sg}); fmDraw(); upd(); });
    };
    $("fmAdd").onclick = () => { fm.push({id: "n" + Date.now(), n: "", d: read().d, s: read().s}); fmDraw(); upd(); const i = $("fmL").querySelector(`[data-k="${fm.length - 1}"][data-f="n"]`); if (i) i.focus(); };
    const fmRates = x => { const t = (d, s) => { const c = prodCalc({...x, d, s}), T = d >= x.cap ? (S.target2 ?? 65) : S.target; return `<span style="color:${tone(c.rate, T)}">${pct(c.rate)}</span>`; };
      $("fmr_main").innerHTML = x.d > 0 && x.s > 0 ? t(x.d, x.s) : ""; fm.forEach((f, k) => { const e = $("fmr_" + k); if (e) e.innerHTML = f.d > 0 && f.s > 0 ? (x.cap > 0 && f.d >= x.cap && uOf(x) !== "pce" ? `<small style="color:var(--mut);display:block;font-size:10px">1 ${contName(x)}</small>` : "") + t(f.d, f.s) : ""; });
      $("fPtl").textContent = x.pt + " %"; const cn = contName(x);
      $("fBl").textContent = `Prix ${cn === "fût" ? "du fût" : cn === "paquet" ? "du paquet" : cn === "boîte" ? "de la boîte" : "bouteille"} HT (€)`; $("fStl").textContent = `Stock (${cn}s)`;
      const u = uOf(x); $("fCapl").textContent = `Contenance (${u === "pce" ? "pièces" : u})`; $("fDl").textContent = `${u === "pce" ? "pièces" : u} servis`;
      $("fCapT").textContent = cn === "fût" ? "Fût de 30 L = 3000 cl" : cn === "paquet" && u === "g" ? "Paquet de 1 kg = 1000 g · expresso ≈ 7 g" : cn === "boîte" ? "Nombre de sachets dans la boîte" : ""; };
    fmDraw();
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
    const upd = () => { const x = read(), c = prodCalc(x), T = tgtP(x), sg = suggest(c.cost, !!x.a, T); fmRates(x);
      if (document.activeElement === $("fC")) fmDraw();
      const W = ["Café", "Thé", "Chocolat"].includes(x.c) ? ["de la tasse", "par tasse"] : ["du verre", "par verre"];
      $("fRes").innerHTML = `${fm.length ? `<div style="grid-column:1/-1" class="l">Format principal${x.fn ? " : " + esc(x.fn) : ""}</div>` : ""}<div><div class="l">Coût ${W[0]}</div><div class="v h">${eur(c.cost)}</div></div><div><div class="l">Gagné ${W[1]}</div><div class="v h">${eur(c.marg)}</div></div>
      <div><div class="l">Taux de marge</div><div class="v h" style="color:${tone(c.rate, T)}">${pct(c.rate)}</div></div>
      <div><div class="l">Prix conseillé (${T} %)</div><div class="v h">${eur(sg)}</div>${isFinite(c.rate) && c.rate < T ? `<button class="mini" id="useSg">Utiliser</button>` : ""}</div>${zonesLine(x.s, c)}${chBlock(c, !!x.a, "fS", upd)}`;
      const u = $("useSg"); if (u) u.onclick = () => { $("fS").value = f1x(sg); upd(); }; armCh("fS", upd); };
    $("sBody").querySelectorAll("input,select").forEach(e => { if (!e.dataset.f) e.oninput = upd; }); $("fC").onchange = () => { const cu0 = CAT_UNIT[$("fC").value];
      if (cu0 && !id) { $("fU").value = cu0[0]; $("fCap").value = f1x(cu0[1]); $("fD").value = f1x(cu0[2]); if ($("fC").value !== "Lait") $("fA").value = "0"; }
      if ($("fC").value === "Lait" && !id) $("fS").value = "0";
      fmDraw(); upd(); }; upd();
    $("fSave").onclick = async () => { const x = read();
      if (!x.n) return toast("Donnez un nom au produit");
      if (fm.some(f => !f.n || !(f.d > 0))) return toast("Chaque format a besoin d'un nom et d'une quantité");
      if (!(x.cap > 0 && x.d > 0)) return toast("Contenance et dose obligatoires");
      $("fSave").classList.add("busy");
      if (await act(() => actSaveProduct(id, x), id ? "Produit mis à jour ✓" : "Produit ajouté ✓")) closeSheet();
      else $("fSave").classList.remove("busy"); };
    if (id) armBtn($("fDel"), "Toucher encore pour supprimer", async () => { if (await act(() => actDeleteProduct(id), "Produit supprimé")) closeSheet(); });
  });
}
function cocktailSheet(id) {
  if (!S.products.length) return toast("Ajoutez d'abord des produits à votre carte");
  const k = id ? S.cocktails.find(c => c.id === id) : {n:"",s:"",x:0.3,cat:"Cocktails",ing:[{p:S.products[0].id,cl:5}]};
  let ing = k.ing.map(g => ({...g}));
  const prodOpts = sel => opts(S.products.map(p => [p.id, p.n]), sel);
  openSheet(`<h2 class="h">${id ? esc(k.n) : "Nouvelle recette"}</h2><div class="sub">Cocktail, cocktail sans alcool ou boisson chaude : le coût se calcule ingrédient par ingrédient</div>
    <div class="two"><div class="field"><label for="kN">Nom</label><input id="kN" value="${esc(k.n)}" placeholder="Ex : Daïquiri, Cappuccino" maxlength="80"></div>
    <div class="field"><label for="kT">Type</label><select id="kT">${opts(REC_CATS, k.cat || "Cocktails")}</select></div></div>
    <div class="two"><div class="field"><label for="kS">Prix de vente TTC (€)</label><input id="kS" inputmode="decimal" value="${f1x(k.s)}"></div>
    <div class="field"><label for="kX">Garniture, sucre, glace, gobelet (€)</label><input id="kX" inputmode="decimal" value="${f1x(k.x)}"></div></div>
    <div class="lbl" style="margin-top:4px"><span>Ingrédients de la carte</span></div><div id="kIng"></div>
    <button class="btn ghost" id="kAdd" style="margin-bottom:12px">+ Ajouter un ingrédient</button>
    <div class="card" style="background:var(--card2)"><div class="res" id="kRes"></div></div>
    <button class="btn" id="kSave">Enregistrer</button>${id ? `<div class="gap"></div><button class="btn danger" id="kDel">Supprimer cette recette</button>` : ""}`, () => {
    const drawIng = () => { $("kIng").innerHTML = ing.map((g, i) => `<div class="ing"><div class="field"><select data-i="${i}" data-f="p" aria-label="Ingrédient">${prodOpts(g.p)}</select></div>
      <div class="field"><input data-i="${i}" data-f="cl" inputmode="decimal" value="${f1x(g.cl)}" aria-label="Quantité"></div><span class="cuu">${esc(uTxt(byId(g.p), g.cl))}</span><button class="x" data-del="${i}" aria-label="Retirer l'ingrédient">✕</button></div>`).join("");
      $("kIng").querySelectorAll("[data-f]").forEach(e => e.oninput = () => { const g = ing[+e.dataset.i]; if (e.dataset.f === "p") { g.p = e.value; drawIng(); } else g.cl = num(e.value); upd(); });
      $("kIng").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { ing.splice(+b.dataset.del, 1); drawIng(); upd(); }); };
    const read = () => ({n:$("kN").value.trim(),cat:$("kT").value,s:num($("kS").value),x:num($("kX").value),ing:ing.filter(g => byId(g.p) && g.cl > 0).map(g => ({...g}))});
    const upd = () => { const x = read(), c = cockCalc(x), sg = suggest(c.cost, c.alc, S.target);
      const lines = x.ing.map(g => { const p = byId(g.p); return `${esc(p.n.split(" ")[0])} ${eur(pcost(p, g.cl))}`; }).join(" + ");
      const hot = x.cat === "Boissons chaudes";
      $("kRes").innerHTML = `<div><div class="l">Coût ${hot ? "de la boisson" : "du cocktail"}</div><div class="v h">${eur(c.cost)}</div></div><div><div class="l">Gagné par ${hot ? "tasse" : "verre"}</div><div class="v h">${eur(c.marg)}</div></div>
       <div><div class="l">Taux de marge</div><div class="v h" style="color:${tone(c.rate)}">${pct(c.rate)}</div></div><div><div class="l">Prix conseillé (${S.target} %)</div><div class="v h">${eur(sg)}</div></div>
       <div style="grid-column:1/-1"><div class="l">Détail du coût · TVA ${c.alc ? 20 : 10} %</div><div style="font-size:12px;margin-top:3px">${lines || "—"}${x.x ? " + extras " + eur(x.x) : ""}</div></div>${zonesLine(x.s, c)}
       <div style="grid-column:1/-1"><div class="l">Allergènes (d'après les produits)</div><div style="font-size:12px;margin-top:3px">${esc(algText(cockAlg(x)))}</div></div>${chBlock(c, c.alc, "kS", upd)}`; armCh("kS", upd); };
    drawIng(); upd(); ["kN","kS","kX","kT"].forEach(i => $(i).oninput = upd);
    $("kAdd").onclick = () => { const u = S.products.find(p => !ing.some(g => g.p === p.id)) || S.products[0]; ing.push({p: u.id, cl: 2}); drawIng(); upd(); };
    $("kSave").onclick = async () => { const x = read();
      if (!x.n) return toast("Donnez un nom à la recette");
      if (!x.ing.length) return toast("Ajoutez au moins un ingrédient");
      $("kSave").classList.add("busy");
      if (await act(() => actSaveCocktail(id, x), id ? "Recette mise à jour ✓" : "Recette créée ✓")) closeSheet();
      else $("kSave").classList.remove("busy"); };
    if (id) armBtn($("kDel"), "Toucher encore pour supprimer", async () => { if (await act(() => actDeleteCocktail(id), "Recette supprimée")) closeSheet(); });
  });
}

/* ================= Restauration : écrans ================= */
function renderCuisine() {
  const c = cu(), tabs = [["d", "Plats", c.d.length], ["r", "Préparations", c.r.length], ["i", "Ingrédients", c.i.length]];
  $("sortChips").innerHTML = tabs.map(([k, l, n]) => `<button class="chip ${cuTab === k ? "on" : ""}" data-t="${k}">${l}${n ? " · " + n : ""}</button>`).join("");
  $("sortChips").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { cuTab = b.dataset.t; renderMenu(); });
  const qs = $("q").value.trim().toLowerCase(), list = c[cuTab].filter(o => (o.n || "").toLowerCase().includes(qs));
  let html;
  if (cuTab === "d") html = list.map(d => ({d, k: platCalc(d)})).sort((a, b) => b.k.marg - a.k.marg).map(({d, k}) => { const T = cuTarget(), st = status(k, null, T);
    return `<div class="row tap" data-id="${esc(d.id)}"><div class="emoji">${CU_CATS[d.c] || "🍴"}</div>
      <div class="grow"><div class="name">${esc(d.n)}</div><div class="meta">${eur(num(d.s))} TTC · coût ${eur(k.cost)} · TVA ${String(num(d.tva || 10)).replace(".", ",")} %</div></div>
      <div class="right"><div class="m h">${eur(k.marg)}</div>${chOn() && k.ht > 0 ? `<div style="font-size:12px;font-weight:600;color:${k.net < 0 ? "var(--bad)" : k.netRate >= netTarget() ? "var(--ok)" : "var(--amber)"}">réel ${eur(k.net)}</div>` : `<div style="font-size:12px;color:${tone(k.rate, T)};font-weight:600">${pct(k.rate)}</div>`}<span class="badge ${st[1]}">${st[0]}</span></div></div>`; }).join("");
  else if (cuTab === "r") html = list.map(r => { const u = r.ru || "g", per = cuUnitCost("r", r.id), big = u === "g" ? ["kg", 1000] : u === "cl" ? ["L", 100] : ["pièce", 1];
    return `<div class="row tap" data-id="${esc(r.id)}"><div class="emoji">🥣</div><div class="grow"><div class="name">${esc(r.n)}</div><div class="meta">Rend ${f1(num(r.rend))} ${u} · ${(r.lines || []).length} ingrédient${(r.lines || []).length > 1 ? "s" : ""}</div></div>
      <div class="right"><div class="m h">${eur(per * big[1])}</div><div class="meta" style="margin:0">par ${big[0]}</div></div></div>`; }).join("");
  else html = list.slice().sort((a, b) => a.n.localeCompare(b.n)).map(i => { const u = CU_U[i.u] || CU_U.kg, real = cuUnitCost("i", i.id) * u[1], bi = buyInfo(i);
    const bought = num(i.qa) > 0 ? `${f1(bi.qa)} ${bi.ua === "pce" && bi.qa <= 1 ? "pièce" : BUY_U[bi.ua][2]} pour ${eur(bi.pa)} HT` : `${eur(num(i.prix))} HT / ${u[2]}`;
    return `<div class="row tap" data-id="${esc(i.id)}"><div class="emoji">🧺</div><div class="grow"><div class="name">${esc(i.n)}</div><div class="meta">${bought}${num(i.perte) ? " · perte " + f1(num(i.perte)) + " %" : ""}</div></div>
      <div class="right"><div class="m h">${eur(real)}</div><div class="meta" style="margin:0">réel / ${u[2]}</div></div></div>`; }).join("");
  const empty = {d: c.i.length ? "Aucun plat. Touchez + pour créer votre première fiche." : "Commencez par ajouter vos ingrédients (onglet Ingrédients), puis créez vos plats.",
    r: "Aucune préparation. Une sauce, une pâte, des frites maison : préparez-les une fois, utilisez-les dans plusieurs plats.", i: "Aucun ingrédient. Touchez + pour ajouter le premier, avec son prix d'achat."}[cuTab];
  const addLbl = {d: "Ajouter un plat", r: "Ajouter une préparation", i: "Ajouter un ingrédient"}[cuTab];
  $("menuList").innerHTML = `<button class="cuadd" id="cuAdd"><span>+</span>${addLbl}</button>` + (html || `<div class="empty">${qs ? "Rien trouvé" : empty}</div>`);
  $("cuAdd").onclick = () => $("fab").onclick();
  $("menuList").querySelectorAll("[data-id]").forEach(r => r.onclick = () => ({d: platSheet, r: prepSheet, i: ingSheet})[cuTab](r.dataset.id));
}
function ingSheet(id) {
  const o0 = id ? cuFind("i", id) : null, bi = o0 ? buyInfo(o0) : {ua: "kg", qa: 1, pa: ""};
  const o = o0 || {n: "", perte: 0};
  openSheet(`<h2 class="h">${id ? esc(o.n) : "Nouvel ingrédient"}</h2><div class="sub">Comme sur la facture : la quantité achetée et le prix payé hors taxes</div>
    <div class="field"><label for="iN">Nom</label><input id="iN" value="${esc(o.n)}" placeholder="Ex : Bœuf haché 15 %" maxlength="80"></div>
    <div class="two"><div class="field"><label for="iQ">Quantité achetée</label><input id="iQ" inputmode="decimal" value="${f1x(bi.qa)}" placeholder="Ex : 5"></div>
    <div class="field"><label for="iU">Unité</label><select id="iU">${opts([["kg","kilos (kg)"],["g","grammes (g)"],["L","litres (L)"],["cl","centilitres (cl)"],["ml","millilitres (ml)"],["pce","pièces"]], bi.ua)}</select></div></div>
    <div class="field"><label for="iP">Prix payé HT pour cette quantité (€)</label><input id="iP" inputmode="decimal" value="${f1x(bi.pa)}" placeholder="Ex : 69,50"></div>
    <div class="field"><label for="iL">Perte à la préparation : <b id="iLl" style="color:var(--amber2)">${f1(num(o.perte))} %</b></label><input id="iL" class="range" type="range" min="0" max="70" step="1" value="${num(o.perte)}">
      <div class="tip" style="padding:6px 0 0">Épluchage, parage, cuisson… Ex : pommes de terre 20 %, salade 30 %.</div></div>
    <div class="field"><label>Allergènes</label>${algChips(o.al || [])}</div>
    <div class="card" style="background:var(--card2)"><div class="res" id="iRes"></div></div>
    <button class="btn" id="iSave">Enregistrer</button>${id ? `<div class="gap"></div><button class="btn danger" id="iDel">Supprimer cet ingrédient</button>` : ""}`, () => {
    algArm();
    const read = () => { const x = {n: $("iN").value.trim(), qa: num($("iQ").value), ua: $("iU").value, pa: num($("iP").value), perte: +$("iL").value, al: algRead()}, b = buyInfo(x);
      return {...x, u: b.u, prix: Math.round(b.prix * 10000) / 10000}; };
    const upd = () => { const x = read(), u = CU_U[x.u], real = x.prix / (1 - x.perte / 100); $("iLl").textContent = x.perte + " %";
      $("iRes").innerHTML = `<div><div class="l">Prix d'achat par ${u[2]}</div><div class="v h">${eur(x.prix)}</div></div><div><div class="l">Coût réel par ${u[2]}${x.perte ? " (après perte)" : ""}</div><div class="v h">${eur(real)}</div></div>
        <div style="grid-column:1/-1"><div class="l">Dans vos plats</div><div style="font-size:13px;margin-top:3px">${u[1] === 1000 ? `100 g coûtent ${eur(real / 10)}` : u[1] === 100 ? `10 cl coûtent ${eur(real / 10)}` : `1 pièce coûte ${eur(real)}`}</div></div>`; };
    $("sBody").querySelectorAll("input,select").forEach(e => e.oninput = upd); upd();
    $("iSave").onclick = async () => { const x = read(); if (!x.n) return toast("Donnez un nom à l'ingrédient");
      if (!(x.qa > 0)) { toast("Indiquez la quantité achetée"); return $("iQ").focus(); }
      if (!(x.pa > 0)) { toast("Indiquez le prix payé"); return $("iP").focus(); }
      $("iSave").classList.add("busy");
      if (await act(() => actSaveCu("i", id, x), id ? "Ingrédient mis à jour ✓" : "Ingrédient ajouté ✓")) closeSheet(); else $("iSave").classList.remove("busy"); };
    if (id) armBtn($("iDel"), "Toucher encore : il sera retiré des recettes", async () => { if (await act(() => actDeleteCu("i", id), "Ingrédient supprimé")) closeSheet(); });
  });
}
function linesEditor(box, lines, selfId, upd) { // éditeur de lignes ingrédients / préparations
  const c = cu(), choices = [...c.i.map(o => ["i:" + o.id, o.n]), ...c.r.filter(r => r.id !== selfId && !(selfId && prepUses(r, selfId))).map(o => ["r:" + o.id, "🥣 " + o.n])];
  const draw = () => {
    box.innerHTML = lines.map((l, k) => `<div class="ing cuing"><div class="field"><select data-k="${k}" data-f="s" aria-label="Ingrédient">${opts(choices, l.t + ":" + l.id)}</select></div>
      <div class="field"><input data-k="${k}" data-f="q" inputmode="decimal" value="${f1x(l.q)}" aria-label="Quantité"></div><span class="cuu">${esc(cuUnit(l.t, l.id))}</span>
      <button class="x" data-del="${k}" aria-label="Retirer">✕</button></div>`).join("") || `<p class="tip" style="padding:0 0 10px">Aucun ingrédient pour l'instant.</p>`;
    box.querySelectorAll("[data-f]").forEach(e => e.oninput = () => { const l = lines[+e.dataset.k];
      if (e.dataset.f === "s") { const [t, ...rest] = e.value.split(":"); l.t = t; l.id = rest.join(":"); draw(); } else l.q = num(e.value); upd(); });
    box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { lines.splice(+b.dataset.del, 1); draw(); upd(); });
  };
  draw();
  return { add() { if (!choices.length) return toast("Ajoutez d'abord des ingrédients (onglet Ingrédients)");
    const used = new Set(lines.map(l => l.t + ":" + l.id)), ch = choices.find(([v]) => !used.has(v)) || choices[0], [t, ...rest] = ch[0].split(":");
    lines.push({t, id: rest.join(":"), q: t === "i" && (cuFind("i", rest.join(":")) || {}).u === "pce" ? 1 : 100}); draw(); upd(); } };
}
function prepSheet(id) {
  if (!cu().i.length) return toast("Ajoutez d'abord des ingrédients (onglet Ingrédients)");
  const o = id ? cuFind("r", id) : {n: "", rend: 1000, ru: "g", lines: []}; const lines = (o.lines || []).map(l => ({...l}));
  openSheet(`<h2 class="h">${id ? esc(o.n) : "Nouvelle préparation"}</h2><div class="sub">Une base préparée à l'avance : sauce, pâte, frites maison, fond…</div>
    <div class="field"><label for="rN">Nom</label><input id="rN" value="${esc(o.n)}" placeholder="Ex : Sauce maison" maxlength="80"></div>
    <div class="lbl" style="margin-top:4px"><span>Ce qu'il faut pour une fournée</span></div><div id="rL"></div>
    <button class="btn ghost" id="rAdd" style="margin-bottom:12px">+ Ajouter un ingrédient</button>
    <div class="two"><div class="field"><label for="rR">Quantité obtenue</label><input id="rR" inputmode="decimal" value="${f1x(o.rend)}"></div>
    <div class="field"><label for="rU">Unité</label><select id="rU">${opts([["g","grammes"],["cl","centilitres"],["pce","portions / pièces"]], o.ru)}</select></div></div>
    <div class="card" style="background:var(--card2)"><div class="res" id="rRes"></div></div>
    <button class="btn" id="rSave">Enregistrer</button>${id ? `<div class="gap"></div><button class="btn danger" id="rDel">Supprimer cette préparation</button>` : ""}`, () => {
    const read = () => ({n: $("rN").value.trim(), rend: num($("rR").value), ru: $("rU").value, lines: lines.filter(l => cuFind(l.t, l.id) && num(l.q) > 0).map(l => ({...l, q: num(l.q)}))});
    const upd = () => { const x = read(), tot = linesCost(x.lines, new Set(id ? [id] : [])), per = x.rend > 0 ? tot / x.rend : 0, big = x.ru === "g" ? ["kg", 1000] : x.ru === "cl" ? ["L", 100] : ["portion", 1];
      $("rRes").innerHTML = `<div><div class="l">Coût de la fournée</div><div class="v h">${eur(tot)}</div></div><div><div class="l">Coût par ${big[0]}</div><div class="v h">${eur(per * big[1])}</div></div>`; };
    const ed = linesEditor($("rL"), lines, id, upd); $("rAdd").onclick = () => ed.add();
    ["rN", "rR", "rU"].forEach(i => $(i).oninput = upd); upd();
    $("rSave").onclick = async () => { const x = read(); if (!x.n) return toast("Donnez un nom à la préparation"); if (!(x.rend > 0)) return toast("Indiquez la quantité obtenue");
      $("rSave").classList.add("busy");
      if (await act(() => actSaveCu("r", id, x), id ? "Préparation mise à jour ✓" : "Préparation créée ✓")) closeSheet(); else $("rSave").classList.remove("busy"); };
    if (id) armBtn($("rDel"), "Toucher encore : elle sera retirée des plats", async () => { if (await act(() => actDeleteCu("r", id), "Préparation supprimée")) closeSheet(); });
  });
}
function platSheet(id) {
  if (!cu().i.length) return toast("Ajoutez d'abord des ingrédients (onglet Ingrédients)");
  const o = id ? cuFind("d", id) : {n: "", c: "Plat", s: "", tva: 10, x: 0, lines: []}; const lines = (o.lines || []).map(l => ({...l}));
  openSheet(`<h2 class="h">${id ? esc(o.n) : "Nouveau plat"}</h2><div class="sub">Le coût de l'assiette se calcule ingrédient par ingrédient</div>
    <div class="field"><label for="dN">Nom du plat</label><input id="dN" value="${esc(o.n)}" placeholder="Ex : Burger maison et frites" maxlength="80"></div>
    <div class="two"><div class="field"><label for="dC">Catégorie</label><select id="dC">${opts(Object.keys(CU_CATS).map(k => [k, CU_CATS[k] + "  " + k]), o.c)}</select></div>
    <div class="field"><label for="dS">Prix de vente TTC (€)</label><input id="dS" inputmode="decimal" value="${f1x(o.s)}"></div></div>
    <div class="field"><label for="dT">TVA</label><select id="dT">${opts([[10,"10 % · sur place ou à emporter à consommer tout de suite"],[5.5,"5,5 % · à emporter pour plus tard, traiteur sans service"],[20,"20 % · avec alcool"]], o.tva)}</select>
      <div class="tip" style="padding:6px 0 0">Les taux dépendent de votre activité : faites-les confirmer par votre comptable.</div></div>
    <div class="lbl" style="margin-top:4px"><span>Dans l'assiette</span></div><div id="dL"></div>
    <button class="btn ghost" id="dAdd" style="margin-bottom:12px">+ Ajouter un ingrédient ou une préparation</button>
    <div class="field"><label for="dX">Emballage, condiments, pain, divers (€ HT)</label><input id="dX" inputmode="decimal" value="${f1x(o.x)}"></div>
    <div class="card" style="background:var(--card2)"><div class="res" id="dRes"></div></div>
    <button class="btn" id="dSave">Enregistrer</button>${id ? `<div class="gap"></div><button class="btn danger" id="dDel">Supprimer ce plat</button>` : ""}`, () => {
    const read = () => ({n: $("dN").value.trim(), c: $("dC").value, s: num($("dS").value), tva: num($("dT").value), x: num($("dX").value), lines: lines.filter(l => cuFind(l.t, l.id) && num(l.q) > 0).map(l => ({...l, q: num(l.q)}))});
    const upd = () => { const x = read(), k = platCalc(x), T = cuTarget(), sg = suggestPlat(k.cost, k.tva, T);
      $("dRes").innerHTML = `<div><div class="l">Coût de l'assiette</div><div class="v h">${eur(k.cost)}</div></div><div><div class="l">Gagné par assiette</div><div class="v h">${eur(k.marg)}</div></div>
        <div><div class="l">Taux de marge</div><div class="v h" style="color:${tone(k.rate, T)}">${pct(k.rate)}</div><div style="font-size:12px;color:var(--mut)">coût matière ${pct(k.ht > 0 ? k.cost / k.ht * 100 : NaN)}</div></div>
        <div><div class="l">Prix conseillé (${T} %)</div><div class="v h">${eur(sg)}</div>${isFinite(k.rate) && k.rate < T ? `<button class="mini" id="useSgD">Utiliser</button>` : ""}</div>
        <div style="grid-column:1/-1"><div class="l">Allergènes (d'après les ingrédients)</div><div style="font-size:13px;margin-top:3px">${esc(algText(linesAlg(x.lines)))}</div></div>${chBlock(k, k.tva, "dS", upd, "assiette")}`;
      const u = $("useSgD"); if (u) u.onclick = () => { $("dS").value = f1x(sg); upd(); }; armCh("dS", upd); };
    const ed = linesEditor($("dL"), lines, null, upd); $("dAdd").onclick = () => ed.add();
    ["dN", "dC", "dS", "dT", "dX"].forEach(i => $(i).oninput = upd); upd();
    $("dSave").onclick = async () => { const x = read(); if (!x.n) return toast("Donnez un nom au plat"); if (!x.lines.length) return toast("Ajoutez au moins un ingrédient");
      $("dSave").classList.add("busy");
      if (await act(() => actSaveCu("d", id, x), id ? "Plat mis à jour ✓" : "Plat créé ✓")) closeSheet(); else $("dSave").classList.remove("busy"); };
    if (id) armBtn($("dDel"), "Toucher encore pour supprimer", async () => { if (await act(() => actDeleteCu("d", id), "Plat supprimé")) closeSheet(); });
  });
}
const METIERS = [["bar","Bar"],["bar-resto","Bar-restaurant"],["resto","Restaurant"],["fastfood","Restauration rapide"],["traiteur","Traiteur"]];
function restoSheet() {
  if (!restoAllowed()) return openSheet(`<h2 class="h"><img src="icons/logo-resto.svg" width="22" height="25" alt="" style="vertical-align:-5px;margin-right:6px">Dosis Resto</h2><div class="sub">Fiches plats, préparations, coût de l'assiette et allergènes, dans la même app que votre bar.</div>
    <div class="card"><div class="name">+ 20 € HT par mois</div><div class="meta" style="white-space:normal">À ajouter à votre abonnement, ou incluse dans la formule Pro. Vos fiches déjà créées sont conservées.</div></div>
    <button class="btn" id="roAbo">Ajouter Dosis Resto à mon abonnement</button>`, () => { $("roAbo").onclick = () => { closeSheet(); setTimeout(aboSheet, 250); }; });
  const r = Object.assign({on: false, metier: "bar-resto", target: 70}, S.resto || {});
  openSheet(`<h2 class="h"><img src="icons/logo-resto.svg" width="22" height="25" alt="" style="vertical-align:-5px;margin-right:6px">Dosis Resto</h2><div class="sub">Fiches plats, préparations et coût de l'assiette, dans la même app que votre bar.</div>
    <div class="field"><label for="roM">Votre activité</label><select id="roM">${opts(METIERS.filter(m => m[0] !== "bar"), r.metier)}</select></div>
    <div class="field"><label for="roT">Objectif de marge cuisine : <b id="roTl" style="color:var(--amber2)">${r.target} %</b></label><input id="roT" class="range" type="range" min="50" max="85" value="${r.target}">
      <div class="tip" style="padding:6px 0 0">70 % de marge = 30 % de coût matière, un repère courant en restauration.</div></div>
    <button class="btn" id="roSave">${r.on ? "Enregistrer" : "Activer Dosis Resto"}</button>
    ${r.on ? `<div class="gap"></div><button class="btn danger" id="roOff">Désactiver l'option</button><p class="tip" style="padding:8px 0 0">Vos fiches sont conservées si vous la réactivez.</p>` : ""}`, () => {
    $("roT").oninput = () => $("roTl").textContent = $("roT").value + " %";
    $("roSave").onclick = async () => { $("roSave").classList.add("busy");
      const x = {on: true, metier: $("roM").value, target: +$("roT").value};
      if (await act(() => actResto(x), r.on ? "Réglages enregistrés ✓" : "Dosis Resto activé ✓")) { closeSheet(); if (!r.on) { cuTab = MODE === "demo" ? "d" : "i"; go("cuisine"); } else navSync(); }
      else $("roSave").classList.remove("busy"); };
    if ($("roOff")) armBtn($("roOff"), "Toucher encore pour désactiver", async () => { if (await act(() => actResto({...r, on: false}), "Option désactivée")) closeSheet(); });
  });
}

/* ================= Prix par zone ================= */
function zonesSheet() {
  const R = zoneRules(), z = k => Object.assign({on: false, t: "eur", v: k === "hh" ? 1 : k === "terrasse" ? 1 : 0.5}, R[k] || {});
  const block = (k, l, hint) => { const r = z(k); return `<div class="zone card"><label class="sw"><input type="checkbox" id="z_${k}_on" ${r.on ? "checked" : ""}><span><b>${l}</b><small>${hint}</small></span></label>
    <div class="two" id="z_${k}_box" ${r.on ? "" : "hidden"}><div class="field"><label for="z_${k}_v">${k === "hh" ? "Réduction" : "Supplément"}</label><input id="z_${k}_v" inputmode="decimal" value="${f1x(r.v)}"></div>
    <div class="field"><label for="z_${k}_t">En</label><select id="z_${k}_t">${opts([["eur","€ par verre"],["pct","% du prix"]], r.t)}</select></div></div></div>`; };
  openSheet(`<h2 class="h">Prix par zone</h2><div class="sub">Le prix de votre carte est celui du comptoir. Ajoutez un supplément pour la salle ou la terrasse, une réduction pour l'happy hour.</div>
    ${block("salle", "Salle", "Prix servi à table")}${block("terrasse", "Terrasse", "Souvent un peu plus cher")}${block("hh", "Happy hour", "Prix réduit sur un créneau")}
    <div class="field" id="hhH" ${z("hh").on ? "" : "hidden"}><label for="z_hh_h">Horaires de l'happy hour (pour mémoire)</label><input id="z_hh_h" value="${esc(z("hh").h || "")}" placeholder="Ex : 17 h – 20 h" maxlength="40"></div>
    <div class="card" style="background:var(--card2)"><div id="zEx" style="font-size:13px;line-height:1.6"></div></div>
    <button class="btn" id="zSave">Enregistrer</button>`, () => {
    const read = () => { const o = {}; ["salle", "terrasse", "hh"].forEach(k => o[k] = {on: $(`z_${k}_on`).checked, t: $(`z_${k}_t`).value, v: num($(`z_${k}_v`).value)}); o.hh.h = $("z_hh_h").value.trim(); return o; };
    const upd = () => { const o = read(); ["salle", "terrasse", "hh"].forEach(k => $(`z_${k}_box`).hidden = !o[k].on); $("hhH").hidden = !o.hh.on;
      const ex = S.products[0] ? S.products.find(p => p.a) || S.products[0] : {n: "Un verre à 8 €", s: 8}, keep = S.opts; S.opts = {...(S.opts || {}), zones: o};
      $("zEx").innerHTML = `<b>Exemple : ${esc(ex.n)}</b><br>` + ZONES.filter(([k]) => zoneOn(k)).map(([k, l]) => `${l} : <b>${eur(zonePrice(ex.s, k))}</b>`).join(" · "); S.opts = keep; };
    $("sBody").querySelectorAll("input,select").forEach(e => e.oninput = upd); upd();
    $("zSave").onclick = async () => { $("zSave").classList.add("busy");
      if (await act(() => actOpts({zones: read()}), "Prix par zone enregistrés ✓")) closeSheet(); else $("zSave").classList.remove("busy"); };
  });
}
function zonesLine(base, c) {
  const zs = ZONES.filter(([k]) => k !== "comptoir" && zoneOn(k)); if (!zs.length || !(base > 0)) return "";
  return `<div style="grid-column:1/-1"><div class="l">Prix par zone</div><div style="font-size:13px;margin-top:3px;line-height:1.6">${zs.map(([k, l]) => { const pz = zonePrice(base, k), h = pz / (1 + c.tva), r = h > 0 ? (h - c.cost) / h * 100 : NaN;
    return `${l} <b>${eur(pz)}</b> <span style="color:${tone(r)}">(${pct(r)})</span>`; }).join(" · ")}</div></div>`;
}

/* ================= Fournisseurs et commandes ================= */
const fours = () => S.fours || (S.fours = []);
const fourById = id => fours().find(f => f.id === id);
const cmds = () => S.cmds || (S.cmds = []);
const CMD_ST = {brouillon: ["À envoyer", "b-warn"], envoyee: ["Envoyée", "b-ok"], recue: ["Reçue", "b-ok"]};
function cmdTotal(c) { return (c.lignes || []).reduce((t, l) => t + num(c.statut === "recue" && l.qr != null ? l.qr : l.q) * num(c.statut === "recue" && l.pr != null ? l.pr : l.prix), 0); }
function lineSource(t, id) { // article commandable : produit du bar (bouteille) ou ingrédient (conditionnement acheté)
  if (t === "p") { const p = byId(id); return p && {n: p.n, u: "bouteille", prix: p.b, f: p.f}; }
  const i = cuFind("i", id); if (!i) return null; const b = buyInfo(i);
  return {n: i.n, u: `${f1(b.qa)} ${b.ua === "pce" ? (b.qa > 1 ? "pièces" : "pièce") : BUY_U[b.ua][2]}`, prix: b.pa, f: i.f};
}
const unitPlural = (u, q) => q > 1 && u === "bouteille" ? "bouteilles" : u;
function cmdText(c) {
  const f = fourById(c.f) || {n: ""};
  return `Bonjour${f.contact ? " " + f.contact : ""},\n\nVoici notre commande${S.bar ? " pour " + S.bar : ""} :\n`
    + (c.lignes || []).map(l => `- ${l.n} : ${f1(num(l.q))} ${l.u === "bouteille" ? unitPlural(l.u, num(l.q)) : "× " + l.u}`).join("\n")
    + (c.note ? `\n\n${c.note}` : "") + `\n\nMerci de nous confirmer la livraison.\nBien cordialement,\n${S.bar || ""}`;
}
function renderCmds() {
  const el = $("cmdList"); if (!el) return;
  const L = cmds().filter(c => c.statut !== "recue").concat(cmds().filter(c => c.statut === "recue").slice(0, 3));
  el.innerHTML = L.length ? L.map(c => { const f = fourById(c.f), st = CMD_ST[c.statut];
    return `<div class="row tap" data-cmd="${esc(c.id)}"><div class="emoji">${c.statut === "recue" ? "📦" : "🧾"}</div><div class="grow"><div class="name">${esc(f ? f.n : "Sans fournisseur")}</div>
      <div class="meta">${(c.lignes || []).length} article${(c.lignes || []).length > 1 ? "s" : ""} · ${new Date(c.statut === "recue" && c.recue_le ? c.recue_le : c.le).toLocaleDateString("fr-FR", {day: "numeric", month: "short"})}</div></div>
      <div class="right"><div class="m h">${eur(c.total != null ? c.total : cmdTotal(c))}</div><span class="badge ${st[1]}">${st[0]}</span></div></div>`; }).join("")
    : `<div class="empty">Aucune commande en cours.</div>`;
  el.querySelectorAll("[data-cmd]").forEach(r => r.onclick = () => cmdSheet(r.dataset.cmd));
  $("fourBtn").textContent = `🚚 Mes fournisseurs${fours().length ? " (" + fours().length + ")" : ""}`;
}
async function prepareOrders() {
  const o = orderList(); if (!o.length) return toast("Rien à commander : tout le stock est au-dessus du minimum");
  if (!fours().length) { toast("Ajoutez d'abord vos fournisseurs"); return foursSheet(); }
  const groups = {}; o.forEach(x => (groups[x.p.f || ""] = groups[x.p.f || ""] || []).push(x));
  let made = 0;
  for (const fid of Object.keys(groups)) {
    const ex = cmds().find(c => c.statut === "brouillon" && (c.f || "") === fid), lignes = ex ? ex.lignes.slice() : [];
    groups[fid].forEach(({p, q}) => { const l = lignes.find(l => l.t === "p" && l.id === p.id); if (l) l.q = Math.max(num(l.q), q); else lignes.push({t: "p", id: p.id, n: p.n, q, u: "bouteille", prix: p.b}); });
    if (await act(() => actSaveCmd(ex ? ex.id : null, {...(ex || {}), f: fid, statut: "brouillon", lignes}), null)) made++;
  }
  renderStock();
  toast(made > 1 ? `${made} commandes préparées ✓` : "Commande préparée ✓");
  if (groups[""]) toast("Produit sans fournisseur : à choisir dans sa commande");
  const first = cmds().find(c => c.statut === "brouillon" && c.f) || cmds().find(c => c.statut === "brouillon"); if (first) cmdSheet(first.id);
}
function cmdSheet(id, achat = false) {
  const c0 = id ? cmds().find(c => c.id === id) : null;
  const c = c0 ? JSON.parse(JSON.stringify(c0)) : {f: fours()[0] ? fours()[0].id : "", statut: achat ? "recue" : "brouillon", lignes: [], note: ""};
  const ro = c.statut === "recue" && !!c0, isAchat = !c0 && achat;
  const srcOpts = [...S.products.map(p => ["p:" + p.id, p.n]), ...cu().i.map(i => ["i:" + i.id, "🧺 " + i.n])];
  const title = ro ? "Livraison reçue" : isAchat ? "Saisir un achat" : c.statut === "envoyee" ? "Commande envoyée" : id ? "Commande à envoyer" : "Nouvelle commande";
  openSheet(`<h2 class="h">${title}</h2><div class="sub">${ro ? "Reçue le " + new Date(c.recue_le || c.le).toLocaleDateString("fr-FR") : isAchat ? "Une facture ou un achat fait sans commande (Metro, marché…). Le stock et les prix d'achat sont mis à jour." : "Prix d'achat hors taxes"}</div>
    <div class="field"><label for="cF">Fournisseur</label><select id="cF" ${ro ? "disabled" : ""}>${opts([["", "— Choisir —"], ...fours().map(f => [f.id, f.n])], c.f)}</select></div>
    <div id="cL"></div>${ro ? "" : `<button class="btn ghost" id="cAdd" style="margin-bottom:12px">+ Ajouter un article</button>`}
    ${ro ? "" : `<div class="field"><label for="cN">Message pour le fournisseur (facultatif)</label><input id="cN" value="${esc(c.note || "")}" placeholder="Ex : livraison avant jeudi 10 h" maxlength="200"></div>`}
    <div class="card" style="background:var(--card2)"><div class="res"><div style="grid-column:1/-1"><div class="l">Total HT</div><div class="v h" id="cTot"></div></div></div></div>
    <div id="cAct"></div>`, () => {
    const draw = () => {
      $("cL").innerHTML = c.lignes.length ? `<div class="card list">${c.lignes.map((l, k) => ro
        ? `<div class="row"><div class="grow"><div class="name">${esc(l.n)}</div><div class="meta">${f1(num(l.qr ?? l.q))} × ${esc(l.u)} à ${eur(num(l.pr ?? l.prix))}</div></div><div class="right m h">${eur(num(l.qr ?? l.q) * num(l.pr ?? l.prix))}</div></div>`
        : `<div class="cline"><div class="grow"><select data-k="${k}" data-f="src" aria-label="Article">${opts(srcOpts, l.t + ":" + l.id)}</select><div class="meta">${esc(l.u)}</div></div>
          <div class="field"><label>Qté</label><input data-k="${k}" data-f="q" inputmode="decimal" value="${f1x(l.q)}"></div>
          <div class="field"><label>Prix HT</label><input data-k="${k}" data-f="prix" inputmode="decimal" value="${f1x(l.prix)}"></div>
          <button class="x" data-del="${k}" aria-label="Retirer">✕</button></div>`).join("")}</div>`
        : `<div class="empty">Aucun article. Touchez « Ajouter un article ».</div>`;
      $("cL").querySelectorAll("[data-f]").forEach(e => e.oninput = () => { const l = c.lignes[+e.dataset.k];
        if (e.dataset.f === "src") { const [t, ...r] = e.value.split(":"), sx = lineSource(t, r.join(":")); Object.assign(l, {t, id: r.join(":"), n: sx.n, u: sx.u, prix: sx.prix}); draw(); }
        else l[e.dataset.f] = num(e.value); tot(); });
      $("cL").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { c.lignes.splice(+b.dataset.del, 1); draw(); tot(); });
      tot();
    };
    const tot = () => { $("cTot").textContent = eur(cmdTotal(c)); };
    draw();
    if (!ro) {
      $("cF").onchange = () => c.f = $("cF").value;
      $("cAdd").onclick = () => { if (!srcOpts.length) return toast("Ajoutez d'abord des produits");
        const mine = srcOpts.find(([v]) => { const [t, ...r] = v.split(":"), sx = lineSource(t, r.join(":")); return sx && sx.f === c.f && !c.lignes.some(l => l.t + ":" + l.id === v); }) || srcOpts.find(([v]) => !c.lignes.some(l => l.t + ":" + l.id === v)) || srcOpts[0];
        const [t, ...r] = mine[0].split(":"), sx = lineSource(t, r.join(":")); c.lignes.push({t, id: r.join(":"), n: sx.n, q: 1, u: sx.u, prix: sx.prix}); draw(); };
    }
    const readC = () => { if (!ro) { c.f = $("cF").value; c.note = $("cN").value.trim(); } c.lignes = c.lignes.filter(l => num(l.q) > 0); return c; };
    const f = () => fourById($("cF").value);
    let acts = "";
    if (isAchat) acts = `<button class="btn" id="cRecv">Enregistrer l'achat</button>`;
    else if (c.statut === "brouillon") acts = `<button class="btn" id="cMail">✉️ Envoyer par email</button><div class="gap"></div><button class="btn ghost" id="cWa">💬 Envoyer par WhatsApp</button><div class="gap"></div>
      <button class="btn ghost" id="cCopy">Copier le texte</button><div class="gap"></div><button class="btn ghost" id="cSave">Enregistrer sans envoyer</button>${id ? `<div class="gap"></div><button class="btn danger" id="cDel">Supprimer la commande</button>` : ""}`;
    else if (c.statut === "envoyee") acts = `<button class="btn" id="cRecv">📦 Réceptionner la livraison</button><div class="gap"></div><button class="btn ghost" id="cCopy">Copier le texte</button><div class="gap"></div><button class="btn danger" id="cDel">Annuler la commande</button>`;
    $("cAct").innerHTML = acts;
    const saveAs = async (statut, msg) => { const x = readC(); if (!x.lignes.length) { toast("Ajoutez au moins un article"); return null; }
      return await act(() => actSaveCmd(id, {...x, statut}), msg); };
    const send = async how => { const x = readC(), fr = f(); if (!x.lignes.length) return toast("Ajoutez au moins un article");
      if (!fr) { toast("Choisissez d'abord le fournisseur"); return $("cF").focus(); }
      const txt = cmdText(x);
      if (how === "mail") { if (!fr || !fr.email) return toast("Ajoutez l'email du fournisseur dans Mes fournisseurs");
        location.href = `mailto:${encodeURIComponent(fr.email)}?subject=${encodeURIComponent("Commande " + (S.bar || ""))}&body=${encodeURIComponent(txt)}`; }
      else { const tel = ((fr && fr.tel) || "").replace(/[^0-9+]/g, "").replace(/^0/, "33").replace(/^\+/, "");
        if (!tel) return toast("Ajoutez le téléphone du fournisseur dans Mes fournisseurs");
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(txt)}`, "_blank"); }
      if (await saveAs("envoyee", "Commande notée comme envoyée ✓")) { closeSheet(); renderStock(); } };
    if ($("cMail")) $("cMail").onclick = () => send("mail");
    if ($("cWa")) $("cWa").onclick = () => send("wa");
    if ($("cCopy")) $("cCopy").onclick = async () => { try { await navigator.clipboard.writeText(cmdText(readC())); toast("Texte copié ✓"); } catch (e) { toast("Copie impossible ici"); } };
    if ($("cSave")) $("cSave").onclick = async () => { if (await saveAs("brouillon", "Commande enregistrée ✓")) { closeSheet(); renderStock(); } };
    if ($("cDel")) armBtn($("cDel"), "Toucher encore pour confirmer", async () => { if (await act(() => actDeleteCmd(id), "Commande supprimée")) { closeSheet(); renderStock(); } });
    if ($("cRecv")) $("cRecv").onclick = () => { const x = readC(); if (!x.lignes.length) return toast("Ajoutez au moins un article"); if (!x.f && !isAchat) return toast("Choisissez le fournisseur"); receptionSheet(id, x); };
  });
}
function receptionSheet(id, c) {
  const L = c.lignes.map(l => ({...l, qr: l.qr ?? l.q, pr: l.pr ?? l.prix}));
  openSheet(`<h2 class="h">Réception</h2><div class="sub">Vérifiez ce qui est arrivé et le prix de la facture. Le stock et vos prix d'achat seront mis à jour.</div>
    <div class="card list">${L.map((l, k) => `<div class="cline"><div class="grow"><div class="name" style="font-size:14px">${esc(l.n)}</div><div class="meta">commandé ${f1(num(l.q))} × ${esc(l.u)} à ${eur(num(l.prix))}</div></div>
      <div class="field"><label>Reçu</label><input data-k="${k}" data-f="qr" inputmode="decimal" value="${f1x(l.qr)}"></div>
      <div class="field"><label>Prix HT</label><input data-k="${k}" data-f="pr" inputmode="decimal" value="${f1x(l.pr)}"></div></div>`).join("")}</div>
    <div class="card" style="background:var(--card2)"><div class="res" id="rcRes"></div></div>
    <button class="btn" id="rcOk">Valider la réception</button>`, () => {
    const upd = () => { const tot = L.reduce((t, l) => t + num(l.qr) * num(l.pr), 0), ch = L.filter(l => Math.abs(num(l.pr) - num(l.prix)) > .004).length, miss = L.filter(l => num(l.qr) < num(l.q)).length;
      $("rcRes").innerHTML = `<div><div class="l">Total HT reçu</div><div class="v h">${eur(tot)}</div></div><div><div class="l">À signaler</div><div style="font-size:13px;margin-top:3px">${[ch ? `${ch} prix changé${ch > 1 ? "s" : ""}` : "", miss ? `${miss} article${miss > 1 ? "s" : ""} manquant${miss > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ") || "Rien"}</div></div>`; };
    $("sBody").querySelectorAll("[data-f]").forEach(e => e.oninput = () => { L[+e.dataset.k][e.dataset.f] = num(e.value); upd(); }); upd();
    $("rcOk").onclick = async () => { $("rcOk").classList.add("busy"); const alerts = [];
      const ok = await act(async () => {
        for (const l of L) {
          if (l.t === "p") { const p = byId(l.id); if (!p) continue;
            const oldR = prodCalc(p).rate, nb = num(l.pr) > 0 ? num(l.pr) : p.b, changed = Math.abs(nb - p.b) > .004;
            await actSaveProduct(p.id, {...p, b: nb, st: Math.round((p.st + num(l.qr)) * 1000) / 1000});
            if (changed) alerts.push({n: p.n, from: num(l.prix), to: nb, txt: `marge ${pct(oldR)} → ${pct(prodCalc(byId(p.id)).rate)}`, bad: prodCalc(byId(p.id)).rate < tgtP(p)});
          } else { const i = cuFind("i", l.id); if (!i) continue; const b = buyInfo(i);
            if (num(l.pr) > 0 && Math.abs(num(l.pr) - b.pa) > .004) {
              const before = cu().d.map(d => [d, platCalc(d).rate]);
              await actSaveCu("i", i.id, {...i, qa: b.qa, ua: b.ua, pa: num(l.pr), u: b.u, prix: buyInfo({...i, qa: b.qa, ua: b.ua, pa: num(l.pr)}).prix});
              const hit = before.map(([d, r]) => [d, r, platCalc(d).rate]).filter(([, r0, r1]) => Math.abs(r1 - r0) > .05);
              alerts.push({n: i.n, from: b.pa, to: num(l.pr), txt: hit.length ? hit.slice(0, 3).map(([d, r0, r1]) => `${d.n} ${pct(r0)} → ${pct(r1)}`).join(" · ") : "aucun plat touché", bad: hit.some(([, , r1]) => r1 < cuTarget())}); } }
        }
        await actSaveCmd(id, {...c, lignes: L, statut: "recue", recue_le: new Date().toISOString()});
      }, null);
      if (!ok) return $("rcOk").classList.remove("busy");
      renderStock();
      if (!alerts.length) { closeSheet(); return toast("Livraison enregistrée ✓"); }
      openSheet(`<h2 class="h">Livraison enregistrée</h2><div class="sub">Des prix d'achat ont changé. Vos marges sont recalculées.</div>
        <div class="card list">${alerts.map(a => `<div class="row"><div class="emoji">${a.to > a.from ? "📈" : "📉"}</div><div class="grow"><div class="name">${esc(a.n)}</div><div class="meta" style="white-space:normal">${eur(a.from)} → <b>${eur(a.to)}</b> HT (${a.to > a.from ? "+" : ""}${pct((a.to - a.from) / (a.from || 1) * 100)}) · ${esc(a.txt)}</div></div>${a.bad ? `<span class="badge b-bad">Sous l'objectif</span>` : ""}</div>`).join("")}</div>
        ${alerts.some(a => a.bad) ? `<p class="tip">Pensez à revoir vos prix de vente : l'accueil vous propose les hausses à faire.</p>` : ""}<button class="btn" id="rcClose">Compris</button>`, () => $("rcClose").onclick = closeSheet);
    };
  });
}
function foursSheet() {
  openSheet(`<h2 class="h">Mes fournisseurs</h2><div class="sub">Grossistes, brasseurs, cavistes, Metro… Rattachez-leur vos produits pour préparer les commandes en un geste.</div>
    <button class="cuadd" id="fAdd"><span>+</span>Ajouter un fournisseur</button>
    <div class="card list">${fours().map(f => { const n = S.products.filter(p => p.f === f.id).length + cu().i.filter(i => i.f === f.id).length;
      return `<div class="row tap" data-f="${esc(f.id)}"><div class="emoji">🚚</div><div class="grow"><div class="name">${esc(f.n)}</div><div class="meta">${n} article${n > 1 ? "s" : ""}${f.jours ? " · " + esc(f.jours) : ""}</div></div><div class="right meta">${f.email ? "✉️" : ""}${f.tel ? " 💬" : ""}</div></div>`; }).join("") || `<div class="empty">Aucun fournisseur pour l'instant.</div>`}</div>`, () => {
    $("fAdd").onclick = () => fourSheet(null);
    $("sBody").querySelectorAll("[data-f]").forEach(r => r.onclick = () => fourSheet(r.dataset.f));
  });
}
function fourSheet(id) {
  const f = id ? fourById(id) : {n: "", contact: "", email: "", tel: "", jours: "", note: ""};
  const sel = new Set([...S.products.filter(p => id && p.f === id).map(p => "p:" + p.id), ...cu().i.filter(i => id && i.f === id).map(i => "i:" + i.id)]);
  const all = [...S.products.map(p => ["p:" + p.id, p.n, p.f && p.f !== id ? fourById(p.f) : null]), ...cu().i.map(i => ["i:" + i.id, "🧺 " + i.n, i.f && i.f !== id ? fourById(i.f) : null])];
  openSheet(`<h2 class="h">${id ? esc(f.n) : "Nouveau fournisseur"}</h2><div class="sub">Ses coordonnées servent à lui envoyer les commandes</div>
    <div class="field"><label for="foN">Nom</label><input id="foN" value="${esc(f.n)}" placeholder="Ex : Boissons de Paris" maxlength="80"></div>
    <div class="field"><label for="foC">Interlocuteur (facultatif)</label><input id="foC" value="${esc(f.contact || "")}" placeholder="Ex : Karim" maxlength="60"></div>
    <div class="two"><div class="field"><label for="foE">Email</label><input id="foE" type="email" inputmode="email" value="${esc(f.email || "")}" placeholder="commandes@…"></div>
    <div class="field"><label for="foT">Téléphone (WhatsApp)</label><input id="foT" type="tel" inputmode="tel" value="${esc(f.tel || "")}" placeholder="06…"></div></div>
    <div class="field"><label for="foJ">Jours de commande ou de livraison</label><input id="foJ" value="${esc(f.jours || "")}" placeholder="Ex : commande le lundi, livré le mercredi" maxlength="80"></div>
    <div class="field"><label>Ce que vous lui achetez</label><div class="algs" id="foP">${all.map(([v, n, other]) => `<button type="button" class="chip ${sel.has(v) ? "on" : ""}" data-v="${esc(v)}" title="${other ? "Actuellement chez " + esc(other.n) : ""}">${esc(n)}</button>`).join("") || `<span class="tip">Ajoutez d'abord des produits.</span>`}</div></div>
    <button class="btn" id="foSave">Enregistrer</button>${id ? `<div class="gap"></div><button class="btn danger" id="foDel">Supprimer ce fournisseur</button>` : ""}`, () => {
    $("foP").querySelectorAll("[data-v]").forEach(b => b.onclick = () => { b.classList.toggle("on"); sel[b.classList.contains("on") ? "add" : "delete"](b.dataset.v); });
    $("foSave").onclick = async () => { const x = {...(f.prc ? {prc: true, site: f.site || ""} : {}), n: $("foN").value.trim(), contact: $("foC").value.trim(), email: $("foE").value.trim(), tel: $("foT").value.trim(), jours: $("foJ").value.trim()};
      if (!x.n) return toast("Donnez un nom au fournisseur");
      $("foSave").classList.add("busy");
      const ok = await act(async () => { const fid = await actSaveFour(id, x);
        for (const p of S.products) { const want = sel.has("p:" + p.id); if (want && p.f !== fid) await actLinkProduct(p.id, fid); else if (!want && p.f === fid) await actLinkProduct(p.id, ""); }
        for (const i of cu().i) { const want = sel.has("i:" + i.id); if (want !== (i.f === fid)) await actSaveCu("i", i.id, {...i, f: want ? fid : ""}); }
      }, id ? "Fournisseur mis à jour ✓" : "Fournisseur ajouté ✓");
      if (ok) foursSheet(); else $("foSave").classList.remove("busy"); };
    if (id) armBtn($("foDel"), "Toucher encore pour supprimer", async () => { if (await act(() => actDeleteFour(id), "Fournisseur supprimé")) foursSheet(); });
  });
}

/* ================= Bilan du mois (comptable) ================= */
function monthBounds(off) { const a = new Date(); a.setDate(1); a.setHours(0, 0, 0, 0); a.setMonth(a.getMonth() - off); const b = new Date(a); b.setMonth(b.getMonth() + 1); return [a, b]; }
const monthName = d => d.toLocaleDateString("fr-FR", {month: "long", year: "numeric"});
async function bilanData(off) {
  const [a, b] = monthBounds(off), inM = d => { d = new Date(d); return d >= a && d < b; };
  let sv, pertesHors;
  if (cloud()) {
    const [r1, r2] = await Promise.all([
      q(sb.from("services").select("ouvert_le,ca_ttc,ca_ht,marge_ht,verres,pertes").eq("etab_id", ETAB.id).not("clos_le", "is", null).gte("ouvert_le", a.toISOString()).lt("ouvert_le", b.toISOString())),
      q(sb.from("pertes").select("type,cout_ht").eq("etab_id", ETAB.id).gte("le", a.toISOString()).lt("le", b.toISOString()))]);
    sv = r1.map(x => ({ca: +x.ca_ttc, ht: +x.ca_ht, marg: +x.marge_ht, qty: x.verres, pertes: x.pertes}));
    pertesHors = r2.map(x => ({type: x.type, c: +x.cout_ht}));
  } else {
    const seen = new Set(), all = [...(S.histAll || []), ...(S.history || [])].filter(h => { const k = h.date; if (seen.has(k)) return false; seen.add(k); return true; });
    sv = all.filter(h => inM(h.date)).map(h => ({ca: h.ca, ht: h.ht != null ? h.ht : h.ca / 1.2, marg: h.marg, qty: h.qty, pertes: h.pertes}));
    pertesHors = (S.pertes || []).filter(x => inM(x.le)).map(x => ({type: x.type, c: x.c}));
  }
  const sum = (L, f) => L.reduce((t, x) => t + (+f(x) || 0), 0);
  const ca = sum(sv, x => x.ca), ht = sum(sv, x => x.ht), marg = sum(sv, x => x.marg), qty = sum(sv, x => x.qty);
  const lossSvc = {}; sv.forEach(x => { for (const z in x.pertes || {}) { const e = lossSvc[z] = lossSvc[z] || {n: 0, c: 0}; e.n += x.pertes[z].n; e.c += x.pertes[z].c; } });
  const achatsL = cmds().filter(c => c.statut === "recue" && inM(c.recue_le || c.le)), achats = sum(achatsL, c => c.total);
  const byF = {}; achatsL.forEach(c => { const n = (fourById(c.f) || {n: "Sans fournisseur"}).n; byF[n] = (byF[n] || 0) + c.total; });
  const R = (S.releves || []).slice().sort((x, y) => new Date(x.le) - new Date(y.le));
  const before = R.filter(r => new Date(r.le) < a).pop(), firstIn = R.find(r => inM(r.le)), afterEnd = R.find(r => new Date(r.le) >= b);
  const stockDeb = before ? before.v : firstIn ? firstIn.v : null, stockFin = off === 0 ? stockValue() : afterEnd ? afterEnd.v : null;
  const debLate = !before && firstIn && (new Date(firstIn.le) - a) > 2 * 864e5;
  const coutTheo = ht - marg, coutReel = stockDeb != null && stockFin != null && !debLate ? stockDeb + achats - stockFin : null;
  const days = Math.round((b - a) / 864e5), elapsed = off === 0 ? Math.min(days, Math.ceil((Date.now() - a) / 864e5)) : days;
  const hors = sum(pertesHors, x => x.c), ch = chTotal() * elapsed / days;
  return {a, b, nServ: sv.length, ca, ht, tva: ca - ht, marg, qty, lossSvc, achats, byF, nAchats: achatsL.length, stockDeb, stockFin,
    stockDebEst: !before && !!firstIn, debLate, firstInDate: firstIn ? firstIn.le : null, elapsed, days, coutTheo, coutReel, ecart: coutReel != null ? coutReel - coutTheo : null, hors, ch, resultat: marg - hors - ch};
}
function bilanRows(d) {
  const r = [["Mois", monthName(d.a)], ["Établissement", S.bar || ""], ["", ""],
    ["VENTES", ""], ["Services clôturés", d.nServ], ["Verres et plats vendus", d.qty], ["Chiffre d'affaires TTC", d.ca], ["Chiffre d'affaires HT", d.ht], ["TVA collectée (estimation)", d.tva], ["Marge brute HT", d.marg],
    ["", ""], ["ACHATS", ""], ["Achats HT (livraisons et factures saisies)", d.achats], ...Object.entries(d.byF).map(([n, v]) => ["  " + n, v]),
    ["", ""], ["STOCK", ""], ["Stock au début du mois HT", d.stockDeb ?? "non relevé"], ["Stock à la fin du mois HT", d.stockFin ?? "non relevé"],
    ["", ""], ["COÛT MATIÈRE", ""], ["Coût matière prévu (d'après les ventes)", d.coutTheo], ["Coût matière réel (stock début + achats − stock fin)", d.coutReel ?? "incomplet"],
    ["Écart (pertes non expliquées)", d.ecart ?? "incomplet"], ["Coût matière en % du CA HT", d.ht > 0 ? Math.round(d.coutTheo / d.ht * 1000) / 10 + " %" : ""],
    ["", ""], ["PERTES ET OFFERTS", ""], ...Object.entries(d.lossSvc).map(([z, x]) => [(LOSS[z] || [z])[0] + " (" + x.n + ")", x.c]), ["Pertes notées hors service", d.hors],
    ["", ""], ["RÉSULTAT ESTIMÉ", ""], [d.elapsed < d.days ? `Charges fixes (${d.elapsed} jours sur ${d.days})` : "Charges fixes du mois", d.ch], ["Résultat estimé (marge − pertes − charges)", d.resultat]];
  return r;
}
function bilanCsv(d) {
  const cell = v => typeof v === "number" ? (Math.round(v * 100) / 100).toString().replace(".", ",") : `"${String(v).replace(/"/g, '""')}"`;
  return "\ufeff" + bilanRows(d).map(([k, v]) => cell(k) + ";" + (v === "" ? "" : cell(v))).join("\r\n");
}
async function bilanSheet(off = 0) {
  openSheet(`<h2 class="h">Bilan du mois</h2><div class="sub">Pour suivre votre mois et l'envoyer à votre comptable</div>
    <div class="chips" id="biM">${[0, 1, 2].map(o => `<button class="chip ${o === off ? "on" : ""}" data-o="${o}">${monthName(monthBounds(o)[0])}</button>`).join("")}</div>
    <div id="biBody"><div class="empty">Calcul en cours…</div></div>`, async () => {
    $("biM").querySelectorAll("[data-o]").forEach(b => b.onclick = () => bilanSheet(+b.dataset.o));
    let d; try { d = await bilanData(off); } catch (e) { $("biBody").innerHTML = `<div class="empty">${esc(frErr(e))}</div>`; return; }
    const v = x => x == null ? "—" : eur(x), lossT = Object.values(d.lossSvc).reduce((t, x) => t + x.c, 0) + d.hors;
    $("biBody").innerHTML = `
      <div class="card"><div class="res bil">
        <div><div class="l">Chiffre d'affaires HT</div><div class="v h">${eur(d.ht, 0)}</div><div class="s">${eur(d.ca, 0)} TTC · ${d.nServ} service${d.nServ > 1 ? "s" : ""}</div></div>
        <div><div class="l">Marge brute HT</div><div class="v h" style="color:var(--amber2)">${eur(d.marg, 0)}</div><div class="s">${pct(d.ht ? d.marg / d.ht * 100 : NaN)} du CA</div></div>
        <div><div class="l">Achats HT</div><div class="v h">${eur(d.achats, 0)}</div><div class="s">${d.nAchats} livraison${d.nAchats > 1 ? "s" : ""} ou facture${d.nAchats > 1 ? "s" : ""}</div></div>
        <div><div class="l">Pertes et offerts</div><div class="v h" style="color:${lossT ? "var(--bad)" : "inherit"}">${eur(lossT, 0)}</div><div class="s">au prix d'achat</div></div>
      </div></div>
      <div class="lbl"><span>Coût matière</span></div>
      <div class="card list">
        <div class="row"><div class="grow"><div class="name">Prévu, d'après les ventes</div><div class="meta">${pct(d.ht ? d.coutTheo / d.ht * 100 : NaN)} du CA HT</div></div><div class="right m h">${v(d.coutTheo)}</div></div>
        <div class="row"><div class="grow"><div class="name">Réel</div><div class="meta" style="white-space:normal">Stock début ${v(d.stockDeb)}${d.stockDebEst ? " (relevé en cours de mois)" : ""} + achats ${v(d.achats)} − stock fin ${v(d.stockFin)}</div></div><div class="right m h">${v(d.coutReel)}</div></div>
        <div class="row"><div class="grow"><div class="name">Écart</div><div class="meta" style="white-space:normal">${d.ecart == null ? (d.debLate ? `Le premier relevé de stock date du ${new Date(d.firstInDate).toLocaleDateString("fr-FR")} : le calcul complet sera possible dès le mois prochain.` : "Il manque un relevé de stock pour ce mois : faites un inventaire en fin de mois.") : d.ecart > 0 ? "Marchandise sortie sans être vendue : surdosage, offerts non notés, casse, vol…" : "Pas de fuite visible."}</div></div>
          <div class="right m h" style="color:${d.ecart == null ? "var(--mut)" : d.ecart > 0 ? "var(--bad)" : "var(--ok)"}">${d.ecart == null ? "—" : eur(d.ecart)}</div></div>
      </div>
      <div class="lbl"><span>Résultat estimé</span></div>
      <div class="card list">
        <div class="row"><div class="grow name">Marge brute</div><div class="right m h">${eur(d.marg)}</div></div>
        <div class="row"><div class="grow name">− Pertes notées hors service</div><div class="right m h">${eur(d.hors)}</div></div>
        <div class="row"><div class="grow"><div class="name">− Charges fixes</div>${!chTotal() ? `<div class="meta">Renseignez-les dans Réglages › Mes charges fixes</div>` : d.elapsed < d.days ? `<div class="meta">${d.elapsed} jours sur ${d.days} (mois en cours)</div>` : ""}</div><div class="right m h">${eur(d.ch)}</div></div>
        <div class="row"><div class="grow name">Résultat estimé</div><div class="right m h" style="color:${d.resultat >= 0 ? "var(--ok)" : "var(--bad)"}">${eur(d.resultat)}</div></div>
      </div>
      <p class="tip">Estimation de gestion, pas une comptabilité officielle. Votre comptable s'appuie sur les factures et le relevé de caisse.</p>
      <div class="field"><label for="biE">Email de votre comptable</label><input id="biE" type="email" inputmode="email" value="${esc((S.opts && S.opts.compta) || "")}" placeholder="cabinet@…"></div>
      <button class="btn" id="biSend">📤 Envoyer au comptable</button><div class="gap"></div>
      <div class="two"><button class="btn ghost" id="biCsv">Fichier Excel</button><button class="btn ghost" id="biPdf">PDF / Imprimer</button></div>`;
    const fname = `Bilan ${S.bar || "Dosis Bar"} ${monthName(d.a)}.csv`.replace(/[\\/:*?"<>|]/g, "-");
    const file = () => new File([bilanCsv(d)], fname, {type: "text/csv"});
    const saveMail = async () => { const e = $("biE").value.trim(); if (e !== ((S.opts && S.opts.compta) || "")) { try { await actOpts({compta: e}); save(); } catch (x) {} } return e; };
    $("biCsv").onclick = () => { const u = URL.createObjectURL(file()), a = document.createElement("a"); a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); toast("Fichier téléchargé ✓"); };
    $("biPdf").onclick = () => { $("printArea").innerHTML = `<h1>Bilan de ${esc(monthName(d.a))}</h1><p>${esc(S.bar || "")}</p><table><tbody>${bilanRows(d).slice(3).map(([k, x]) => k === "" ? `<tr><td colspan="2" style="border:0;height:6pt"></td></tr>`
        : x === "" ? `<tr><td colspan="2" style="background:#eee;font-weight:700">${esc(k)}</td></tr>` : `<tr><td>${esc(k)}</td><td style="text-align:right">${typeof x === "number" ? eur(x) : esc(x)}</td></tr>`).join("")}</tbody></table>
        <p class="pf">Estimation de gestion établie par Dosis Bar le ${new Date().toLocaleDateString("fr-FR")}. Ne remplace pas les pièces comptables.</p>`; window.print(); };
    $("biSend").onclick = async () => { const e = await saveMail(), f = file(), title = `Bilan ${monthName(d.a)} – ${S.bar || ""}`;
      const body = `Bonjour,\n\nVoici le bilan de gestion de ${monthName(d.a)}${S.bar ? " pour " + S.bar : ""} :\n- Chiffre d'affaires HT : ${eur(d.ht)} (TTC ${eur(d.ca)})\n- Marge brute HT : ${eur(d.marg)}\n- Achats HT : ${eur(d.achats)}\n- Stock fin de mois HT : ${v(d.stockFin)}\n- Pertes et offerts : ${eur(lossT)}\n\nLe détail est dans le fichier joint.\nBien cordialement,\n${S.bar || ""}`;
      try { if (navigator.canShare && navigator.canShare({files: [f]})) { await navigator.share({files: [f], title, text: body}); return; } } catch (x) { if (x && x.name === "AbortError") return; }
      $("biCsv").click();
      location.href = `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body + "\n\n(Pensez à joindre le fichier qui vient d'être téléchargé.)")}`; };
  });
}

/* ================= Abonnement (Mollie) ================= */
const ABO_HT = {pilote: 29.99, bar: 49, pro: 79}, ABO_RESTO = 20;
const ABO_NOMS = {pilote: "Bar pilote", bar: "Dosis Bar", pro: "Dosis Bar Pro"};
const ABO_ST = {aucun: ["Pas d'abonnement", ""], en_attente: ["Paiement en attente", "b-warn"], actif: ["Actif", "b-ok"], impaye: ["Paiement refusé", "b-bad"], annule: ["Résilié", "b-warn"]};
const aboHT = (f, r) => ABO_HT[f] + (r && f !== "pro" ? ABO_RESTO : 0);
/* ================= Caisse enregistreuse connectée (SumUp pour commencer) ================= */
const CAISSE_NOMS = {sumup: "SumUp"};
async function caisseCall(body) {
  const {data, error} = await sb.functions.invoke("caisse", {body: {etab: ETAB.id, ...body}});
  if (error) { let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (e) {} throw new Error(m); }
  if (data && data.error) throw new Error(data.error);
  return data;
}
function caisseSheet() {
  if (MODE !== "cloud") return toast("Créez votre compte pour connecter votre caisse");
  if (isBarman()) return;
  const c = S.caisse;
  const autres = `<div class="card"><div class="name" style="font-size:14px">Votre caisse n'est pas dans la liste ?</div>
    <p class="tip" style="margin-top:6px">Zelty, L'Addition, Lightspeed, Hiboutik et les autres arrivent au fur et à mesure. En attendant, importez le fichier des ventes de votre caisse (Service › Importer les ventes) : ça marche avec toutes les caisses.</p>
    <button class="link" id="caAsk" style="padding:6px 0 0">Dire quelle caisse j'utilise</button></div>`;
  if (c) return openSheet(`<h2 class="h">Ma caisse enregistreuse</h2><div class="sub">Les ventes de votre caisse arrivent dans Dosis Bar sans ressaisie.</div>
    <div class="card"><div class="row" style="padding:0;border:0"><div class="grow"><div class="name">${esc(CAISSE_NOMS[c.fournisseur] || c.fournisseur)} · connectée ✓</div>
      <div class="meta" style="white-space:normal">${esc(c.nom_compte || "")}${c.derniere_synchro ? " · dernières ventes récupérées le " + new Date(c.derniere_synchro).toLocaleString("fr-FR", {day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"}) : ""}</div>
      ${c.erreur ? `<div class="meta" style="white-space:normal;color:var(--bad);margin-top:4px">${esc(c.erreur)}</div>` : ""}</div></div></div>
    <button class="btn" id="caGet">Récupérer les ventes d'une journée</button><div class="gap"></div>
    <button class="btn ghost danger" id="caOff">Déconnecter la caisse</button>${autres}`, () => {
    $("caGet").onclick = () => { closeSheet(); setTimeout(importSheet, 250); };
    $("caOff").onclick = async () => { const b = $("caOff"); if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = "Confirmer : déconnecter la caisse"; return; } b.classList.add("busy");
      try { await caisseCall({action: "deconnecter"}); S.caisse = null; save(); toast("Caisse déconnectée"); caisseSheet(); } catch (e) { $("caOff").classList.remove("busy"); toast(frErr(e)); } };
    $("caAsk").onclick = () => { closeSheet(); setTimeout(avisSheet, 250); };
  });
  openSheet(`<h2 class="h">Ma caisse enregistreuse</h2><div class="sub">Connectez votre caisse : les ventes de chaque journée arrivent dans Dosis Bar, sans fichier à exporter.</div>
    <div class="card"><div class="name">SumUp</div><div class="meta" style="white-space:normal;margin-top:4px">Caisse SumUp POS, POS Lite ou application SumUp avec catalogue de produits.</div>
      <ol class="tip" style="margin:10px 0 0 18px;padding:0;line-height:1.6">
        <li>Ouvrez <b>me.sumup.com</b> et connectez-vous.</li>
        <li>Allez dans <b>Paramètres › Clés API</b> (ou « Développeurs »), puis <b>Créer une clé</b>.</li>
        <li>Copiez la clé et collez-la ci-dessous.</li></ol>
      <div class="field" style="margin-top:12px"><label for="caKey">Clé API SumUp (la clé secrète)</label><input id="caKey" autocomplete="off" spellcheck="false" placeholder="sup_sk_…"></div>
      <div class="field" id="caCptBox" hidden><label for="caCpt">Identifiant marchand SumUp</label><input id="caCpt" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="MH4H92C7">
        <p class="tip" style="margin-top:6px">8 lettres et chiffres, visibles sur me.sumup.com dans <b>Profil</b> ou <b>Paramètres du compte</b> (« Identifiant marchand » ou « Merchant ID »).</p></div>
      <button class="btn" id="caGo">Connecter SumUp</button>
      <p class="tip" style="margin-top:8px">La clé sert uniquement à lire vos ventes. Elle est gardée sur notre serveur et n'est jamais affichée dans l'app, même pour vos barmen.</p></div>${autres}`, () => {
    $("caGo").onclick = async () => { const cle = $("caKey").value.trim(); if (cle.length < 20) { toast("Collez la clé API complète"); return $("caKey").focus(); }
      $("caGo").classList.add("busy");
      const compte = $("caCptBox").hidden ? "" : $("caCpt").value.trim();
      if (!$("caCptBox").hidden && !compte) { $("caGo").classList.remove("busy"); toast("Indiquez votre identifiant marchand SumUp"); return $("caCpt").focus(); }
      try { const r = await caisseCall({action: "connecter", fournisseur: "sumup", cle, compte}); S.caisse = {fournisseur: "sumup", nom_compte: r.nom}; save(); toast("SumUp connectée ✓"); caisseSheet(); }
      catch (e) { $("caGo").classList.remove("busy"); const m = frErr(e);
        if (/identifiant marchand/.test(m) && $("caCptBox").hidden) { $("caCptBox").hidden = false; $("caCpt").focus(); }
        toast(m); } };
    $("caAsk").onclick = () => { closeSheet(); setTimeout(avisSheet, 250); };
  });
}
async function caisseVentes() {
  const d = $("caDate").value; if (!d) return toast("Choisissez la journée");
  $("caFetch").classList.add("busy");
  try {
    const r = await caisseCall({action: "ventes", date: d});
    S.caisse = Object.assign({}, S.caisse, {derniere_synchro: new Date().toISOString(), erreur: null}); save();
    if (!r.items.length) { $("caFetch").classList.remove("busy");
      return toast(r.transactions ? `${r.transactions} paiement${r.transactions > 1 ? "s" : ""} trouvé${r.transactions > 1 ? "s" : ""}, mais sans détail des produits : utilisez le catalogue de produits dans votre caisse SumUp` : "Aucune vente SumUp ce jour-là"); }
    const lines = r.items.reduce((s, i) => s + i.q, 0);
    impMatch({pre: {items: r.items, lines, date: r.date}, src: r.source, sansDetail: r.sansDetail, totalSansDetail: r.totalSansDetail}, {}, r.ref, `${r.source} · ${new Date(r.date + "T12:00:00").toLocaleDateString("fr-FR", {weekday: "long", day: "numeric", month: "long"})}`);
  } catch (e) { $("caFetch").classList.remove("busy"); toast(frErr(e)); }
}
async function aboCall(body) {
  const {data, error} = await sb.functions.invoke("abonnement", {body: {etab: ETAB.id, ...body}});
  if (error) { let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (e) {} throw new Error(m); }
  if (data && data.error) throw new Error(data.error);
  return data;
}
async function aboRefresh() { if (!cloud()) return; accRefresh(); try { S.abo = await q(sb.from("abonnements").select("formule,resto,statut,montant_ttc,paye_jusqu").eq("etab_id", ETAB.id).maybeSingle()); save(); } catch (e) {} }
function aboSheet() {
  if (MODE !== "cloud") return toast("Créez votre compte pour vous abonner");
  const a = S.abo || {statut: "aucun"}, actif = a.statut === "actif", st = ABO_ST[a.statut] || ABO_ST.aucun;
  let f = actif ? a.formule : "bar", r = actif ? !!a.resto : restoOn();
  const fx = (S.opts && S.opts.facturation) || {};
  const card = (k, desc) => `<button type="button" class="abo ${f === k ? "on" : ""}" data-f="${k}" ${actif && k === "pilote" && a.formule !== "pilote" ? "disabled" : ""}>
      <span class="n">${ABO_NOMS[k]}</span><span class="p h">${eur(ABO_HT[k])} <small>HT / mois</small></span><span class="d">${desc}</span></button>`;
  openSheet(`<h2 class="h">Mon abonnement</h2><div class="sub">Paiement sécurisé par Mollie : carte bancaire ou prélèvement SEPA. Sans engagement, résiliable à tout moment.</div>
    ${a.statut !== "aucun" ? `<div class="card"><div class="row"><div class="grow"><div class="name">${a.formule ? ABO_NOMS[a.formule] + (a.resto && a.formule !== "pro" ? " + Dosis Resto" : "") : "Abonnement"}</div>
      <div class="meta">${a.montant_ttc ? eur(+a.montant_ttc) + " TTC / mois" : ""}${a.paye_jusqu ? " · " + (a.statut === "annule" ? "accès jusqu'au " : "prochain prélèvement le ") + new Date(a.paye_jusqu).toLocaleDateString("fr-FR") : ""}</div></div><span class="badge ${st[1]}">${st[0]}</span></div></div>` : ""}
    <div class="lbl"><span>${actif ? "Changer de formule" : "Choisir une formule"}</span></div>
    <div class="abos">${card("pilote", "2 mois offerts, puis prix bloqué à vie. Avec le code pilote.")}${card("bar", "Toutes les fonctions du bar, équipe incluse.")}${card("pro", "Dosis Resto inclus. Factures et caisse connectée bientôt.")}</div>
    <div class="field" id="abCodeF" hidden><label for="abCode">Code pilote</label><input id="abCode" autocapitalize="characters" placeholder="Code reçu de Dosis Bar" maxlength="30"></div>
    <label class="sw" id="abRestoF" style="margin:6px 0 14px"><input type="checkbox" id="abResto" ${r ? "checked" : ""}><span><b>Dosis Resto</b><small>Plats, préparations, coût de l'assiette : + ${eur(ABO_RESTO)} HT / mois</small></span></label>
    <div class="card" style="background:var(--card2)"><div class="res"><div><div class="l">Par mois</div><div class="v h" id="abHT"></div></div><div><div class="l">TTC (TVA 20 %)</div><div class="v h" id="abTTC"></div></div><div style="grid-column:1/-1;font-size:12px;color:var(--mut)" id="abNote"></div></div></div>
    <div class="lbl"><span>Informations de facturation</span></div>
    <div class="field"><label for="fxNom">Raison sociale</label><input id="fxNom" maxlength="120" value="${esc(fx.nom || ETAB.nom || "")}" placeholder="Nom de la société ou de l'entreprise"></div>
    <div class="field"><label for="fxAdr">Adresse</label><input id="fxAdr" maxlength="200" value="${esc(fx.adresse || "")}" placeholder="N°, rue, code postal, ville" autocomplete="street-address"></div>
    <div class="field"><label for="fxSiret">SIRET <small>(facultatif)</small></label><input id="fxSiret" maxlength="20" inputmode="numeric" value="${esc(fx.siret || "")}"></div>
    <div class="field"><label for="fxTva">N° de TVA intracommunautaire <small>(facultatif)</small></label><input id="fxTva" maxlength="20" autocapitalize="characters" value="${esc(fx.tva || "")}"></div>
    <div class="field"><label for="fxMail">Email qui reçoit les factures</label><input id="fxMail" type="email" maxlength="120" value="${esc(fx.email || (ME && ME.email) || "")}"></div>
    ${actif ? `<button class="btn ghost" id="fxSave" style="margin-bottom:14px">Enregistrer la facturation</button>` : ""}
    ${actif ? "" : `<label class="check" style="align-items:flex-start;font-size:13px;line-height:1.45;margin:4px 0 12px"><input type="checkbox" id="abCgv" style="margin-top:1px;flex:none"> <span>J'accepte les <a href="cgv.html" target="_blank" style="color:var(--amber2)">conditions générales de vente</a> : abonnement mensuel sans engagement, mois commencé non remboursé.</span></label>`}
    <button class="btn" id="abGo"></button>
    ${actif || a.statut === "impaye" ? `<div class="gap"></div><button class="btn danger" id="abStop">Résilier l'abonnement</button>` : ""}
    <p class="tip">Le paiement se fait sur la page sécurisée de Mollie : Dosis Bar ne voit jamais vos coordonnées bancaires.</p>
    ${a.statut !== "aucun" ? `<div class="lbl"><span>Mes factures</span></div><div id="abFacts" class="tip">Chargement…</div>` : ""}`, () => {
    const fxRead = () => ({nom: $("fxNom").value.trim(), adresse: $("fxAdr").value.trim(), siret: $("fxSiret").value.replace(/\s/g, ""), tva: $("fxTva").value.replace(/\s/g, "").toUpperCase(), email: $("fxMail").value.trim()});
    const fxCheck = (v) => { if (!v.nom) { toast("Indiquez la raison sociale"); $("fxNom").focus(); return false; }
      if (v.adresse.length < 8) { toast("Indiquez l'adresse complète, elle figure sur la facture"); $("fxAdr").focus(); return false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { toast("Indiquez un email valide pour les factures"); $("fxMail").focus(); return false; } return true; };
    if ($("fxSave")) $("fxSave").onclick = async () => { const v = fxRead(); if (!fxCheck(v)) return;
      try { await actOpts({facturation: v}); toast("Facturation enregistrée ✓"); } catch (e) { toast(frErr(e)); } };
    if ($("abFacts")) q(sb.from("factures").select("numero,emise_le,total_ttc").eq("etab_id", ETAB.id).order("emise_le", {ascending: false}).order("numero", {ascending: false})).then(l => {
      $("abFacts").innerHTML = l.length ? l.map(x => `<a class="card row" style="text-decoration:none;color:inherit;margin-bottom:8px" href="facture.html?n=${encodeURIComponent(x.numero)}" target="_blank" rel="noopener"><div class="grow"><div class="name">Facture ${esc(x.numero)}</div><div class="meta">${new Date(x.emise_le).toLocaleDateString("fr-FR")}</div></div><b>${eur(+x.total_ttc)}</b></a>`).join("") : "Aucune facture pour l'instant. Elle arrive par email à chaque paiement.";
    }).catch(() => { $("abFacts").textContent = "Factures indisponibles pour le moment."; });
    const upd = () => { document.querySelectorAll(".abo").forEach(b => b.classList.toggle("on", b.dataset.f === f));
      $("abCodeF").hidden = !(f === "pilote" && !actif); $("abRestoF").hidden = f === "pro"; r = $("abResto").checked;
      const ht = aboHT(f, r); $("abHT").textContent = eur(ht) + " HT"; $("abTTC").textContent = eur(Math.round(ht * 120) / 100);
      $("abNote").textContent = actif ? "Le nouveau montant s'applique au prochain prélèvement." : f === "pilote" ? "Aujourd'hui : 1 € pour valider votre moyen de paiement. Premier prélèvement dans 2 mois." : "Le premier mois est payé aujourd'hui, puis chaque mois automatiquement.";
      $("abGo").textContent = actif ? (f === a.formule && r === !!a.resto ? "Formule actuelle" : "Changer de formule") : "Continuer vers le paiement";
      $("abGo").disabled = actif && f === a.formule && r === !!a.resto; };
    document.querySelectorAll(".abo").forEach(b => b.onclick = () => { if (b.disabled) return; f = b.dataset.f; upd(); });
    $("abResto").onchange = upd; upd();
    $("abGo").onclick = async () => { if (!navigator.onLine) return toast("Connexion internet nécessaire");
      const fxv = fxRead(); if (!actif && !fxCheck(fxv)) return;
      if (!actif && !$("abCgv").checked) { toast("Acceptez d'abord les conditions générales de vente"); return $("abCgv").focus(); }
      if (!actif && f === "pilote" && !$("abCode").value.trim()) { toast("Entrez votre code pilote"); return $("abCode").focus(); }
      $("abGo").classList.add("busy");
      try {
        if (actif) { await aboCall({action: "changer", formule: f, resto: r}); await aboRefresh(); closeSheet(); toast("Formule modifiée ✓"); }
        else { await actOpts({facturation: fxv}); const d = await aboCall({action: "souscrire", formule: f, resto: r, code: $("abCode").value}); location.href = d.url; }
      } catch (e) { toast(frErr(e)); $("abGo").classList.remove("busy"); } };
    if ($("abStop")) armBtn($("abStop"), "Toucher encore pour résilier", async () => {
      try { await aboCall({action: "resilier"}); await aboRefresh(); closeSheet(); toast("Abonnement résilié"); } catch (e) { toast(frErr(e)); } });
  });
}
async function aboRetour() {
  if (!/[?&]abonnement=retour/.test(location.search)) return;
  history.replaceState(null, "", location.pathname);
  toast("Merci ! Confirmation du paiement en cours…");
  // Statut lu directement chez Mollie à chaque essai (le webhook peut arriver après le retour du client)
  let st = null;
  for (let i = 0; i < 12; i++) {
    try { st = await aboCall({action: "verifier"}); } catch (e) { st = null; }
    if (st && st.statut === "paid") { await new Promise(r => setTimeout(r, 1500)); await aboRefresh(); toast("Paiement accepté, abonnement actif ✓"); render(); return; }
    if (st && /failed|canceled|expired/.test(st.statut)) { await aboRefresh(); render();
      return toast(st.statut === "canceled" ? "Paiement annulé : rien n'a été prélevé"
        : st.statut === "expired" ? "Paiement non finalisé à temps : rien n'a été prélevé. Vous pouvez recommencer"
        : "Paiement refusé par la banque" + (st.echec ? " (" + st.echec + ")" : "") + " : rien n'a été prélevé. Réessayez ou utilisez une autre carte"); }
    await new Promise(r => setTimeout(r, 2500));
  }
  await aboRefresh(); render();
  toast("Votre banque n'a pas encore confirmé le paiement : il apparaîtra ici dès sa confirmation");
}

/* ================= Pertes et offerts ================= */
function monthLosses() {
  const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0); const by = {};
  const add = (z, n, c) => { const e = by[z] = by[z] || {n: 0, c: 0}; e.n += n; e.c += c; };
  (S.history || []).filter(h => !h.demo && new Date(h.date) >= m0 && h.pertes).forEach(h => { for (const z in h.pertes) add(z, h.pertes[z].n, h.pertes[z].c); });
  (S.pertes || []).filter(x => new Date(x.le) >= m0).forEach(x => add(x.type, 1, x.c));
  const t = liveTotals(); for (const z in t.loss) add(z, t.loss[z].n, t.loss[z].c);
  return {by, total: Object.values(by).reduce((a, x) => a + x.c, 0)};
}
let releveDone = false;
function ensureReleve() {
  if (releveDone || isBarman() || !S.products.length) return; releveDone = true;
  const m0 = monthBounds(0)[0]; if ((S.releves || []).some(r => new Date(r.le) >= m0)) return;
  actReleve("auto").then(save).catch(() => { releveDone = false; });
}
function renderPertes() {
  ensureReleve();
  const el = $("pertesCard"); if (!el) return; const m = monthLosses(), ks = Object.keys(m.by);
  el.innerHTML = (ks.length ? `<div class="row"><div class="grow"><div class="name">${eur(m.total)} ce mois-ci</div><div class="meta" style="white-space:normal">${ks.map(z => `${LOSS[z][1]} ${LOSS[z][0]} : ${eur(m.by[z].c)}`).join(" · ")}</div></div></div>`
    : `<div class="empty" style="padding:14px 6px 8px">Aucune perte notée ce mois-ci. Les offerts, la casse et les repas du personnel se notent dans le mode Service, ou ici.</div>`)
    + `<div class="chbtns" style="padding:0 0 12px"><button class="mini" id="pDecl">Noter une perte</button><button class="mini ghostmini" id="pBil">📊 Bilan du mois</button>${(S.pertes || []).length ? `<button class="mini ghostmini" id="pList">Voir le détail</button>` : ""}</div>`;
  $("pDecl").onclick = () => perteSheet(); $("pBil").onclick = () => bilanSheet(0); if ($("pList")) $("pList").onclick = pertesList;
}
function perteSheet() {
  const items = [...S.products.map(p => ({k: "p" + p.id, n: p.n, nm: p.n, kind: "p", o: p})),
    ...(restoOn() ? [...cu().d.map(d => ({k: "d" + d.id, n: "🍽️ " + d.n, nm: d.n, kind: "d", o: d})), ...cu().i.map(i => ({k: "i" + i.id, n: "🧺 " + i.n, nm: i.n, kind: "i", o: i}))] : [])];
  if (!items.length) return toast("Ajoutez d'abord des produits");
  openSheet(`<h2 class="h">Noter une perte</h2><div class="sub">Casse, offert, repas du personnel, produit jeté : chaque perte notée explique une partie de l'écart d'inventaire.</div>
    <div class="field"><label for="peT">Type</label><select id="peT">${opts(Object.entries(LOSS).map(([k, v]) => [k, v[1] + "  " + v[0]]), "casse")}</select></div>
    <div class="field"><label for="peI">Article</label><select id="peI">${opts(items.map(x => [x.k, x.n]), items[0].k)}</select></div>
    <div class="two"><div class="field"><label for="peQ">Quantité</label><input id="peQ" inputmode="decimal" value="1"></div>
    <div class="field"><label for="peU">Unité</label><select id="peU"></select></div></div>
    <div class="card" style="background:var(--card2)"><div class="res" id="peRes"></div></div>
    <button class="btn" id="peSave">Enregistrer la perte</button>`, () => {
    const cur = () => items.find(x => x.k === $("peI").value);
    const units = it => it.kind === "p" ? [["bt", "bouteille(s)"], ["v", "verre(s) de " + f1(it.o.d) + " cl"]] : it.kind === "d" ? [["por", "portion(s)"]]
      : [[(CU_U[it.o.u] || CU_U.kg)[0], (CU_U[it.o.u] || CU_U.kg)[0] === "pce" ? "pièce(s)" : (CU_U[it.o.u] || CU_U.kg)[0]]];
    const fillU = () => { const it = cur(); $("peU").innerHTML = opts(units(it), $("peT").value === "casse" || it.kind !== "p" ? units(it)[0][0] : "v"); };
    const calc = () => { const it = cur(), qn = num($("peQ").value), u = $("peU").value; let c = 0, bt = 0;
      if (it.kind === "p") { bt = u === "bt" ? qn : qn * it.o.d / it.o.cap; c = bt * it.o.b; }
      else if (it.kind === "d") c = qn * platCalc(it.o).cost; else c = qn * cuUnitCost("i", it.o.id);
      return {it, qn, u, c, bt}; };
    const upd = () => { const x = calc(); $("peRes").innerHTML = `<div style="grid-column:1/-1"><div class="l">Coût de la perte (prix d'achat HT)</div><div class="v h" style="color:var(--bad)">${eur(x.c)}</div>${x.it.kind === "p" ? `<div style="font-size:12px;color:var(--mut);margin-top:3px">Le stock baisse de ${f1(x.bt)} bouteille${x.bt > 1 ? "s" : ""}.</div>` : ""}</div>`; };
    $("peI").onchange = () => { fillU(); upd(); }; $("peT").onchange = () => { fillU(); upd(); }; $("peQ").oninput = upd; $("peU").onchange = upd; fillU(); upd();
    $("peSave").onclick = async () => { const x = calc(); if (!(x.qn > 0)) return toast("Indiquez une quantité");
      const ul = units(x.it).find(u => u[0] === x.u)[1].replace(/\(s\)/, x.qn > 1 ? "s" : "");
      $("peSave").classList.add("busy");
      if (await act(() => actPerte({type: $("peT").value, n: x.it.nm, q: x.qn, u: ul, c: x.c,
        stock: x.it.kind === "p" ? {id: x.it.o.id, st: Math.round((x.it.o.st - x.bt) * 1000) / 1000} : null}), "Perte enregistrée ✓")) closeSheet();
      else $("peSave").classList.remove("busy"); };
  });
}
function pertesList() {
  const L = S.pertes || [];
  openSheet(`<h2 class="h">Pertes notées ce mois-ci</h2><div class="sub">Hors service. Les offerts et la casse notés pendant le service sont comptés dans le bilan de chaque soirée.</div>
    <div class="card list">${L.map(x => `<div class="row"><div class="emoji">${(LOSS[x.type] || ["", "➖"])[1]}</div><div class="grow"><div class="name">${esc(x.n)}</div><div class="meta">${f1(x.q)} ${esc(x.u)} · ${new Date(x.le).toLocaleDateString("fr-FR", {day: "numeric", month: "short"})}</div></div>
      <div class="right"><div class="m h" style="color:var(--bad)">${eur(x.c)}</div><button class="mini ghostmini" data-del="${esc(x.id)}">Retirer</button></div></div>`).join("") || `<div class="empty">Aucune perte</div>`}</div>`, () => {
    $("sBody").querySelectorAll("[data-del]").forEach(b => armBtn(b, "Confirmer", async () => { if (await act(() => actDeletePerte(b.dataset.del), "Perte retirée")) pertesList(); }));
  });
}

/* ================= Carte des allergènes ================= */
function allergenSheet() {
  const rows = [...(restoOn() ? cu().d.map(d => ({n: d.n, g: "Cuisine", a: linesAlg(d.lines)})) : []),
    ...S.cocktails.map(k => ({n: k.n, g: k.cat === "Boissons chaudes" ? "Boissons chaudes" : "Cocktails", a: cockAlg(k)})), ...S.products.map(p => ({n: p.n, g: "Boissons", a: p.al || []}))];
  const groups = [...new Set(rows.map(r => r.g))];
  const html = groups.map(g => `<h3>${g}</h3><table><tbody>${rows.filter(r => r.g === g).map(r => `<tr><td>${esc(r.n)}</td><td>${esc(r.a.length ? r.a.map(algName).join(", ") : "—")}</td></tr>`).join("")}</tbody></table>`).join("");
  openSheet(`<h2 class="h">Carte des allergènes</h2><div class="sub">Les 14 allergènes réglementaires, d'après les ingrédients que vous avez renseignés. Vérifiez-la avant de l'afficher.</div>
    <div class="algtable">${html || `<div class="empty">Rien à afficher pour l'instant.</div>`}</div>
    <button class="btn" id="algPrint">🖨️ Imprimer ou enregistrer en PDF</button>`, () => {
    $("algPrint").onclick = () => { const pa = $("printArea");
      pa.innerHTML = `<h1>${esc(S.bar || "Notre carte")} : allergènes</h1><p>Liste des 14 allergènes réglementaires présents dans nos plats et boissons. Renseignez-vous auprès de notre équipe en cas de doute.</p>${html}<p class="pf">Mise à jour le ${new Date().toLocaleDateString("fr-FR")}</p>`;
      window.print(); };
  });
}

/* ================= Charges fixes ================= */
function chBlock(c, alc, field, upd, unit = "verre") {
  if (!chOn() || !(c.ht > 0)) return "";
  const sg = suggestNet(c.cost, c.tva), mn = minPrice(c.cost, c.tva), col = c.net < 0 ? "var(--bad)" : c.netRate >= netTarget() ? "var(--ok)" : "var(--amber)";
  return `<div class="chsep" style="grid-column:1/-1">Avec vos charges fixes</div>
    <div><div class="l">Charges par ${unit}</div><div class="v h">${eur(c.ch)}</div></div><div><div class="l">Coût de revient réel</div><div class="v h">${eur(c.full)}</div></div>
    <div><div class="l">Bénéfice réel par ${unit}</div><div class="v h" style="color:${col}">${eur(c.net)}</div><div style="font-size:12px;color:${col};font-weight:600">${pct(c.netRate)}${c.net < 0 ? " · vendu à perte" : ""}</div></div>
    <div><div class="l">Prix minimum TTC</div><div class="v h">${eur(mn)}</div></div>
    <div style="grid-column:1/-1"><div class="l">Prix conseillé pour ${netTarget()} % de bénéfice réel</div><div class="v h">${eur(sg)}</div>${field && c.netRate < netTarget() ? `<button class="mini" data-usech="${sg}">Utiliser ce prix</button>` : ""}</div>`;
}
function armCh(field, upd) { document.querySelectorAll("[data-usech]").forEach(b => b.onclick = () => { $(field).value = f1x(+b.dataset.usech); upd(); }); }
function renderCharges(d) {
  const el = $("charges"); if (!el) return;
  if (!chOn()) { el.innerHTML = `<div class="row"><div class="emoji">💶</div><div class="grow"><div class="name">Votre vrai bénéfice par verre</div><div class="meta" style="white-space:normal">Ajoutez loyer, salaires, énergie… pour savoir ce que chaque verre vous rapporte une fois tout payé.</div></div><button class="mini" id="chGo" style="flex:none">Ajouter</button></div>`;
    $("chGo").onclick = chargesSheet; return; }
  const tot = chTotal(), it = allItems().filter(i => i.c.ht > 0), loss = it.filter(i => i.c.net < 0);
  const avgM = d.avgEur, need = avgM > 0 ? Math.ceil(tot / avgM) : NaN, vol = num(S.ch.v), res = vol * avgM - tot;
  const avgNet = it.length ? it.reduce((s, i) => s + i.c.net, 0) / it.length : NaN;
  el.innerHTML = `<div class="chgrid"><div><div class="l">Charges fixes</div><div class="v h">${eur(tot, 0)}<small> / mois</small></div></div>
      <div><div class="l">Par verre vendu</div><div class="v h">${eur(cpv())}</div></div>
      <div><div class="l">Bénéfice réel moyen</div><div class="v h" style="color:${avgNet < 0 ? "var(--bad)" : "var(--ok)"}">${eur(avgNet)}<small> / verre</small></div></div></div>
    <p class="chline">${isFinite(need) ? `Il faut vendre environ <b>${need.toLocaleString("fr-FR")} verres par mois</b> pour payer vos charges. Vous en vendez environ ${vol.toLocaleString("fr-FR")} : ${res >= 0 ? `bénéfice estimé <b style="color:var(--ok)">${eur(res, 0)} / mois</b>` : `il manque <b style="color:var(--bad)">${eur(-res, 0)} / mois</b>`}.` : ""}
    ${loss.length ? `<br><b style="color:var(--bad)">${loss.length} boisson${loss.length > 1 ? "s" : ""} vendue${loss.length > 1 ? "s" : ""} à perte</b> : ${loss.slice(0, 3).map(i => esc(i.o.n)).join(", ")}${loss.length > 3 ? "…" : ""}` : ""}</p>
    <div class="chbtns">${loss.length ? `<button class="mini" id="chSee">Voir la carte</button>` : ""}<button class="mini ghostmini" id="chEdit">Modifier mes charges</button></div>`;
  $("chEdit").onclick = chargesSheet; if ($("chSee")) $("chSee").onclick = () => { sortBy = "marg"; go("menu"); };
}
function chargesSheet() {
  const c = Object.assign({v: "", net: 15}, S.ch || {}), real = realVolume();
  openSheet(`<h2 class="h">Mes charges fixes</h2><div class="sub">Par mois, hors taxes. Elles sont réparties sur chaque verre vendu pour calculer votre bénéfice réel. Vos barmen ne les voient pas.</div>
    ${CH_LINES.map(([k, l]) => `<div class="field"><label for="ch_${k}">${l}</label><div class="eurin"><input id="ch_${k}" inputmode="decimal" value="${f1x(c[k] ?? "")}" placeholder="0"><span>€</span></div>${k === "salaires" ? `<button type="button" class="link" id="chSal" style="padding:6px 0 0;font-size:12px">Calculer avec les heures de travail</button><div id="chSalBox" hidden class="two" style="margin-top:8px"><div class="field"><label for="chH">Heures par mois (toute l'équipe)</label><input id="chH" inputmode="decimal" placeholder="Ex : 300"></div><div class="field"><label for="chT">Coût horaire chargé (€)</label><input id="chT" inputmode="decimal" placeholder="Ex : 18"></div></div>` : ""}</div>`).join("")}
    <div class="field"><label for="ch_v">${restoOn() ? "Verres et plats vendus par mois" : "Verres vendus par mois (toute la carte)"}</label><input id="ch_v" inputmode="decimal" value="${f1x(c.v)}" placeholder="Ex : 3000">
      ${real ? `<button type="button" class="link" id="chReal" style="padding:6px 0 0;font-size:12px">Utiliser mes ventes réelles : environ ${real.toLocaleString("fr-FR")} verres par mois</button>` : `<div class="tip" style="padding:6px 0 0">Une estimation suffit pour commencer. Après quelques services, Dosis Bar vous proposera le vrai chiffre.</div>`}</div>
    <div class="field"><label for="ch_net">Bénéfice réel visé : <b id="ch_netl" style="color:var(--amber2)">${num(c.net)} %</b></label><input id="ch_net" class="range" type="range" min="0" max="40" value="${num(c.net)}"></div>
    <div class="card" style="background:var(--card2)"><div class="res" id="chRes"></div></div>
    <button class="btn" id="chSave">Enregistrer</button>${S.ch ? `<div class="gap"></div><button class="btn danger" id="chDel">Ne plus utiliser les charges</button>` : ""}`, () => {
    const read = () => { const x = {v: num($("ch_v").value), net: +$("ch_net").value}; CH_LINES.forEach(([k]) => x[k] = num($("ch_" + k).value)); return x; };
    const upd = () => { const x = read(), tot = chTotal(x), per = cpv(x), d = scoreData(), need = d.avgEur > 0 ? Math.ceil(tot / d.avgEur) : NaN;
      $("ch_netl").textContent = x.net + " %";
      $("chRes").innerHTML = `<div><div class="l">Total par mois</div><div class="v h">${eur(tot, 0)}</div></div><div><div class="l">Charges par verre</div><div class="v h">${per ? eur(per) : "—"}</div></div>
        <div style="grid-column:1/-1"><div class="l">Seuil de rentabilité</div><div style="font-size:13px;margin-top:3px">${isFinite(need) && tot ? `${need.toLocaleString("fr-FR")} verres par mois pour payer vos charges` : "—"}</div></div>`; };
    $("sBody").querySelectorAll("input").forEach(e => e.oninput = upd); upd();
    $("chSal").onclick = () => { $("chSalBox").hidden = false; $("chH").focus(); };
    const sal = () => { const h = num($("chH").value), t = num($("chT").value); if (h && t) { $("ch_salaires").value = f1x(Math.round(h * t)); upd(); } };
    $("chH").oninput = sal; $("chT").oninput = sal;
    if ($("chReal")) $("chReal").onclick = () => { $("ch_v").value = real; upd(); };
    $("chSave").onclick = async () => { const x = read();
      if (chTotal(x) > 0 && !(x.v > 0)) { toast("Indiquez combien de verres vous vendez par mois"); $("ch_v").focus(); return; }
      $("chSave").classList.add("busy");
      if (await act(() => actCharges(x), "Charges enregistrées ✓")) closeSheet(); else $("chSave").classList.remove("busy"); };
    if ($("chDel")) armBtn($("chDel"), "Toucher encore pour confirmer", async () => { if (await act(() => actCharges(null), "Charges retirées")) closeSheet(); });
  });
}

/* ================= Réglages ================= */
function settingsSheet() {
  if (isBarman()) return accountSheet();
  const acc = MODE === "cloud"
    ? `<div class="lbl"><span>Équipe</span></div><div class="card list" id="team"><div class="empty">Chargement…</div></div>
       <div class="two"><button class="btn ghost" id="invB">Inviter un barman</button><button class="btn ghost" id="invP">Inviter un associé</button></div>
       <div class="lbl"><span>Compte</span></div><div class="card list"><div class="row"><div class="grow"><div class="name">${esc(ME.email)}</div><div class="meta">Patron · ${esc(ETAB.nom)}</div></div></div></div>
       ${compteBtns()}
       <button class="btn ghost" id="swEtab">Changer d'établissement ou rejoindre</button><div class="gap"></div>
       <button class="btn danger" id="logout">Se déconnecter</button>`
    : (CLOUD ? `<div class="card" style="margin-top:16px"><div class="name">Sauvegardez votre carte en ligne</div><p class="tip" style="margin:4px 0 12px">Pour la retrouver sur tous vos appareils et la partager avec votre équipe.</p><button class="btn" id="goAcc">Créer un compte ou se connecter</button></div>` : "")
      + `<div class="gap"></div><button class="btn danger" id="sReset">Remettre les données d'exemple</button>`;
  openSheet(`<h2 class="h">Réglages</h2><div class="sub">${MODE === "cloud" ? "Enregistré en ligne pour toute l'équipe" : "Mode essai : données gardées dans ce navigateur"}</div>
    <div class="field"><label for="sBar">Nom de l'établissement</label><input id="sBar" value="${esc(S.bar)}" placeholder="Ex : Le Comptoir" maxlength="80"></div>
    <div class="field"><label for="sT">Objectif spiritueux et cocktails : <b id="sTl" style="color:var(--amber2)">${S.target} %</b></label><input id="sT" class="range" type="range" min="60" max="90" value="${S.target}"></div>
    <div class="field"><label for="sT2">Objectif bouteilles et canettes servies entières (bière, soft, eau) : <b id="sT2l" style="color:var(--amber2)">${S.target2 ?? 65} %</b></label><input id="sT2" class="range" type="range" min="40" max="85" value="${S.target2 ?? 65}"></div>
    <div class="field"><label for="sV">Verres vendus par mois et par produit (pour les estimations)</label><input id="sV" inputmode="decimal" value="${S.vol}"></div>
    <button class="btn" id="sSave">Enregistrer</button>
    <button class="btn ghost" id="sCh" style="margin-top:10px">💶 Mes charges fixes${chOn() ? " · " + eur(chTotal(), 0) + " / mois" : ""}</button>
    <button class="btn ghost" id="sRo" style="margin-top:10px"><img src="icons/logo-resto.svg" width="16" height="18" alt="" style="vertical-align:-3px;margin-right:4px"> Dosis Resto · ${restoOn() ? "activé" : "désactivé"}</button>
    <button class="btn ghost" id="sZo" style="margin-top:10px">🏷️ Prix par zone${ZONES.some(([k]) => k !== "comptoir" && zoneOn(k)) ? " · " + ZONES.filter(([k]) => zoneOn(k)).map(z => z[1]).join(", ") : " (comptoir, salle, terrasse, happy hour)"}</button>
    <button class="btn ghost" id="sAl" style="margin-top:10px">⚠️ Carte des allergènes</button>
    <button class="btn ghost" id="sBi" style="margin-top:10px">📊 Bilan du mois pour le comptable</button>
    <button class="btn ghost" id="sCa" style="margin-top:10px">🔌 Ma caisse enregistreuse${S.caisse ? " · " + esc(CAISSE_NOMS[S.caisse.fournisseur] || "") + " connectée" : ""}</button><button class="btn ghost" id="sAb" style="margin-top:10px">💳 Mon abonnement${S.abo && S.abo.statut === "actif" ? " · " + ABO_NOMS[S.abo.formule] : ""}</button>${avisBtns()}${acc}${`<div class="center" style="margin-top:18px;font-size:12px;color:var(--mut)"><a href="mentions-legales.html" style="color:var(--mut)">Mentions légales</a> · <a href="confidentialite.html" style="color:var(--mut)">Confidentialité</a> · <a href="conditions.html" style="color:var(--mut)">Conditions</a> · <a href="cgv.html" style="color:var(--mut)">CGV</a></div>`}`, () => {
    armAvis();
    $("sCh").onclick = chargesSheet; $("sRo").onclick = restoSheet; $("sZo").onclick = zonesSheet; $("sAl").onclick = allergenSheet; $("sBi").onclick = () => bilanSheet(0); $("sCa").onclick = caisseSheet; $("sAb").onclick = aboSheet;
    $("sT").oninput = () => $("sTl").textContent = $("sT").value + " %";
    $("sT2").oninput = () => $("sT2l").textContent = $("sT2").value + " %";
    $("sSave").onclick = async () => { $("sSave").classList.add("busy");
      if (await act(() => actSettings({bar: $("sBar").value.trim(), target: +$("sT").value, target2: +$("sT2").value, vol: Math.max(1, Math.round(num($("sV").value)))}), "Réglages enregistrés ✓")) closeSheet();
      else $("sSave").classList.remove("busy"); };
    if (MODE === "cloud") {
      loadTeam();
      $("invB").onclick = () => invite("barman"); $("invP").onclick = () => invite("patron");
      $("swEtab").onclick = () => { closeSheet(); showAuth("etab"); };
      $("logout").onclick = logout; compteArm();
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
    ${compteBtns()}
    <button class="btn ghost" id="swEtab">Changer d'établissement ou rejoindre</button><div class="gap"></div>
    <button class="btn danger" id="logout">Se déconnecter</button>${avisBtns()}${`<div class="center" style="margin-top:18px;font-size:12px;color:var(--mut)"><a href="mentions-legales.html" style="color:var(--mut)">Mentions légales</a> · <a href="confidentialite.html" style="color:var(--mut)">Confidentialité</a> · <a href="conditions.html" style="color:var(--mut)">Conditions</a> · <a href="cgv.html" style="color:var(--mut)">CGV</a></div>`}`, () => {
    armAvis();
    $("swEtab").onclick = () => { closeSheet(); showAuth("etab"); }; $("logout").onclick = logout; compteArm(); });
}
$("setBtn").onclick = settingsSheet;

/* ================= Mon compte : email, mot de passe, export, quitter, suppression ================= */
function compteBtns() {
  return `<div class="two"><button class="btn ghost" id="cEmail">Changer d'email</button><button class="btn ghost" id="cPass">Changer de mot de passe</button></div>
    <button class="btn ghost" id="cExp" style="margin-top:10px">Télécharger mes données</button>
    <button class="link" id="cDanger" style="padding:12px 0 14px;color:var(--mut)">Quitter ou supprimer…</button>`;
}
function compteArm() {
  $("cEmail").onclick = emailSheet; $("cPass").onclick = passSheet; $("cExp").onclick = exportData; $("cDanger").onclick = dangerSheet;
}
function emailSheet() {
  openSheet(`<h2 class="h">Changer d'email</h2><div class="sub">Adresse actuelle : ${esc(ME.email)}</div>
    <div class="field"><label for="neMail">Nouvelle adresse email</label><input id="neMail" type="email" autocomplete="email" placeholder="nom@exemple.fr"></div>
    <p class="tip" style="margin:-4px 0 12px">Un email de confirmation part vers la nouvelle adresse${" "}(et, par sécurité, vers l'actuelle). Le changement se fait quand vous cliquez sur le lien.</p>
    <button class="btn" id="neGo">Envoyer la confirmation</button>`, () => {
    $("neGo").onclick = async () => { const v = $("neMail").value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast("Indiquez une adresse email valide"); return $("neMail").focus(); }
      if (v === (ME.email || "").toLowerCase()) return toast("C'est déjà votre adresse");
      $("neGo").classList.add("busy");
      const {error} = await sb.auth.updateUser({email: v}, {emailRedirectTo: location.origin + location.pathname});
      if (error) { $("neGo").classList.remove("busy"); return toast(frErr(error)); }
      openSheet(`<h2 class="h">Vérifiez vos emails</h2><div class="sub">Un lien de confirmation a été envoyé à <b>${esc(v)}</b>.</div>
        <p class="tip">Cliquez sur le lien reçu (pensez aux courriers indésirables). Si un email arrive aussi sur ${esc(ME.email)}, confirmez-le également. Votre adresse change ensuite partout, y compris dans votre équipe.</p>
        <button class="btn" id="neOk">Compris</button>`, () => $("neOk").onclick = closeSheet); };
  });
}
function passSheet() {
  openSheet(`<h2 class="h">Changer de mot de passe</h2><div class="sub">${esc(ME.email)}</div>
    <div class="field"><label for="npA">Nouveau mot de passe (8 caractères minimum)</label><input id="npA" type="password" autocomplete="new-password" minlength="8"></div>
    <div class="field"><label for="npB">Retapez-le</label><input id="npB" type="password" autocomplete="new-password" minlength="8"></div>
    <button class="btn" id="npGo">Enregistrer le mot de passe</button>`, () => {
    $("npGo").onclick = async () => { const a = $("npA").value, b = $("npB").value;
      if (a.length < 8) { toast("8 caractères minimum"); return $("npA").focus(); }
      if (a !== b) { toast("Les deux mots de passe sont différents"); return $("npB").focus(); }
      $("npGo").classList.add("busy");
      const {error} = await sb.auth.updateUser({password: a});
      if (error) { $("npGo").classList.remove("busy"); return toast(frErr(error)); }
      closeSheet(); toast("Mot de passe changé ✓"); };
  });
}
async function exportData() {
  const b = $("cExp"); if (b) b.classList.add("busy");
  const out = {export: "Dosis Bar", date: new Date().toISOString(), compte: {email: ME.email}, etablissement: {id: ETAB.id, nom: ETAB.nom, role: ETAB.role}};
  try {
    if (!isBarman()) {
      const T = ["produits", "produit_formats", "cocktails", "services", "ventes", "inventaires", "pertes", "cuisine", "fournisseurs", "commandes", "stock_releves", "etab_charges", "abonnements", "paiements", "caisse_connexions"];
      out.etablissement.reglages = (await q(sb.from("etablissements").select("*").eq("id", ETAB.id).maybeSingle())) || null;
      out.equipe = await q(sb.from("membres").select("email,role,depuis").eq("etab_id", ETAB.id)).catch(() => []);
      for (const t of T) { try { out[t] = await q(sb.from(t).select("*").eq("etab_id", ETAB.id).limit(50000)); } catch (e) { out[t] = {erreur: frErr(e)}; } }
      try { const ids = (out.cocktails || []).map(c => c.id); out.cocktail_ingredients = ids.length ? await q(sb.from("cocktail_ingredients").select("*").in("cocktail_id", ids)) : []; } catch (e) {}
      try { out.factures = await q(sb.from("factures").select("numero,emise_le,payee_le,client,lignes,total_ht,tva,total_ttc").eq("etab_id", ETAB.id)); } catch (e) {}
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], {type: "application/json"}), u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = `dosis-bar-${(ETAB.nom || "donnees").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000);
    toast("Données téléchargées ✓");
  } catch (e) { toast(frErr(e)); }
  if (b) b.classList.remove("busy");
}
async function compteCall(body) {
  const {data, error} = await sb.functions.invoke("compte", {body});
  if (error) { let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (e) {} throw new Error(m); }
  if (data && data.error) throw new Error(data.error);
  return data;
}
function dangerSheet() {
  const patron = !isBarman();
  openSheet(`<h2 class="h">Quitter ou supprimer</h2><div class="sub">Avant de supprimer, pensez à télécharger vos données.</div>
    <div class="card"><div class="name">Quitter ${esc(ETAB.nom)}</div><div class="meta" style="white-space:normal;margin-top:4px">Vous perdez l'accès à cet établissement. Ses données restent pour l'équipe.${patron ? " Possible seulement s'il reste un autre patron." : ""}</div>
      <button class="btn ghost" id="dQuit" style="margin-top:10px">Quitter l'établissement</button></div>
    ${patron ? `<div class="card"><div class="name" style="color:var(--bad)">Supprimer l'établissement</div><div class="meta" style="white-space:normal;margin-top:4px">Efface définitivement la carte, les ventes, le stock, la cuisine, les fournisseurs et l'équipe de ${esc(ETAB.nom)}. L'abonnement est arrêté. Les factures déjà émises sont conservées 10 ans, comme la loi l'exige.</div>
      <div class="field" style="margin-top:10px"><label for="dEtN">Pour confirmer, tapez le nom : <b>${esc(ETAB.nom)}</b></label><input id="dEtN" autocomplete="off"></div>
      <button class="btn danger" id="dEtab">Supprimer l'établissement</button></div>` : ""}
    <div class="card"><div class="name" style="color:var(--bad)">Supprimer mon compte</div><div class="meta" style="white-space:normal;margin-top:4px">Efface votre compte et votre adresse email. Les établissements dont vous êtes le seul patron sont supprimés aussi, et leur abonnement est arrêté.</div>
      <div class="field" style="margin-top:10px"><label for="dAcN">Pour confirmer, tapez <b>SUPPRIMER</b></label><input id="dAcN" autocomplete="off" autocapitalize="characters"></div>
      <button class="btn danger" id="dAcc">Supprimer mon compte</button></div>`, () => {
    $("dQuit").onclick = async () => { const b = $("dQuit"); if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = "Confirmer : quitter " + ETAB.nom; return; } b.classList.add("busy");
      try { await q(sb.rpc("quitter_etab", {p_etab: ETAB.id})); closeSheet(); localStorage.removeItem(EKEY); toast("Vous avez quitté " + ETAB.nom); showAuth("etab"); } catch (e) { b.classList.remove("busy"); toast(frErr(e)); } };
    if ($("dEtab")) $("dEtab").onclick = async () => { if ($("dEtN").value.trim().toLowerCase() !== (ETAB.nom || "").trim().toLowerCase()) { toast("Tapez exactement le nom de l'établissement"); return $("dEtN").focus(); }
      $("dEtab").classList.add("busy");
      try { await compteCall({action: "supprimer_etab", etab: ETAB.id}); closeSheet(); localStorage.removeItem(EKEY); toast("Établissement supprimé"); showAuth("etab"); } catch (e) { $("dEtab").classList.remove("busy"); toast(frErr(e)); } };
    $("dAcc").onclick = async () => { if ($("dAcN").value.trim().toUpperCase() !== "SUPPRIMER") { toast("Tapez SUPPRIMER pour confirmer"); return $("dAcN").focus(); }
      $("dAcc").classList.add("busy");
      try { await compteCall({action: "supprimer_compte"}); closeSheet(); try { await sb.auth.signOut(); } catch (e) {} localStorage.removeItem(EKEY); localStorage.removeItem(MKEY); toast("Compte supprimé. Merci d'avoir utilisé Dosis Bar"); setTimeout(() => location.reload(), 1500); }
      catch (e) { $("dAcc").classList.remove("busy"); toast(frErr(e)); } };
  });
}

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
  const A = $("auth"), brand = `<div class="brand"><img src="icons/logo-bar.svg" width="52" height="60" alt="" style="display:block;margin:0 auto 6px"><h1 class="h">Dosis <span>Bar</span></h1><p>Ce que chaque verre vous rapporte vraiment.</p></div>`;
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
  $("authBody").innerHTML = html + `<div class="center" style="margin-top:18px;font-size:12px;color:var(--mut)"><a href="mentions-legales.html" style="color:var(--mut)">Mentions légales</a> · <a href="confidentialite.html" style="color:var(--mut)">Confidentialité</a> · <a href="conditions.html" style="color:var(--mut)">Conditions</a> · <a href="cgv.html" style="color:var(--mut)">CGV</a></div>`; A.classList.add("on"); A.scrollTop = 0;
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
  S = Object.assign(emptyState(), lsGet(CKEY + "." + e.id) || {}); S.bar = e.nom; liveNorm(); S.zone = lsGet("dosisbar.zone") || "comptoir";
  hideAuth(); closeSheet(); checkAdmin(); releveDone = false; setSync("ok"); go(isBarman() ? "service" : "home"); if (!isBarman()) { aboRetour(); ensurePrc();
    if (/[?&]ouvrir=abonnement/.test(location.search)) { history.replaceState(null, "", location.pathname); setTimeout(aboSheet, 400); } }
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
  MODE = "demo"; ETAB = null; S = loadDemo(); liveNorm(); S.zone = lsGet("dosisbar.zone") || "comptoir"; setSync("ok"); go("home");
  if (!quiet && !S.bar && !S.welcomed) { S.welcomed = true; save();
    openSheet(`<div style="text-align:center;padding:6px 0 8px"><img src="icons/logo-bar.svg" width="52" height="60" alt=""></div><h2 class="h" style="text-align:center">Bienvenue sur Dosis Bar</h2>
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

/* Dosis Bar — lecture d'un fichier de ventes de caisse (CSV ou Excel)
   et rapprochement des noms de la caisse avec la carte. */
"use strict";
window.Import = (() => {
  const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  // nom de produit simplifié : sans contenances ni mots de service
  const normName = s => norm(s).replace(/\b\d+([.,]\d+)?\s?(cl|ml|l|cc)\b/g, " ")
    .replace(/\b(le |la |les |un |une |verre|verres|bouteille|btl|bt|shot|dose|pinte|demi|x\d+)\b/g, " ")
    .replace(/\s+/g, " ").trim();

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "js/vendor/xlsx.mini.min.js";
      s.onload = ok; s.onerror = () => ko(new Error("Lecture Excel indisponible")); document.head.appendChild(s); });
  }

  /* ---------- Lecture ---------- */
  async function readFile(file) {
    if (file.size > 15 * 1024 * 1024) throw new Error("Fichier trop gros (15 Mo maximum)");
    const name = (file.name || "").toLowerCase(), buf = await file.arrayBuffer();
    let rows;
    if (/\.(xlsx|xlsm|xlsb|xls|ods)$/.test(name)) {
      await loadXlsx();
      const wb = window.XLSX.read(buf, {type: "array", cellDates: true});
      let best = null;
      for (const sn of wb.SheetNames) {   // la feuille la plus remplie
        const r = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], {header: 1, raw: true, defval: ""});
        if (!best || r.length > best.length) best = r;
      }
      rows = best || [];
    } else {
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
      rows = parseCSV(text.replace(/^﻿/, ""));
    }
    rows = rows.map(r => r.map(c => c instanceof Date ? c : String(c ?? "").trim())).filter(r => r.some(c => c !== ""));
    if (rows.length < 2) throw new Error("Le fichier ne contient pas de lignes de ventes");
    return {rows, ref: fingerprint(rows)};
  }
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 15);
    const delims = [";", ",", "\t", "|"];
    let delim = ";", best = -1;
    for (const d of delims) {   // séparateur le plus régulier sur les premières lignes
      const counts = lines.map(l => splitLine(l, d).length), freq = {};
      counts.forEach(c => freq[c] = (freq[c] || 0) + 1);
      const mode = +Object.keys(freq).sort((a, b) => freq[b] - freq[a] || b - a)[0];
      const score = mode > 1 ? freq[mode] * Math.min(mode, 12) : 0;
      if (score > best) { best = score; delim = d; }
    }
    const out = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); out.push(row); }
    return out;
  }
  function splitLine(l, d) { let n = 1, q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) n++; } return Array(n); }
  function fingerprint(rows) {
    let h = 2166136261; const s = JSON.stringify(rows.slice(0, 400));
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return "f" + (h >>> 0).toString(36) + "-" + rows.length;
  }

  /* ---------- Colonnes ---------- */
  const KEYS = {
    name: ["produit", "article", "libelle", "designation", "item", "nom", "description", "product", "intitule", "plat", "boisson"],
    qty: ["quantite", "qte", "qty", "quantity", "nombre", "nb", "unites", "count", "vendus"],
    total: ["total ttc", "montant ttc", "ca ttc", "prix total", "total", "montant", "amount", "ventes brutes", "ventes nettes", "chiffre", "gross sales", "net sales", "ca"],
    unit: ["prix unitaire", "pu ttc", "pu", "unit price", "prix ttc", "prix"],
    date: ["date", "jour", "day", "heure", "time", "cree le"]
  };
  const toNum = v => {
    if (typeof v === "number") return v;
    let s = String(v ?? "").replace(/[€$£\s ]/g, "");
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
    const n = parseFloat(s); return isFinite(n) ? n : NaN;
  };
  function findHeader(rows) {
    let bestI = 0, bestS = -1;
    rows.slice(0, 12).forEach((r, i) => {
      const s = r.reduce((acc, c) => { const n = norm(c); return acc + (Object.values(KEYS).some(ks => ks.some(k => n === k || n.startsWith(k + " ") || n.endsWith(" " + k) || n.includes(k))) ? 2 : 0) + (n && isNaN(toNum(c)) ? 0.2 : 0); }, 0);
      if (s > bestS) { bestS = s; bestI = i; }
    });
    return bestI;
  }
  function detect(rows) {
    const hi = findHeader(rows), header = rows[hi].map(c => String(c)), data = rows.slice(hi + 1);
    const H = header.map(norm), used = new Set(), map = {};
    const score = (h, ks) => { let s = 0; ks.forEach((k, i) => { const w = 10 - i * 0.3; if (h === k) s = Math.max(s, w + 5); else if (h.split(" ").includes(k) || h.startsWith(k)) s = Math.max(s, w + 2); else if (h.includes(k)) s = Math.max(s, w); }); return s; };
    const numericRatio = c => { const v = data.slice(0, 50).map(r => r[c]).filter(x => x !== "" && x != null); return v.length ? v.filter(x => !isNaN(toNum(x))).length / v.length : 0; };
    for (const key of ["name", "qty", "total", "unit", "date"]) {
      let best = -1, bs = 0;
      H.forEach((h, c) => {
        if (used.has(c)) return;
        let s = score(h, KEYS[key]);
        if (key === "total" && /\bht\b|hors taxe|tva|taxe|remise|discount|tax/.test(h)) s -= 8;
        if (key === "total" && /ttc/.test(h)) s += 3;
        if (key === "unit" && /total/.test(h)) s -= 8;
        if ((key === "qty" || key === "total" || key === "unit") && numericRatio(c) < 0.6) s -= 10;
        if (key === "name" && numericRatio(c) > 0.6) s -= 10;
        if (s > bs) { bs = s; best = c; }
      });
      if (best >= 0 && bs >= 6) { map[key] = best; used.add(best); }
    }
    if (map.name == null) {   // à défaut : la colonne de texte la plus variée
      let best = -1, bv = 0;
      header.forEach((_, c) => { if (used.has(c) || numericRatio(c) > 0.5) return; const v = new Set(data.map(r => r[c])).size; if (v > bv) { bv = v; best = c; } });
      if (best >= 0) map.name = best;
    }
    const sure = map.name != null && (map.qty != null || map.total != null);
    return {header, data, map, sure, headerIndex: hi};
  }

  /* ---------- Regroupement des lignes ---------- */
  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return v;
    const s = String(v || "");
    let m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1], 23, 0); }
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 0);
    const t = Date.parse(s);   // formats anglais : "Nov 13, 2026"
    if (!isNaN(t) && /[a-z]{3}/i.test(s)) { const d = new Date(t); d.setHours(23, 0, 0, 0); return d; }
    return null;
  }
  function group(det, map) {
    const items = new Map(); let lines = 0; const dates = {};
    for (const r of det.data) {
      const name = String(r[map.name] ?? "").trim();
      if (!name || /^(total|sous total|sous-total|totaux|grand total)$/i.test(norm(name))) continue;
      let q = map.qty != null ? toNum(r[map.qty]) : 1;
      if (!isFinite(q) || q === 0) continue;
      let t = map.total != null ? toNum(r[map.total]) : NaN;
      if (!isFinite(t) && map.unit != null && isFinite(toNum(r[map.unit]))) t = toNum(r[map.unit]) * q;
      const k = normName(name) || norm(name);
      const it = items.get(k) || {key: k, label: name, q: 0, ttc: 0, hasTtc: false};
      it.q += q; if (isFinite(t)) { it.ttc += t; it.hasTtc = true; }
      items.set(k, it); lines++;
      if (map.date != null) { const d = parseDate(r[map.date]); if (d) { const ds = d.toISOString().slice(0, 10); dates[ds] = (dates[ds] || 0) + 1; } }
    }
    const list = [...items.values()].filter(i => Math.round(i.q) !== 0).map(i => ({...i, q: Math.round(i.q), ttc: Math.round(i.ttc * 100) / 100}));
    list.sort((a, b) => b.q - a.q);
    const date = Object.keys(dates).sort((a, b) => dates[b] - dates[a])[0] || null;
    return {items: list, lines, date};
  }

  /* ---------- Rapprochement avec la carte ---------- */
  const bigrams = s => { const b = new Map(); const t = " " + s + " "; for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); b.set(g, (b.get(g) || 0) + 1); } return b; };
  function dice(a, b) {
    if (!a || !b) return 0; if (a === b) return 1;
    const A = bigrams(a), B = bigrams(b); let inter = 0, n = 0;
    A.forEach((v, k) => { inter += Math.min(v, B.get(k) || 0); n += v; }); B.forEach(v => n += v);
    return 2 * inter / n;
  }
  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if ((" " + b + " ").includes(" " + a + " ") || (" " + a + " ").includes(" " + b + " ")) return 0.9;
    const ta = new Set(a.split(" ")), tb = new Set(b.split(" "));
    const common = [...ta].filter(w => w.length > 2 && tb.has(w)).length;
    const tok = common / Math.max(1, Math.min(ta.size, tb.size));
    return Math.max(dice(a, b), tok * 0.85);
  }
  function match(items, catalog, aliases) {   // catalog: [{key, label}]
    const cat = catalog.map(c => ({...c, n: normName(c.label)}));
    return items.map(it => {
      const al = aliases && aliases[it.key];
      if (al === "ignore") return {...it, choice: "ignore", status: "memo"};
      if (al && cat.some(c => c.key === al)) return {...it, choice: al, status: "memo"};
      const scored = cat.map(c => ({key: c.key, s: similarity(it.key, c.n)})).sort((x, y) => y.s - x.s);
      const b = scored[0], s2 = scored[1] ? scored[1].s : 0;
      if (b && b.s >= 0.8 && b.s - s2 >= 0.08) return {...it, choice: b.key, status: "ok", score: b.s};
      if (b && b.s >= 0.45) return {...it, choice: b.key, status: "check", score: b.s};
      return {...it, choice: "", status: "unknown"};
    });
  }

  return {readFile, detect, group, match, normName, toNum, parseCSV};
})();

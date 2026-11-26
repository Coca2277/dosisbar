/* Dosis Bar : pays, TVA, devise et langue.
   Taux en % : alc = boissons alcoolisées servies sur place, soft = boissons sans alcool sur place,
   food = nourriture sur place, emp = vente à emporter. Sources : tableau HOTREC des taux au 1er janvier 2026,
   mises à jour 2026 (Allemagne, Irlande, République tchèque) et Agencia Tributaria pour l'Espagne
   (hostelería à 10 %, boissons alcoolisées comprises). Le patron peut toujours modifier les taux.
   ht: true = prix de la carte affichés hors taxe (la taxe est ajoutée à l'encaissement, ex. États-Unis). */
(function () {
  "use strict";
  const P = {
    FR: {cur: "EUR", alc: 20, soft: 10, food: 10, emp: 5.5},
    ES: {cur: "EUR", alc: 10, soft: 10, food: 10, emp: 10},
    PT: {cur: "EUR", alc: 23, soft: 23, food: 13, emp: 13},
    IT: {cur: "EUR", alc: 10, soft: 10, food: 10, emp: 10},
    DE: {cur: "EUR", alc: 19, soft: 19, food: 7, emp: 7},
    AT: {cur: "EUR", alc: 20, soft: 20, food: 10, emp: 10},
    BE: {cur: "EUR", alc: 21, soft: 21, food: 12, emp: 6},
    NL: {cur: "EUR", alc: 21, soft: 9, food: 9, emp: 9},
    LU: {cur: "EUR", alc: 17, soft: 3, food: 3, emp: 3},
    IE: {cur: "EUR", alc: 23, soft: 13.5, food: 9, emp: 9},
    GR: {cur: "EUR", alc: 24, soft: 24, food: 13, emp: 13},
    CY: {cur: "EUR", alc: 9, soft: 9, food: 9, emp: 5},
    MT: {cur: "EUR", alc: 18, soft: 18, food: 18, emp: 18},
    HR: {cur: "EUR", alc: 25, soft: 25, food: 13, emp: 13},
    SI: {cur: "EUR", alc: 22, soft: 22, food: 9.5, emp: 9.5},
    SK: {cur: "EUR", alc: 23, soft: 19, food: 5, emp: 19},
    FI: {cur: "EUR", alc: 25.5, soft: 13.5, food: 13.5, emp: 13.5},
    EE: {cur: "EUR", alc: 24, soft: 24, food: 24, emp: 24},
    LV: {cur: "EUR", alc: 21, soft: 21, food: 21, emp: 21},
    LT: {cur: "EUR", alc: 21, soft: 21, food: 21, emp: 21},
    BG: {cur: "EUR", alc: 20, soft: 20, food: 20, emp: 20},
    CZ: {cur: "CZK", alc: 21, soft: 12, food: 12, emp: 12},
    PL: {cur: "PLN", alc: 23, soft: 23, food: 8, emp: 8},
    HU: {cur: "HUF", alc: 27, soft: 27, food: 5, emp: 27},
    RO: {cur: "RON", alc: 21, soft: 21, food: 11, emp: 11},
    DK: {cur: "DKK", alc: 25, soft: 25, food: 25, emp: 25},
    SE: {cur: "SEK", alc: 25, soft: 12, food: 12, emp: 6},
    GB: {cur: "GBP", alc: 20, soft: 20, food: 20, emp: 20},
    IE_: null,
    CH: {cur: "CHF", alc: 8.1, soft: 8.1, food: 8.1, emp: 2.6},
    NO: {cur: "NOK", alc: 25, soft: 25, food: 25, emp: 15},
    US: {cur: "USD", alc: 0, soft: 0, food: 0, emp: 0, ht: true},
    XX: {cur: "EUR", alc: 20, soft: 10, food: 10, emp: 10, perso: true}
  };
  delete P.IE_;
  const ORDER = ["FR", "ES", "PT", "IT", "DE", "AT", "BE", "NL", "LU", "IE", "GB", "CH", "GR", "CY", "MT", "HR", "SI", "SK", "CZ", "PL", "HU", "RO", "BG", "DK", "SE", "NO", "FI", "EE", "LV", "LT", "US", "XX"];
  const CURS = ["EUR", "USD", "GBP", "CHF", "CAD", "MXN", "DKK", "SEK", "NOK", "PLN", "CZK", "HUF", "RON", "MAD", "XOF", "XAF", "DOP", "COP", "ARS", "CLP", "PEN", "BRL", "AUD"];

  const ls = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
              set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }};

  // ---- Langue : choix enregistré, sinon langue du navigateur
  function detectLang() {
    const q = (location.search.match(/[?&]lang=(fr|es|en)\b/) || [])[1];
    if (q) { ls.set("dosis.lang", q); return q; }
    const s = ls.get("dosis.lang"); if (s === "fr" || s === "es" || s === "en") return s;
    const n = (navigator.language || "fr").slice(0, 2).toLowerCase();
    return n === "fr" ? "fr" : n === "es" ? "es" : "en";   // autre langue (allemand, italien…) : anglais
  }
  const LANG = detectLang();
  document.documentElement.lang = LANG;

  // ---- Pays : réglage de l'établissement (S.opts.pays), sinon dernier choix local, sinon déduit de la langue
  function guessPays() { const s = ls.get("dosis.pays"); if (s && P[s]) return s;
    if (LANG === "fr") return "FR";   // les établissements déjà inscrits sont en France : rien ne change pour eux
    const reg = (navigator.language || "").split("-")[1]; if (reg && P[reg.toUpperCase()]) return reg.toUpperCase();
    return LANG === "es" ? "ES" : LANG === "en" ? "GB" : "FR"; }
  const opts = () => { try { return (typeof S !== "undefined" && S && S.opts) || null; } catch (e) { return null; } };
  function pays() { const o = opts(); return (o && o.pays && P[o.pays]) ? o.pays : guessPays(); }
  function tx() { const code = pays(), base = P[code], o = opts(), perso = (o && o.tvaPerso && o.tvaPerso[code]) || null;
    const r = Object.assign({}, base, perso || {}); r.code = code; return r; }
  const rate = k => (tx()[k] || 0) / 100;   // en fraction : 0.2 pour 20 %
  const cur = () => tx().cur || "EUR";
  function loc() { if (LANG === "fr") return "fr-FR"; if (LANG === "es") return "es-ES"; return pays() === "US" ? "en-US" : "en-GB"; }

  // ---- Montants : en France et en euros, exactement l'affichage historique
  const fmtCache = {};
  function money(v, d = 2) {
    if (!isFinite(v)) return "—";
    const c = cur(), l = loc();
    if (c === "EUR" && (l === "fr-FR" || l === "es-ES")) return v.toLocaleString(l, {minimumFractionDigits: d, maximumFractionDigits: d}) + " €";
    const k = l + c + d;
    if (!fmtCache[k]) fmtCache[k] = new Intl.NumberFormat(l, {style: "currency", currency: c, minimumFractionDigits: d, maximumFractionDigits: d});
    return fmtCache[k].format(v);
  }
  function symbol() { try { return new Intl.NumberFormat(loc(), {style: "currency", currency: cur(), currencyDisplay: "narrowSymbol"}).formatToParts(0).find(p => p.type === "currency").value; } catch (e) { return cur(); } }
  function paysName(code) { if (code === "XX") return {fr: "Autre pays", es: "Otro país", en: "Other country"}[LANG];
    try { return new Intl.DisplayNames([LANG], {type: "region"}).of(code); } catch (e) { return code; } }

  function setLang(l) { ls.set("dosis.lang", l); const u = new URL(location.href); u.searchParams.delete("lang"); location.replace(u.toString()); }
  function rememberPays(code) { if (P[code]) ls.set("dosis.pays", code); }

  window.DOSIS_PAYS = {P, ORDER, CURS, LANG, pays, tx, rate, cur, loc, money, symbol, paysName, setLang, rememberPays};
})();

/* Dosis Bar : traduction de l'interface (espagnol, anglais).
   Le français reste la langue du code. Ce module traduit ce qui s'affiche : textes, infobulles,
   champs d'aide, messages (toast, alert, confirm). Les dictionnaires sont dans i18n-es.js et i18n-en.js
   (clé = texte français, valeur = traduction). Les montants et données saisies ne sont pas touchés. */
(function () {
  "use strict";
  const PAYS = window.DOSIS_PAYS, LANG = PAYS ? PAYS.LANG : "fr";
  // sélecteur de langue : tout élément [data-lang-switch] reçoit un petit menu FR / ES / EN
  function mountSwitch() { document.querySelectorAll("[data-lang-switch]").forEach(el => { if (el.dataset.done) return; el.dataset.done = 1;
    const s = document.createElement("select"); s.className = "langsw noi18n"; s.setAttribute("aria-label", {fr: "Langue", es: "Idioma", en: "Language"}[LANG]);
    [["fr", "FR · Français"], ["es", "ES · Español"], ["en", "EN · English"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; if (v === LANG) o.selected = true; s.appendChild(o); });
    s.onchange = () => PAYS.setLang(s.value); el.appendChild(s); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountSwitch); else mountSwitch();
  window.DOSIS_LANGSW = mountSwitch;
  if (LANG === "fr") { window.DOSIS_T = s => s; return; }
  const base = (document.currentScript && document.currentScript.src || "").replace(/i18n\.js(\?.*)?$/, "");
  document.write('<script src="' + base + "i18n-" + LANG + '.js?v=1"><\/script>');

  const norm = s => s.replace(/\s+/g, " ").trim();
  // petits mots qui reviennent au milieu des montants (« 12,00 € TTC », « Alcool · TVA 19 % »)
  const WORDS = {es: {"TVA": "IVA", "HT": "sin IVA", "TTC": "IVA incl.", "Sans alcool": "Sin alcohol", "Alcool": "Alcohol", "par mois": "al mes", "/ mois": "/ mes", "par an": "al año", "verres": "copas", "verre": "copa", "bouteilles": "botellas", "bouteille": "botella", "stocks bas": "stocks bajos", "stock bas": "stock bajo", "boissons vendues à perte": "bebidas vendidas a pérdida", "boisson vendue à perte": "bebida vendida a pérdida", "réel": "real", "Reste": "Quedan", "Commander": "Pedir", "marge": "margen", "formats": "formatos", "format": "formato", "pièces": "unidades", "pièce": "unidad", "soirs": "noches", "jours": "días", "produits": "productos", "produit": "producto", "désactivé": "desactivado", "activé": "activado", "Anisé": "Anisado", "Bière": "Cerveza", "Thé": "Té", "Allongé": "Americano", "de marge": "de margen", "coefficient": "coeficiente"},
                 en: {"TVA": "VAT", "HT": "excl. VAT", "TTC": "incl. VAT", "Sans alcool": "Alcohol-free", "Alcool": "Alcohol", "par mois": "per month", "/ mois": "/ month", "par an": "per year", "verres": "glasses", "verre": "glass", "bouteilles": "bottles", "bouteille": "bottle", "stocks bas": "low stocks", "stock bas": "low stock", "boissons vendues à perte": "drinks sold at a loss", "boisson vendue à perte": "drink sold at a loss", "réel": "actual", "Reste": "Left", "Commander": "Order", "marge": "margin", "formats": "servings", "format": "serving", "pièces": "units", "pièce": "unit", "soirs": "nights", "jours": "days", "produits": "products", "produit": "product", "désactivé": "off", "activé": "on", "Anisé": "Aniseed", "Bière": "Beer", "Thé": "Tea", "Café": "Coffee", "Allongé": "Long black", "de marge": "margin", "coefficient": "markup"}}[LANG] || {};
  const WRX = new RegExp("(?<![\\wÀ-ÿ])(" + Object.keys(WORDS).sort((a, b) => b.length - a.length).map(k => k.replace(/[/]/g, "\\/")).join("|") + ")(?![\\wÀ-ÿ])", "g");
  let DICT = null, BIG = null;
  function ready() {
    if (DICT) return true;
    const d = window.DOSIS_I18N && window.DOSIS_I18N[LANG]; if (!d) return false;
    DICT = new Map(); Object.keys(d).forEach(k => DICT.set(norm(k), d[k]));
    // fragments longs : remplacés aussi à l'intérieur d'un texte qui contient des chiffres ou des noms
    const longs = [...DICT.keys()].filter(k => k.length >= 10 && / /.test(k)).sort((a, b) => b.length - a.length);
    BIG = longs.length ? new RegExp(longs.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
    return true;
  }
  // devise : seuls les libellés de champs « (€) » et « € par verre » suivent la devise de l'établissement (les tarifs Dosis Bar restent en euros)
  const symFix = s => { if (!PAYS || !/app\.html$/.test(location.pathname) || PAYS.cur() === "EUR" || s.indexOf("€") < 0) return s;
    return s.replace(/\(€/g, "(" + PAYS.symbol()).replace(/€ (por copa|per glass|par verre)/g, (m, x) => PAYS.symbol() + " " + x); };
  function tr(s) {
    if (s == null) return s; s = String(s);
    if (!ready()) return symFix(s);
    const t = norm(s); if (!t) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    if (DICT.has(t)) return symFix(lead + DICT.get(t) + trail);
    let r = s.replace(/\s+/g, " ");
    if (BIG) r = r.replace(BIG, m => DICT.get(m));
    r = r.replace(WRX, m => WORDS[m]);
    if (r !== s.replace(/\s+/g, " ")) return symFix(lead + r.trim() + trail);
    return symFix(s);
  }
  window.DOSIS_T = tr;

  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT", "CODE"]);
  const done = new WeakMap();   // nœud -> dernier texte écrit par nous (évite les boucles)
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  function skipEl(el) { for (let e = el; e; e = e.parentElement) { if (SKIP.has(e.tagName) || (e.classList && e.classList.contains("noi18n")) || e.isContentEditable) return true; } return false; }
  function doText(n) {
    const v = n.nodeValue; if (!v || !/[A-Za-zÀ-ÿ€]/.test(v) || done.get(n) === v) return;
    if (skipEl(n.parentElement)) return;
    const t = tr(v); done.set(n, t); if (t !== v) n.nodeValue = t;
  }
  function doEl(el) {
    if (el.nodeType !== 1) return;
    if (skipEl(el.parentElement)) return;
    ATTRS.forEach(a => { const v = el.getAttribute(a); if (v && !el["_i18n_" + a + v]) { const t = tr(v); if (t !== v) el.setAttribute(a, t); el["_i18n_" + a + t] = 1; } });
    if (el.tagName === "META" && el.name === "description") { const v = el.content, t = tr(v); if (t !== v) el.content = t; }
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else ATTRS.forEach(a => { const v = n.getAttribute(a); if (v && !n["_i18n_" + a + v] && !skipEl(n.parentElement)) { const t = tr(v); if (t !== v) n.setAttribute(a, t); n["_i18n_" + a + t] = 1; } }); }
  }
  function all() { if (!ready()) return; document.title = tr(document.title); doEl(document.documentElement); }
  const mo = new MutationObserver(ms => { if (!ready()) return;
    for (const m of ms) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") { if (ATTRS.includes(m.attributeName)) doEl(m.target.nodeType === 1 ? m.target : m.target.parentElement); }
      else m.addedNodes.forEach(n => n.nodeType === 3 ? doText(n) : doEl(n));
    } });
  function start() { all(); mo.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS}); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  // messages système
  const A = window.alert, C = window.confirm, P = window.prompt;
  window.alert = m => A.call(window, tr(m));
  window.confirm = m => C.call(window, tr(m));
  window.prompt = (m, d) => P.call(window, tr(m), d);
})();

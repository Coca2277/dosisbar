/* Dosis Bar — lecteur de code-barres (appareil photo du téléphone)
   Moteur natif du navigateur quand il existe (Android, Mac), sinon ZXing (iPhone, PC).
   Recherche du produit dans la base publique Open Food Facts. */
"use strict";
window.Scan = (() => {
  const FORMATS_NATIVE = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
  let stream = null, timer = null, busy = false, detector = null, zx = null, engine = null;
  let canvas = null, ctx = null, onCode = null, last = "", lastAt = 0, paused = false;

  function loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "js/vendor/zxing.min.js"; s.onload = ok; s.onerror = () => ko(new Error("Lecteur indisponible"));
      document.head.appendChild(s);
    });
  }
  async function initEngine() {
    if (engine) return engine;
    if ("BarcodeDetector" in window) {
      try {
        const f = await window.BarcodeDetector.getSupportedFormats();
        if (f.includes("ean_13")) { detector = new window.BarcodeDetector({formats: FORMATS_NATIVE.filter(x => f.includes(x))}); return engine = "native"; }
      } catch (e) {}
    }
    await loadZXing();
    const Z = window.ZXing, hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    zx = new Z.MultiFormatReader(); zx.setHints(hints);
    return engine = "zxing";
  }

  // Contrôle de la clé EAN/UPC : évite les fausses lectures
  function validEan(c) {
    if (!/^\d{8}$|^\d{12,14}$/.test(c)) return /^[\x20-\x7e]{4,40}$/.test(c); // code 128 : texte simple
    const d = c.split("").map(Number), check = d.pop();
    const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - sum % 10) % 10 === check;
  }
  // UPC-A (12 chiffres) = EAN-13 avec un 0 devant : on garde une seule forme
  const normalize = c => (c = String(c).trim(), /^\d{12}$/.test(c) ? "0" + c : c);

  async function readFrame(video) {
    if (!video.videoWidth) return null;
    if (engine === "native") {
      const r = await detector.detect(video);
      return r.length ? r[0].rawValue : null;
    }
    // ZXing : on lit la bande centrale de l'image (plus rapide, plus fiable)
    const vw = video.videoWidth, vh = video.videoHeight;
    const w = Math.min(vw, 1000), sw = vw, sh = Math.round(vh * 0.5), sy = Math.round((vh - sh) / 2);
    const h = Math.round(sh * w / sw);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(video, 0, sy, sw, sh, 0, 0, w, h);
    const Z = window.ZXing;
    try {
      const src = new Z.HTMLCanvasElementLuminanceSource(canvas);
      return zx.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(src))).getText();
    } catch (e) { return null; }
  }

  async function start(video, cb) {
    stop(); onCode = cb; paused = false; last = ""; lastAt = 0;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("NO_CAMERA");
    canvas = canvas || document.createElement("canvas"); ctx = ctx || canvas.getContext("2d", {willReadFrequently: true});
    await initEngine();
    stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: "environment"}, width: {ideal: 1280}, height: {ideal: 720}}});
    video.srcObject = stream; video.setAttribute("playsinline", ""); video.muted = true;
    await video.play().catch(() => {});
    timer = setInterval(async () => {
      if (busy || paused || !stream) return;
      busy = true;
      try {
        const raw = await readFrame(video);
        if (raw) {
          const c = normalize(raw), now = Date.now();
          if (validEan(c) && !(c === last && now - lastAt < 2500)) {
            last = c; lastAt = now;
            try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
            onCode && onCode(c);
          }
        }
      } catch (e) {} finally { busy = false; }
    }, engine === "native" ? 120 : 180);
    return {engine, torch: torchAvailable()};
  }
  function stop() {
    clearInterval(timer); timer = null;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  const pause = p => { paused = p; if (!p) { last = ""; } };
  function torchAvailable() {
    try { const t = stream && stream.getVideoTracks()[0]; return !!(t && t.getCapabilities && t.getCapabilities().torch); } catch (e) { return false; }
  }
  let torchOn = false;
  async function toggleTorch() {
    const t = stream && stream.getVideoTracks()[0]; if (!t) return false;
    torchOn = !torchOn;
    try { await t.applyConstraints({advanced: [{torch: torchOn}]}); } catch (e) { torchOn = false; }
    return torchOn;
  }

  /* ---- Recherche du produit (Open Food Facts, base publique et gratuite) ---- */
  const CAT_RULES = [
    [/rums?$|rhums?$|:rhum|:rum/, "Rhum"], [/whisk(e)?y|bourbon|scotch/, "Whisky"], [/:gins?$|-gins?$/, "Gin"],
    [/vodka/, "Vodka"], [/pastis|anis/, "Anisé"], [/beers?$|bieres?|lager|ale$|stout/, "Bière"],
    [/wines?$|vins?$|champagne|cremant|prosecco/, "Vin"], [/sodas?$|colas?$|tonic|lemonade|limonade|carbonated-drinks/, "Soft"],
    [/juices?$|jus-|nectar/, "Jus"], [/syrups?$|sirops?/, "Sirop"], [/waters?$|eaux?/, "Eau"]
  ];
  function toCl(q) {
    if (!q) return 0;
    const m = String(q).toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(cl|ml|l|litres?|liters?)\b/);
    if (!m) return 0;
    const n = parseFloat(m[1]), u = m[2];
    return Math.round((u === "cl" ? n : u === "ml" ? n / 10 : n * 100) * 10) / 10;
  }
  async function lookup(code) {
    if (!/^\d{8,14}$/.test(code)) return null;
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_fr,brands,quantity,product_quantity,product_quantity_unit,categories_tags`, {signal: ctrl.signal});
      if (!r.ok) return null;
      const j = await r.json();
      if (j.status !== 1 || !j.product) return null;
      const p = j.product, tags = (p.categories_tags || []).join(" ");
      let nom = (p.product_name_fr || p.product_name || "").trim();
      const marque = (p.brands || "").split(",")[0].trim();
      if (marque && nom && !nom.toLowerCase().includes(marque.toLowerCase())) nom = marque + " " + nom;
      if (!nom) nom = marque;
      let cat = "Autre";
      for (const [re, c] of CAT_RULES) if ((p.categories_tags || []).some(tg => re.test(tg))) { cat = c; break; }
      const alcool = /alcoholic-beverages|spirits|beers|wines|liqueurs/.test(tags) && !/non-alcoholic|sans-alcool/.test(tags);
      let cap = toCl(p.quantity);
      if (!cap && p.product_quantity && /ml|cl|l/i.test(p.product_quantity_unit || "")) cap = toCl(p.product_quantity + " " + p.product_quantity_unit);
      return {nom: nom.slice(0, 80), categorie: cat, alcool: cat === "Soft" || cat === "Jus" || cat === "Eau" || cat === "Sirop" ? false : alcool || ["Rhum","Whisky","Gin","Vodka","Anisé","Bière","Vin"].includes(cat), cap};
    } catch (e) { return null; } finally { clearTimeout(t); }
  }

  return {start, stop, pause, toggleTorch, lookup, validEan, normalize};
})();

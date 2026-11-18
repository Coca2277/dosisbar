// Dosis Bar — connexion aux caisses enregistreuses (appelée par l'app, patron connecté)
// SumUp : le patron crée une clé API sur me.sumup.com (Paramètres › Clés API) et la colle dans l'app.
// Actions : connecter {fournisseur, cle} · deconnecter · ventes {date: "AAAA-MM-JJ"}
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- SumUp ----------
const SUMUP = "https://api.sumup.com";
async function sumup(cle: string, path: string) {
  const r = await fetch(path.startsWith("http") ? path : SUMUP + path, { headers: { Authorization: "Bearer " + cle, Accept: "application/json" } });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* réponse non JSON */ }
  if (r.status === 401 || r.status === 403) throw new Error("Clé SumUp refusée : vérifiez qu'elle est complète et qu'elle a bien les droits sur les transactions");
  if (!r.ok) throw new Error((j && (j.message || j.error_message || j.detail)) || "Erreur SumUp (" + r.status + ")");
  return j;
}
async function sumupCompte(cle: string) {
  const m = await sumup(cle, "/v0.1/memberships?resource.type=merchant&status=accepted");
  const it = (m?.items || []).find((x: any) => x?.resource?.type === "merchant") || (m?.items || [])[0];
  const code = it?.resource?.id || it?.resource_id;
  if (!code) throw new Error("Aucun compte commerçant SumUp trouvé avec cette clé");
  return { compte: String(code), nom: String(it?.resource?.name || code) };
}
// Début et fin d'une journée à Paris, en UTC (gère l'heure d'été)
function journeeParis(date: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const midiUTC = new Date(Date.UTC(y, mo - 1, d, 12));
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(midiUTC));
  const decal = h - 12;   // +1 en hiver, +2 en été
  const debut = new Date(Date.UTC(y, mo - 1, d, 0 - decal, 0, 0));
  const fin = new Date(debut.getTime() + 24 * 3600 * 1000 - 1000);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}
async function sumupVentes(cle: string, compte: string, date: string) {
  const { debut, fin } = journeeParis(date);
  const base = `/v2.1/merchants/${encodeURIComponent(compte)}/transactions/history`;
  let url = `${base}?oldest_time=${encodeURIComponent(debut)}&newest_time=${encodeURIComponent(fin)}&limit=100&order=ascending&statuses[]=SUCCESSFUL&types[]=PAYMENT`;
  const codes: string[] = [];
  for (let page = 0; page < 30 && url; page++) {
    const h = await sumup(cle, url);
    for (const t of h?.items || []) if (t.transaction_code && t.status === "SUCCESSFUL") codes.push(t.transaction_code);
    const next = (h?.links || []).find((l: any) => l.rel === "next")?.href;
    url = !next ? "" : next.startsWith("http") ? next : next.startsWith("/") ? next : base + "?" + String(next).replace(/^\?/, "");
  }
  const lignes = new Map<string, { key: string; label: string; q: number; ttc: number; hasTtc: boolean }>();
  let sansDetail = 0, totalSansDetail = 0, n = 0;
  for (let i = 0; i < codes.length; i += 8) {
    const lot = await Promise.all(codes.slice(i, i + 8).map((c) => sumup(cle, `/v2.1/merchants/${encodeURIComponent(compte)}/transactions?transaction_code=${encodeURIComponent(c)}`)));
    for (const t of lot) {
      n++;
      const prods = t?.products || [];
      if (!prods.length) { sansDetail++; totalSansDetail += Number(t?.amount) || 0; continue; }
      for (const p of prods) {
        const label = String(p.name || "").trim(); const q = Number(p.quantity) || 1;
        if (!label) continue;
        const key = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
        const ttc = Number(p.total_with_vat ?? (p.price_with_vat != null ? p.price_with_vat * q : NaN));
        const l = lignes.get(key) || { key, label, q: 0, ttc: 0, hasTtc: true };
        l.q += q; if (isFinite(ttc)) l.ttc += ttc; else l.hasTtc = false;
        lignes.set(key, l);
      }
    }
  }
  const items = [...lignes.values()].map((l) => ({ ...l, q: Math.round(l.q), ttc: Math.round(l.ttc * 100) / 100 })).filter((l) => l.q !== 0).sort((a, b) => b.q - a.q);
  return { items, transactions: n, sansDetail, totalSansDetail: Math.round(totalSansDetail * 100) / 100 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Connexion requise" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json();
    const etab = String(b.etab || "");
    const { data: m } = await admin.from("membres").select("role").eq("etab_id", etab).eq("user_id", u.user.id).maybeSingle();
    if (!m || m.role !== "patron") return json({ error: "Réservé au patron de l'établissement" }, 403);

    if (b.action === "connecter") {
      if (b.fournisseur !== "sumup") return json({ error: "Caisse pas encore prise en charge" }, 400);
      const cle = String(b.cle || "").trim();
      if (cle.length < 20) return json({ error: "Collez la clé API complète de SumUp" }, 400);
      const c = await sumupCompte(cle);
      await admin.from("caisse_cles").upsert({ etab_id: etab, cle });
      await admin.from("caisse_connexions").upsert({ etab_id: etab, fournisseur: "sumup", compte: c.compte, nom_compte: c.nom, erreur: null });
      return json({ ok: true, nom: c.nom });
    }
    if (b.action === "deconnecter") {
      await admin.from("caisse_cles").delete().eq("etab_id", etab);
      await admin.from("caisse_connexions").delete().eq("etab_id", etab);
      return json({ ok: true });
    }
    if (b.action === "ventes") {
      const date = String(b.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Date invalide" }, 400);
      const { data: c } = await admin.from("caisse_connexions").select("*").eq("etab_id", etab).maybeSingle();
      const { data: k } = await admin.from("caisse_cles").select("cle").eq("etab_id", etab).maybeSingle();
      if (!c || !k) return json({ error: "Aucune caisse connectée" }, 400);
      try {
        const r = await sumupVentes(k.cle, c.compte, date);
        await admin.from("caisse_connexions").update({ derniere_synchro: new Date().toISOString(), erreur: null }).eq("etab_id", etab);
        return json({ ...r, date, ref: `sumup:${c.compte}:${date}`, source: "SumUp" });
      } catch (e) {
        await admin.from("caisse_connexions").update({ erreur: String((e as Error).message || e) }).eq("etab_id", etab);
        throw e;
      }
    }
    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
});

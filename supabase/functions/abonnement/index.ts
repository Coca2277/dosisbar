// Dosis Bar — création et gestion de l'abonnement Mollie (appelée par l'app, utilisateur connecté)
// Secrets à définir dans Supabase : MOLLIE_API_KEY (obligatoire), CODE_PILOTE (code donné aux bars pilotes)
import { createClient } from "npm:@supabase/supabase-js@2";

const APP = "https://dosisbar.com/app.html";
const PRIX_HT: Record<string, number> = { pilote: 19, bar: 29, pro: 59 };
const RESTO_HT = 15;
const MOIS_PAR_AN = 10; // paiement à l'année : 12 mois pour le prix de 10
const NOMS: Record<string, string> = { pilote: "Bar pilote", bar: "Dosis Bar", pro: "Dosis Bar Pro" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const euros = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

async function mollie(path: string, method = "GET", body?: unknown) {
  const key = Deno.env.get("MOLLIE_API_KEY");
  if (!key) throw new Error("Paiement pas encore configuré (clé Mollie manquante)");
  const r = await fetch("https://api.mollie.com/v2" + path, {
    method, headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || j.title || "Erreur Mollie");
  return j;
}

function tarif(formule: string, resto: boolean) {
  const ht = PRIX_HT[formule] + (resto && formule !== "pro" ? RESTO_HT : 0);
  return { ht, ttc: Math.round(ht * 1.2 * 100) / 100 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Connexion requise" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const b = await req.json();
    const etab = String(b.etab || "");
    const { data: m } = await admin.from("membres").select("role").eq("etab_id", etab).eq("user_id", u.user.id).maybeSingle();
    if (!m || m.role !== "patron") return json({ error: "Réservé au patron de l'établissement" }, 403);
    const { data: et } = await admin.from("etablissements").select("nom").eq("id", etab).single();
    const { data: ab0 } = await admin.from("abonnements").select("*").eq("etab_id", etab).maybeSingle();
    const ab = ab0 || { etab_id: etab, statut: "aucun" };

    if (b.action === "souscrire") {
      const formule = String(b.formule);
      if (!PRIX_HT[formule]) return json({ error: "Formule inconnue" }, 400);
      if (formule === "pilote") {
        const code = Deno.env.get("CODE_PILOTE");
        if (!code || String(b.code || "").trim().toUpperCase() !== code.trim().toUpperCase()) return json({ error: "Code pilote incorrect" }, 400);
      }
      if (ab.statut === "actif" && ab.mollie_abonnement) return json({ error: "Un abonnement est déjà actif : utilisez « Changer de formule »" }, 400);
      const resto = !!b.resto && formule !== "pro";
      const annuel = !!b.annuel && formule !== "pilote";
      const t = tarif(formule, resto);
      const periode = annuel ? Math.round(t.ttc * MOIS_PAR_AN * 100) / 100 : t.ttc;
      let client = ab.mollie_client;
      if (!client) {
        const c = await mollie("/customers", "POST", { name: et?.nom || "Établissement", email: u.user.email, metadata: { etab } });
        client = c.id;
      }
      const essai = formule === "pilote";
      const p = await mollie(`/customers/${client}/payments`, "POST", {
        amount: { currency: "EUR", value: essai ? "1.00" : euros(periode) },
        description: essai ? `${NOMS[formule]} – validation du moyen de paiement` : `${NOMS[formule]}${resto ? " + Dosis Resto" : ""} – ${annuel ? "1re année" : "1er mois"}`,
        sequenceType: "first",
        redirectUrl: APP + "?abonnement=retour",
        webhookUrl: url + "/functions/v1/mollie-webhook",
        metadata: { etab, formule, resto, annuel, ttc: periode },
      });
      await admin.from("abonnements").upsert({
        etab_id: etab, formule, resto, statut: ab.statut === "actif" ? "actif" : "en_attente",
        montant_ttc: periode, annuel, mollie_client: client, maj: new Date().toISOString(),
      });
      return json({ url: p._links.checkout.href });
    }

    if (b.action === "verifier") {
      // Retour de la page de paiement : on lit le statut directement chez Mollie (sans attendre le webhook)
      if (!ab.mollie_client) return json({ statut: "aucun" });
      const list = await mollie(`/customers/${ab.mollie_client}/payments?limit=1`);
      const p = list?._embedded?.payments?.[0];
      if (!p) return json({ statut: "aucun" });
      if (["paid", "failed", "canceled", "expired"].includes(p.status)) {
        // statut définitif : on rejoue le traitement du webhook (idempotent) au cas où Mollie ne l'aurait pas encore appelé
        const fd = new FormData(); fd.set("id", p.id);
        try { await fetch(url + "/functions/v1/mollie-webhook", { method: "POST", body: fd }); } catch (_) { /* le webhook Mollie prendra le relais */ }
      }
      const echec = p.details?.failureReason || p.details?.failureMessage || "";
      return json({ statut: p.status, id: p.id, echec, cree: p.createdAt });
    }

    if (b.action === "changer") {
      if (!ab.mollie_abonnement || ab.statut !== "actif") return json({ error: "Aucun abonnement actif à modifier" }, 400);
      const formule = String(b.formule);
      if (!PRIX_HT[formule] || formule === "pilote") return json({ error: "Formule non disponible" }, 400);
      const resto = !!b.resto && formule !== "pro";
      const t = tarif(formule, resto);
      const periode = ab.annuel ? Math.round(t.ttc * MOIS_PAR_AN * 100) / 100 : t.ttc;
      await mollie(`/customers/${ab.mollie_client}/subscriptions/${ab.mollie_abonnement}`, "PATCH", {
        amount: { currency: "EUR", value: euros(periode) },
        description: `${NOMS[formule]}${resto ? " + Dosis Resto" : ""} – ${etab.slice(0, 8)}`,
      });
      await admin.from("abonnements").update({ formule, resto, montant_ttc: periode, maj: new Date().toISOString() }).eq("etab_id", etab);
      return json({ ok: true });
    }

    if (b.action === "resilier") {
      if (ab.mollie_abonnement) {
        try { await mollie(`/customers/${ab.mollie_client}/subscriptions/${ab.mollie_abonnement}`, "DELETE"); } catch (_) { /* déjà annulé */ }
      }
      await admin.from("abonnements").update({ statut: "annule", mollie_abonnement: null, maj: new Date().toISOString() }).eq("etab_id", etab);
      return json({ ok: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || "Erreur" }, 500);
  }
});

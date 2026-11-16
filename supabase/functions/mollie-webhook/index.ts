// Dosis Bar — réception des notifications de Mollie.
// Mollie n'envoie que l'identifiant du paiement : on relit toujours le paiement chez Mollie avec notre clé,
// donc une fausse notification ne peut rien valider. Cette fonction doit être déployée SANS vérification JWT.
import { createClient } from "npm:@supabase/supabase-js@2";

const NOMS: Record<string, string> = { pilote: "Bar pilote", bar: "Dosis Bar", pro: "Dosis Bar Pro" };
const euros = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusMois = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

async function mollie(path: string, method = "GET", body?: unknown) {
  const r = await fetch("https://api.mollie.com/v2" + path, {
    method, headers: { Authorization: "Bearer " + Deno.env.get("MOLLIE_API_KEY"), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || j.title || "Erreur Mollie");
  return j;
}

Deno.serve(async (req) => {
  try {
    const form = await req.formData().catch(() => null);
    const id = String(form?.get("id") || "");
    if (!/^tr_[A-Za-z0-9]+$/.test(id)) return new Response("ok");
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const p = await mollie("/payments/" + id);

    let etab = p.metadata?.etab as string | undefined;
    let ab: Record<string, unknown> | null = null;
    if (!etab && p.subscriptionId) {
      const { data } = await admin.from("abonnements").select("*").eq("mollie_abonnement", p.subscriptionId).maybeSingle();
      ab = data; etab = data?.etab_id as string | undefined;
    }
    if (!etab) return new Response("ok");
    if (!ab) ab = (await admin.from("abonnements").select("*").eq("etab_id", etab).maybeSingle()).data;

    await admin.from("paiements").upsert({
      id, etab_id: etab, le: p.paidAt || p.createdAt, montant_ttc: +p.amount.value, statut: p.status, libelle: p.description,
    });

    if (p.sequenceType === "first") {
      if (p.status === "paid" && !(ab?.mollie_abonnement)) {
        const formule = String(p.metadata.formule), resto = !!p.metadata.resto, ttc = +p.metadata.ttc;
        const debut = plusMois(new Date(), formule === "pilote" ? 2 : 1);
        const s = await mollie(`/customers/${p.customerId}/subscriptions`, "POST", {
          amount: { currency: "EUR", value: euros(ttc) }, interval: "1 month", startDate: iso(debut),
          description: `${NOMS[formule]}${resto ? " + Restauration" : ""} – ${etab.slice(0, 8)}`,
          webhookUrl: url + "/functions/v1/mollie-webhook", metadata: { etab },
        });
        await admin.from("abonnements").upsert({
          etab_id: etab, formule, resto, statut: "actif", montant_ttc: ttc, paye_jusqu: iso(debut),
          mollie_client: p.customerId, mollie_abonnement: s.id, maj: new Date().toISOString(),
        });
      } else if (["failed", "canceled", "expired"].includes(p.status) && ab?.statut === "en_attente") {
        await admin.from("abonnements").update({ statut: "aucun", maj: new Date().toISOString() }).eq("etab_id", etab);
      }
    } else if (p.subscriptionId) {
      if (p.status === "paid") {
        const base = ab?.paye_jusqu ? new Date(String(ab.paye_jusqu)) : new Date();
        const fin = plusMois(base < new Date() ? new Date() : base, 1);
        await admin.from("abonnements").update({ statut: "actif", paye_jusqu: iso(fin), maj: new Date().toISOString() }).eq("etab_id", etab);
      } else if (["failed", "charged_back"].includes(p.status)) {
        await admin.from("abonnements").update({ statut: "impaye", maj: new Date().toISOString() }).eq("etab_id", etab);
      }
    }
    return new Response("ok");
  } catch (_) {
    return new Response("erreur", { status: 500 }); // Mollie réessaiera plus tard
  }
});

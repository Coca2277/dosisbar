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

// ---------- Factures ----------
const VENDEUR = {
  nom: "PARIS RHUM CLUB", forme: "SAS au capital de 1 500 €", adresse: "12 B rue de Béziers, 93150 Le Blanc-Mesnil, France",
  rcs: "RCS Bobigny 891 564 288", siret: "891 564 288 00019", tva: "FR35891564288", email: "contact@dosisbar.com",
};
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
let DEV = "EUR";   // devise de la facture en cours
const SYM: Record<string, string> = { EUR: "€", GBP: "£", CHF: "CHF", USD: "$" };
const fr = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (SYM[DEV] || DEV);
const jour = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

type Ligne = { designation: string; detail: string; qte: number; pu_ht: number };
type Client = { nom: string; adresse: string; siret?: string; tva?: string; email: string; etablissement: string };

function mentionTva(taux: number, pays: string) {
  if (taux > 0) return "";
  return ["ES","PT","IT","DE","AT","BE","NL","LU","IE","GR","CY","MT","HR","SI","SK","FI","EE","LV","LT","BG","CZ","PL","HU","RO","DK","SE"].includes(pays)
    ? "Autoliquidation : TVA due par le preneur (art. 196 de la directive 2006/112/CE et art. 283-2 du CGI)."
    : "TVA non applicable, art. 259-1 du CGI (prestation de services à un client établi hors de l'Union européenne).";
}
function htmlFacture(c: Client, lignes: Ligne[], ht: number, tva: number, ttc: number, payee: Date, ref: string, taux = 20, pays = "FR") {
  const td = "padding:10px 8px;border-bottom:1px solid #e6e0d8;vertical-align:top";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Facture {{NUMERO}} — Dosis Bar</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f6f2ec;font-family:Helvetica,Arial,sans-serif;color:#1d1916">
<div style="max-width:720px;margin:0 auto;background:#fff;padding:36px 32px;font-size:14px;line-height:1.5">
<table style="width:100%;border-collapse:collapse"><tr>
<td style="vertical-align:top"><div style="font-size:22px;font-weight:700"><img src="https://dosisbar.com/icons/logo-facture.png" width="21" height="24" alt="" style="vertical-align:-3px;margin-right:8px">Dosis <span style="color:#c27a12">Bar</span></div>
<div style="margin-top:8px"><b>${VENDEUR.nom}</b><br>${VENDEUR.forme}<br>${VENDEUR.adresse}<br>${VENDEUR.rcs} · SIRET ${VENDEUR.siret}<br>TVA intracommunautaire ${VENDEUR.tva}<br>${VENDEUR.email}</div></td>
<td style="vertical-align:top;text-align:right"><div style="font-size:24px;font-weight:700">Facture</div>
<div>N° <b>{{NUMERO}}</b></div><div>Date : ${jour(new Date())}</div></td></tr></table>
<div style="margin:28px 0 22px;padding:14px 16px;background:#f6f2ec;border-radius:10px"><div style="color:#7a6e62;font-size:12px">FACTURÉ À</div>
<b>${esc(c.nom)}</b><br>${esc(c.adresse).replace(/\n/g, "<br>")}${c.siret ? `<br>SIRET ${esc(c.siret)}` : ""}${c.tva ? `<br>TVA ${esc(c.tva)}` : ""}<br>Établissement : ${esc(c.etablissement)}</div>
<table style="width:100%;border-collapse:collapse">
<tr style="color:#7a6e62;font-size:12px;text-align:left"><th style="${td}">Désignation</th><th style="${td};text-align:right">Qté</th><th style="${td};text-align:right">Prix unitaire HT</th><th style="${td};text-align:right">Total HT</th></tr>
${lignes.map((l) => `<tr><td style="${td}"><b>${esc(l.designation)}</b><br><span style="color:#7a6e62">${esc(l.detail)}</span></td><td style="${td};text-align:right">${l.qte}</td><td style="${td};text-align:right">${fr(l.pu_ht)}</td><td style="${td};text-align:right">${fr(l.pu_ht * l.qte)}</td></tr>`).join("")}
</table>
<table style="margin:16px 0 0 auto;border-collapse:collapse;min-width:260px">
<tr><td style="padding:4px 8px">Total HT</td><td style="padding:4px 8px;text-align:right">${fr(ht)}</td></tr>
<tr><td style="padding:4px 8px">TVA ${taux} %</td><td style="padding:4px 8px;text-align:right">${fr(tva)}</td></tr>
<tr><td style="padding:8px;font-weight:700;border-top:2px solid #1d1916">Total TTC</td><td style="padding:8px;text-align:right;font-weight:700;border-top:2px solid #1d1916">${fr(ttc)}</td></tr></table>
${mentionTva(taux, pays) ? `<div style="margin-top:14px;font-size:13px"><b>${mentionTva(taux, pays)}</b></div>` : ""}
<div style="margin-top:22px;padding:12px 16px;border:1px solid #9cc7a4;background:#eef7f0;border-radius:10px"><b>Facture acquittée</b> le ${jour(payee)}, payée via Mollie (référence ${esc(ref)}).</div>
<div style="margin-top:26px;color:#7a6e62;font-size:12px">Nature de l'opération : prestation de services (abonnement logiciel en ligne). Pas d'escompte pour paiement anticipé.
En cas de retard de paiement : pénalités égales à trois fois le taux d'intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement (art. L. 441-10 du Code de commerce).
Conditions générales de vente : dosisbar.com/cgv.html</div>
</div></body></html>`;
}

async function facturer(admin: any, p: any, etab: string, ab: Record<string, unknown> | null) {
  const ttc = +p.amount.value;
  if (p.status !== "paid" || !(ttc > 0)) return;
  DEV = String(p.amount.currency || "EUR");
  const taux = p.metadata?.tva != null ? +p.metadata.tva : ab?.tva_taux != null ? +ab.tva_taux : 20;
  const { data: e } = await admin.from("etablissements").select("nom,options").eq("id", etab).maybeSingle();
  const { data: m } = await admin.from("membres").select("email").eq("etab_id", etab).eq("role", "patron").order("depuis").limit(1).maybeSingle();
  const fac = (e?.options?.facturation || {}) as Record<string, string>;
  const client: Client = {
    nom: fac.nom || e?.nom || "Client", adresse: fac.adresse || "", siret: fac.siret || "", tva: fac.tva || "",
    email: fac.email || m?.email || "", etablissement: e?.nom || "",
  };
  const formule = String(p.metadata?.formule || ab?.formule || "bar");
  const resto = p.metadata?.resto ?? ab?.resto;
  const nom = `Abonnement ${(p.metadata?.annuel ?? ab?.annuel) ? "annuel " : ""}${NOMS[formule] || "Dosis Bar"}${resto && formule !== "pro" ? " + Dosis Resto" : ""}`;
  const payee = new Date(p.paidAt || Date.now());
  const verif = p.sequenceType === "first" && formule === "pilote";
  const ht = Math.round((ttc / (1 + taux / 100)) * 100) / 100, tva = Math.round((ttc - ht) * 100) / 100;
  const pays = String(e?.options?.pays || "FR");
  const lignes: Ligne[] = [{
    designation: verif ? "Validation du moyen de paiement – offre pilote" : nom,
    detail: verif ? "Les 2 premiers mois de l'offre pilote sont offerts" : `Période du ${jour(payee)} au ${jour(plusMois(payee, (p.metadata?.annuel ?? ab?.annuel) ? 12 : 1))}`,
    qte: 1, pu_ht: ht,
  }];
  const { data: f, error } = await admin.rpc("emettre_facture", {
    p_paiement: p.id, p_etab: etab, p_payee: payee.toISOString(), p_client: client, p_lignes: lignes,
    p_ht: ht, p_tva: tva, p_ttc: ttc, p_html: htmlFacture(client, lignes, ht, tva, ttc, payee, p.id, taux, pays),
  });
  if (error) throw error;
  if (f && DEV !== "EUR") await admin.from("factures").update({ devise: DEV }).eq("numero", f.numero);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!f || f.envoyee_le || !key || !client.email) return;
  let lg = "fr"; try { const { data: et } = await admin.from("etablissements").select("options").eq("id", etab).single(); lg = et?.options?.langue || "fr"; } catch (_) { /* français */ }
  const sujet = lg === "es" ? `Su factura Dosis Bar ${f.numero}` : lg === "en" ? `Your Dosis Bar invoice ${f.numero}` : `Votre facture Dosis Bar ${f.numero}`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Dosis Bar <contact@dosisbar.com>", to: [client.email], bcc: ["contact@dosisbar.com"], reply_to: "contact@dosisbar.com",
      subject: sujet, html: f.html,
    }),
  });
  if (r.ok) await admin.from("factures").update({ envoyee_le: new Date().toISOString() }).eq("numero", f.numero);
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
      if (p.status === "paid" && (!(ab?.mollie_abonnement) || ab?.statut !== "actif")) {
        // Nouveau moyen de paiement après un impayé ou une résiliation : on remplace l'ancien abonnement Mollie
        if (ab?.mollie_abonnement && ab?.mollie_client) {
          try { await mollie(`/customers/${ab.mollie_client}/subscriptions/${ab.mollie_abonnement}`, "DELETE"); } catch (_) { /* déjà annulé */ }
        }
        const formule = String(p.metadata.formule), resto = !!p.metadata.resto, ttc = +p.metadata.ttc, annuel = !!p.metadata.annuel;
        const devise = String(p.metadata.devise || p.amount.currency || "EUR"), tva = p.metadata.tva != null ? +p.metadata.tva : 20, grille = String(p.metadata.grille || "v1");
        const debut = plusMois(new Date(), formule === "pilote" ? 2 : annuel ? 12 : 1);
        const s = await mollie(`/customers/${p.customerId}/subscriptions`, "POST", {
          amount: { currency: devise, value: euros(ttc) }, interval: annuel ? "12 months" : "1 month", startDate: iso(debut),
          description: `${NOMS[formule]}${resto ? " + Dosis Resto" : ""} – ${etab.slice(0, 8)}`,
          webhookUrl: url + "/functions/v1/mollie-webhook", metadata: { etab, tva },
        });
        await admin.from("abonnements").upsert({
          etab_id: etab, formule, resto, annuel, statut: "actif", montant_ttc: ttc, paye_jusqu: iso(debut),
          mollie_client: p.customerId, mollie_abonnement: s.id, grille, devise, tva_taux: tva, maj: new Date().toISOString(),
        });
      } else if (["failed", "canceled", "expired"].includes(p.status) && ab?.statut === "en_attente") {
        await admin.from("abonnements").update({ statut: "aucun", maj: new Date().toISOString() }).eq("etab_id", etab);
      }
    } else if (p.subscriptionId) {
      if (p.status === "paid") {
        const base = ab?.paye_jusqu ? new Date(String(ab.paye_jusqu)) : new Date();
        const fin = plusMois(base < new Date() ? new Date() : base, ab?.annuel ? 12 : 1);
        await admin.from("abonnements").update({ statut: "actif", paye_jusqu: iso(fin), maj: new Date().toISOString() }).eq("etab_id", etab);
      } else if (["failed", "charged_back"].includes(p.status)) {
        await admin.from("abonnements").update({ statut: "impaye", maj: new Date().toISOString() }).eq("etab_id", etab);
      }
    }
    await facturer(admin, p, etab, ab);
    return new Response("ok");
  } catch (_) {
    return new Response("erreur", { status: 500 }); // Mollie réessaiera plus tard
  }
});

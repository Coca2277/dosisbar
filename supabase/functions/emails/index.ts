// Emails automatiques Dosis Bar : bienvenue, fin d'essai, paiement refusé.
// Appelée chaque heure par pg_cron. Sans effet si rien n'est dû : chaque email n'est envoyé qu'une fois (table emails_envoyes).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP = "https://dosisbar.com/app.html";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const jour = (d: string | null) => d ? new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : "";
const auj = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));

function page(titre: string, corps: string, bouton: string, lien: string) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titre)}</title></head>
<body style="margin:0;background:#f6f2ec;font-family:Helvetica,Arial,sans-serif;color:#1d1916">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="font-size:20px;font-weight:700;margin-bottom:18px"><img src="https://dosisbar.com/icons/logo-facture.png" width="21" height="24" alt="" style="vertical-align:-4px;margin-right:8px">Dosis Bar</div>
<div style="background:#fff;border-radius:14px;padding:28px 26px;font-size:15px;line-height:1.55">
<h1 style="font-size:21px;line-height:1.3;margin:0 0 16px">${esc(titre)}</h1>
${corps}
<p style="margin:26px 0 6px"><a href="${lien}" style="display:inline-block;background:#E8A33C;color:#1d1916;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">${esc(bouton)}</a></p>
</div>
<p style="font-size:12px;color:#7a6e62;margin:16px 6px;line-height:1.5">Une question ? Répondez simplement à cet email.<br>
Dosis Bar · Paris Rhum Club SAS · <a href="https://dosisbar.com" style="color:#7a6e62">dosisbar.com</a></p>
</div></body></html>`;
}

function contenu(r: { type: string; nom: string; fin_essai: string | null; paye_jusqu: string | null }) {
  const nom = esc(r.nom);
  if (r.type === "bienvenue") {
    return {
      sujet: `Bienvenue sur Dosis Bar, ${r.nom}`,
      html: page(`Bienvenue sur Dosis Bar, ${r.nom}`,
        `<p>Votre établissement <b>${nom}</b> est prêt. Vous avez <b>14 jours d'essai gratuit</b>, toutes les fonctions incluses, jusqu'au <b>${jour(r.fin_essai)}</b>. Aucune carte bancaire n'est demandée.</p>
<p style="margin-bottom:6px">Pour bien démarrer, trois gestes suffisent :</p>
<ol style="padding-left:20px;margin:0">
<li style="margin-bottom:6px"><b>Remplissez votre carte</b> : vos produits avec leur prix d'achat. Dosis Bar calcule le coût de chaque verre et votre marge.</li>
<li style="margin-bottom:6px"><b>Ouvrez le service</b> le soir : vous voyez ce que le bar gagne, en direct.</li>
<li><b>Faites un premier inventaire</b> : Dosis Bar vous montre ce qui manque dans les bouteilles.</li>
</ol>
<p>Vous pouvez inviter votre équipe depuis Réglages › Équipe.</p>`,
        "Ouvrir Dosis Bar", APP),
    };
  }
  if (r.type === "essai_fin") {
    const fin = r.fin_essai ? new Date(r.fin_essai + "T00:00:00") : auj();
    const n = Math.round((fin.getTime() - new Date(auj().toDateString()).getTime()) / 864e5);
    const quand = n <= 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`;
    return {
      sujet: `Votre essai Dosis Bar se termine ${quand}`,
      html: page(`Votre essai se termine ${quand}`,
        `<p>L'essai gratuit de <b>${nom}</b> se termine le <b>${jour(r.fin_essai)}</b>.</p>
<p>Pour continuer à suivre vos marges, vos stocks et vos services, choisissez votre formule en quelques secondes : <b>Dosis Bar à 29,99 € HT par mois</b>, sans engagement, résiliable à tout moment.</p>
<p>Sans abonnement, rien n'est perdu : vos données restent enregistrées et consultables, mais vous ne pourrez plus les modifier.</p>`,
        "Choisir ma formule", APP + "?ouvrir=abonnement"),
    };
  }
  return {
    sujet: "Votre paiement Dosis Bar n'a pas abouti",
    html: page("Votre paiement n'a pas abouti",
      `<p>Le dernier prélèvement de l'abonnement de <b>${nom}</b> a été refusé par votre banque. Rien n'a été débité.</p>
<p>Votre accès reste ouvert${r.paye_jusqu ? ` jusqu'au <b>${jour(addDays(r.paye_jusqu, 15))}</b>` : " pendant 15 jours"}. Pour ne pas l'interrompre, renouvelez votre moyen de paiement depuis l'application : Réglages › Mon abonnement.</p>
<p>Causes fréquentes : carte expirée, plafond atteint, ou validation demandée par la banque.</p>`,
      "Mettre à jour mon paiement", APP + "?ouvrir=abonnement"),
  };
}
function addDays(d: string, n: number) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return new Response("RESEND_API_KEY manquante", { status: 500 });
  const { data, error } = await admin.rpc("emails_a_envoyer");
  if (error) { console.error(error); return new Response("erreur", { status: 500 }); }
  let envoyes = 0;
  for (const r of (data || []).slice(0, 50)) {
    // On réserve d'abord : si deux appels se croisent, un seul envoie
    const { error: dup } = await admin.from("emails_envoyes").insert({ etab_id: r.etab_id, type: r.type, cle: r.cle });
    if (dup) continue;
    const c = contenu(r);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Dosis Bar <contact@dosisbar.com>", to: [r.email], reply_to: "contact@dosisbar.com", subject: c.sujet, html: c.html }),
    });
    if (res.ok) envoyes++;
    else { console.error("Resend", res.status, await res.text()); await admin.from("emails_envoyes").delete().match({ etab_id: r.etab_id, type: r.type, cle: r.cle }); }
  }
  return new Response(JSON.stringify({ dus: (data || []).length, envoyes }), { headers: { "Content-Type": "application/json" } });
});

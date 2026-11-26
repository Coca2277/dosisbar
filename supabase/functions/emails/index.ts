// Emails automatiques Dosis Bar : bienvenue, fin d'essai, paiement refusé.
// Appelée chaque heure par pg_cron. Sans effet si rien n'est dû : chaque email n'est envoyé qu'une fois (table emails_envoyes).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP = "https://dosisbar.com/app.html";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
type Lang = "fr" | "es" | "en";
const LOC: Record<Lang, string> = { fr: "fr-FR", es: "es-ES", en: "en-GB" };
const jour = (d: string | null, l: Lang = "fr") => d ? new Date(d + "T12:00:00Z").toLocaleDateString(LOC[l], { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : "";
const auj = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));

const PIED: Record<Lang, string> = {
  fr: "Une question ? Répondez simplement à cet email.",
  es: "¿Alguna pregunta? Responda simplemente a este email.",
  en: "Any questions? Just reply to this email.",
};
function page(titre: string, corps: string, bouton: string, lien: string, l: Lang) {
  return `<!DOCTYPE html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titre)}</title></head>
<body style="margin:0;background:#f6f2ec;font-family:Helvetica,Arial,sans-serif;color:#1d1916">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="font-size:20px;font-weight:700;margin-bottom:18px"><img src="https://dosisbar.com/icons/logo-facture.png" width="21" height="24" alt="" style="vertical-align:-4px;margin-right:8px">Dosis Bar</div>
<div style="background:#fff;border-radius:14px;padding:28px 26px;font-size:15px;line-height:1.55">
<h1 style="font-size:21px;line-height:1.3;margin:0 0 16px">${esc(titre)}</h1>
${corps}
<p style="margin:26px 0 6px"><a href="${lien}" style="display:inline-block;background:#E8A33C;color:#1d1916;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">${esc(bouton)}</a></p>
</div>
<p style="font-size:12px;color:#7a6e62;margin:16px 6px;line-height:1.5">${PIED[l]}<br>
Dosis Bar · Paris Rhum Club SAS · <a href="https://dosisbar.com" style="color:#7a6e62">dosisbar.com</a></p>
</div></body></html>`;
}

type Row = { type: string; nom: string; fin_essai: string | null; paye_jusqu: string | null };
const PRIX_BAR: Record<string, [number, string]> = { EUR: [35, "€"], GBP: [32, "£"], CHF: [45, "CHF"], USD: [49, "$"] };
function prixBar(pays: string, l: Lang) {
  const dev = ({ GB: "GBP", CH: "CHF", US: "USD" } as Record<string, string>)[pays] || "EUR", [v, sym] = PRIX_BAR[dev];
  const m = dev === "EUR" ? (l === "en" ? `€${v}` : `${v} €`) : dev === "CHF" ? `${v} CHF` : `${sym}${v}`;
  const ttc = pays === "FR" ? { fr: " (42 € TTC)", es: " (42 € IVA incl.)", en: " (€42 incl. VAT)" }[l] : "";
  return { fr: `${m} HT par mois${ttc}`, es: `${m} sin IVA al mes${ttc}`, en: `${m} excl. VAT per month${ttc}` }[l];
}
function contenu(r: Row, l: Lang, pays = "FR") {
  const nom = esc(r.nom), APPL = APP + "?lang=" + l, GUIDE = "https://dosisbar.com/guide.html?lang=" + l;
  if (r.type === "bienvenue") {
    const fin = jour(r.fin_essai, l);
    const T = {
      fr: { s: `Bienvenue sur Dosis Bar, ${r.nom}`, b: "Ouvrir Dosis Bar",
        c: `<p>Votre établissement <b>${nom}</b> est prêt. Vous avez <b>14 jours d'essai gratuit</b>, toutes les fonctions incluses, jusqu'au <b>${fin}</b>. Aucune carte bancaire n'est demandée.</p>
<p style="margin-bottom:6px">Pour bien démarrer, trois gestes suffisent :</p>
<ol style="padding-left:20px;margin:0">
<li style="margin-bottom:6px"><b>Remplissez votre carte</b> : vos produits avec leur prix d'achat. Dosis Bar calcule le coût de chaque verre et votre marge.</li>
<li style="margin-bottom:6px"><b>Ouvrez le service</b> le soir : vous voyez ce que le bar gagne, en direct.</li>
<li><b>Faites un premier inventaire</b> : Dosis Bar vous montre ce qui manque dans les bouteilles.</li>
</ol>
<p>Vous pouvez inviter votre équipe depuis Réglages › Équipe. Et pour tout le reste, le <a href="${GUIDE}" style="color:#B8741A">guide d'utilisation</a> vous explique chaque écran pas à pas.</p>` },
      es: { s: `Bienvenido a Dosis Bar, ${r.nom}`, b: "Abrir Dosis Bar",
        c: `<p>Su establecimiento <b>${nom}</b> está listo. Tiene <b>14 días de prueba gratuita</b>, con todas las funciones incluidas, hasta el <b>${fin}</b>. No se pide ninguna tarjeta bancaria.</p>
<p style="margin-bottom:6px">Para empezar bien, bastan tres gestos:</p>
<ol style="padding-left:20px;margin:0">
<li style="margin-bottom:6px"><b>Rellene su carta</b>: sus productos con su precio de compra. Dosis Bar calcula el coste de cada copa y su margen.</li>
<li style="margin-bottom:6px"><b>Abra el servicio</b> por la noche: ve lo que gana el bar, en directo.</li>
<li><b>Haga un primer inventario</b>: Dosis Bar le muestra lo que falta en las botellas.</li>
</ol>
<p>Puede invitar a su equipo desde Ajustes › Equipo. Y para todo lo demás, la <a href="${GUIDE}" style="color:#B8741A">guía de uso</a> le explica cada pantalla paso a paso.</p>
<p>Compruebe en Ajustes › País, IVA y moneda que su país está bien elegido: los tipos de IVA de sus cálculos dependen de él.</p>` },
      en: { s: `Welcome to Dosis Bar, ${r.nom}`, b: "Open Dosis Bar",
        c: `<p>Your venue <b>${nom}</b> is ready. You have a <b>14-day free trial</b>, all features included, until <b>${fin}</b>. No card needed.</p>
<p style="margin-bottom:6px">Three steps are enough to get going:</p>
<ol style="padding-left:20px;margin:0">
<li style="margin-bottom:6px"><b>Fill in your menu</b>: your products with their purchase price. Dosis Bar works out the cost of every glass and your margin.</li>
<li style="margin-bottom:6px"><b>Open service</b> in the evening: you see what the bar is making, live.</li>
<li><b>Do a first stock count</b>: Dosis Bar shows you what's missing from the bottles.</li>
</ol>
<p>You can invite your team from Settings › Team. For everything else, the <a href="${GUIDE}" style="color:#B8741A">user guide</a> walks you through each screen step by step.</p>
<p>Check in Settings › Country, VAT and currency that your country is right: the tax rates in your calculations depend on it.</p>` },
    }[l];
    return { sujet: T.s, html: page(T.s, T.c, T.b, APPL, l) };
  }
  if (r.type === "essai_fin") {
    const finD = r.fin_essai ? new Date(r.fin_essai + "T00:00:00") : auj();
    const n = Math.round((finD.getTime() - new Date(auj().toDateString()).getTime()) / 864e5), fin = jour(r.fin_essai, l);
    const quand = {
      fr: n <= 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`,
      es: n <= 0 ? "hoy" : n === 1 ? "mañana" : `dentro de ${n} días`,
      en: n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`,
    }[l];
    const T = {
      fr: { s: `Votre essai Dosis Bar se termine ${quand}`, t: `Votre essai se termine ${quand}`, b: "Choisir ma formule",
        c: `<p>L'essai gratuit de <b>${nom}</b> se termine le <b>${fin}</b>.</p>
<p>Pour continuer à suivre vos marges, vos stocks et vos services, choisissez votre formule en quelques secondes : <b>Dosis Bar à ${prixBar(pays, "fr")}</b>, sans engagement, résiliable à tout moment. Ou 2 mois offerts en payant à l'année.</p>
<p>Sans abonnement, rien n'est perdu : vos données restent enregistrées et consultables, mais vous ne pourrez plus les modifier.</p>` },
      es: { s: `Su prueba de Dosis Bar termina ${quand}`, t: `Su prueba termina ${quand}`, b: "Elegir mi plan",
        c: `<p>La prueba gratuita de <b>${nom}</b> termina el <b>${fin}</b>.</p>
<p>Para seguir controlando sus márgenes, su stock y sus servicios, elija su plan en unos segundos: <b>Dosis Bar por ${prixBar(pays, "es")}</b>, sin permanencia, cancelable en cualquier momento. O 2 meses gratis pagando al año.</p>
<p>Sin suscripción no se pierde nada: sus datos siguen guardados y consultables, pero ya no podrá modificarlos.</p>` },
      en: { s: `Your Dosis Bar trial ends ${quand}`, t: `Your trial ends ${quand}`, b: "Choose my plan",
        c: `<p>The free trial for <b>${nom}</b> ends on <b>${fin}</b>.</p>
<p>To keep tracking your margins, stock and services, choose your plan in a few seconds: <b>Dosis Bar at ${prixBar(pays, "en")}</b>, no commitment, cancel anytime. Or get 2 months free by paying yearly.</p>
<p>Without a subscription nothing is lost: your data stays saved and viewable, but you won't be able to edit it any more.</p>` },
    }[l];
    return { sujet: T.s, html: page(T.t, T.c, T.b, APPL + "&ouvrir=abonnement", l) };
  }
  const lim = r.paye_jusqu ? jour(addDays(r.paye_jusqu, 15), l) : "";
  const T = {
    fr: { s: "Votre paiement Dosis Bar n'a pas abouti", t: "Votre paiement n'a pas abouti", b: "Mettre à jour mon paiement",
      c: `<p>Le dernier prélèvement de l'abonnement de <b>${nom}</b> a été refusé par votre banque. Rien n'a été débité.</p>
<p>Votre accès reste ouvert${lim ? ` jusqu'au <b>${lim}</b>` : " pendant 15 jours"}. Pour ne pas l'interrompre, renouvelez votre moyen de paiement depuis l'application : Réglages › Mon abonnement.</p>
<p>Causes fréquentes : carte expirée, plafond atteint, ou validation demandée par la banque.</p>` },
    es: { s: "Su pago de Dosis Bar no se ha completado", t: "Su pago no se ha completado", b: "Actualizar mi pago",
      c: `<p>Su banco ha rechazado el último cargo de la suscripción de <b>${nom}</b>. No se ha cobrado nada.</p>
<p>Su acceso sigue abierto${lim ? ` hasta el <b>${lim}</b>` : " durante 15 días"}. Para no interrumpirlo, renueve su medio de pago desde la aplicación: Ajustes › Mi suscripción.</p>
<p>Causas frecuentes: tarjeta caducada, límite alcanzado o validación pedida por el banco.</p>` },
    en: { s: "Your Dosis Bar payment didn't go through", t: "Your payment didn't go through", b: "Update my payment",
      c: `<p>Your bank declined the latest subscription payment for <b>${nom}</b>. Nothing was charged.</p>
<p>Your access stays open${lim ? ` until <b>${lim}</b>` : " for 15 days"}. To avoid any interruption, update your payment method in the app: Settings › My subscription.</p>
<p>Common causes: expired card, limit reached, or the bank asking for confirmation.</p>` },
  }[l];
  return { sujet: T.s, html: page(T.t, T.c, T.b, APPL + "&ouvrir=abonnement", l) };
}
function addDays(d: string, n: number) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return new Response("RESEND_API_KEY manquante", { status: 500 });
  const { data, error } = await admin.rpc("emails_a_envoyer");
  if (error) { console.error(error); return new Response("erreur", { status: 500 }); }
  let envoyes = 0;
  // langue de chaque établissement (Réglages de l'app), français par défaut
  const ids = [...new Set((data || []).map((r: { etab_id: string }) => r.etab_id))];
  const langs: Record<string, Lang> = {}, paysDe: Record<string, string> = {};
  if (ids.length) { const { data: ets } = await admin.from("etablissements").select("id,options").in("id", ids);
    for (const e of ets || []) { const lg = e.options?.langue; langs[e.id] = lg === "es" || lg === "en" ? lg : "fr"; paysDe[e.id] = e.options?.pays || "FR"; } }
  for (const r of (data || []).slice(0, 50)) {
    // On réserve d'abord : si deux appels se croisent, un seul envoie
    const { error: dup } = await admin.from("emails_envoyes").insert({ etab_id: r.etab_id, type: r.type, cle: r.cle });
    if (dup) continue;
    const c = contenu(r, langs[r.etab_id] || "fr", paysDe[r.etab_id] || "FR");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Dosis Bar <contact@dosisbar.com>", to: [r.email], reply_to: "contact@dosisbar.com", subject: c.sujet, html: c.html }),
    });
    if (res.ok) envoyes++;
    else { console.error("Resend", res.status, await res.text()); await admin.from("emails_envoyes").delete().match({ etab_id: r.etab_id, type: r.type, cle: r.cle }); }
  }
  return new Response(JSON.stringify({ dus: (data || []).length, envoyes }), { headers: { "Content-Type": "application/json" } });
});

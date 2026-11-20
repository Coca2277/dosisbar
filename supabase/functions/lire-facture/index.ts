// Dosis Bar — lecture automatique d'une facture fournisseur (photo ou PDF) par IA.
// Réservé aux formules Pro, à l'essai gratuit et aux comptes admin. Secret requis : ANTHROPIC_API_KEY.
// Facultatif : ANTHROPIC_MODEL (modèle utilisé, par défaut claude-sonnet-5-5).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const LIMITE_JOUR = 40;
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const OUTIL = {
  name: "facture",
  description: "Enregistre le contenu d'une facture ou d'un bon de livraison fournisseur.",
  input_schema: {
    type: "object",
    properties: {
      est_facture: { type: "boolean", description: "false si le document n'est pas une facture, un ticket ou un bon de livraison d'achat" },
      fournisseur: { type: "string", description: "Nom commercial du fournisseur (vendeur), pas du client" },
      date: { type: "string", description: "Date de la facture au format AAAA-MM-JJ, vide si absente" },
      numero: { type: "string", description: "Numéro de facture, vide si absent" },
      total_ht: { type: "number", description: "Total hors taxes de la facture, 0 si absent" },
      total_ttc: { type: "number", description: "Total TTC de la facture, 0 si absent" },
      lignes: {
        type: "array",
        description: "Une entrée par article acheté. Exclure frais de port, consignes, remises globales, sous-totaux et lignes de TVA.",
        items: {
          type: "object",
          properties: {
            designation: { type: "string", description: "Libellé de l'article tel qu'écrit sur la facture" },
            quantite: { type: "number", description: "Nombre d'unités reçues (bouteilles, canettes, pièces, kg ou litres). Si la facture compte en cartons ou colis et indique le nombre d'unités par carton, convertir en unités." },
            unite: { type: "string", description: "Unité de la quantité : bouteille, canette, piece, kg, litre, carton, fut" },
            contenance_cl: { type: "number", description: "Contenance d'une bouteille ou canette en centilitres si indiquée (70 cl, 1 L = 100), sinon 0" },
            prix_unitaire_ht: { type: "number", description: "Prix hors taxes d'UNE unité de la quantité, remise de ligne déduite. Si seul le prix TTC est donné, le convertir en HT avec le taux de TVA de la ligne." },
            total_ht: { type: "number", description: "Montant HT de la ligne" },
          },
          required: ["designation", "quantite", "unite", "prix_unitaire_ht"],
        },
      },
    },
    required: ["est_facture", "fournisseur", "lignes"],
  },
};

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

    const { data: acc } = await userClient.rpc("acces_etab", { p_etab: etab });
    const ok = acc && (acc.admin || acc.etat === "essai" || (acc.etat === "abonne" && acc.formule === "pro"));
    if (!ok) return json({ error: "La lecture automatique des factures fait partie de la formule Pro", code: "PRO" }, 403);

    const depuis = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { count } = await admin.from("factures_lues").select("id", { count: "exact", head: true }).eq("etab_id", etab).gte("le", depuis);
    if ((count || 0) >= LIMITE_JOUR) return json({ error: `Limite de ${LIMITE_JOUR} factures lues par jour atteinte. Réessayez demain.` }, 429);

    const type = String(b.type || ""), data = String(b.fichier || "");
    if (!TYPES.includes(type) || !data) return json({ error: "Envoyez une photo (JPEG, PNG) ou un PDF" }, 400);
    if (data.length > 9_000_000) return json({ error: "Fichier trop lourd (6 Mo maximum)" }, 400);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Lecture des factures pas encore activée (clé manquante)" }, 503);
    const doc = type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: type, data } }
      : { type: "image", source: { type: "base64", media_type: type, data } };

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
        max_tokens: 4000,
        tools: [OUTIL],
        tool_choice: { type: "tool", name: "facture" },
        messages: [{ role: "user", content: [doc, { type: "text", text:
          "Voici une facture (ou un bon de livraison) d'un fournisseur d'un bar ou d'un restaurant en France. " +
          "Lis chaque article acheté et remplis l'outil « facture ». Les prix sont en euros. " +
          "Garde les libellés tels qu'ils sont écrits. N'invente rien : si une information est illisible, laisse-la vide ou à 0." }] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) { console.error("Anthropic", r.status, JSON.stringify(j).slice(0, 500)); return json({ error: "La lecture n'a pas abouti. Réessayez avec une photo plus nette." }, 502); }
    const out = (j.content || []).find((c: { type: string }) => c.type === "tool_use")?.input;
    if (!out) return json({ error: "Rien n'a pu être lu sur ce document." }, 422);
    if (out.est_facture === false) return json({ error: "Ce document ne ressemble pas à une facture d'achat." }, 422);

    const lignes = (out.lignes || []).filter((l: { designation?: string; quantite?: number }) => l && l.designation && +l.quantite > 0);
    await admin.from("factures_lues").insert({ etab_id: etab, fournisseur: String(out.fournisseur || "").slice(0, 120), lignes: lignes.length });
    return json({ ...out, lignes });
  } catch (e) {
    console.error(e);
    return json({ error: "Erreur pendant la lecture de la facture" }, 500);
  }
});

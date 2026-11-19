// Dosis Bar — suppression d'un établissement ou d'un compte (appelée par l'app, utilisateur connecté)
// Actions : supprimer_etab {etab} (patron) · supprimer_compte
// Avant toute suppression, l'abonnement Mollie de l'établissement est arrêté.
// Les factures sont gardées 10 ans (pas de lien en cascade avec l'établissement).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function arreterMollie(admin: any, etab: string) {
  const { data: ab } = await admin.from("abonnements").select("mollie_client,mollie_abonnement").eq("etab_id", etab).maybeSingle();
  const key = Deno.env.get("MOLLIE_API_KEY");
  if (ab?.mollie_abonnement && ab?.mollie_client && key) {
    const r = await fetch(`https://api.mollie.com/v2/customers/${ab.mollie_client}/subscriptions/${ab.mollie_abonnement}`,
      { method: "DELETE", headers: { Authorization: "Bearer " + key } });
    if (!r.ok && r.status !== 404 && r.status !== 422) throw new Error("Impossible d'arrêter l'abonnement chez Mollie, réessayez dans un instant");
  }
}
async function supprimerEtab(admin: any, etab: string) {
  await arreterMollie(admin, etab);
  const { error } = await admin.from("etablissements").delete().eq("id", etab);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Connexion requise" }, 401);
    const uid = u.user.id;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json();

    if (b.action === "supprimer_etab") {
      const etab = String(b.etab || "");
      const { data: m } = await admin.from("membres").select("role").eq("etab_id", etab).eq("user_id", uid).maybeSingle();
      if (!m || m.role !== "patron") return json({ error: "Réservé au patron de l'établissement" }, 403);
      await supprimerEtab(admin, etab);
      return json({ ok: true });
    }

    if (b.action === "supprimer_compte") {
      const { data: ms } = await admin.from("membres").select("etab_id,role").eq("user_id", uid);
      for (const m of ms || []) {
        if (m.role === "patron") {
          const { count } = await admin.from("membres").select("user_id", { count: "exact", head: true }).eq("etab_id", m.etab_id).eq("role", "patron").neq("user_id", uid);
          if (!count) { await supprimerEtab(admin, m.etab_id); continue; }   // seul patron : l'établissement est supprimé
        }
        await admin.from("membres").delete().eq("etab_id", m.etab_id).eq("user_id", uid);
      }
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
});

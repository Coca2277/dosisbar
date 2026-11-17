-- Migration 12 : accès selon l'abonnement
-- Essai gratuit de 14 jours à partir de la création de l'établissement.
-- Les établissements créés avant le 18/11/2026 (premiers testeurs) sont gratuits jusqu'au 01/01/2027.
-- Après l'essai, sans abonnement : lecture seule (les données restent visibles, plus aucune modification).
-- Abonnement résilié : accès jusqu'à la fin de la période payée. Paiement refusé : 15 jours de grâce (CGV art. 10).
-- Les établissements dont un patron est administrateur (le fondateur) ne sont jamais bloqués.

create or replace function public._acces(p_etab uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e record; a record; auj date := (now() at time zone 'Europe/Paris')::date; fin date; ab boolean := false; adm boolean;
begin
  select id, cree_le into e from etablissements where id = p_etab;
  if not found then return jsonb_build_object('etat', 'essai'); end if;
  select * into a from abonnements where etab_id = p_etab;
  if found then
    ab := a.statut = 'actif'
       or (a.statut = 'annule' and a.paye_jusqu >= auj)
       or (a.statut = 'impaye' and a.paye_jusqu + 15 >= auj);
  end if;
  fin := (e.cree_le at time zone 'Europe/Paris')::date + 14;
  if e.cree_le < '2026-11-18 00:00+01' then fin := greatest(fin, date '2027-01-01'); end if;
  adm := exists (select 1 from membres m join admins d on d.user_id = m.user_id where m.etab_id = p_etab and m.role = 'patron');
  return jsonb_build_object(
    'etat', case when adm or ab then 'abonne' when auj < fin then 'essai' else 'lecture' end,
    'formule', case when adm then 'pro' when ab then a.formule end,
    'resto', case when adm then true when ab then a.formule = 'pro' or coalesce(a.resto, false) else auj < fin end,
    'fin_essai', fin,
    'statut', coalesce(a.statut, 'aucun'),
    'paye_jusqu', a.paye_jusqu,
    'admin', adm);
end $$;

-- Pour l'app (patron et barman) : uniquement pour un établissement dont on est membre.
create or replace function public.acces_etab(p_etab uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_membre(p_etab) then raise exception 'Accès refusé'; end if;
  return public._acces(p_etab);
end $$;
revoke all on function public._acces(uuid) from public, anon, authenticated;
grant execute on function public.acces_etab(uuid) to authenticated;

-- Garde-fou côté base : refuse les modifications en lecture seule.
create or replace function public._verif_ecriture() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_etab uuid;
begin
  v_etab := case when tg_op = 'DELETE' then old.etab_id else new.etab_id end;
  if public._acces(v_etab)->>'etat' = 'lecture' then
    raise exception 'Essai gratuit terminé : abonnez-vous pour continuer à modifier vos données.' using errcode = 'P0001', hint = 'abonnement';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['produits','cocktails','produit_formats','services','ventes','inventaires','pertes','cuisine',
                           'fournisseurs','commandes','stock_releves','etab_charges'] loop
    execute format('drop trigger if exists verif_ecriture on public.%I', t);
    execute format('create trigger verif_ecriture before insert or update or delete on public.%I for each row execute function public._verif_ecriture()', t);
  end loop;
end $$;

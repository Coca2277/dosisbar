-- =====================================================================
--  Dosis Bar — import des ventes de caisse (14 novembre 2026)
--  À exécuter une fois dans Supabase > SQL Editor (déjà inclus dans schema.sql)
-- =====================================================================

-- Mémoire des noms de la caisse -> produits de la carte (par établissement)
alter table public.etablissements add column if not exists alias_caisse jsonb not null default '{}'::jsonb;

-- Un fichier importé ne peut pas l'être deux fois
alter table public.services add column if not exists import_ref text;
create unique index if not exists services_import_unique on public.services(etab_id, import_ref) where import_ref is not null;

-- Une ligne de vente importée peut porter plusieurs verres
alter table public.ventes drop constraint if exists ventes_qte_check;
alter table public.ventes add constraint ventes_qte_check check (qte <> 0 and qte between -1000 and 1000);

-- Importer une soirée : crée un service clôturé, enregistre les ventes, baisse le stock
-- p_items : [{"t":"p"|"k","id":"uuid","q":3,"ttc":21.0}]  (ttc = total encaissé pour la ligne, facultatif)
create or replace function public.importer_ventes(p_etab uuid, p_le timestamptz, p_ref text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare s uuid; it jsonb; pr record; q int; unit numeric; ratio numeric; cout numeric; res jsonb;
begin
  if not est_patron(p_etab) then raise exception 'Réservé au patron'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Aucune vente à importer'; end if;
  if jsonb_array_length(p_items) > 2000 then raise exception 'Fichier trop grand'; end if;
  if p_ref is not null and exists(select 1 from services where etab_id = p_etab and import_ref = p_ref) then
    raise exception 'Ce fichier a déjà été importé';
  end if;

  insert into services(etab_id, ouvert_le, clos_le, import_ref) values (p_etab, coalesce(p_le, now()), coalesce(p_le, now()), p_ref)
    returning id into s;

  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'q')::int;
    if q is null or q = 0 or abs(q) > 1000 then raise exception 'Quantité invalide'; end if;
    if (it->>'t') not in ('p','k') then raise exception 'Type invalide'; end if;
    select * into pr from _prix_item(it->>'t', (it->>'id')::uuid, p_etab);
    cout := pr.ht - pr.marge;
    ratio := case when pr.prix_ttc > 0 then pr.ht / pr.prix_ttc else 1 / 1.2 end;
    unit := case when (it->>'ttc') is not null and (it->>'ttc')::numeric > 0 then (it->>'ttc')::numeric / q else pr.prix_ttc end;
    insert into ventes(etab_id, service_id, item_type, item_id, qte, prix_ttc, ht, marge_ht, par, le)
      values (p_etab, s, it->>'t', (it->>'id')::uuid, q, round(unit, 2), unit * ratio, unit * ratio - cout, auth.uid(), coalesce(p_le, now()));
    if (it->>'t') = 'p' then
      update produits set stock = greatest(0, stock - q * dose_cl / contenance_cl) where id = (it->>'id')::uuid and etab_id = p_etab;
    else
      update produits p set stock = greatest(0, p.stock - q * i.cl / p.contenance_cl)
        from cocktail_ingredients i where i.cocktail_id = (it->>'id')::uuid and i.produit_id = p.id and p.etab_id = p_etab;
    end if;
  end loop;

  update services set
    ca_ttc   = (select coalesce(sum(qte*prix_ttc),0) from ventes where service_id = s),
    ca_ht    = (select coalesce(sum(qte*ht),0)       from ventes where service_id = s),
    marge_ht = (select coalesce(sum(qte*marge_ht),0) from ventes where service_id = s),
    verres   = (select coalesce(sum(qte),0)          from ventes where service_id = s)
  where id = s
  returning jsonb_build_object('ca_ttc', ca_ttc, 'ca_ht', ca_ht, 'marge_ht', marge_ht, 'verres', verres) into res;
  return res;
end $$;

revoke all on function public.importer_ventes(uuid, timestamptz, text, jsonb) from public, anon;
grant execute on function public.importer_ventes(uuid, timestamptz, text, jsonb) to authenticated;

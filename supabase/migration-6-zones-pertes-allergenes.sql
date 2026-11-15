-- Migration 6 : prix par zone (comptoir, salle, terrasse, happy hour), offerts / casse / repas du personnel,
--               pertes déclarées hors service, allergènes des produits du bar

alter table public.produits add column if not exists allergenes text[] not null default '{}';
alter table public.ventes   add column if not exists zone text not null default 'comptoir';
alter table public.services add column if not exists pertes jsonb;

create table if not exists public.pertes (
  id       bigint generated always as identity primary key,
  etab_id  uuid not null references public.etablissements(id) on delete cascade,
  le       timestamptz not null default now(),
  type     text not null check (type in ('offert','casse','perso','jete','autre')),
  libelle  text not null check (char_length(libelle) between 1 and 120),
  qte      numeric(12,3) not null,
  unite    text not null,
  cout_ht  numeric(12,2) not null check (cout_ht >= 0),
  par      uuid references auth.users(id) on delete set null
);
create index if not exists pertes_etab_le on public.pertes(etab_id, le desc);
alter table public.pertes enable row level security;
drop policy if exists pertes_patron on public.pertes;
create policy pertes_patron on public.pertes for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
revoke all on public.pertes from anon;
grant select, insert, update, delete on public.pertes to authenticated;

-- Prix TTC d'un article selon la zone (usage interne)
create or replace function public._zone_prix(p_etab uuid, p_zone text, p_base numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when p_zone in ('offert','casse','perso') then 0
    when p_zone = 'comptoir' then p_base
    else coalesce((
      select case
        when coalesce((z->>'on')::boolean, false) is false then p_base
        when z->>'t' = 'pct' then greatest(0, round(p_base * (1 + s * coalesce((z->>'v')::numeric, 0) / 100), 2))
        else greatest(0, round(p_base + s * coalesce((z->>'v')::numeric, 0), 2)) end
      from (select options->'zones'->p_zone as z, case when p_zone = 'hh' then -1 else 1 end as s
              from etablissements where id = p_etab) x), p_base) end;
$$;

-- Vendre (+1) ou annuler (-1) un article dans une zone ; les zones offert/casse/perso comptent une perte
create or replace function public.vendre2(p_etab uuid, p_type char, p_id uuid, p_delta int, p_zone text)
returns void
language plpgsql security definer set search_path = public as $$
declare s uuid; pr record; vendus int; prix numeric; ratio numeric; cout numeric; ht2 numeric;
begin
  if not est_membre(p_etab) then raise exception 'Accès refusé'; end if;
  if p_delta not in (1,-1) then raise exception 'Quantité invalide'; end if;
  if p_type not in ('p','k') then raise exception 'Type invalide'; end if;
  if p_zone not in ('comptoir','salle','terrasse','hh','offert','casse','perso') then raise exception 'Zone invalide'; end if;

  select id into s from services where etab_id = p_etab and clos_le is null;
  if s is null then
    if p_delta < 0 then return; end if;
    insert into services(etab_id) values (p_etab)
      on conflict (etab_id) where clos_le is null do nothing returning id into s;
    if s is null then select id into s from services where etab_id = p_etab and clos_le is null; end if;
  end if;

  if p_delta < 0 then
    select coalesce(sum(qte),0) into vendus from ventes
      where service_id = s and item_type = p_type and item_id = p_id and zone = p_zone;
    if vendus <= 0 then return; end if;
  end if;

  select * into pr from _prix_item(p_type, p_id, p_etab);
  cout  := pr.ht - pr.marge;
  ratio := case when pr.ht > 0 then pr.prix_ttc / pr.ht else 1.1 end;
  prix  := _zone_prix(p_etab, p_zone, pr.prix_ttc);
  ht2   := prix / ratio;
  insert into ventes(etab_id, service_id, item_type, item_id, qte, prix_ttc, ht, marge_ht, par, zone)
    values (p_etab, s, p_type, p_id, p_delta, prix, ht2, ht2 - cout, auth.uid(), p_zone);

  if p_type = 'p' then
    update produits set stock = greatest(0, stock - p_delta * dose_cl / contenance_cl)
      where id = p_id and etab_id = p_etab;
  else
    update produits p set stock = greatest(0, p.stock - p_delta * i.cl / p.contenance_cl)
      from cocktail_ingredients i where i.cocktail_id = p_id and i.produit_id = p.id and p.etab_id = p_etab;
  end if;
end $$;

-- L'ancienne fonction reste utilisable (applis pas encore mises à jour) : zone comptoir
create or replace function public.vendre(p_etab uuid, p_type char, p_id uuid, p_delta int)
returns void language plpgsql security definer set search_path = public as $$
begin perform vendre2(p_etab, p_type, p_id, p_delta, 'comptoir'); end $$;

create or replace function public.service_en_cours(p_etab uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s services; r jsonb; patron boolean;
begin
  if not est_membre(p_etab) then raise exception 'Accès refusé'; end if;
  patron := est_patron(p_etab);
  select * into s from services where etab_id = p_etab and clos_le is null;
  if not found then return jsonb_build_object('ouvert', false, 'items', '{}'::jsonb, 'items_z', '{}'::jsonb, 'ca_ttc', 0, 'verres', 0, 'marge_ht', case when patron then 0 end); end if;
  select jsonb_build_object(
      'ouvert', true, 'id', s.id, 'ouvert_le', s.ouvert_le,
      'ca_ttc', coalesce(sum(v.qte * v.prix_ttc), 0),
      'ca_ht',  case when patron then coalesce(sum(v.qte * v.ht), 0) end,
      'marge_ht', case when patron then coalesce(sum(v.qte * v.marge_ht), 0) end,
      'verres', coalesce(sum(v.qte) filter (where v.zone not in ('offert','casse','perso')), 0),
      'items', coalesce((select jsonb_object_agg(k, q) from (
          select item_type || item_id::text as k, sum(qte) as q from ventes
          where service_id = s.id group by 1 having sum(qte) > 0) t), '{}'::jsonb),
      'items_z', coalesce((select jsonb_object_agg(k, q) from (
          select item_type || item_id::text || '@' || zone as k, sum(qte) as q from ventes
          where service_id = s.id group by 1 having sum(qte) > 0) t), '{}'::jsonb))
    into r from ventes v where v.service_id = s.id;
  return r;
end $$;

create or replace function public.cloturer_service(p_etab uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare s uuid; r jsonb; pz jsonb;
begin
  if not est_membre(p_etab) then raise exception 'Accès refusé'; end if;
  select id into s from services where etab_id = p_etab and clos_le is null for update;
  if s is null then return null; end if;
  select coalesce(jsonb_object_agg(zone, jsonb_build_object('n', n, 'c', c)), '{}'::jsonb) into pz from (
    select zone, sum(qte) as n, round(-sum(qte * marge_ht), 2) as c from ventes
     where service_id = s and zone in ('offert','casse','perso') group by zone having sum(qte) > 0) t;
  update services set clos_le = now(),
    ca_ttc   = (select coalesce(sum(qte*prix_ttc),0) from ventes where service_id = s),
    ca_ht    = (select coalesce(sum(qte*ht),0)       from ventes where service_id = s),
    marge_ht = (select coalesce(sum(qte*marge_ht),0) from ventes where service_id = s),
    verres   = (select coalesce(sum(qte),0)          from ventes where service_id = s and zone not in ('offert','casse','perso')),
    pertes   = pz
  where id = s
  returning jsonb_build_object('ca_ttc', ca_ttc, 'verres', verres,
            'marge_ht', case when est_patron(p_etab) then marge_ht end) into r;
  return r;
end $$;

revoke all on function public._zone_prix(uuid,text,numeric) from public, anon, authenticated;
revoke all on function public.vendre2(uuid,char,uuid,int,text) from public, anon;
grant execute on function public.vendre2(uuid,char,uuid,int,text) to authenticated;

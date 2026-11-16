-- Migration 8 : formats de vente (vin au verre, pichet, bouteille ; bière pression galopin, demi, pinte…)
--               et perte au service (mousse et purge du fût, vin oxydé…)

alter table public.produits add column if not exists format_nom text;
alter table public.produits add column if not exists perte_pct numeric(5,2) not null default 0;
alter table public.produits drop constraint if exists produits_perte_check;
alter table public.produits add constraint produits_perte_check check (perte_pct >= 0 and perte_pct <= 60);

create table if not exists public.produit_formats (
  id         uuid primary key default gen_random_uuid(),
  etab_id    uuid not null references public.etablissements(id) on delete cascade,
  produit_id uuid not null references public.produits(id) on delete cascade,
  nom        text not null check (char_length(nom) between 1 and 40),
  dose_cl    numeric(8,2) not null check (dose_cl > 0),
  prix_ttc   numeric(10,2) not null check (prix_ttc >= 0),
  ordre      int not null default 0
);
create index if not exists produit_formats_produit on public.produit_formats(produit_id);
alter table public.produit_formats enable row level security;
create policy produit_formats_patron on public.produit_formats for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
revoke all on public.produit_formats from anon;
grant select, insert, update, delete on public.produit_formats to authenticated;

alter table public.ventes drop constraint if exists ventes_item_type_check;
alter table public.ventes add constraint ventes_item_type_check check (item_type in ('p','k','f'));

-- Coût HT d'un centilitre servi, perte comprise
create or replace function public._cout_cl(p produits) returns numeric language sql immutable as $$
  select p.prix_achat_ht / nullif(p.contenance_cl, 0) / (1 - coalesce(p.perte_pct, 0) / 100);
$$;

create or replace function public._prix_item(p_type char, p_id uuid, p_etab uuid,
  out prix_ttc numeric, out ht numeric, out marge numeric)
language plpgsql stable security definer set search_path = public as $$
declare cout numeric := 0; alc boolean := false; p produits; c cocktails; f produit_formats;
begin
  if p_type = 'p' then
    select * into p from produits where id = p_id and etab_id = p_etab;
    if not found then raise exception 'Article introuvable'; end if;
    prix_ttc := p.prix_vente_ttc; alc := p.alcool; cout := coalesce(_cout_cl(p), 0) * p.dose_cl;
  elsif p_type = 'f' then
    select * into f from produit_formats where id = p_id and etab_id = p_etab;
    if not found then raise exception 'Article introuvable'; end if;
    select * into p from produits where id = f.produit_id;
    prix_ttc := f.prix_ttc; alc := p.alcool; cout := coalesce(_cout_cl(p), 0) * f.dose_cl;
  else
    select * into c from cocktails where id = p_id and etab_id = p_etab;
    if not found then raise exception 'Article introuvable'; end if;
    prix_ttc := c.prix_vente_ttc; cout := c.extras_ht;
    select coalesce(sum(coalesce(_cout_cl(pr), 0) * i.cl), 0) + cout, coalesce(bool_or(pr.alcool), false)
      into cout, alc
      from cocktail_ingredients i join produits pr on pr.id = i.produit_id where i.cocktail_id = p_id;
  end if;
  ht := prix_ttc / (case when alc then 1.2 else 1.1 end);
  marge := ht - cout;
end $$;
revoke all on function public._prix_item(char,uuid,uuid) from public, anon, authenticated;

-- Baisse (ou remonte) le stock pour q articles vendus (usage interne)
create or replace function public._sortie_stock(p_etab uuid, p_type char, p_id uuid, q numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'p' then
    update produits set stock = greatest(0, stock - q * dose_cl / contenance_cl) where id = p_id and etab_id = p_etab;
  elsif p_type = 'f' then
    update produits p set stock = greatest(0, p.stock - q * f.dose_cl / p.contenance_cl)
      from produit_formats f where f.id = p_id and p.id = f.produit_id and p.etab_id = p_etab;
  else
    update produits p set stock = greatest(0, p.stock - q * i.cl / p.contenance_cl)
      from cocktail_ingredients i where i.cocktail_id = p_id and i.produit_id = p.id and p.etab_id = p_etab;
  end if;
end $$;
revoke all on function public._sortie_stock(uuid,char,uuid,numeric) from public, anon, authenticated;

create or replace function public.carte_service(p_etab uuid)
returns table(item_type char(1), item_id uuid, nom text, categorie text, prix_ttc numeric, disponible boolean)
language sql stable security definer set search_path = public as $$
  select 'p'::char(1), p.id, p.nom || coalesce(' · ' || nullif(p.format_nom, ''), ''), p.categorie, p.prix_vente_ttc, p.stock * p.contenance_cl >= p.dose_cl
    from produits p where p.etab_id = p_etab and est_membre(p_etab)
  union all
  select 'f'::char(1), f.id, p.nom || ' · ' || f.nom, p.categorie, f.prix_ttc, p.stock * p.contenance_cl >= f.dose_cl
    from produit_formats f join produits p on p.id = f.produit_id where f.etab_id = p_etab and est_membre(p_etab)
  union all
  select 'k'::char(1), c.id, c.nom, 'Cocktails', c.prix_vente_ttc,
         not exists(select 1 from cocktail_ingredients i join produits p on p.id = i.produit_id
                    where i.cocktail_id = c.id and p.stock * p.contenance_cl < i.cl)
    from cocktails c where c.etab_id = p_etab and est_membre(p_etab)
  order by 4, 3;
$$;

create or replace function public.vendre2(p_etab uuid, p_type char, p_id uuid, p_delta int, p_zone text)
returns void
language plpgsql security definer set search_path = public as $$
declare s uuid; pr record; vendus int; prix numeric; ratio numeric; cout numeric; ht2 numeric;
begin
  if not est_membre(p_etab) then raise exception 'Accès refusé'; end if;
  if p_delta not in (1,-1) then raise exception 'Quantité invalide'; end if;
  if p_type not in ('p','k','f') then raise exception 'Type invalide'; end if;
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
  perform _sortie_stock(p_etab, p_type, p_id, p_delta);
end $$;

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
    if (it->>'t') not in ('p','k','f') then raise exception 'Type invalide'; end if;
    select * into pr from _prix_item(it->>'t', (it->>'id')::uuid, p_etab);
    cout := pr.ht - pr.marge;
    ratio := case when pr.prix_ttc > 0 then pr.ht / pr.prix_ttc else 1 / 1.2 end;
    unit := case when (it->>'ttc') is not null and (it->>'ttc')::numeric > 0 then (it->>'ttc')::numeric / q else pr.prix_ttc end;
    insert into ventes(etab_id, service_id, item_type, item_id, qte, prix_ttc, ht, marge_ht, par, le)
      values (p_etab, s, it->>'t', (it->>'id')::uuid, q, round(unit, 2), unit * ratio, unit * ratio - cout, auth.uid(), coalesce(p_le, now()));
    perform _sortie_stock(p_etab, (it->>'t')::char, (it->>'id')::uuid, q);
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

-- =====================================================================
--  Dosis Bar — schéma de base de données (Supabase / PostgreSQL)
--  À coller une seule fois dans Supabase > SQL Editor > New query > Run.
--
--  Règle de sécurité principale :
--   • le PATRON voit et modifie tout (prix d'achat, marges, inventaires) ;
--   • le BARMAN ne lit jamais les tables directement : il passe par des
--     fonctions qui ne lui renvoient que la carte (nom, prix de vente)
--     et qui enregistrent ses ventes.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.etablissements (
  id                   uuid primary key default gen_random_uuid(),
  nom                  text not null check (char_length(nom) between 1 and 80),
  objectif_spiritueux  int  not null default 80 check (objectif_spiritueux between 30 and 95),
  objectif_bouteilles  int  not null default 65 check (objectif_bouteilles between 30 and 95),
  volume_mois          int  not null default 60 check (volume_mois between 1 and 100000),
  cree_le              timestamptz not null default now()
);

create table if not exists public.membres (
  etab_id  uuid not null references public.etablissements(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null check (role in ('patron','barman')),
  email    text,
  depuis   timestamptz not null default now(),
  primary key (etab_id, user_id)
);
create index if not exists membres_user_idx on public.membres(user_id);

create table if not exists public.invitations (
  code       text primary key,
  etab_id    uuid not null references public.etablissements(id) on delete cascade,
  role       text not null check (role in ('patron','barman')),
  cree_par   uuid not null references auth.users(id) on delete cascade,
  expire_le  timestamptz not null default now() + interval '7 days',
  utilise_par uuid references auth.users(id) on delete set null
);

create table if not exists public.produits (
  id              uuid primary key default gen_random_uuid(),
  etab_id         uuid not null references public.etablissements(id) on delete cascade,
  nom             text not null check (char_length(nom) between 1 and 80),
  categorie       text not null default 'Autre',
  alcool          boolean not null default true,
  prix_achat_ht   numeric(10,2) not null default 0 check (prix_achat_ht >= 0),
  contenance_cl   numeric(8,2)  not null check (contenance_cl > 0),
  dose_cl         numeric(8,2)  not null check (dose_cl > 0),
  prix_vente_ttc  numeric(10,2) not null default 0 check (prix_vente_ttc >= 0),
  stock           numeric(10,3) not null default 0 check (stock >= 0),
  stock_min       numeric(10,2) not null default 0 check (stock_min >= 0),
  modifie_le      timestamptz not null default now()
);
create index if not exists produits_etab_idx on public.produits(etab_id);
-- code-barres de la bouteille (lecteur de l'app)
alter table public.produits add column if not exists code_barre text;
create index if not exists produits_code_idx on public.produits(etab_id, code_barre);

create table if not exists public.cocktails (
  id              uuid primary key default gen_random_uuid(),
  etab_id         uuid not null references public.etablissements(id) on delete cascade,
  nom             text not null check (char_length(nom) between 1 and 80),
  prix_vente_ttc  numeric(10,2) not null default 0 check (prix_vente_ttc >= 0),
  extras_ht       numeric(10,2) not null default 0 check (extras_ht >= 0),
  modifie_le      timestamptz not null default now()
);
create index if not exists cocktails_etab_idx on public.cocktails(etab_id);

create table if not exists public.cocktail_ingredients (
  id           uuid primary key default gen_random_uuid(),
  cocktail_id  uuid not null references public.cocktails(id) on delete cascade,
  produit_id   uuid not null references public.produits(id) on delete cascade,
  cl           numeric(8,2) not null check (cl > 0)
);
create index if not exists ci_cocktail_idx on public.cocktail_ingredients(cocktail_id);

create table if not exists public.services (
  id         uuid primary key default gen_random_uuid(),
  etab_id    uuid not null references public.etablissements(id) on delete cascade,
  ouvert_le  timestamptz not null default now(),
  clos_le    timestamptz,
  ca_ttc     numeric(12,2),
  ca_ht      numeric(12,2),
  marge_ht   numeric(12,2),
  verres     int
);
-- un seul service ouvert à la fois par établissement
create unique index if not exists services_un_ouvert on public.services(etab_id) where clos_le is null;
create index if not exists services_etab_idx on public.services(etab_id, ouvert_le desc);

create table if not exists public.ventes (
  id          bigint generated always as identity primary key,
  etab_id     uuid not null references public.etablissements(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  item_type   char(1) not null check (item_type in ('p','k')),
  item_id     uuid not null,
  qte         int  not null check (qte in (1,-1)),
  prix_ttc    numeric(10,2) not null,
  ht          numeric(10,4) not null,
  marge_ht    numeric(10,4) not null,
  par         uuid references auth.users(id) on delete set null,
  le          timestamptz not null default now()
);
create index if not exists ventes_service_idx on public.ventes(service_id);

create table if not exists public.inventaires (
  id               uuid primary key default gen_random_uuid(),
  etab_id          uuid not null references public.etablissements(id) on delete cascade,
  fait_par         uuid references auth.users(id) on delete set null,
  le               timestamptz not null default now(),
  perte_ventes_ht  numeric(12,2) not null default 0,
  details          jsonb not null default '[]'::jsonb
);
create index if not exists inventaires_etab_idx on public.inventaires(etab_id, le desc);

-- ---------------------------------------------------------------------
-- Fonctions d'aide (droits)
-- ---------------------------------------------------------------------
create or replace function public.est_membre(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from membres where etab_id = e and user_id = auth.uid());
$$;

create or replace function public.est_patron(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from membres where etab_id = e and user_id = auth.uid() and role = 'patron');
$$;

-- ---------------------------------------------------------------------
-- Sécurité par ligne (RLS)
-- ---------------------------------------------------------------------
alter table public.etablissements        enable row level security;
alter table public.membres               enable row level security;
alter table public.invitations           enable row level security;
alter table public.produits              enable row level security;
alter table public.cocktails             enable row level security;
alter table public.cocktail_ingredients  enable row level security;
alter table public.services              enable row level security;
alter table public.ventes                enable row level security;
alter table public.inventaires           enable row level security;

drop policy if exists etab_lire on public.etablissements;
create policy etab_lire on public.etablissements for select to authenticated using (est_membre(id));
drop policy if exists etab_modifier on public.etablissements;
create policy etab_modifier on public.etablissements for update to authenticated using (est_patron(id)) with check (est_patron(id));
drop policy if exists etab_supprimer on public.etablissements;
create policy etab_supprimer on public.etablissements for delete to authenticated using (est_patron(id));

drop policy if exists membres_lire on public.membres;
create policy membres_lire on public.membres for select to authenticated using (user_id = auth.uid() or est_patron(etab_id));
drop policy if exists membres_retirer on public.membres;
create policy membres_retirer on public.membres for delete to authenticated using (est_patron(etab_id) and user_id <> auth.uid());

drop policy if exists invit_lire on public.invitations;
create policy invit_lire on public.invitations for select to authenticated using (est_patron(etab_id));
drop policy if exists invit_supprimer on public.invitations;
create policy invit_supprimer on public.invitations for delete to authenticated using (est_patron(etab_id));

drop policy if exists produits_patron on public.produits;
create policy produits_patron on public.produits for all to authenticated using (est_patron(etab_id)) with check (est_patron(etab_id));

drop policy if exists cocktails_patron on public.cocktails;
create policy cocktails_patron on public.cocktails for all to authenticated using (est_patron(etab_id)) with check (est_patron(etab_id));

drop policy if exists ci_patron on public.cocktail_ingredients;
create policy ci_patron on public.cocktail_ingredients for all to authenticated
  using (exists(select 1 from cocktails c where c.id = cocktail_id and est_patron(c.etab_id)))
  with check (
    exists(select 1 from cocktails c where c.id = cocktail_id and est_patron(c.etab_id))
    and exists(select 1 from cocktails c join produits p on p.etab_id = c.etab_id
               where c.id = cocktail_id and p.id = produit_id));

drop policy if exists services_lire on public.services;
create policy services_lire on public.services for select to authenticated using (est_patron(etab_id));

drop policy if exists ventes_lire on public.ventes;
create policy ventes_lire on public.ventes for select to authenticated using (est_patron(etab_id));

drop policy if exists inv_patron on public.inventaires;
create policy inv_patron on public.inventaires for all to authenticated using (est_patron(etab_id)) with check (est_patron(etab_id));

-- Personne n'accède aux tables sans être connecté.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- Les ventes et les services ne s'écrivent que par les fonctions ci-dessous.
revoke insert, update, delete on public.ventes, public.services from authenticated;
revoke insert, update on public.etablissements, public.membres, public.invitations from authenticated;
grant update on public.etablissements to authenticated;

-- ---------------------------------------------------------------------
-- Fonctions appelées par l'app
-- ---------------------------------------------------------------------

-- Créer son établissement (l'utilisateur devient patron)
create or replace function public.creer_etablissement(p_nom text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  insert into etablissements(nom) values (trim(p_nom)) returning id into e;
  insert into membres(etab_id, user_id, role, email)
    values (e, auth.uid(), 'patron', (select email from auth.users where id = auth.uid()));
  return e;
end $$;

-- Générer un code d'invitation (patron uniquement)
create or replace function public.inviter(p_etab uuid, p_role text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  if not est_patron(p_etab) then raise exception 'Réservé au patron'; end if;
  if p_role not in ('patron','barman') then raise exception 'Rôle inconnu'; end if;
  loop
    c := upper(substr(translate(encode(gen_random_bytes(8),'base64'),'+/=0O1lI',''),1,6));
    exit when char_length(c) = 6 and not exists(select 1 from invitations where code = c);
  end loop;
  insert into invitations(code, etab_id, role, cree_par) values (c, p_etab, p_role, auth.uid());
  return c;
end $$;

-- Rejoindre un établissement avec un code
create or replace function public.rejoindre(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invitations;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into i from invitations where code = upper(trim(p_code)) for update;
  if not found or i.utilise_par is not null or i.expire_le < now() then
    raise exception 'Code invalide ou expiré';
  end if;
  insert into membres(etab_id, user_id, role, email)
    values (i.etab_id, auth.uid(), i.role, (select email from auth.users where id = auth.uid()))
    on conflict (etab_id, user_id) do update set role = excluded.role;
  update invitations set utilise_par = auth.uid() where code = i.code;
  return i.etab_id;
end $$;

-- Mes établissements et mon rôle
create or replace function public.mes_etablissements()
returns table(id uuid, nom text, role text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nom, m.role from membres m join etablissements e on e.id = m.etab_id
  where m.user_id = auth.uid() order by e.nom;
$$;

-- La carte pour le service : SANS prix d'achat ni marge
create or replace function public.carte_service(p_etab uuid)
returns table(item_type char(1), item_id uuid, nom text, categorie text, prix_ttc numeric, disponible boolean)
language sql stable security definer set search_path = public as $$
  select 'p'::char(1), p.id, p.nom, p.categorie, p.prix_vente_ttc, p.stock * p.contenance_cl >= p.dose_cl
    from produits p where p.etab_id = p_etab and est_membre(p_etab)
  union all
  select 'k'::char(1), c.id, c.nom, 'Cocktails', c.prix_vente_ttc,
         not exists(select 1 from cocktail_ingredients i join produits p on p.id = i.produit_id
                    where i.cocktail_id = c.id and p.stock * p.contenance_cl < i.cl)
    from cocktails c where c.etab_id = p_etab and est_membre(p_etab)
  order by 4, 3;
$$;

-- Calcul HT et marge d'un article (usage interne)
create or replace function public._prix_item(p_type char, p_id uuid, p_etab uuid,
  out prix_ttc numeric, out ht numeric, out marge numeric)
language plpgsql stable security definer set search_path = public as $$
declare cout numeric := 0; alc boolean := false; p produits; c cocktails;
begin
  if p_type = 'p' then
    select * into p from produits where id = p_id and etab_id = p_etab;
    if not found then raise exception 'Article introuvable'; end if;
    prix_ttc := p.prix_vente_ttc; alc := p.alcool;
    cout := p.prix_achat_ht / p.contenance_cl * p.dose_cl;
  else
    select * into c from cocktails where id = p_id and etab_id = p_etab;
    if not found then raise exception 'Article introuvable'; end if;
    prix_ttc := c.prix_vente_ttc; cout := c.extras_ht;
    select coalesce(sum(pr.prix_achat_ht / pr.contenance_cl * i.cl), 0) + cout, coalesce(bool_or(pr.alcool), false)
      into cout, alc
      from cocktail_ingredients i join produits pr on pr.id = i.produit_id where i.cocktail_id = p_id;
  end if;
  ht := prix_ttc / (case when alc then 1.2 else 1.1 end);
  marge := ht - cout;
end $$;

-- Enregistrer un verre vendu (+1) ou annulé (-1). Ouvre le service si besoin.
create or replace function public.vendre(p_etab uuid, p_type char, p_id uuid, p_delta int)
returns void
language plpgsql security definer set search_path = public as $$
declare s uuid; pr record; vendus int;
begin
  if not est_membre(p_etab) then raise exception 'Accès refusé'; end if;
  if p_delta not in (1,-1) then raise exception 'Quantité invalide'; end if;
  if p_type not in ('p','k') then raise exception 'Type invalide'; end if;

  select id into s from services where etab_id = p_etab and clos_le is null;
  if s is null then
    if p_delta < 0 then return; end if;
    insert into services(etab_id) values (p_etab)
      on conflict (etab_id) where clos_le is null do nothing returning id into s;
    if s is null then select id into s from services where etab_id = p_etab and clos_le is null; end if;
  end if;

  if p_delta < 0 then
    select coalesce(sum(qte),0) into vendus from ventes
      where service_id = s and item_type = p_type and item_id = p_id;
    if vendus <= 0 then return; end if;
  end if;

  select * into pr from _prix_item(p_type, p_id, p_etab);
  insert into ventes(etab_id, service_id, item_type, item_id, qte, prix_ttc, ht, marge_ht, par)
    values (p_etab, s, p_type, p_id, p_delta, pr.prix_ttc, pr.ht, pr.marge, auth.uid());

  -- le stock suit les ventes
  if p_type = 'p' then
    update produits set stock = greatest(0, stock - p_delta * dose_cl / contenance_cl)
      where id = p_id and etab_id = p_etab;
  else
    update produits p set stock = greatest(0, p.stock - p_delta * i.cl / p.contenance_cl)
      from cocktail_ingredients i where i.cocktail_id = p_id and i.produit_id = p.id and p.etab_id = p_etab;
  end if;
end $$;

-- État du service en cours. La marge n'est renvoyée qu'au patron.
create or replace function public.service_en_cours(p_etab uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s services; r jsonb; patron boolean;
begin
  if not est_membre(p_etab) then raise exception 'Accès refusé'; end if;
  patron := est_patron(p_etab);
  select * into s from services where etab_id = p_etab and clos_le is null;
  if not found then return jsonb_build_object('ouvert', false, 'items', '{}'::jsonb, 'ca_ttc', 0, 'verres', 0, 'marge_ht', case when patron then 0 end); end if;
  select jsonb_build_object(
      'ouvert', true, 'id', s.id, 'ouvert_le', s.ouvert_le,
      'ca_ttc', coalesce(sum(v.qte * v.prix_ttc), 0),
      'ca_ht',  case when patron then coalesce(sum(v.qte * v.ht), 0) end,
      'marge_ht', case when patron then coalesce(sum(v.qte * v.marge_ht), 0) end,
      'verres', coalesce(sum(v.qte), 0),
      'items', coalesce((select jsonb_object_agg(k, q) from (
          select item_type || item_id::text as k, sum(qte) as q from ventes
          where service_id = s.id group by 1 having sum(qte) > 0) t), '{}'::jsonb))
    into r from ventes v where v.service_id = s.id;
  return r;
end $$;

-- Clôturer le service : fige les totaux
create or replace function public.cloturer_service(p_etab uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare s uuid; r jsonb;
begin
  if not est_membre(p_etab) then raise exception 'Accès refusé'; end if;
  select id into s from services where etab_id = p_etab and clos_le is null for update;
  if s is null then return null; end if;
  update services set clos_le = now(),
    ca_ttc   = (select coalesce(sum(qte*prix_ttc),0) from ventes where service_id = s),
    ca_ht    = (select coalesce(sum(qte*ht),0)       from ventes where service_id = s),
    marge_ht = (select coalesce(sum(qte*marge_ht),0) from ventes where service_id = s),
    verres   = (select coalesce(sum(qte),0)          from ventes where service_id = s)
  where id = s
  returning jsonb_build_object('ca_ttc', ca_ttc, 'verres', verres,
            'marge_ht', case when est_patron(p_etab) then marge_ht end) into r;
  return r;
end $$;

-- Droits d'exécution : seulement les utilisateurs connectés
revoke all on function public.est_membre(uuid), public.est_patron(uuid), public.creer_etablissement(text),
  public.inviter(uuid,text), public.rejoindre(text), public.mes_etablissements(), public.carte_service(uuid),
  public._prix_item(char,uuid,uuid), public.vendre(uuid,char,uuid,int), public.service_en_cours(uuid),
  public.cloturer_service(uuid) from public, anon;
-- fonction interne : jamais appelable directement (elle révèle les coûts)
revoke all on function public._prix_item(char,uuid,uuid) from authenticated;
grant execute on function public.est_membre(uuid), public.est_patron(uuid), public.creer_etablissement(text),
  public.inviter(uuid,text), public.rejoindre(text), public.mes_etablissements(), public.carte_service(uuid),
  public.vendre(uuid,char,uuid,int), public.service_en_cours(uuid), public.cloturer_service(uuid) to authenticated;

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
-- Migration 3 : avis des testeurs (bouton « Donner mon avis »)

create table if not exists public.avis (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  etab_id uuid references public.etablissements(id) on delete set null,
  etab_nom text,
  role text,
  humeur text check (humeur in ('aime','manque','bloque')),
  message text not null check (char_length(message) between 1 and 2000),
  ecran text,
  appareil text,
  lu boolean not null default false
);
alter table public.avis enable row level security;
-- Aucune politique : personne ne lit ni n'écrit directement, tout passe par les fonctions ci-dessous.

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;

create or replace function public.donner_avis(p_etab uuid, p_humeur text, p_message text, p_ecran text, p_appareil text)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_nom text; v_recent int;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_message is null or char_length(trim(p_message)) = 0 then raise exception 'Message vide'; end if;
  select count(*) into v_recent from avis where user_id = auth.uid() and cree_le > now() - interval '1 hour';
  if v_recent >= 10 then raise exception 'Trop d''avis envoyés, réessayez plus tard'; end if;
  if p_etab is not null then
    select m.role, e.nom into v_role, v_nom from membres m join etablissements e on e.id = m.etab_id
      where m.etab_id = p_etab and m.user_id = auth.uid();
  end if;
  insert into avis(user_id, email, etab_id, etab_nom, role, humeur, message, ecran, appareil)
  values (auth.uid(), (select email from auth.users where id = auth.uid()),
          case when v_role is null then null else p_etab end, v_nom, v_role,
          nullif(p_humeur, ''), left(trim(p_message), 2000), left(p_ecran, 40), left(p_appareil, 200));
end $$;

create or replace function public.est_admin() returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;

create or replace function public.lire_avis() returns setof public.avis language plpgsql security definer stable set search_path = public as $$
begin
  if not exists(select 1 from admins where user_id = auth.uid()) then raise exception 'Accès réservé'; end if;
  return query select * from avis order by cree_le desc limit 300;
end $$;

create or replace function public.marquer_avis_lu(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from admins where user_id = auth.uid()) then raise exception 'Accès réservé'; end if;
  update avis set lu = true where id = p_id;
end $$;

revoke all on function public.donner_avis(uuid,text,text,text,text), public.est_admin(), public.lire_avis(), public.marquer_avis_lu(bigint) from public, anon;
grant execute on function public.donner_avis(uuid,text,text,text,text), public.est_admin(), public.lire_avis(), public.marquer_avis_lu(bigint) to authenticated;

-- Le compte du fondateur devient administrateur : le premier compte créé sur Dosis Bar.
insert into public.admins(user_id) select id from auth.users order by created_at asc limit 1 on conflict do nothing;
-- Migration 4 : charges fixes de l'établissement (visibles par les patrons seulement)
create table if not exists public.etab_charges (
  etab_id uuid primary key references public.etablissements(id) on delete cascade,
  data jsonb not null,
  maj timestamptz not null default now()
);
alter table public.etab_charges enable row level security;
drop policy if exists charges_patron on public.etab_charges;
create policy charges_patron on public.etab_charges for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
revoke all on public.etab_charges from anon;
grant select, insert, update, delete on public.etab_charges to authenticated;
-- Migration 5 : option Restauration (ingrédients, préparations, plats) et options de l'établissement
alter table public.etablissements add column if not exists options jsonb not null default '{}'::jsonb;

create table if not exists public.cuisine (
  id uuid primary key default gen_random_uuid(),
  etab_id uuid not null references public.etablissements(id) on delete cascade,
  type text not null check (type in ('i','r','d')),
  data jsonb not null,
  modifie_le timestamptz not null default now()
);
create index if not exists cuisine_etab on public.cuisine(etab_id);
alter table public.cuisine enable row level security;
drop policy if exists cuisine_patron on public.cuisine;
create policy cuisine_patron on public.cuisine for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
revoke all on public.cuisine from anon;
grant select, insert, update, delete on public.cuisine to authenticated;
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
-- Migration 7 : fournisseurs, commandes / achats, relevés de stock (bilan du mois pour le comptable)

create table if not exists public.fournisseurs (
  id         uuid primary key default gen_random_uuid(),
  etab_id    uuid not null references public.etablissements(id) on delete cascade,
  data       jsonb not null,
  modifie_le timestamptz not null default now()
);
create index if not exists fournisseurs_etab on public.fournisseurs(etab_id);

alter table public.produits add column if not exists fournisseur_id uuid references public.fournisseurs(id) on delete set null;

create table if not exists public.commandes (
  id         uuid primary key default gen_random_uuid(),
  etab_id    uuid not null references public.etablissements(id) on delete cascade,
  le         timestamptz not null default now(),
  statut     text not null default 'brouillon' check (statut in ('brouillon','envoyee','recue')),
  recue_le   timestamptz,
  total_ht   numeric(12,2) not null default 0,
  data       jsonb not null,
  modifie_le timestamptz not null default now()
);
create index if not exists commandes_etab_le on public.commandes(etab_id, le desc);

create table if not exists public.stock_releves (
  id        bigint generated always as identity primary key,
  etab_id   uuid not null references public.etablissements(id) on delete cascade,
  le        timestamptz not null default now(),
  valeur_ht numeric(12,2) not null,
  origine   text not null default 'auto' check (origine in ('auto','inventaire'))
);
create index if not exists stock_releves_etab_le on public.stock_releves(etab_id, le desc);

alter table public.fournisseurs  enable row level security;
alter table public.commandes     enable row level security;
alter table public.stock_releves enable row level security;
create policy fournisseurs_patron on public.fournisseurs for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
create policy commandes_patron on public.commandes for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
create policy stock_releves_patron on public.stock_releves for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
revoke all on public.fournisseurs, public.commandes, public.stock_releves from anon;
grant select, insert, update, delete on public.fournisseurs, public.commandes, public.stock_releves to authenticated;
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
-- Migration 9 : café, thé et boissons chaudes : unité des produits (cl, g, pièce), type de recette,
--               produits « ingrédient seul » (prix 0, ex. lait) cachés du mode Service

alter table public.produits add column if not exists unite text not null default 'cl';
alter table public.produits drop constraint if exists produits_unite_check;
alter table public.produits add constraint produits_unite_check check (unite in ('cl','g','pce'));

alter table public.cocktails add column if not exists categorie text not null default 'Cocktails';
alter table public.cocktails drop constraint if exists cocktails_categorie_check;
alter table public.cocktails add constraint cocktails_categorie_check check (categorie in ('Cocktails','Sans alcool','Boissons chaudes'));

create or replace function public.carte_service(p_etab uuid)
returns table(item_type char(1), item_id uuid, nom text, categorie text, prix_ttc numeric, disponible boolean)
language sql stable security definer set search_path = public as $$
  select 'p'::char(1), p.id, p.nom || coalesce(' · ' || nullif(p.format_nom, ''), ''), p.categorie, p.prix_vente_ttc, p.stock * p.contenance_cl >= p.dose_cl
    from produits p where p.etab_id = p_etab and est_membre(p_etab) and p.prix_vente_ttc > 0
  union all
  select 'f'::char(1), f.id, p.nom || ' · ' || f.nom, p.categorie, f.prix_ttc, p.stock * p.contenance_cl >= f.dose_cl
    from produit_formats f join produits p on p.id = f.produit_id where f.etab_id = p_etab and est_membre(p_etab) and f.prix_ttc > 0
  union all
  select 'k'::char(1), c.id, c.nom, c.categorie, c.prix_vente_ttc,
         not exists(select 1 from cocktail_ingredients i join produits p on p.id = i.produit_id
                    where i.cocktail_id = c.id and p.stock * p.contenance_cl < i.cl)
    from cocktails c where c.etab_id = p_etab and est_membre(p_etab)
  order by 4, 3;
$$;
-- Migration 10 : abonnements Mollie (lecture seule pour le patron ; écritures uniquement par les fonctions serveur)

create table if not exists public.abonnements (
  etab_id             uuid primary key references public.etablissements(id) on delete cascade,
  formule             text check (formule in ('pilote','bar','pro')),
  resto               boolean not null default false,
  statut              text not null default 'aucun' check (statut in ('aucun','en_attente','actif','impaye','annule')),
  montant_ttc         numeric(10,2),
  paye_jusqu          date,
  mollie_client       text,
  mollie_abonnement   text,
  maj                 timestamptz not null default now()
);
alter table public.abonnements enable row level security;
create policy abonnements_lire on public.abonnements for select to authenticated using (public.est_patron(etab_id));
revoke all on public.abonnements from anon;
revoke insert, update, delete on public.abonnements from authenticated;
grant select on public.abonnements to authenticated;

create table if not exists public.paiements (
  id          text primary key,              -- identifiant Mollie (tr_…)
  etab_id     uuid not null references public.etablissements(id) on delete cascade,
  le          timestamptz not null default now(),
  montant_ttc numeric(10,2) not null,
  statut      text not null,
  libelle     text
);
create index if not exists paiements_etab_le on public.paiements(etab_id, le desc);
alter table public.paiements enable row level security;
create policy paiements_lire on public.paiements for select to authenticated using (public.est_patron(etab_id));
revoke all on public.paiements from anon;
revoke insert, update, delete on public.paiements from authenticated;
grant select on public.paiements to authenticated;

-- Droits du rôle serveur (fonctions Edge abonnement / mollie-webhook)
grant select on public.membres, public.etablissements to service_role;
grant select, insert, update, delete on public.abonnements, public.paiements to service_role;

-- Migration 11 : factures des abonnements
-- Numérotation continue par année (F2026-0001, F2026-0002…), sans trou.
-- Une facture émise ne peut plus être modifiée ni supprimée (seule la date d'envoi par email est notée).
-- Pas de lien « on delete cascade » vers l'établissement : les factures sont gardées 10 ans, même si le compte est supprimé.

create table if not exists public.factures (
  numero       text primary key,
  annee        int  not null,
  rang         int  not null,
  etab_id      uuid not null,
  paiement_id  text not null unique,
  emise_le     date not null default current_date,
  payee_le     timestamptz,
  client       jsonb not null,
  lignes       jsonb not null,
  total_ht     numeric(10,2) not null,
  tva          numeric(10,2) not null,
  total_ttc    numeric(10,2) not null,
  html         text not null,
  envoyee_le   timestamptz,
  unique (annee, rang)
);
create index if not exists factures_etab on public.factures(etab_id, emise_le desc);

create or replace function public._factures_verrou() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Une facture émise ne peut pas être supprimée'; end if;
  if (to_jsonb(new) - 'envoyee_le') is distinct from (to_jsonb(old) - 'envoyee_le') then
    raise exception 'Une facture émise ne peut pas être modifiée';
  end if;
  return new;
end $$;
drop trigger if exists factures_verrou on public.factures;
create trigger factures_verrou before update or delete on public.factures
  for each row execute function public._factures_verrou();

-- Émission : appelée uniquement par le webhook Mollie (rôle serveur). Rejouer le même paiement renvoie la même facture.
create or replace function public.emettre_facture(
  p_paiement text, p_etab uuid, p_payee timestamptz, p_client jsonb, p_lignes jsonb,
  p_ht numeric, p_tva numeric, p_ttc numeric, p_html text
) returns public.factures language plpgsql security definer set search_path = public as $$
declare f public.factures; a int; r int; n text;
begin
  select * into f from factures where paiement_id = p_paiement;
  if found then return f; end if;
  perform pg_advisory_xact_lock(87425011);
  select * into f from factures where paiement_id = p_paiement;
  if found then return f; end if;
  a := extract(year from now() at time zone 'Europe/Paris')::int;
  select coalesce(max(rang), 0) + 1 into r from factures where annee = a;
  n := 'F' || a || '-' || lpad(r::text, 4, '0');
  insert into factures(numero, annee, rang, etab_id, paiement_id, emise_le, payee_le, client, lignes, total_ht, tva, total_ttc, html)
  values (n, a, r, p_etab, p_paiement, (now() at time zone 'Europe/Paris')::date, p_payee, p_client, p_lignes, p_ht, p_tva, p_ttc,
          replace(p_html, '{{NUMERO}}', n))
  returning * into f;
  return f;
end $$;

alter table public.factures enable row level security;
drop policy if exists factures_lire on public.factures;
create policy factures_lire on public.factures for select to authenticated using (public.est_patron(etab_id) or public.est_admin());
revoke all on public.factures from anon, authenticated;
grant select on public.factures to authenticated;
grant select, insert, update on public.factures to service_role;
revoke all on function public.emettre_facture(text,uuid,timestamptz,jsonb,jsonb,numeric,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.emettre_facture(text,uuid,timestamptz,jsonb,jsonb,numeric,numeric,numeric,text) to service_role;

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

-- Migration 13 : connexion des caisses enregistreuses (SumUp pour commencer)
-- caisse_connexions : visible par le patron (sans la clé).
-- caisse_cles : la clé API de la caisse, lisible uniquement par le serveur (fonction « caisse »).

create table if not exists public.caisse_connexions (
  etab_id      uuid primary key references public.etablissements(id) on delete cascade,
  fournisseur  text not null check (fournisseur in ('sumup')),
  compte       text,                 -- identifiant du compte chez la caisse (ex. code marchand SumUp)
  nom_compte   text,                 -- nom affiché par la caisse
  derniere_synchro timestamptz,
  erreur       text,
  cree_le      timestamptz not null default now()
);
create table if not exists public.caisse_cles (
  etab_id uuid primary key references public.etablissements(id) on delete cascade,
  cle     text not null
);

alter table public.caisse_connexions enable row level security;
alter table public.caisse_cles enable row level security;
drop policy if exists caisse_lire on public.caisse_connexions;
create policy caisse_lire on public.caisse_connexions for select to authenticated using (public.est_patron(etab_id));
revoke all on public.caisse_connexions, public.caisse_cles from anon, authenticated;
grant select on public.caisse_connexions to authenticated;
grant select, insert, update, delete on public.caisse_connexions, public.caisse_cles to service_role;

-- Migration 14 : gestion du compte (changement d'email, quitter un établissement, suppression)

-- L'email affiché dans l'équipe suit le changement d'adresse du compte.
create or replace function public._sync_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.membres set email = new.email where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_email on auth.users;
create trigger sync_email after update of email on auth.users for each row execute function public._sync_email();

-- Quitter un établissement (barman, ou associé s'il reste un autre patron).
create or replace function public.quitter_etab(p_etab uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  select role into r from membres where etab_id = p_etab and user_id = auth.uid();
  if r is null then raise exception 'Vous ne faites pas partie de cet établissement'; end if;
  if r = 'patron' and not exists (select 1 from membres where etab_id = p_etab and role = 'patron' and user_id <> auth.uid()) then
    raise exception 'Vous êtes le seul patron : supprimez l''établissement, ou invitez d''abord un autre patron';
  end if;
  delete from membres where etab_id = p_etab and user_id = auth.uid();
end $$;
grant execute on function public.quitter_etab(uuid) to authenticated;

-- Suppression d'un établissement par la fonction serveur « compte » (après résiliation Mollie).
-- Les factures restent (obligation de conservation de 10 ans) : elles n'ont pas de lien en cascade.
grant delete on public.etablissements to service_role;
grant select, delete on public.membres to service_role;
-- Migration 15 : emails automatiques (bienvenue, fin d'essai, paiement refusé)
create table if not exists public.emails_envoyes (
  etab_id    uuid not null references public.etablissements(id) on delete cascade,
  type       text not null check (type in ('bienvenue','essai_fin','paiement_refuse')),
  cle        text not null default '',
  envoye_le  timestamptz not null default now(),
  primary key (etab_id, type, cle)
);
alter table public.emails_envoyes enable row level security;  -- aucune règle : réservé au serveur
grant select, insert, delete on public.emails_envoyes to service_role;

-- Liste des emails dus (pas encore envoyés). Lue uniquement par la fonction serveur « emails ».
create or replace function public.emails_a_envoyer() returns table
  (etab_id uuid, type text, cle text, email text, nom text, fin_essai date, paye_jusqu date)
language plpgsql stable security definer set search_path = public as $$
declare auj date := (now() at time zone 'Europe/Paris')::date;
begin
  return query
  with b as (
    select e.id, e.nom, e.cree_le, public._acces(e.id) as acc,
      (select m.email from membres m where m.etab_id = e.id and m.role = 'patron' order by m.depuis limit 1) as mail
    from etablissements e
  ), dus as (
    -- Bienvenue : établissements créés depuis la mise en service des emails, dans les 7 derniers jours
    select b.id, 'bienvenue'::text t, ''::text k, b.mail, b.nom, (b.acc->>'fin_essai')::date fe, null::date pj
      from b where b.cree_le >= '2026-11-20 00:00+01' and b.cree_le > now() - interval '7 days'
    union all
    -- Fin d'essai : de J-3 au jour J, si toujours en essai (ni abonné, ni admin)
    select b.id, 'essai_fin', b.acc->>'fin_essai', b.mail, b.nom, (b.acc->>'fin_essai')::date, null
      from b where b.acc->>'etat' = 'essai' and not coalesce((b.acc->>'admin')::boolean, false)
       and (b.acc->>'fin_essai')::date - auj between 0 and 3
    union all
    -- Paiement refusé : abonnement impayé, un email par paiement refusé (des 7 derniers jours)
    select b.id, 'paiement_refuse', p.id, b.mail, b.nom, null, a.paye_jusqu
      from b join abonnements a on a.etab_id = b.id and a.statut = 'impaye'
      join lateral (select x.id from paiements x where x.etab_id = b.id and x.statut in ('failed','charged_back')
                    and x.le > now() - interval '7 days' order by x.le desc limit 1) p on true
  )
  select d.id, d.t, d.k, d.mail, d.nom, d.fe, d.pj from dus d
  where d.mail is not null
    and not exists (select 1 from emails_envoyes s where s.etab_id = d.id and s.type = d.t and s.cle = d.k);
end $$;
revoke all on function public.emails_a_envoyer() from public, anon, authenticated;
grant execute on function public.emails_a_envoyer() to service_role;

-- Toutes les heures (à la 17e minute), la fonction « emails » envoie ce qui est dû
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule('dosis-emails') where exists (select 1 from cron.job where jobname = 'dosis-emails');
select cron.schedule('dosis-emails', '17 * * * *',
  $c$ select net.http_post(url := 'https://zksoxdoqfabbhzwyymbp.supabase.co/functions/v1/emails',
       headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb) $c$);
-- Migration 16 : paiement à l'année (2 mois offerts)
alter table public.abonnements add column if not exists annuel boolean not null default false;
-- Migration 17 : lecture automatique des factures fournisseurs (journal + limite par jour)
create table if not exists public.factures_lues (
  id          bigserial primary key,
  etab_id     uuid not null references public.etablissements(id) on delete cascade,
  le          timestamptz not null default now(),
  fournisseur text,
  lignes      int,
  ok          boolean not null default true
);
create index if not exists factures_lues_etab_le on public.factures_lues(etab_id, le desc);
alter table public.factures_lues enable row level security;   -- aucune règle : réservé au serveur
grant select, insert on public.factures_lues to service_role;
grant usage, select on sequence public.factures_lues_id_seq to service_role;

-- ================= Migration 18 : prix internationaux (26/11/2026) =================
-- grille v1 = anciens prix gardés par les abonnés d'avant le 26/11/2026 ; v2 = grille internationale.
alter table abonnements add column if not exists grille text not null default 'v1';
alter table abonnements add column if not exists devise text not null default 'EUR';
alter table abonnements add column if not exists tva_taux numeric not null default 20;
alter table factures add column if not exists devise text not null default 'EUR';

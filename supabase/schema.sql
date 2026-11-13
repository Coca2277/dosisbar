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

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

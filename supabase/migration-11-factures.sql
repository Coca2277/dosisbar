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

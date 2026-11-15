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

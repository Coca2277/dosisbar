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

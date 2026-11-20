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

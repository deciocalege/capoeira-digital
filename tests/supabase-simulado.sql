-- ============================================================================
--  Emulação MÍNIMA do Supabase (schema "auth", função auth.uid(), papéis) para correr
--  os ficheiros servidor/*.sql num PostgreSQL normal, SÓ para testes. NÃO uses no Supabase.
--
--  Como testar o SQL da sincronização num PostgreSQL local (o utilizador tem de poder criar bases):
--    createdb capoeira_teste
--    psql capoeira_teste -f tests/supabase-simulado.sql
--    psql capoeira_teste -f servidor/01-esquema.sql
--    psql capoeira_teste -f servidor/03-sincronizacao.sql
--    psql capoeira_teste -f tests/sincronizacao.sql        (cada linha "_esperado_" diz o valor certo)
-- ============================================================================
-- Emulação mínima do Supabase para testar o SQL da app
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
end $$;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on sequences to authenticated, anon;
alter default privileges in schema public grant execute on functions to authenticated, anon;
grant select on auth.users to authenticated;

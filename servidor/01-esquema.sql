-- =====================================================================
-- Capoeira Digital — ESQUEMA DO SERVIDOR (versão 1)
-- Executa este ficheiro UMA vez no Supabase: SQL Editor → New query →
-- colar tudo → Run. Pode ser repetido sem estragar nada (é "idempotente").
--
-- Ideia: cada registo da app (ave, venda, consumo…) é guardado como um
-- documento JSON na tabela "registos", com a granja a que pertence e a data
-- da última alteração. Assim, novas funcionalidades da app não obrigam a
-- mudar a base de dados.
-- =====================================================================

-- ---------- 1. Tabelas ----------

create table if not exists public.granjas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(nome) between 1 and 80),
  criado_por uuid not null default auth.uid() references auth.users (id),
  criado_em  timestamptz not null default now()
);

create table if not exists public.membros (
  granja_id     uuid not null references public.granjas (id) on delete cascade,
  utilizador_id uuid not null references auth.users (id) on delete cascade,
  papel         text not null default 'trabalhador'
                check (papel in ('administrador', 'trabalhador')),
  email         text,
  criado_em     timestamptz not null default now(),
  primary key (granja_id, utilizador_id)
);

create table if not exists public.registos (
  granja_id      uuid not null references public.granjas (id) on delete cascade,
  tabela         text not null check (tabela in (
                   'compartimentos', 'aves', 'feedStock', 'consumo', 'transacoes',
                   'ovosLog', 'saidasAves', 'incubacao', 'misturas',
                   'planosAlimentares', 'saude', 'pesagens', 'vendas',
                   'revenda', 'revendaMov')),
  id             text not null,                       -- id do registo na app
  dados          jsonb not null default '{}'::jsonb,  -- o registo em si
  apagado        boolean not null default false,      -- apagar = marcar
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (granja_id, tabela, id)
);

-- Para pedir só o que mudou desde a última sincronização
create index if not exists registos_sincronizacao_idx
  on public.registos (granja_id, atualizado_em);

-- ---------- 2. Data da alteração definida pelo servidor ----------
-- (o relógio do telemóvel pode estar errado; o do servidor não)

create or replace function public.registos_carimbar()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em  := now();
  new.atualizado_por := auth.uid();
  if tg_op = 'INSERT' then
    new.criado_em := now();
  else
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists registos_carimbar_tg on public.registos;
create trigger registos_carimbar_tg
  before insert or update on public.registos
  for each row execute function public.registos_carimbar();

-- ---------- 3. Funções de apoio às regras de acesso ----------

create or replace function public.eh_membro(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros m
    where m.granja_id = g and m.utilizador_id = auth.uid()
  );
$$;

create or replace function public.eh_admin(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros m
    where m.granja_id = g and m.utilizador_id = auth.uid()
      and m.papel = 'administrador'
  );
$$;

-- Cria uma granja nova e torna quem a criou administrador
create or replace function public.criar_granja(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso iniciar sessão para criar uma granja.';
  end if;
  insert into public.granjas (nome, criado_por)
    values (trim(p_nome), auth.uid())
    returning id into g;
  insert into public.membros (granja_id, utilizador_id, papel, email)
    values (g, auth.uid(), 'administrador',
            (select u.email from auth.users u where u.id = auth.uid()));
  return g;
end;
$$;

-- Teste de ligação: a app chama isto para saber se o servidor está pronto
create or replace function public.ping()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('ok', true, 'versao_esquema', 1, 'hora', now());
$$;

-- ---------- 4. Regras de acesso (Row Level Security) ----------
-- Cada pessoa só vê e altera as granjas de que é membro.

alter table public.granjas  enable row level security;
alter table public.membros  enable row level security;
alter table public.registos enable row level security;

-- granjas
drop policy if exists granjas_ver on public.granjas;
create policy granjas_ver on public.granjas
  for select to authenticated using (public.eh_membro(id));

drop policy if exists granjas_editar on public.granjas;
create policy granjas_editar on public.granjas
  for update to authenticated
  using (public.eh_admin(id)) with check (public.eh_admin(id));

drop policy if exists granjas_apagar on public.granjas;
create policy granjas_apagar on public.granjas
  for delete to authenticated using (public.eh_admin(id));

-- membros
drop policy if exists membros_ver on public.membros;
create policy membros_ver on public.membros
  for select to authenticated using (public.eh_membro(granja_id));

drop policy if exists membros_adicionar on public.membros;
create policy membros_adicionar on public.membros
  for insert to authenticated with check (public.eh_admin(granja_id));

drop policy if exists membros_editar on public.membros;
create policy membros_editar on public.membros
  for update to authenticated
  using (public.eh_admin(granja_id)) with check (public.eh_admin(granja_id));

drop policy if exists membros_remover on public.membros;
create policy membros_remover on public.membros
  for delete to authenticated using (public.eh_admin(granja_id));

-- registos (os papéis finos — o trabalhador não ver finanças — vêm no item 8)
drop policy if exists registos_ver on public.registos;
create policy registos_ver on public.registos
  for select to authenticated using (public.eh_membro(granja_id));

drop policy if exists registos_criar on public.registos;
create policy registos_criar on public.registos
  for insert to authenticated with check (public.eh_membro(granja_id));

drop policy if exists registos_alterar on public.registos;
create policy registos_alterar on public.registos
  for update to authenticated
  using (public.eh_membro(granja_id)) with check (public.eh_membro(granja_id));

drop policy if exists registos_limpar on public.registos;
create policy registos_limpar on public.registos
  for delete to authenticated using (public.eh_admin(granja_id));

-- ---------- 5. Permissões ----------
-- Quem não iniciou sessão ("anon") só pode chamar o teste de ligação.

revoke all on public.granjas  from anon;
revoke all on public.membros  from anon;
revoke all on public.registos from anon;

grant select, update, delete       on public.granjas  to authenticated;
grant select, insert, update, delete on public.membros  to authenticated;
grant select, insert, update, delete on public.registos to authenticated;

revoke all on function public.criar_granja(text) from public, anon;
grant execute on function public.criar_granja(text) to authenticated;

grant execute on function public.ping() to anon, authenticated;
grant execute on function public.eh_membro(uuid) to authenticated;
grant execute on function public.eh_admin(uuid) to authenticated;

-- ---------- 6. Tempo real (item 3 do plano) ----------
-- Faz com que alterações em "registos" cheguem aos outros aparelhos.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'registos') then
    alter publication supabase_realtime add table public.registos;
  end if;
end;
$$;

-- Fim. Para confirmar: SQL Editor → select public.ping();

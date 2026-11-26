-- ============================================================================
--  CAPOEIRA DIGITAL — 04: PAPÉIS E CONVITES
--  Corre este ficheiro UMA vez no Supabase (SQL Editor → New query → Run), depois do
--  01-esquema.sql e do 03-sincronizacao.sql. É seguro correr mais do que uma vez.
-- ============================================================================
--
--  Dois papéis por criação:
--    ADMINISTRADOR  vê e altera tudo; convida, muda o papel e retira pessoas.
--    TRABALHADOR    faz os registos do dia a dia (aves, ovos, ração, saúde, produção…),
--                   mas NÃO vê nem altera as finanças: transacoes, vendas, revenda e
--                   revendaMov. Isto é imposto pelo servidor (não só escondido na app).
--
--  Convite (sem precisar de enviar emails):
--    1. O administrador escreve o email da pessoa e escolhe o papel → recebe um CÓDIGO.
--    2. Passa o código à pessoa (mensagem, WhatsApp…).
--    3. A pessoa cria conta / entra com ESSE email e escreve o código → fica com acesso.
--    O código só serve para o email convidado, vale 7 dias e usa-se uma vez.
--
--  Garantias: uma criação nunca fica sem administrador; só se mexe nas pessoas através
--  das funções abaixo (o acesso directo à tabela "membros" fica fechado).
-- ============================================================================

-- ---------- 1. Que tabelas o trabalhador não pode usar ----------
create or replace function public.tabelas_restritas()
returns text[]
language sql
immutable
as $$ select array['transacoes', 'vendas', 'revenda', 'revendaMov']::text[]; $$;

create or replace function public.pode_tabela(g uuid, t text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_admin(g)
      or (public.eh_membro(g) and not (t = any (public.tabelas_restritas())));
$$;

-- As regras de acesso aos registos passam a olhar para o papel.
drop policy if exists registos_ver on public.registos;
create policy registos_ver on public.registos
  for select to authenticated using (public.pode_tabela(granja_id, tabela));

drop policy if exists registos_criar on public.registos;
create policy registos_criar on public.registos
  for insert to authenticated with check (public.pode_tabela(granja_id, tabela));

drop policy if exists registos_alterar on public.registos;
create policy registos_alterar on public.registos
  for update to authenticated
  using (public.pode_tabela(granja_id, tabela)) with check (public.pode_tabela(granja_id, tabela));

-- ---------- 2. Enviar registos: o trabalhador não envia finanças ----------
-- (substitui a função do 03: igual, mas ignora as tabelas que o papel não pode usar
--  e devolve quantos ignorou em "recusados", em vez de falhar o lote todo)
create or replace function public.enviar_registos(p_granja uuid, p_registos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r          jsonb;
  v_dados    jsonb;
  v_ts       timestamptz;
  v_aceites  int := 0;
  v_ignor    int := 0;
  v_recusa   int := 0;
  v_n        int;
begin
  if auth.uid() is null then
    raise exception 'É preciso iniciar sessão para sincronizar.';
  end if;
  if not public.eh_membro(p_granja) then
    raise exception 'Não pertences a esta granja.';
  end if;
  if p_registos is null or jsonb_typeof(p_registos) <> 'array' then
    raise exception 'Os registos têm de vir numa lista.';
  end if;
  if jsonb_array_length(p_registos) > 500 then
    raise exception 'Demasiados registos de uma vez (máximo 500).';
  end if;

  for r in select value from jsonb_array_elements(p_registos) loop
    if not public.pode_tabela(p_granja, r->>'tabela') then
      v_recusa := v_recusa + 1;
      continue;
    end if;
    v_dados := coalesce(r->'dados', '{}'::jsonb);
    v_ts := least(
      coalesce(nullif(v_dados->>'atualizadoEm', '')::timestamptz, now()),
      now() + interval '5 minutes');
    v_dados := jsonb_set(
      v_dados, '{atualizadoEm}',
      to_jsonb(to_char(v_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));

    insert into public.registos as t (granja_id, tabela, id, dados, apagado)
    values (p_granja, r->>'tabela', r->>'id', v_dados, coalesce((r->>'apagado')::boolean, false))
    on conflict (granja_id, tabela, id) do update
      set dados   = excluded.dados,
          apagado = excluded.apagado
      where coalesce(nullif(t.dados->>'atualizadoEm', '')::timestamptz, 'epoch'::timestamptz)
            < (excluded.dados->>'atualizadoEm')::timestamptz;

    get diagnostics v_n = row_count;
    if v_n > 0 then v_aceites := v_aceites + 1; else v_ignor := v_ignor + 1; end if;
  end loop;

  return jsonb_build_object('aceites', v_aceites, 'ignorados', v_ignor, 'recusados', v_recusa, 'hora', now());
end;
$$;

-- ---------- 3. Convites ----------
create table if not exists public.convites (
  id          uuid primary key default gen_random_uuid(),
  granja_id   uuid not null references public.granjas (id) on delete cascade,
  email       text not null,
  papel       text not null default 'trabalhador' check (papel in ('administrador', 'trabalhador')),
  codigo      text not null unique,
  criado_por  uuid references auth.users (id) on delete set null,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null default (now() + interval '7 days'),
  usado_em    timestamptz,
  usado_por   uuid references auth.users (id) on delete set null
);
-- no máximo um convite por pessoa e por criação enquanto não for usado
create unique index if not exists convites_pendente_idx
  on public.convites (granja_id, email) where usado_em is null;

alter table public.convites enable row level security;
-- sem políticas e sem permissões: só as funções abaixo mexem nesta tabela
revoke all on public.convites from anon, authenticated;

-- ---------- 4. Funções ----------
create or replace function public._email_de(u uuid)
returns text
language sql stable security definer set search_path = public
as $$ select lower(trim(email)) from auth.users where id = u; $$;

create or replace function public._n_admins(g uuid)
returns int
language sql stable security definer set search_path = public
as $$ select count(*)::int from public.membros where granja_id = g and papel = 'administrador'; $$;

-- Convidar (só administradores) → devolve o código a entregar à pessoa
create or replace function public.convidar(p_granja uuid, p_email text, p_papel text default 'trabalhador')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_codigo text;
  v_exp    timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then raise exception 'É preciso iniciar sessão.'; end if;
  if not public.eh_admin(p_granja) then raise exception 'Só os administradores podem convidar pessoas.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'O email não parece válido.'; end if;
  if p_papel not in ('administrador', 'trabalhador') then raise exception 'Papel inválido.'; end if;
  if exists (
       select 1 from public.membros m
        where m.granja_id = p_granja
          and (lower(coalesce(m.email, '')) = v_email or public._email_de(m.utilizador_id) = v_email)
     ) then
    raise exception 'Esta pessoa já tem acesso a esta criação.';
  end if;

  -- código legível: 3 grupos de 4 (ex.: 7F3A-91C2-0BDE)
  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_codigo := substr(v_codigo, 1, 4) || '-' || substr(v_codigo, 5, 4) || '-' || substr(v_codigo, 9, 4);

  insert into public.convites (granja_id, email, papel, codigo, criado_por, expira_em)
  values (p_granja, v_email, p_papel, v_codigo, auth.uid(), v_exp)
  on conflict (granja_id, email) where usado_em is null
  do update set papel = excluded.papel, codigo = excluded.codigo, criado_por = excluded.criado_por,
                criado_em = now(), expira_em = excluded.expira_em;

  return jsonb_build_object('codigo', v_codigo, 'email', v_email, 'papel', p_papel, 'expira_em', v_exp);
end;
$$;

-- Aceitar um convite (qualquer pessoa com sessão; o email da conta tem de ser o convidado)
create or replace function public.aceitar_convite(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cod  text := upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g'));
  v_cod2 text;
  c      public.convites%rowtype;
  v_eu   text;
  v_nome text;
begin
  if auth.uid() is null then raise exception 'É preciso iniciar sessão para aceitar um convite.'; end if;
  if length(v_cod) <> 12 then raise exception 'O código do convite não está completo.'; end if;
  v_cod2 := substr(v_cod, 1, 4) || '-' || substr(v_cod, 5, 4) || '-' || substr(v_cod, 9, 4);

  select * into c from public.convites where codigo = v_cod2 for update;
  if not found then raise exception 'Código de convite inválido.'; end if;
  if c.usado_em is not null then raise exception 'Este convite já foi usado.'; end if;
  if c.expira_em < now() then raise exception 'Este convite expirou. Pede um novo ao administrador.'; end if;

  v_eu := public._email_de(auth.uid());
  if v_eu is distinct from c.email then
    raise exception 'Este convite é para outro email (%). Entra com a conta desse email.',
      regexp_replace(c.email, '^(.).*@', '\1***@');
  end if;

  insert into public.membros (granja_id, utilizador_id, papel, email)
  values (c.granja_id, auth.uid(), c.papel, v_eu)
  on conflict (granja_id, utilizador_id) do nothing;

  update public.convites set usado_em = now(), usado_por = auth.uid() where id = c.id;
  select nome into v_nome from public.granjas where id = c.granja_id;
  return jsonb_build_object('granja_id', c.granja_id, 'granja_nome', v_nome, 'papel', c.papel);
end;
$$;

-- Quem tem acesso a esta criação (qualquer membro vê a lista)
create or replace function public.listar_membros(p_granja uuid)
returns table (utilizador_id uuid, email text, papel text, criado_em timestamptz, sou_eu boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'É preciso iniciar sessão.'; end if;
  if not public.eh_membro(p_granja) then raise exception 'Não pertences a esta granja.'; end if;
  return query
    select m.utilizador_id, coalesce(m.email, public._email_de(m.utilizador_id)), m.papel, m.criado_em,
           (m.utilizador_id = auth.uid())
      from public.membros m
     where m.granja_id = p_granja
     order by (m.papel = 'administrador') desc, m.criado_em;
end;
$$;

-- Convites por usar (só administradores)
create or replace function public.listar_convites(p_granja uuid)
returns table (id uuid, email text, papel text, codigo text, criado_em timestamptz, expira_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'É preciso iniciar sessão.'; end if;
  if not public.eh_admin(p_granja) then raise exception 'Só os administradores veem os convites.'; end if;
  return query
    select c.id, c.email, c.papel, c.codigo, c.criado_em, c.expira_em
      from public.convites c
     where c.granja_id = p_granja and c.usado_em is null
     order by c.criado_em desc;
end;
$$;

create or replace function public.cancelar_convite(p_convite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'É preciso iniciar sessão.'; end if;
  select granja_id into g from public.convites where id = p_convite;
  if g is null then return; end if;
  if not public.eh_admin(g) then raise exception 'Só os administradores podem cancelar convites.'; end if;
  delete from public.convites where id = p_convite and usado_em is null;
end;
$$;

-- Mudar o papel de alguém (só administradores; nunca deixa a criação sem administrador)
create or replace function public.alterar_papel(p_granja uuid, p_utilizador uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_atual text;
begin
  if auth.uid() is null then raise exception 'É preciso iniciar sessão.'; end if;
  if not public.eh_admin(p_granja) then raise exception 'Só os administradores podem mudar papéis.'; end if;
  if p_papel not in ('administrador', 'trabalhador') then raise exception 'Papel inválido.'; end if;
  select papel into v_atual from public.membros where granja_id = p_granja and utilizador_id = p_utilizador;
  if v_atual is null then raise exception 'Essa pessoa não pertence a esta criação.'; end if;
  if v_atual = 'administrador' and p_papel <> 'administrador' and public._n_admins(p_granja) <= 1 then
    raise exception 'Tem de haver pelo menos um administrador. Torna outra pessoa administradora primeiro.';
  end if;
  update public.membros set papel = p_papel where granja_id = p_granja and utilizador_id = p_utilizador;
end;
$$;

-- Retirar alguém da criação (só administradores)
create or replace function public.remover_membro(p_granja uuid, p_utilizador uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_papel text;
begin
  if auth.uid() is null then raise exception 'É preciso iniciar sessão.'; end if;
  if not public.eh_admin(p_granja) then raise exception 'Só os administradores podem retirar pessoas.'; end if;
  select papel into v_papel from public.membros where granja_id = p_granja and utilizador_id = p_utilizador;
  if v_papel is null then return; end if;
  if v_papel = 'administrador' and public._n_admins(p_granja) <= 1 then
    raise exception 'Não podes retirar o único administrador.';
  end if;
  delete from public.membros where granja_id = p_granja and utilizador_id = p_utilizador;
end;
$$;

-- Sair de uma criação (qualquer membro; o único administrador tem de passar o cargo antes)
create or replace function public.sair_da_granja(p_granja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_papel text;
begin
  if auth.uid() is null then raise exception 'É preciso iniciar sessão.'; end if;
  select papel into v_papel from public.membros where granja_id = p_granja and utilizador_id = auth.uid();
  if v_papel is null then return; end if;
  if v_papel = 'administrador' and public._n_admins(p_granja) <= 1 then
    raise exception 'És o único administrador. Torna outra pessoa administradora antes de sair.';
  end if;
  delete from public.membros where granja_id = p_granja and utilizador_id = auth.uid();
end;
$$;

-- ---------- 5. Permissões ----------
-- As pessoas só se mexem pelas funções acima (nunca directamente na tabela).
revoke insert, update, delete on public.membros from authenticated;

revoke all on function public.convidar(uuid, text, text)         from public, anon;
revoke all on function public.aceitar_convite(text)              from public, anon;
revoke all on function public.listar_membros(uuid)               from public, anon;
revoke all on function public.listar_convites(uuid)              from public, anon;
revoke all on function public.cancelar_convite(uuid)             from public, anon;
revoke all on function public.alterar_papel(uuid, uuid, text)    from public, anon;
revoke all on function public.remover_membro(uuid, uuid)         from public, anon;
revoke all on function public.sair_da_granja(uuid)               from public, anon;
revoke all on function public.enviar_registos(uuid, jsonb)       from public, anon;
revoke all on function public.pode_tabela(uuid, text)            from public, anon;
revoke all on function public._email_de(uuid)                    from public, anon, authenticated;
revoke all on function public._n_admins(uuid)                    from public, anon, authenticated;

grant execute on function public.convidar(uuid, text, text)      to authenticated;
grant execute on function public.aceitar_convite(text)           to authenticated;
grant execute on function public.listar_membros(uuid)            to authenticated;
grant execute on function public.listar_convites(uuid)           to authenticated;
grant execute on function public.cancelar_convite(uuid)          to authenticated;
grant execute on function public.alterar_papel(uuid, uuid, text) to authenticated;
grant execute on function public.remover_membro(uuid, uuid)      to authenticated;
grant execute on function public.sair_da_granja(uuid)            to authenticated;
grant execute on function public.enviar_registos(uuid, jsonb)    to authenticated;
grant execute on function public.pode_tabela(uuid, text)         to authenticated;
grant execute on function public.tabelas_restritas()             to authenticated;

-- Fim. Para confirmar: select proname from pg_proc where proname in
-- ('convidar','aceitar_convite','listar_membros','alterar_papel','remover_membro','pode_tabela');

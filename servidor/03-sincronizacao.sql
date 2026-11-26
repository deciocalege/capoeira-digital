-- ============================================================================
--  CAPOEIRA DIGITAL — 03: SINCRONIZAÇÃO ENTRE APARELHOS
--  Corre este ficheiro UMA vez no Supabase (SQL Editor → New query → Run),
--  depois de teres corrido o 01-esquema.sql. É seguro correr mais do que uma vez.
-- ============================================================================
--
--  Como funciona:
--   • Cada aparelho guarda os dados localmente (funciona sem internet) e, quando
--     há ligação, ENVIA o que mudou e RECEBE o que mudou nos outros aparelhos.
--   • Se dois aparelhos alteraram o MESMO registo, ganha a alteração mais recente
--     (campo "atualizadoEm" que vai dentro do registo). Uma alteração mais antiga
--     é ignorada, nunca apaga uma mais nova.
--   • Para saber "o que mudou desde a última vez" usa-se a data do SERVIDOR
--     (coluna atualizado_em, posta pelo servidor) e não a do telemóvel, porque
--     o relógio de um telemóvel pode estar errado.
--   • Uma data "do futuro" (relógio do telemóvel adiantado) é limitada a daqui a
--     5 minutos, para um aparelho com o relógio mal acertado não passar a ganhar
--     sempre.
--
--  Funções (todas exigem sessão iniciada e ser membro da granja):
--    enviar_registos(granja, registos)   envia uma lista de registos
--    receber_registos(granja, ...)       devolve os registos alterados desde um ponto
--    resumo_granja(granja)               quantos registos a granja tem no servidor
-- ============================================================================

-- ---------- 1. Enviar ----------
-- p_registos: [{"tabela":"aves","id":"…","apagado":false,"dados":{…}}, …]  (até 500 de cada vez)
-- Devolve {"aceites": n, "ignorados": n, "hora": "…"}.
create or replace function public.enviar_registos(p_granja uuid, p_registos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r         jsonb;
  v_dados   jsonb;
  v_ts      timestamptz;
  v_aceites int := 0;
  v_ignor   int := 0;
  v_n       int;
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
    v_dados := coalesce(r->'dados', '{}'::jsonb);
    -- data da alteração feita no aparelho (nunca mais do que 5 minutos no futuro)
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
      -- só substitui se a versão que chega for MAIS RECENTE do que a que já está
      where coalesce(nullif(t.dados->>'atualizadoEm', '')::timestamptz, 'epoch'::timestamptz)
            < (excluded.dados->>'atualizadoEm')::timestamptz;

    get diagnostics v_n = row_count;
    if v_n > 0 then v_aceites := v_aceites + 1; else v_ignor := v_ignor + 1; end if;
  end loop;

  return jsonb_build_object('aceites', v_aceites, 'ignorados', v_ignor, 'hora', now());
end;
$$;

-- ---------- 2. Receber ----------
-- Devolve, por ordem, os registos alterados DEPOIS do ponto indicado. O ponto é
-- (p_desde, p_desde_tabela, p_desde_id): a app guarda o último que recebeu. Com os
-- três campos a paginação não perde registos mesmo que muitos tenham a mesma data
-- (o que acontece quando se envia um lote de uma vez). Só com p_desde, devolve
-- tudo o que mudou depois dessa data. Sem nada, devolve tudo (primeira sincronização).
create or replace function public.receber_registos(
  p_granja       uuid,
  p_desde        timestamptz default null,
  p_desde_tabela text        default null,
  p_desde_id     text        default null,
  p_limite       int         default 500)
returns table (tabela text, id text, dados jsonb, apagado boolean, atualizado_em timestamptz)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso iniciar sessão para sincronizar.';
  end if;
  if not public.eh_membro(p_granja) then
    raise exception 'Não pertences a esta granja.';
  end if;

  return query
    select r.tabela, r.id, r.dados, r.apagado, r.atualizado_em
    from public.registos r
    where r.granja_id = p_granja
      and (
        p_desde is null
        or (p_desde_tabela is null and r.atualizado_em > p_desde)
        or (p_desde_tabela is not null
            and (r.atualizado_em, r.tabela, r.id) > (p_desde, p_desde_tabela, coalesce(p_desde_id, '')))
      )
    order by r.atualizado_em, r.tabela, r.id
    limit least(greatest(coalesce(p_limite, 500), 1), 1000);
end;
$$;

-- ---------- 3. Resumo ----------
-- Para a app perguntar, antes da primeira sincronização, "o servidor já tem dados?"
create or replace function public.resumo_granja(p_granja uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'É preciso iniciar sessão para sincronizar.';
  end if;
  if not public.eh_membro(p_granja) then
    raise exception 'Não pertences a esta granja.';
  end if;
  select jsonb_build_object(
           'total',    count(*),
           'vivos',    count(*) filter (where not r.apagado),
           'apagados', count(*) filter (where r.apagado),
           'ultima',   max(r.atualizado_em))
    into v
    from public.registos r
   where r.granja_id = p_granja;
  return v;
end;
$$;

-- ---------- 4. Permissões ----------
revoke all on function public.enviar_registos(uuid, jsonb) from public, anon;
revoke all on function public.receber_registos(uuid, timestamptz, text, text, int) from public, anon;
revoke all on function public.resumo_granja(uuid) from public, anon;
grant execute on function public.enviar_registos(uuid, jsonb) to authenticated;
grant execute on function public.receber_registos(uuid, timestamptz, text, text, int) to authenticated;
grant execute on function public.resumo_granja(uuid) to authenticated;

-- Fim. Para confirmar: select proname from pg_proc where proname in
-- ('enviar_registos','receber_registos','resumo_granja');

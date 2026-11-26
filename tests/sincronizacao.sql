-- ============================================================================
--  Testes das funções de servidor/03-sincronizacao.sql (ver como correr em tests/supabase-simulado.sql).
--  Cada resultado traz no nome o valor esperado (ex.: "aceites_esperado_3").
--  Cobre: envio, reenvio sem efeito, "o mais recente ganha", datas do futuro, apagar, paginação
--  sem perder registos, isolamento entre granjas, lote tudo-ou-nada e pedidos inválidos.
-- ============================================================================
\set ON_ERROR_STOP off
\pset tuples_only on
\echo '== utilizadores e granja'
insert into auth.users(id,email) values ('aaaaaaaa-0000-4000-8000-000000000001','a@x.pt'),('bbbbbbbb-0000-4000-8000-000000000002','b@x.pt');
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
select public.criar_granja('Capoeira A') as granja \gset
\echo granja criada pelo A: :granja

\echo '== 1) enviar 3 registos'
select public.enviar_registos(:'granja', '[
 {"tabela":"compartimentos","id":"c1","apagado":false,"dados":{"id":"c1","nome":"Galinheiro","atualizadoEm":"2026-10-20T10:00:00.000Z"}},
 {"tabela":"aves","id":"a1","apagado":false,"dados":{"id":"a1","qtd":5,"atualizadoEm":"2026-10-20T10:00:00.000Z"}},
 {"tabela":"aves","id":"a2","apagado":false,"dados":{"id":"a2","qtd":2,"atualizadoEm":"2026-10-20T10:00:00.000Z"}}]'::jsonb) ->> 'aceites' as aceites_esperado_3;

\echo '== 2) reenviar igual: tudo ignorado e a data do servidor NÃO muda'
select atualizado_em as antes from public.registos where id='a1' \gset
select pg_sleep(0.05);
select (public.enviar_registos(:'granja', '[{"tabela":"aves","id":"a1","dados":{"id":"a1","qtd":5,"atualizadoEm":"2026-10-20T10:00:00.000Z"}}]'::jsonb)) ->> 'ignorados' as ignorados_esperado_1;
select (atualizado_em = :'antes'::timestamptz) as data_servidor_inalterada_true from public.registos where id='a1';

\echo '== 3) versão mais ANTIGA é ignorada; mais NOVA é aceite'
select (public.enviar_registos(:'granja', '[{"tabela":"aves","id":"a1","dados":{"id":"a1","qtd":99,"atualizadoEm":"2026-10-19T10:00:00.000Z"}}]'::jsonb)) ->> 'ignorados' as antiga_ignorada_1;
select dados->>'qtd' as qtd_continua_5 from public.registos where id='a1';
select (public.enviar_registos(:'granja', '[{"tabela":"aves","id":"a1","dados":{"id":"a1","qtd":7,"atualizadoEm":"2026-10-21T08:00:00.000Z"}}]'::jsonb)) ->> 'aceites' as nova_aceite_1;
select dados->>'qtd' as qtd_passou_7, (atualizado_em > :'antes'::timestamptz) as data_servidor_avancou_true from public.registos where id='a1';

\echo '== 4) data do futuro é limitada a +5 minutos'
select public.enviar_registos(:'granja', '[{"tabela":"aves","id":"a3","dados":{"id":"a3","atualizadoEm":"2099-01-01T00:00:00.000Z"}}]'::jsonb) ->> 'aceites' as aceite_1;
select ((dados->>'atualizadoEm')::timestamptz < now() + interval '6 minutes') as limitada_true from public.registos where id='a3';

\echo '== 5) apagar propaga (apagado=true) e conta no resumo'
select public.enviar_registos(:'granja', '[{"tabela":"aves","id":"a2","apagado":true,"dados":{"id":"a2","qtd":2,"apagado":true,"atualizadoEm":"2026-10-22T09:00:00.000Z"}}]'::jsonb) ->> 'aceites' as apagado_aceite_1;
select public.resumo_granja(:'granja') as resumo;

\echo '== 6) paginação sem perder nada, mesmo com a MESMA data de servidor (lote enviado de uma vez)'
select public.enviar_registos(:'granja', (select jsonb_agg(jsonb_build_object('tabela','ovosLog','id','o'||g,'dados',jsonb_build_object('id','o'||g,'qtd',g,'atualizadoEm','2026-10-23T10:00:00.000Z'))) from generate_series(1,7) g)) ->> 'aceites' as lote_7;
create temp table recebidos (tabela text, id text);
select set_config('app.granja', :'granja', false);
do $$
declare ts timestamptz := null; tb text := null; i text := null; n int; ult record; paginas int := 0;
begin
  loop
    n := 0;
    for ult in select * from public.receber_registos(current_setting('app.granja')::uuid, ts, tb, i, 3) loop
      insert into recebidos values (ult.tabela, ult.id);
      ts := ult.atualizado_em; tb := ult.tabela; i := ult.id; n := n + 1;
    end loop;
    paginas := paginas + 1;
    exit when n = 0;
  end loop;
  raise notice 'páginas lidas: %', paginas;
end $$;
select count(*) as total_recebido_esperado_11, count(distinct (tabela,id)) as distintos_11 from recebidos;

\echo '== 7) um membro de outra granja / sem sessão não consegue nada'
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',false);
select public.receber_registos(:'granja') ;
select public.enviar_registos(:'granja','[]'::jsonb);
select public.resumo_granja(:'granja');
select count(*) as B_ve_registos_esperado_0 from public.registos;
select set_config('request.jwt.claim.sub','',false);
select public.receber_registos(:'granja');

\echo '== 8) tabela inválida: erro e NADA do lote fica gravado'
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
select public.enviar_registos(:'granja', '[{"tabela":"aves","id":"x1","dados":{"id":"x1","atualizadoEm":"2026-10-24T10:00:00.000Z"}},{"tabela":"naoexiste","id":"x2","dados":{}}]'::jsonb);
select count(*) as x1_nao_ficou_esperado_0 from public.registos where id='x1';
\echo '== 9) lista demasiado grande e formato errado'
select public.enviar_registos(:'granja', '{"a":1}'::jsonb);
select public.enviar_registos(:'granja', (select jsonb_agg('{"tabela":"aves","id":"z","dados":{}}'::jsonb) from generate_series(1,501)));
\echo '== 10) receber só o que mudou depois de um ponto (sem tabela/id)'
select count(*) as depois_do_ponto from public.receber_registos(:'granja', now() + interval '1 hour');

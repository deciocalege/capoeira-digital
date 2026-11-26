-- ============================================================================
--  Testes de servidor/04-papeis-e-convites.sql
--  Como correr: ver tests/supabase-simulado.sql (corre também o 01, o 03 e o 04 antes deste).
--  Cada resultado traz no nome o valor esperado (ex.: "membros_esperado_2").
--  Os "ERROR:" que aparecem são os pedidos que TÊM de ser recusados.
-- ============================================================================
\set ON_ERROR_STOP off
\pset footer off
insert into auth.users(id,email) values
 ('aaaaaaaa-0000-4000-8000-00000000000a','admin@x.pt'),
 ('bbbbbbbb-0000-4000-8000-00000000000b','Trabalhador@X.pt'),
 ('cccccccc-0000-4000-8000-00000000000c','outra@x.pt');
\set A '\'aaaaaaaa-0000-4000-8000-00000000000a\''
\set B '\'bbbbbbbb-0000-4000-8000-00000000000b\''
\set C '\'cccccccc-0000-4000-8000-00000000000c\''

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);
select public.criar_granja('Capoeira Teste') as g \gset
\echo == granja :g

\echo '== 1) convidar: email normalizado, código legível, um só convite pendente por pessoa'
select public.convidar(:'g', '  TRABALHADOR@x.pt ', 'trabalhador') as conv \gset
select (:'conv'::jsonb)->>'email' as email_normalizado, (:'conv'::jsonb)->>'codigo' as codigo;
select (:'conv'::jsonb->>'codigo' ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$') as formato_ok_true;
select (:'conv'::jsonb)->>'codigo' as cod1 \gset
select public.convidar(:'g', 'trabalhador@x.pt', 'trabalhador') ->> 'codigo' as cod2 \gset
select (:'cod1' <> :'cod2') as novo_codigo_true, (select count(*) from public.listar_convites(:'g')) as pendentes_esperado_1;
\echo '   -- o código antigo deixou de servir (só o último):'
reset role;
select count(*) as codigo_antigo_ainda_existe_esperado_0 from public.convites where codigo = :'cod1';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);

\echo '== 2) convites inválidos'
select public.convidar(:'g', 'isto-nao-e-email', 'trabalhador');
select public.convidar(:'g', 'x@x.pt', 'chefe');
select public.convidar(:'g', 'admin@x.pt', 'trabalhador');

\echo '== 3) outra pessoa não consegue usar o convite do trabalhador'
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000c', false);
select public.aceitar_convite(:'cod2');
select public.aceitar_convite('0000-0000-0000');
select public.aceitar_convite('curto');
select count(*) as C_ainda_nao_e_membro_esperado_0 from public.membros where utilizador_id = :C;

\echo '== 4) o trabalhador aceita (aceita código em minúsculas e sem hífens) e depois não repete'
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', false);
select public.aceitar_convite(lower(replace(:'cod2', '-', ''))) ->> 'papel' as papel_esperado_trabalhador;
select public.aceitar_convite(:'cod2');
select papel as papel_na_tabela from public.membros where utilizador_id = :B;

\echo '== 5) convite expirado'
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);
select public.convidar(:'g', 'outra@x.pt', 'trabalhador') ->> 'codigo' as cod3 \gset
reset role;
update public.convites set expira_em = now() - interval '1 hour' where codigo = :'cod3';
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-00000000000c', false);
select public.aceitar_convite(:'cod3');

\echo '== 6) o trabalhador NÃO vê nem escreve finanças (imposto pelo servidor)'
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);
select public.enviar_registos(:'g', '[
  {"tabela":"aves","id":"a1","dados":{"id":"a1","qtd":5,"atualizadoEm":"2026-10-20T10:00:00.000Z"}},
  {"tabela":"transacoes","id":"t1","dados":{"id":"t1","valor":100,"atualizadoEm":"2026-10-20T10:00:00.000Z"}},
  {"tabela":"vendas","id":"v1","dados":{"id":"v1","atualizadoEm":"2026-10-20T10:00:00.000Z"}},
  {"tabela":"revenda","id":"r1","dados":{"id":"r1","atualizadoEm":"2026-10-20T10:00:00.000Z"}},
  {"tabela":"revendaMov","id":"m1","dados":{"id":"m1","atualizadoEm":"2026-10-20T10:00:00.000Z"}}]'::jsonb) ->> 'aceites' as admin_enviou_5_esperado_5;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', false);
select string_agg(tabela, ',' order by tabela) as trabalhador_recebe_so_esperado_aves from public.receber_registos(:'g');
select count(*) as trabalhador_select_directo_financas_esperado_0 from public.registos where tabela in ('transacoes','vendas','revenda','revendaMov');
select (public.resumo_granja(:'g'))->>'total' as resumo_do_trabalhador_esperado_1;
select public.enviar_registos(:'g', '[
  {"tabela":"aves","id":"a2","dados":{"id":"a2","qtd":1,"atualizadoEm":"2026-10-21T10:00:00.000Z"}},
  {"tabela":"transacoes","id":"t2","dados":{"id":"t2","valor":1,"atualizadoEm":"2026-10-21T10:00:00.000Z"}},
  {"tabela":"transacoes","id":"t1","dados":{"id":"t1","valor":0,"atualizadoEm":"2026-10-25T10:00:00.000Z"}}]'::jsonb) as trabalhador_envia_aceites_1_recusados_2;
insert into public.registos (granja_id, tabela, id, dados) values (:'g', 'transacoes', 't3', '{}');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);
select count(*) as admin_ve_transacoes_esperado_1, (select dados->>'valor' from public.registos where id='t1') as t1_intacto_esperado_100 from public.registos where tabela='transacoes';

\echo '== 7) listas: membros (todos veem), convites (só admin)'
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', false);
select count(*) as membros_esperado_2 from public.listar_membros(:'g');
select email, papel, sou_eu from public.listar_membros(:'g') order by papel desc;
select public.listar_convites(:'g');

\echo '== 8) papéis: o trabalhador não promove ninguém; o admin não fica sozinho sem admin'
select public.alterar_papel(:'g', :B, 'administrador');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);
select public.alterar_papel(:'g', :A, 'trabalhador');
select public.remover_membro(:'g', :A);
select public.sair_da_granja(:'g');
select public.alterar_papel(:'g', :B, 'administrador');
select papel as B_agora_esperado_administrador from public.membros where utilizador_id = :B;
select public.alterar_papel(:'g', :B, 'trabalhador');
select papel as B_voltou_trabalhador from public.membros where utilizador_id = :B;

\echo '== 9) a tabela de membros está fechada a escritas directas'
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', false);
update public.membros set papel = 'administrador' where utilizador_id = :B;
insert into public.membros (granja_id, utilizador_id, papel) values (:'g', :C, 'administrador');
delete from public.membros where utilizador_id = :B;
select count(*) as select_directo_aos_convites_recusado from public.convites;

\echo '== 10) retirar alguém: perde logo o acesso aos dados'
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);
select public.remover_membro(:'g', :B);
select count(*) as membros_depois_esperado_1 from public.membros where granja_id = :'g';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', false);
select public.receber_registos(:'g');
select count(*) as B_ve_registos_esperado_0 from public.registos;

\echo '== 11) sair: o administrador pode sair quando há outro'
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);
select public.convidar(:'g', 'trabalhador@x.pt', 'administrador') ->> 'codigo' as cod4 \gset
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', false);
select public.aceitar_convite(:'cod4') ->> 'papel' as B_volta_como_esperado_administrador;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', false);
select public.sair_da_granja(:'g');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', false);
select count(*) as membros_que_ficam_esperado_1, count(*) filter (where papel = 'administrador') as admins_esperado_1 from public.listar_membros(:'g');
select public.sair_da_granja(:'g');

\echo '== 12) sem sessão nada funciona'
select set_config('request.jwt.claim.sub', '', false);
select public.convidar(:'g', 'x@x.pt', 'trabalhador');
select public.aceitar_convite('AAAA-BBBB-CCCC');
select public.listar_membros(:'g');

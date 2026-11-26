/* Testes da ligação ao servidor: node tests/servidor.test.js */
const assert = require('assert');
const armazem = {};
global.localStorage = {getItem:k=>(k in armazem ? armazem[k] : null), setItem:(k,v)=>{ armazem[k] = String(v); }, removeItem:k=>{ delete armazem[k]; }};
const Servidor = require('../js/servidor.js');
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = papel => `${b64({alg:'HS256', typ:'JWT'})}.${b64({role:papel, iss:'supabase'})}.assinatura`;
let ok = 0; const falhas = [];
async function test(nome, fn){ try{ await fn(); ok++; console.log('  ✅ '+nome); }catch(e){ falhas.push(nome); console.log('  ❌ '+nome+'\n     '+e.message); } }
const cfg = {url:'https://abc.supabase.co', chave:jwt('anon')};
const resposta = (status, corpo) => ({ok: status>=200 && status<300, status, text: async()=>corpo===undefined ? '' : (typeof corpo==='string' ? corpo : JSON.stringify(corpo))});

(async()=>{
  await test('normalizarUrl: acrescenta https, remove caminhos e barras finais', ()=>{
    assert.strictEqual(Servidor.normalizarUrl('abc.supabase.co').url, 'https://abc.supabase.co');
    assert.strictEqual(Servidor.normalizarUrl('  https://abc.supabase.co/rest/v1/  ').url, 'https://abc.supabase.co');
    assert.strictEqual(Servidor.normalizarUrl('http://localhost:54321').url, 'http://localhost:54321');
  });
  await test('normalizarUrl: recusa vazio, http remoto e lixo', ()=>{
    assert.ok(Servidor.normalizarUrl('').erro);
    assert.ok(Servidor.normalizarUrl('http://abc.supabase.co').erro);
    assert.ok(Servidor.normalizarUrl('banana').erro);
    assert.ok(Servidor.normalizarUrl('https://').erro);
  });
  await test('analisarChave: aceita anon (JWT) e publishable', ()=>{
    assert.strictEqual(Servidor.analisarChave(jwt('anon')).tipo, 'jwt');
    assert.strictEqual(Servidor.analisarChave('sb_publishable_abc123').tipo, 'publishable');
    assert.strictEqual(Servidor.analisarChave(' '+jwt('anon').slice(0,20)+'\n'+jwt('anon').slice(20)+' ').tipo, 'jwt'); // espaços/quebras da colagem
  });
  await test('analisarChave: RECUSA a chave secreta (service_role e sb_secret_)', ()=>{
    assert.ok(Servidor.analisarChave(jwt('service_role')).erro.includes('SECRETA'));
    assert.ok(Servidor.analisarChave('sb_secret_abc').erro.includes('SECRETA'));
  });
  await test('analisarChave: recusa lixo e chaves vazias', ()=>{
    assert.ok(Servidor.analisarChave('').erro);
    assert.ok(Servidor.analisarChave('abc').erro);
    assert.ok(Servidor.analisarChave('a.b.c').erro);
  });
  await test('config: guardar, ler e remover', ()=>{
    assert.strictEqual(Servidor.lerConfig(), null);
    assert.ok(Servidor.guardarConfig(cfg));
    assert.deepStrictEqual(Servidor.lerConfig(), cfg);
    Servidor.removerConfig();
    assert.strictEqual(Servidor.lerConfig(), null);
    armazem['capoeira-servidor'] = '{estragado';
    assert.strictEqual(Servidor.lerConfig(), null); // JSON corrompido não rebenta
  });
  await test('testar: ligação ok devolve hora e versão do esquema; envia as chaves certas', async ()=>{
    let pedido;
    global.fetch = async (url, op)=>{ pedido = {url, op}; return resposta(200, {ok:true, versao_esquema:1, hora:'2026-10-09T10:00:00Z'}); };
    const r = await Servidor.testar(cfg);
    assert.strictEqual(r.estado, 'ok');
    assert.strictEqual(r.versaoEsquema, 1);
    assert.strictEqual(pedido.url, 'https://abc.supabase.co/rest/v1/rpc/ping');
    assert.strictEqual(pedido.op.method, 'POST');
    assert.strictEqual(pedido.op.headers.apikey, cfg.chave);
    assert.strictEqual(pedido.op.headers.Authorization, 'Bearer '+cfg.chave);
  });
  await test('testar: função em falta (404 / PGRST202) → falta-esquema', async ()=>{
    global.fetch = async ()=>resposta(404, {code:'PGRST202', message:'Could not find the function public.ping'});
    assert.strictEqual((await Servidor.testar(cfg)).estado, 'falta-esquema');
  });
  await test('testar: 401 e 403 → chave-invalida; 503 → servidor-indisponivel; 418 → erro', async ()=>{
    global.fetch = async ()=>resposta(401, {message:'Invalid API key'});
    assert.strictEqual((await Servidor.testar(cfg)).estado, 'chave-invalida');
    global.fetch = async ()=>resposta(403, '');
    assert.strictEqual((await Servidor.testar(cfg)).estado, 'chave-invalida');
    global.fetch = async ()=>resposta(503, 'Service Unavailable');
    assert.strictEqual((await Servidor.testar(cfg)).estado, 'servidor-indisponivel');
    global.fetch = async ()=>resposta(418, {});
    assert.strictEqual((await Servidor.testar(cfg)).estado, 'erro');
  });
  await test('testar: sem internet → sem-ligacao; sem configuração → sem-configuracao', async ()=>{
    global.fetch = async ()=>{ throw new TypeError('Failed to fetch'); };
    assert.strictEqual((await Servidor.testar(cfg)).estado, 'sem-ligacao');
    Servidor.removerConfig();
    assert.strictEqual((await Servidor.testar()).estado, 'sem-configuracao');
  });
  await test('pedido: tempo esgotado aborta o pedido', async ()=>{
    global.fetch = (url, op)=>new Promise((_, rejeitar)=>{ op.signal.addEventListener('abort', ()=>{ const e = new Error('abort'); e.name = 'AbortError'; rejeitar(e); }); });
    const r = await Servidor.pedido('/rest/v1/x', {config:cfg, tempoMs:30});
    assert.strictEqual(r.erro, 'tempo-esgotado');
  });

  /* ---------- Sessão (login) ---------- */
  const agora = ()=>Math.floor(Date.now()/1000);
  const tokenCom = (extra)=>`${b64({alg:'HS256'})}.${b64(Object.assign({sub:'user-1', email:'ana@exemplo.com'}, extra||{}))}.x`;
  const sessaoGoTrue = (extra)=>Object.assign({access_token:tokenCom(), refresh_token:'ref-1', expires_in:3600, user:{id:'user-1', email:'ana@exemplo.com'}}, extra||{});
  const limpar = ()=>{ Object.keys(armazem).forEach(k=>delete armazem[k]); };

  await test('entrar: guarda a sessão (com expires_at) e nunca guarda a palavra-passe', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    let pedido;
    global.fetch = async (url, op)=>{ pedido = {url, op}; return resposta(200, sessaoGoTrue()); };
    const r = await Servidor.entrar(' ana@exemplo.com ', 'segredo123');
    assert.ok(r.ok);
    assert.ok(pedido.url.endsWith('/auth/v1/token?grant_type=password'));
    assert.deepStrictEqual(JSON.parse(pedido.op.body), {email:'ana@exemplo.com', password:'segredo123'});
    assert.strictEqual(pedido.op.headers.Authorization, 'Bearer '+cfg.chave);    // o login usa a chave pública
    const s = Servidor.lerSessao();
    assert.strictEqual(s.user.email, 'ana@exemplo.com');
    assert.ok(s.expires_at > agora() + 3000);
    assert.ok(!JSON.stringify(armazem).includes('segredo123'));
  });
  await test('entrar: erros em português (credenciais, email por confirmar, email inválido, sem internet)', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    global.fetch = async ()=>resposta(400, {error_code:'invalid_credentials', msg:'Invalid login credentials'});
    assert.strictEqual((await Servidor.entrar('a@b.pt', 'x')).mensagem, 'Email ou palavra-passe incorretos.');
    global.fetch = async ()=>resposta(400, {error_code:'email_not_confirmed', msg:'Email not confirmed'});
    assert.ok((await Servidor.entrar('a@b.pt', 'x')).mensagem.includes('confirmado'));
    assert.ok((await Servidor.entrar('sem-arroba', 'x')).mensagem.includes('email válido'));
    global.fetch = async ()=>{ throw new TypeError('Failed to fetch'); };
    assert.ok((await Servidor.entrar('a@b.pt', 'x')).mensagem.includes('Sem ligação'));
    assert.strictEqual(Servidor.lerSessao(), null);
  });
  await test('criarConta: palavra-passe curta recusada; com confirmação por email; sem confirmação inicia sessão; registo desativado', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    let chamadas = 0; global.fetch = async ()=>{ chamadas++; return resposta(200, {}); };
    assert.ok((await Servidor.criarConta('a@b.pt', '1234567')).mensagem.includes('8 caracteres'));
    assert.strictEqual(chamadas, 0);
    global.fetch = async ()=>resposta(200, {id:'u2', email:'a@b.pt', confirmation_sent_at:'2026-10-10T10:00:00Z'});
    const c = await Servidor.criarConta('a@b.pt', '12345678');
    assert.ok(c.ok && c.confirmar && Servidor.lerSessao() === null);
    global.fetch = async ()=>resposta(200, sessaoGoTrue());
    const d = await Servidor.criarConta('a@b.pt', '12345678');
    assert.ok(d.ok && !d.confirmar && Servidor.lerSessao());
    limpar(); Servidor.guardarConfig(cfg);
    global.fetch = async ()=>resposta(422, {error_code:'signup_disabled', msg:'Signups not allowed for this instance'});
    assert.ok((await Servidor.criarConta('a@b.pt', '12345678')).mensagem.includes('desativado'));
    global.fetch = async ()=>resposta(400, {msg:'Email address "x@y.pt" is not authorized'});
    assert.ok((await Servidor.criarConta('x@y.pt', '12345678')).mensagem.includes('equipa'));
    global.fetch = async ()=>resposta(429, {error_code:'over_email_send_rate_limit', msg:'email rate limit exceeded'});
    assert.ok((await Servidor.criarConta('x@y.pt', '12345678')).mensagem.includes('Demasiados'));
  });
  await test('recuperarSenha: valida o email e chama /recover', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    let url; global.fetch = async (u)=>{ url = u; return resposta(200, {}); };
    assert.ok(!(await Servidor.recuperarSenha('')).ok);
    assert.ok((await Servidor.recuperarSenha('a@b.pt')).ok);
    assert.ok(url.endsWith('/auth/v1/recover'));
  });
  await test('pedido usa o token da sessão; o teste de ligação usa sempre a chave pública', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    const tok = tokenCom();
    Servidor.guardarSessao({access_token:tok, refresh_token:'r', expires_at:agora()+3000, user:{id:'user-1', email:'a@b.pt'}});
    const vistos = [];
    global.fetch = async (u, op)=>{ vistos.push(op.headers.Authorization); return resposta(200, {ok:true, versao_esquema:1}); };
    await Servidor.pedido('/rest/v1/registos');
    await Servidor.testar();
    assert.strictEqual(vistos[0], 'Bearer '+tok);
    assert.strictEqual(vistos[1], 'Bearer '+cfg.chave);
  });
  await test('tokenValido: renova só uma vez mesmo com pedidos em paralelo e guarda os tokens novos', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    Servidor.guardarSessao({access_token:'velho', refresh_token:'ref-1', expires_at:agora()+10, user:{id:'user-1', email:'a@b.pt'}});
    let renovacoes = 0;
    global.fetch = async (u, op)=>{ if(u.includes('grant_type=refresh_token')){ renovacoes++; assert.strictEqual(JSON.parse(op.body).refresh_token, 'ref-1'); return resposta(200, sessaoGoTrue({access_token:tokenCom({n:2}), refresh_token:'ref-2'})); } return resposta(200, []); };
    const [a, b, c] = await Promise.all([Servidor.tokenValido(), Servidor.tokenValido(), Servidor.pedido('/rest/v1/x')]);
    assert.strictEqual(renovacoes, 1);
    assert.strictEqual(a, b);
    assert.strictEqual(Servidor.lerSessao().refresh_token, 'ref-2');
  });
  await test('tokenValido: refresh recusado limpa a sessão; sem internet mantém a sessão', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    const expirada = ()=>Servidor.guardarSessao({access_token:'velho', refresh_token:'ref-1', expires_at:agora()-5, user:{id:'u', email:'a@b.pt'}});
    expirada();
    global.fetch = async ()=>resposta(400, {error_code:'refresh_token_not_found'});
    assert.strictEqual(await Servidor.tokenValido(), null);
    assert.strictEqual(Servidor.lerSessao(), null);
    expirada();
    global.fetch = async ()=>{ throw new TypeError('Failed to fetch'); };
    assert.strictEqual(await Servidor.tokenValido(), null);
    assert.ok(Servidor.lerSessao(), 'sem internet a sessão deve ficar guardada');
  });
  await test('sair: chama logout com o token e limpa sessão e granja, mesmo que o servidor falhe', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    Servidor.guardarSessao({access_token:'tk', refresh_token:'r', expires_at:agora()+3000, user:{id:'u', email:'a@b.pt'}});
    Servidor.guardarGranja({id:'g1', nome:'Capoeira', papel:'administrador'});
    let visto; global.fetch = async (u, op)=>{ visto = {u, auth:op.headers.Authorization}; throw new TypeError('offline'); };
    await Servidor.sair();
    assert.ok(visto.u.endsWith('/auth/v1/logout'));
    assert.strictEqual(visto.auth, 'Bearer tk');
    assert.strictEqual(Servidor.lerSessao(), null);
    assert.strictEqual(Servidor.lerGranja(), null);
  });
  await test('sessaoDeFragmento: lê o regresso do Google (tokens no endereço) e os erros', ()=>{
    const tk = tokenCom();
    const f = Servidor.sessaoDeFragmento(`#access_token=${tk}&refresh_token=r9&expires_in=3600&token_type=bearer`);
    assert.strictEqual(f.sessao.refresh_token, 'r9');
    assert.strictEqual(f.sessao.user.email, 'ana@exemplo.com');   // vem do próprio token
    assert.ok(f.sessao.expires_at > agora() + 3000);
    assert.ok(Servidor.sessaoDeFragmento('#error=access_denied&error_description=Acesso+negado').erro.includes('Acesso'));
    assert.strictEqual(Servidor.sessaoDeFragmento('#qualquer=coisa'), null);
    assert.strictEqual(Servidor.sessaoDeFragmento(''), null);
  });
  await test('minhasGranjas e criarGranja: pedidos certos e resultados tratados', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    Servidor.guardarSessao({access_token:'tk', refresh_token:'r', expires_at:agora()+3000, user:{id:'user-1', email:'a@b.pt'}});
    let url; global.fetch = async (u)=>{ url = u; return resposta(200, [{granja_id:'g1', papel:'administrador', granjas:{id:'g1', nome:'Capoeira'}}, {granja_id:'g2', papel:'trabalhador', granjas:null}]); };
    const r = await Servidor.minhasGranjas();
    assert.ok(url.includes('/rest/v1/membros?select=granja_id,papel,granjas(id,nome)&utilizador_id=eq.user-1'));
    assert.deepStrictEqual(r.granjas, [{id:'g1', nome:'Capoeira', papel:'administrador'}]);
    let corpo; global.fetch = async (u, op)=>{ url = u; corpo = JSON.parse(op.body); return resposta(200, '"0d9a6c11-84fe-4a1b-9c1a-7e2f8d4a1b60"'); };
    const c = await Servidor.criarGranja('  Minha criação ');
    assert.ok(url.endsWith('/rest/v1/rpc/criar_granja'));
    assert.deepStrictEqual(corpo, {p_nome:'Minha criação'});
    assert.strictEqual(c.granja.id, '0d9a6c11-84fe-4a1b-9c1a-7e2f8d4a1b60');
    assert.ok(!(await Servidor.criarGranja('  ')).ok);
    global.fetch = async ()=>resposta(401, {message:'JWT expired'});
    assert.ok(!(await Servidor.criarGranja('X')).ok);
  });
  await test('urlGoogle aponta para o servidor com o regresso à página atual', ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    global.location = {origin:'https://deciocalege.github.io', pathname:'/capoeira-digital/servidor.html'};
    const u = Servidor.urlGoogle();
    assert.ok(u.startsWith('https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to='));
    assert.ok(decodeURIComponent(u.split('redirect_to=')[1]) === 'https://deciocalege.github.io/capoeira-digital/servidor.html');
  });

  await test('minhasGranjas/criarGranja: com a sessão expirada e o refresh recusado nunca usam a chave pública', async ()=>{
    limpar(); Servidor.guardarConfig(cfg);
    Servidor.guardarSessao({access_token:'velho', refresh_token:'ref-1', expires_at:agora()-5, user:{id:'user-1', email:'a@b.pt'}});
    const vistos = [];
    global.fetch = async (u, op)=>{ vistos.push(u); return resposta(400, {error_code:'refresh_token_not_found'}); };
    const r = await Servidor.minhasGranjas();
    assert.ok(!r.ok && r.expirada);
    assert.ok(vistos.every(u=>u.includes('grant_type=refresh_token')), 'só o pedido de renovação, nenhum pedido de dados');
    Servidor.guardarSessao({access_token:'velho', refresh_token:'ref-1', expires_at:agora()-5, user:{id:'user-1', email:'a@b.pt'}});
    const c = await Servidor.criarGranja('X');
    assert.ok(!c.ok && c.mensagem.includes('expirou'));
  });
  /* ---------- Pessoas e convites (servidor/04-papeis-e-convites.sql) ---------- */
  const comSessao = ()=>{ Servidor.guardarConfig(cfg); Servidor.guardarSessao({access_token:'tok-1', refresh_token:'ref-1', expires_at:Math.floor(Date.now()/1000)+3600, user:{id:'user-1', email:'a@b.pt'}}); };
  await test('convidar, aceitar, listar, alterar papel, retirar e sair chamam as funções certas, com o token e os nomes certos', async ()=>{
    comSessao(); const chamadas = [];
    global.fetch = async (u, op)=>{ chamadas.push({u, corpo:JSON.parse(op.body || '{}'), auth:(op.headers || {}).Authorization}); return resposta(200, []); };
    await Servidor.convidar('g1', 'x@y.pt', 'trabalhador');
    await Servidor.aceitarConvite('AAAA-BBBB-CCCC');
    await Servidor.listarMembros('g1'); await Servidor.listarConvites('g1'); await Servidor.cancelarConvite('c1');
    await Servidor.alterarPapel('g1', 'u2', 'administrador'); await Servidor.removerMembro('g1', 'u2'); await Servidor.sairDaGranja('g1');
    const alvo = chamadas.map(c=>c.u.split('/rpc/')[1]);
    assert.deepStrictEqual(alvo, ['convidar', 'aceitar_convite', 'listar_membros', 'listar_convites', 'cancelar_convite', 'alterar_papel', 'remover_membro', 'sair_da_granja']);
    assert.deepStrictEqual(chamadas[0].corpo, {p_granja:'g1', p_email:'x@y.pt', p_papel:'trabalhador'});
    assert.deepStrictEqual(chamadas[1].corpo, {p_codigo:'AAAA-BBBB-CCCC'});
    assert.deepStrictEqual(chamadas[5].corpo, {p_granja:'g1', p_utilizador:'u2', p_papel:'administrador'});
    assert.ok(chamadas.every(c=>c.auth === 'Bearer tok-1'), 'sempre com o token da sessão, nunca com a chave pública');
  });
  await test('convidar sem papel indicado convida como trabalhador', async ()=>{
    comSessao(); let corpo;
    global.fetch = async (u, op)=>{ corpo = JSON.parse(op.body); return resposta(200, {codigo:'X'}); };
    const r = await Servidor.convidar('g1', 'x@y.pt');
    assert.ok(r.ok); assert.strictEqual(corpo.p_papel, 'trabalhador');
  });
  await test('uma regra recusada pelo servidor mostra a mensagem do servidor (já em português)', async ()=>{
    comSessao();
    global.fetch = async ()=>resposta(400, {code:'P0001', message:'Só os administradores podem convidar pessoas.'});
    const r = await Servidor.convidar('g1', 'x@y.pt', 'trabalhador');
    assert.ok(!r.ok); assert.strictEqual(r.mensagem, 'Só os administradores podem convidar pessoas.');
  });
  await test('sem o ficheiro 04 no servidor: diz qual executar', async ()=>{
    comSessao();
    global.fetch = async ()=>resposta(404, {code:'PGRST202', message:'Could not find the function public.convidar'});
    const r = await Servidor.convidar('g1', 'x@y.pt', 'trabalhador');
    assert.ok(!r.ok && r.falhaSql); assert.ok(r.mensagem.includes('04-papeis-e-convites.sql'));
  });
  await test('sessão recusada (401) e falhas do servidor não mostram texto técnico', async ()=>{
    comSessao();
    global.fetch = async ()=>resposta(401, {message:'JWT expired'});
    const r1 = await Servidor.listarMembros('g1'); assert.ok(!r1.ok); assert.ok(!/JWT/.test(r1.mensagem));
    global.fetch = async ()=>resposta(500, {message:'relation "x" does not exist'});
    const r2 = await Servidor.listarMembros('g1'); assert.ok(!r2.ok); assert.ok(!/relation/.test(r2.mensagem));
  });
  await test('sem sessão nem se tenta falar com o servidor', async ()=>{
    Servidor.limparSessao(); let tentou = false;
    global.fetch = async ()=>{ tentou = true; return resposta(200, []); };
    const r = await Servidor.convidar('g1', 'x@y.pt', 'trabalhador');
    assert.ok(!r.ok && /expirou|Entra/.test(r.mensagem)); assert.strictEqual(tentou, false);
  });
  await test('papelActual: o papel da criação escolhida, ou nada', ()=>{
    Servidor.limparGranja(); assert.strictEqual(Servidor.papelActual(), null);
    Servidor.guardarGranja({id:'g1', nome:'C', papel:'trabalhador'}); assert.strictEqual(Servidor.papelActual(), 'trabalhador');
    Servidor.guardarGranja({id:'g1', nome:'C', papel:'administrador'}); assert.strictEqual(Servidor.papelActual(), 'administrador');
    Servidor.limparGranja();
  });
  console.log(`\n${ok} passou(ram), ${falhas.length} falhou(aram)`);
  process.exit(falhas.length ? 1 : 0);
})();

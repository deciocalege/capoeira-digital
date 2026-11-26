/* @revisao 2.19.0 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).ficheiros = '2.19.0';
/* ============ ARQUIVO DA CRIAÇÃO — Netlify Blobs ============
   O Supabase continua a validar sessão e papel. Os ficheiros novos ficam
   no armazenamento persistente da Netlify, separados por criação.
   Administrador: carregar/eliminar. Trabalhador: consultar/descarregar. */

let _ficheiros = [];

function tamanhoFicheiro(bytes){
  if(!bytes) return '—';
  if(bytes < 1024) return `${bytes} B`;
  if(bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(2)} MB`;
}
function dataFicheiro(valor){
  if(!valor) return '—';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-PT');
}
async function tokenFicheiros(){
  if(typeof Servidor === 'undefined' || !Servidor.lerSessao()) return null;
  return await Servidor.tokenValido();
}
async function pedidoFicheiros(metodo='GET', corpo=null, query=''){
  const granja = Servidor.lerGranja();
  const token = await tokenFicheiros();
  if(!granja?.id || !token) throw new Error('Entra na página Servidor e seleciona a tua criação.');
  const headers = { authorization: `Bearer ${token}` };
  const opcoes = { method:metodo, headers };
  if(corpo instanceof FormData) opcoes.body = corpo;
  else if(corpo !== null){ headers['content-type'] = 'application/json'; opcoes.body = JSON.stringify(corpo); }
  const r = await fetch(`/.netlify/functions/ficheiros?granjaId=${encodeURIComponent(granja.id)}${query}`, opcoes);
  if(!r.ok){
    let d = {}; try{ d = await r.json(); }catch(e){}
    throw new Error(d.mensagem || `Erro ao comunicar com o armazenamento (${r.status}).`);
  }
  return r;
}

async function carregarListaFicheiros(){
  const r = await pedidoFicheiros();
  const d = await r.json();
  if(!d.ok) throw new Error(d.mensagem || 'Não foi possível listar os ficheiros.');
  _ficheiros = Array.isArray(d.ficheiros) ? d.ficheiros : [];
  return _ficheiros;
}

async function viewFicheiros(){
  const granja = Servidor.lerGranja();
  if(!Servidor.lerSessao()) return `<h2 class="section-title">Arquivo de ficheiros</h2><p class="empty">Inicia sessão na página <a href="servidor.html">Servidor</a> para aceder aos ficheiros.</p>`;
  if(!granja?.id) return `<h2 class="section-title">Arquivo de ficheiros</h2><p class="empty">Seleciona primeiro uma criação na página <a href="servidor.html">Servidor</a>.</p>`;
  const admin = Servidor.papelActual() === 'administrador';
  return `
    <h2 class="section-title">Arquivo de ficheiros</h2>
    <p class="footnote">Os ficheiros são guardados na Netlify, separados por criação. O Supabase continua responsável pelo login e pelas permissões.</p>
    ${admin ? `<form id="form-upload-ficheiros" class="card" style="padding:1rem;">
      <h3>Adicionar ficheiro</h3>
      <label>Selecionar ficheiro (máximo 4 MB)
        <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.csv,.xls,.xlsx,.zip,.txt" required>
      </label>
      <button class="btn" type="submit">${Icon.svg('caixa')} Carregar para a Netlify</button>
      <p class="footnote">Formatos: PDF, imagens, CSV, Excel, ZIP e TXT.</p>
    </form>` : `<p class="footnote">Tens acesso de consulta. O carregamento e a eliminação estão reservados ao administrador.</p>`}
    <div class="acoes" style="justify-content:space-between;align-items:center;">
      <h3>Ficheiros guardados (${_ficheiros.length})</h3>
      <button class="btn outline small" id="btn-atualizar-ficheiros" type="button">Atualizar lista</button>
    </div>
    ${_ficheiros.length ? `<div class="lista-ficheiros">${_ficheiros.map(f=>`
      <div class="card" style="padding:.85rem;margin:.5rem 0;display:flex;gap:.75rem;align-items:center;justify-content:space-between;flex-wrap:wrap;">
        <div style="min-width:0;flex:1;">
          <strong style="overflow-wrap:anywhere;">${Util.escapeHTML(f.nome)}</strong>
          <div class="footnote">${tamanhoFicheiro(f.tamanho)} · ${Util.escapeHTML(dataFicheiro(f.enviadoEm))}</div>
        </div>
        <div class="acoes">
          <button class="btn small" type="button" data-download-ficheiro="${Util.escapeHTML(f.key)}">Descarregar</button>
          ${admin ? `<button class="btn outline small" type="button" data-apagar-ficheiro="${Util.escapeHTML(f.key)}">Eliminar</button>` : ''}
        </div>
      </div>`).join('')}</div>` : `<p class="empty">Ainda não existem ficheiros nesta criação.</p>`}
    <p class="footnote">Nota: o envio pela Netlify Functions está limitado a ficheiros pequenos (até 4 MB nesta integração). Para ficheiros maiores será necessário implementar upload direto com URL temporário.</p>
  `;
}

async function renderFicheiros(){
  const app = document.getElementById('app');
  try{ await carregarListaFicheiros(); }
  catch(e){
    _ficheiros = [];
    const mensagem = Util.escapeHTML(e.message || 'Não foi possível carregar os ficheiros.');
    await UI.redesenhar(app, () => `<h2 class="section-title">Arquivo de ficheiros</h2><div class="card"><p>${mensagem}</p><p class="footnote">Confirma que o site foi publicado com as Netlify Functions e que as variáveis de ambiente estão configuradas.</p><p><a href="servidor.html">Abrir configuração do servidor</a></p></div>`, ligarEventosFicheiros);
    return;
  }
  await UI.redesenhar(app, () => viewFicheiros(), ligarEventosFicheiros);
}

function ligarEventosFicheiros(){
  const form = document.getElementById('form-upload-ficheiros');
  if(form) form.addEventListener('submit', async e=>{
    e.preventDefault();
    const botao = form.querySelector('button[type="submit"]');
    const file = form.querySelector('input[type="file"]').files[0];
    if(!file) return;
    botao.disabled = true;
    try{
      const dados = new FormData(); dados.append('file', file);
      const r = await pedidoFicheiros('POST', dados);
      const d = await r.json();
      if(!d.ok) throw new Error(d.mensagem || 'Falha no carregamento.');
      Util.toast('Ficheiro guardado na Netlify.');
      await renderFicheiros();
    }catch(err){ Util.toast('⚠️ ' + err.message, 6000); botao.disabled = false; }
  });
  const atualizar = document.getElementById('btn-atualizar-ficheiros');
  if(atualizar) atualizar.addEventListener('click', renderFicheiros);
  document.querySelectorAll('[data-download-ficheiro]').forEach(btn=>btn.addEventListener('click', async()=>{
    btn.disabled = true;
    try{
      const key = btn.dataset.downloadFicheiro;
      const r = await pedidoFicheiros('GET', null, `&key=${encodeURIComponent(key)}`);
      const blob = await r.blob();
      const nome = decodeURIComponent((r.headers.get('content-disposition') || '').split("filename*=UTF-8''")[1] || 'ficheiro');
      const a = document.createElement('a'), href = URL.createObjectURL(blob);
      a.href = href; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
    }catch(err){ Util.toast('⚠️ ' + err.message, 6000); }
    finally{ btn.disabled = false; }
  }));
  document.querySelectorAll('[data-apagar-ficheiro]').forEach(btn=>btn.addEventListener('click', async()=>{
    if(!confirm('Tens a certeza de que pretendes eliminar este ficheiro?')) return;
    btn.disabled = true;
    try{
      const r = await pedidoFicheiros('DELETE', {key:btn.dataset.apagarFicheiro});
      const d = await r.json();
      if(!d.ok) throw new Error(d.mensagem || 'Falha ao eliminar.');
      Util.toast('Ficheiro eliminado.'); await renderFicheiros();
    }catch(err){ Util.toast('⚠️ ' + err.message, 6000); btn.disabled = false; }
  }));
}

renderFicheiros();

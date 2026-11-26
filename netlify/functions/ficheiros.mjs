import { getStore } from '@netlify/blobs';

const MAX_BYTES = 4 * 1024 * 1024; // margem abaixo do limite binário das Functions
const STORE_NAME = 'capoeira-arquivos';
const MIME_PERMITIDOS = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'text/plain', 'text/csv',
  'application/zip',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const json = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const erro = (mensagem, status = 400) => json({ ok: false, mensagem }, status);

function obterStore() {
  // Escolha explícita da região evita o default us-east-2 inesperado.
  const region = process.env.CAPOEIRA_BLOBS_REGION || 'eu-central-1';
  return getStore({ name: STORE_NAME, region });
}

function nomeSeguro(nome) {
  const base = String(nome || 'ficheiro').normalize('NFKC').split(/[\\/]/).pop();
  return base.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\s+/g, '_').slice(0, 120) || 'ficheiro';
}

async function autenticar(req, granjaId) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const auth = req.headers.get('authorization') || '';
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !anon) return { falha: erro('Faltam as variáveis SUPABASE_URL e SUPABASE_ANON_KEY na Netlify.', 503) };
  if (!token) return { falha: erro('Inicia sessão para continuar.', 401) };
  if (!/^[0-9a-f-]{36}$/i.test(String(granjaId || ''))) return { falha: erro('Identificador da criação inválido.') };

  let user;
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anon, authorization: `Bearer ${token}` }
    });
    if (!r.ok) return { falha: erro('A sessão expirou ou não é válida. Entra novamente.', 401) };
    user = await r.json();
  } catch {
    return { falha: erro('Não foi possível validar a sessão no Supabase.', 503) };
  }
  if (!user?.id) return { falha: erro('Utilizador não autenticado.', 401) };

  try {
    const q = new URLSearchParams({
      select: 'granja_id,papel',
      utilizador_id: `eq.${user.id}`,
      granja_id: `eq.${granjaId}`,
      limit: '1'
    });
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/membros?${q}`, {
      headers: { apikey: anon, authorization: `Bearer ${token}` }
    });
    if (!r.ok) return { falha: erro('Não foi possível confirmar as permissões no Supabase.', 403) };
    const membros = await r.json();
    const membro = Array.isArray(membros) ? membros[0] : null;
    if (!membro) return { falha: erro('Não tens acesso a esta criação.', 403) };
    return { user, papel: membro.papel };
  } catch {
    return { falha: erro('Falha ao verificar as permissões.', 503) };
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const granjaId = url.searchParams.get('granjaId') || '';
  const auth = await autenticar(req, granjaId);
  if (auth.falha) return auth.falha;
  const { user, papel } = auth;
  const prefix = `${granjaId}/`;
  const store = obterStore();

  try {
    if (req.method === 'GET') {
      const key = url.searchParams.get('key');
      if (key) {
        if (!key.startsWith(prefix) || key.includes('..')) return erro('Ficheiro não autorizado.', 403);
        const item = await store.getWithMetadata(key, { type: 'blob' });
        if (!item) return erro('Ficheiro não encontrado.', 404);
        const meta = item.metadata || {};
        const nome = nomeSeguro(meta.fileName || 'download');
        return new Response(item.data, {
          headers: {
            'content-type': meta.contentType || 'application/octet-stream',
            'content-length': String(meta.size || item.data.size || 0),
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff'
          }
        });
      }
      const { blobs } = await store.list({ prefix });
      const ficheiros = await Promise.all(blobs.map(async b => {
        const meta = await store.getMetadata(b.key);
        const m = meta?.metadata || {};
        return {
          key: b.key,
          nome: m.fileName || b.key.slice(prefix.length),
          tipo: m.contentType || 'application/octet-stream',
          tamanho: Number(m.size) || 0,
          enviadoEm: m.uploadedAt || null,
          etag: b.etag
        };
      }));
      ficheiros.sort((a, b) => String(b.enviadoEm || '').localeCompare(String(a.enviadoEm || '')));
      return json({ ok: true, ficheiros });
    }

    if (req.method === 'POST') {
      if (papel !== 'administrador') return erro('Só o administrador pode carregar ficheiros.', 403);
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return erro('Seleciona um ficheiro.');
      if (file.size < 1 || file.size > MAX_BYTES) return erro('O ficheiro deve ter até 4 MB.');
      const tipo = String(file.type || 'application/octet-stream').toLowerCase();
      if (!MIME_PERMITIDOS.has(tipo)) return erro('Formato não permitido. Usa PDF, imagens, CSV, Excel, ZIP ou TXT.');
      const nome = nomeSeguro(file.name);
      const key = `${prefix}${crypto.randomUUID()}-${nome}`;
      await store.set(key, file, {
        metadata: {
          fileName: nome,
          contentType: tipo,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user.id
        }
      });
      return json({ ok: true, mensagem: 'Ficheiro guardado na Netlify Blobs.', key, nome });
    }

    if (req.method === 'DELETE') {
      if (papel !== 'administrador') return erro('Só o administrador pode eliminar ficheiros.', 403);
      const body = await req.json().catch(() => ({}));
      const key = String(body.key || '');
      if (!key.startsWith(prefix) || key.includes('..')) return erro('Ficheiro não autorizado.', 403);
      await store.delete(key);
      return json({ ok: true, mensagem: 'Ficheiro eliminado.' });
    }

    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, POST, DELETE' } });
  } catch (e) {
    console.error('[capoeira/ficheiros]', e);
    return erro('O armazenamento Netlify não respondeu. Confirma a configuração e tenta novamente.', 500);
  }
};

/* @revisao 2.15.1 — identifica a versão deste ficheiro (ver REVISOES em config.js) */
(globalThis.__revisao = globalThis.__revisao || {}).pdf = '2.15.1';
/* ============ PDF SEM BIBLIOTECAS ============
   Gera ficheiros PDF (A4, texto e tabelas) diretamente no telemóvel, sem
   internet e sem bibliotecas externas. Usa a letra Helvetica (já incluída em
   qualquer leitor de PDF) com acentuação portuguesa (WinAnsi).

   Uso:
     const doc = PDF.criar('Extrato financeiro');
     doc.titulo('Extrato financeiro', 'Período: 01/10/2026 a 31/10/2026');
     doc.secao('Resumo');
     doc.tabela(['Data','Valor'], [['01/10','100 MT']], {larguras:[100,100], alinhar:['l','r']});
     doc.descarregar('extrato.pdf');
*/
const PDF = (()=>{
  const LARG = 595.28, ALT = 841.89, MARGEM = 40;
  const AZUL = [0.141, 0.200, 0.286];   // #243349
  const CINZA = [0.33, 0.36, 0.43];

  /* Larguras (milésimas de em) da Helvetica; o que não está aqui vale 556. */
  const LARGURAS = {
    ' ':278,'!':278,'"':355,'&':667,"'":191,'(':333,')':333,'*':389,'+':584,',':278,'-':333,'.':278,'/':278,
    ':':278,';':278,'<':584,'=':584,'>':584,'@':1015,'%':889,
    A:667,B:667,C:722,D:722,E:667,F:611,G:778,H:722,I:278,J:500,K:667,L:556,M:833,N:722,O:778,P:667,Q:778,R:722,
    S:667,T:611,U:722,V:667,W:944,X:667,Y:667,Z:611,'[':278,'\\':278,']':278,'^':469,'`':333,
    c:500,f:278,i:222,j:222,k:500,l:222,m:833,r:333,s:500,t:278,v:500,w:722,x:500,y:500,z:500,
    '{':334,'|':260,'}':334,'~':584,'\u2013':556,'\u2014':1000,'\u2022':350,'\u2026':1000
  };
  const ESPECIAIS = {
    '\u20ac':0x80,'\u201a':0x82,'\u0192':0x83,'\u201e':0x84,'\u2026':0x85,'\u2020':0x86,'\u2021':0x87,'\u02c6':0x88,
    '\u2030':0x89,'\u0160':0x8a,'\u2039':0x8b,'\u0152':0x8c,'\u017d':0x8e,'\u2018':0x91,'\u2019':0x92,'\u201c':0x93,
    '\u201d':0x94,'\u2022':0x95,'\u2013':0x96,'\u2014':0x97,'\u02dc':0x98,'\u2122':0x99,'\u0161':0x9a,'\u203a':0x9b,
    '\u0153':0x9c,'\u017e':0x9e,'\u0178':0x9f
  };
  const ESPACOS = /[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]/;

  function paraBytes(s){
    const out = [];
    for(const ch of String(s==null ? '' : s)){
      let c = ch.codePointAt(0);
      if(ESPACOS.test(ch)) c = 32;
      if(c < 32) c = 32;
      if(c < 128 || (c >= 0xa1 && c <= 0xff)) out.push(c);
      else if(ESPECIAIS[ch]) out.push(ESPECIAIS[ch]);
      else out.push(63); // "?"
    }
    return out;
  }
  const hex = s => '<' + paraBytes(s).map(b=>b.toString(16).padStart(2,'0')).join('') + '>';
  function larguraChar(ch){
    if(ESPACOS.test(ch)) return LARGURAS[' '];
    if(LARGURAS[ch]!=null) return LARGURAS[ch];
    const base = ch.normalize('NFD')[0];
    return LARGURAS[base]!=null ? LARGURAS[base] : 556;
  }
  function larguraTexto(s, tam, negrito){
    let w = 0;
    for(const ch of String(s==null ? '' : s)) w += larguraChar(ch);
    w = w*tam/1000;
    return negrito ? w*1.07 : w;
  }
  /* Parte um texto em linhas que cabem em "max" pontos (parte palavras muito compridas). */
  function quebrar(s, max, tam, negrito){
    const texto = String(s==null ? '' : s).replace(/\s+/g,' ').trim();
    if(texto==='') return [''];
    const linhas = [];
    let atual = '';
    const empurrar = palavra=>{
      const tentativa = atual ? atual+' '+palavra : palavra;
      if(larguraTexto(tentativa, tam, negrito) <= max){ atual = tentativa; return; }
      if(atual){ linhas.push(atual); atual = ''; }
      if(larguraTexto(palavra, tam, negrito) <= max){ atual = palavra; return; }
      for(const ch of palavra){            // palavra maior que a coluna: quebra por letras
        if(larguraTexto(atual+ch, tam, negrito) > max && atual){ linhas.push(atual); atual = ''; }
        atual += ch;
      }
    };
    texto.split(' ').forEach(empurrar);
    if(atual) linhas.push(atual);
    return linhas;
  }
  const f2 = n => (Math.round(n*100)/100).toFixed(2);
  const rgb = c => c.map(f2).join(' ');

  function criar(tituloDoc){
    const paginas = [];
    let cmds, y;
    const util = LARG - 2*MARGEM;
    const RODAPE = MARGEM + 6;

    function nova(){ cmds = []; paginas.push(cmds); y = ALT - MARGEM; }
    nova();

    function texto(s, x, base, o){
      o = o || {};
      cmds.push(`BT /F${o.negrito ? 2 : 1} ${f2(o.tam||10)} Tf ${rgb(o.cor||[0,0,0])} rg 1 0 0 1 ${f2(x)} ${f2(base)} Tm ${hex(s)} Tj ET`);
    }
    function retangulo(x, yBase, w, h, cor){ cmds.push(`${rgb(cor)} rg ${f2(x)} ${f2(yBase)} ${f2(w)} ${f2(h)} re f`); }
    function linha(x1, y1, x2, y2, cor, esp){ cmds.push(`${rgb(cor)} RG ${f2(esp||0.5)} w ${f2(x1)} ${f2(y1)} m ${f2(x2)} ${f2(y2)} l S`); }
    const garantir = h => { if(y - h < RODAPE + 10) nova(); };

    const api = {
      titulo(t, sub){
        garantir(60);
        texto(t, MARGEM, y - 16, {tam:16, negrito:true, cor:AZUL});
        y -= 24;
        if(sub){
          quebrar(sub, util, 9.5).forEach(l=>{ texto(l, MARGEM, y - 9, {tam:9.5, cor:CINZA}); y -= 13; });
        }
        linha(MARGEM, y - 2, LARG - MARGEM, y - 2, AZUL, 1);
        y -= 12;
        return api;
      },
      secao(t){
        garantir(44);
        y -= 8;
        texto(t, MARGEM, y - 11, {tam:11.5, negrito:true, cor:AZUL});
        y -= 18;
        return api;
      },
      paragrafo(t, o){
        o = o || {};
        const tam = o.tam || 9.5;
        quebrar(t, util, tam, o.negrito).forEach(l=>{
          garantir(tam*1.4);
          texto(l, MARGEM, y - tam, {tam, negrito:o.negrito, cor:o.cor||[0,0,0]});
          y -= tam*1.4;
        });
        return api;
      },
      espaco(h){ y -= h; return api; },
      /* Tabela com cabeçalho repetido em cada página. larguras em pontos (soma ≤ 515). */
      tabela(cabecalhos, linhas, o){
        o = o || {};
        const tam = o.tam || 8.5, pad = 3.2, lh = tam*1.28;
        const n = cabecalhos.length;
        const lar = o.larguras || cabecalhos.map(()=>util/n);
        const alin = o.alinhar || cabecalhos.map(()=>'l');
        const cores = o.corColuna || {};
        const x0 = MARGEM;
        const xs = []; lar.reduce((x,w)=>{ xs.push(x); return x+w; }, x0);
        const total = lar.reduce((a,b)=>a+b,0);

        function desenharLinha(celulas, opc){
          const partes = celulas.map((c,i)=>quebrar(c, lar[i]-2*pad, tam, opc.negrito));
          const nl = Math.max(1, ...partes.map(p=>p.length));
          const h = nl*lh + 2*pad;
          if(y - h < RODAPE + 10){
            nova();
            if(!opc.cabecalho) desenharLinha(cabecalhos, {cabecalho:true, negrito:true, fundo:[0.90,0.93,0.97]});
          }
          if(opc.fundo) retangulo(x0, y-h, total, h, opc.fundo);
          partes.forEach((ls,i)=>{
            ls.forEach((l,k)=>{
              const w = larguraTexto(l, tam, opc.negrito);
              const x = alin[i]==='r' ? xs[i]+lar[i]-pad-w : alin[i]==='c' ? xs[i]+(lar[i]-w)/2 : xs[i]+pad;
              texto(l, x, y - pad - tam*0.86 - k*lh, {tam, negrito:opc.negrito, cor: opc.cabecalho ? AZUL : (cores[i] && !opc.semCor ? cores[i] : [0,0,0])});
            });
          });
          linha(x0, y-h, x0+total, y-h, [0.82,0.85,0.9], 0.4);
          y -= h;
        }
        if(!o.semCabecalho) desenharLinha(cabecalhos, {cabecalho:true, negrito:true, fundo:[0.90,0.93,0.97]});
        linhas.forEach((l,i)=>{
          const ultima = o.negritoUltima && i===linhas.length-1;
          desenharLinha(l.map(v=>v==null ? '' : String(v)), {negrito:ultima, fundo: (i%2===1 && !ultima) ? [0.97,0.975,0.985] : (ultima ? [0.93,0.95,0.98] : null)});
        });
        y -= 6;
        return api;
      },
      /* Gera os bytes do PDF (Uint8Array). */
      gerar(){
        const agora = new Date();
        const stamp = agora.toLocaleString('pt-PT', {dateStyle:'short', timeStyle:'short'});
        paginas.forEach((c, i)=>{
          cmds = c;
          texto(`Capoeira Digital — ${tituloDoc}`, MARGEM, 24, {tam:7.5, cor:CINZA});
          const dir = `Gerado em ${stamp}   ·   Página ${i+1} de ${paginas.length}`;
          texto(dir, LARG - MARGEM - larguraTexto(dir, 7.5), 24, {tam:7.5, cor:CINZA});
          linha(MARGEM, 34, LARG - MARGEM, 34, [0.82,0.85,0.9], 0.4);
        });
        const objetos = [];                 // textos ASCII de cada objeto (a partir do nº 1)
        const nPag = paginas.length;
        const idPaginas = 2, idF1 = 3, idF2 = 4, idInfo = 5 + nPag*2;
        objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objetos[idPaginas] = `<< /Type /Pages /Kids [${paginas.map((_,i)=>`${5+i*2} 0 R`).join(' ')}] /Count ${nPag} >>`;
        objetos[idF1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        objetos[idF2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        paginas.forEach((c,i)=>{
          const conteudo = c.join('\n');
          objetos[5+i*2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(LARG)} ${f2(ALT)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+i*2} 0 R >>`;
          objetos[6+i*2] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
        });
        const p2 = n => String(n).padStart(2,'0');
        const data = `D:${agora.getFullYear()}${p2(agora.getMonth()+1)}${p2(agora.getDate())}${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`;
        const tituloHex = 'FEFF' + Array.from(String(tituloDoc)).map(ch=>ch.codePointAt(0).toString(16).padStart(4,'0')).join('');
        objetos[idInfo] = `<< /Title <${tituloHex}> /Producer (Capoeira Digital) /CreationDate (${data}) >>`;

        let pdf = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
        const desloc = [];
        for(let i=1; i<objetos.length; i++){
          desloc[i] = pdf.length;
          pdf += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
        }
        const xref = pdf.length;
        pdf += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
        for(let i=1; i<objetos.length; i++) pdf += String(desloc[i]).padStart(10,'0') + ' 00000 n \n';
        pdf += `trailer\n<< /Size ${objetos.length} /Root 1 0 R /Info ${idInfo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        const bytes = new Uint8Array(pdf.length);
        for(let i=0; i<pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
        return bytes;
      },
      paginas(){ return paginas.length; },
      descarregar(nome){
        const blob = new Blob([api.gerar()], {type:'application/pdf'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url), 1500);
      }
    };
    return api;
  }
  return {criar, larguraTexto, quebrar};
})();
if(typeof module !== 'undefined') module.exports = PDF;

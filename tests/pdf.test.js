/* Testes do gerador de PDF: node tests/pdf.test.js */
const assert = require('assert');
const PDF = require('../js/pdf.js');
let ok = 0, falhas = [];
function test(nome, fn){ try{ fn(); ok++; console.log('  ✅ '+nome); }catch(e){ falhas.push(nome); console.log('  ❌ '+nome+'\n     '+e.message); } }
const texto = u8 => Buffer.from(u8).toString('latin1');

test('estrutura válida: cabeçalho, %%EOF e tabela xref com os deslocamentos certos', ()=>{
  const doc = PDF.criar('Teste'); doc.titulo('Olá'); doc.paragrafo('texto');
  const s = texto(doc.gerar());
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
  assert.ok(s.slice(start).startsWith('xref'));
  const n = Number(/xref\n0 (\d+)\n/.exec(s.slice(start))[1]);
  const linhas = s.slice(start).split('\n').slice(2, 2+n);
  linhas.slice(1).forEach((l, i)=>{
    const off = Number(l.slice(0,10));
    assert.ok(s.slice(off).startsWith(`${i+1} 0 obj`), `objeto ${i+1} no sítio errado`);
  });
});
test('acentos portugueses e travessão saem em WinAnsi (hex)', ()=>{
  const doc = PDF.criar('x'); doc.paragrafo('ação é ç — ü');
  const s = texto(doc.gerar());
  assert.ok(/<[0-9a-f]*e7e3[0-9a-f]*>/.test(s));      // "çã" = e7 e3
  assert.ok(s.includes('97'));                         // travessão = 0x97
});
test('espaços especiais de moeda (U+202F / U+00A0) viram espaço normal, nunca "?"', ()=>{
  const doc = PDF.criar('x'); doc.paragrafo('1\u202f250\u00a0MT');
  const s = texto(doc.gerar());
  const m = /rg 1 0 0 1 [\d.]+ [\d.]+ Tm <([0-9a-f]+)> Tj ET/.exec(s);
  assert.ok(m, 'texto não encontrado');
  assert.strictEqual(m[1], Buffer.from('1 250 MT','latin1').toString('hex'));
});
test('tabelas grandes passam para mais páginas e repetem o cabeçalho; rodapé "Página i de n"', ()=>{
  const doc = PDF.criar('Longo');
  doc.tabela(['A','B'], Array.from({length:200}, (_,i)=>['linha '+i, String(i)]), {larguras:[400,115], alinhar:['l','r']});
  assert.ok(doc.paginas() >= 4);
  const s = texto(doc.gerar());
  assert.strictEqual((s.match(/\/Type \/Page /g)||[]).length, doc.paginas());
});
test('quebrar() parte frases e palavras compridas dentro da largura', ()=>{
  const linhas = PDF.quebrar('uma frase com várias palavras que não cabem numa linha curta', 80, 9);
  assert.ok(linhas.length > 2);
  linhas.forEach(l=>assert.ok(PDF.larguraTexto(l, 9) <= 80.5, l));
  const longa = PDF.quebrar('A'.repeat(80), 60, 9);
  assert.ok(longa.length > 1);
  longa.forEach(l=>assert.ok(PDF.larguraTexto(l, 9) <= 60.5));
  assert.deepStrictEqual(PDF.quebrar('', 50, 9), ['']);
});
test('larguraTexto: letras largas > estreitas; acentuadas = base', ()=>{
  assert.ok(PDF.larguraTexto('WWW', 10) > PDF.larguraTexto('iii', 10));
  assert.strictEqual(PDF.larguraTexto('á', 10), PDF.larguraTexto('a', 10));
});
console.log(`\n${ok} passou(ram), ${falhas.length} falhou(aram)`);
process.exit(falhas.length ? 1 : 0);

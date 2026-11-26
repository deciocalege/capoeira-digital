'use strict';
/* ============================================================
   TESTE: todos os ficheiros JS têm a marca de revisão certa e o config.js lista-os todos.
   Corre antes de entregar uma versão:   node tests/ficheiros.test.js
   ============================================================ */
const fs = require('fs'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..', 'js');
const config = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
const versao = (config.match(/const APP_VERSAO = '([\d.]+)'/) || [])[1];
const revisoes = JSON.parse(('{' + (config.match(/const REVISOES = \{([\s\S]*?)\};/) || [])[1] + '}').replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"'));
const maisQue = (a, b)=>{ const x = a.split('.').map(Number), y = b.split('.').map(Number); for(let i = 0; i < 3; i++){ if((x[i]||0) !== (y[i]||0)) return (x[i]||0) > (y[i]||0); } return false; };
let ok = 0; const falhas = [];
function test(nome, fn){ try{ fn(); ok++; console.log('  ✅ ' + nome); }catch(e){ falhas.push(nome); console.log('  ❌ ' + nome + '\n     ' + e.message); } }

const ficheiros = fs.readdirSync(dir).filter(f=>f.endsWith('.js') && f !== 'config.js').map(f=>f.slice(0, -3));
test('config.js tem APP_VERSAO e a lista REVISOES', ()=>{ assert.ok(versao); assert.ok(Object.keys(revisoes).length > 10); });
ficheiros.forEach(n=>{
  test(`${n}.js: marca @revisao igual à exigida em config.js`, ()=>{
    const s = fs.readFileSync(path.join(dir, n + '.js'), 'utf8');
    const m = s.match(new RegExp("__revisao = globalThis\\.__revisao \\|\\| \\{\\}\\)\\." + n + " = '([\\d.]+)'"));
    assert.ok(m, 'falta a linha @revisao no topo');
    assert.strictEqual(m[1], revisoes[n], `o ficheiro diz ${m[1]} e o config.js exige ${revisoes[n]}`);
    assert.ok(!maisQue(m[1], versao), `o ficheiro (${m[1]}) é mais novo do que APP_VERSAO (${versao})`);
  });
});
test('config.js lista exactamente os ficheiros que existem', ()=>{
  assert.deepStrictEqual(Object.keys(revisoes).sort(), ficheiros.slice().sort());
});

console.log('\n' + '─'.repeat(50) + `\n${ok} passou(ram), ${falhas.length} falhou(aram)`);
if(falhas.length) process.exitCode = 1; else console.log('✅ Tudo bem — nenhuma regressão detectada.');

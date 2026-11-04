'use strict';
// Poder guardado (trocar sem atacar) e etapa de movimento com tempo extra.
const test = require('node:test');
const assert = require('node:assert/strict');
const JuizTimes = require('../js/juiz-times.js');
const Anfitriao = require('../js/anfitriao.js');
const { criarRelogio, criarConexaoFalsa } = require('./conexao-falsa.js');

const CFG = { modo: 'classico', tiro: 'turbo', resposta: 'todos', segundos: 10 };
const navio = function (l, c, o, t) { return { l: l, c: c, orientacao: o, tamanho: t }; };
const NA = function () { return { n2: navio(0, 0, 'h', 2) }; };
const ACERTOU = { 1: true, 2: true };

function partidaMao(cfg) {
  return JuizTimes.criarPartida(Object.assign({}, CFG, cfg || {}), [
    { id: 1, nome: 'A', alunos: ['u1'], navios: NA() }, { id: 2, nome: 'B', alunos: ['u2'], navios: NA() }]);
}

test('guardar poder: trocar sem alvo aplica a troca, zera a sequência e não ataca', function () {
  const e = partidaMao();
  e.times[1].sequencia = 3;
  const r = JuizTimes.resolverRodada(e, { 1: { trocar: 'duplo', poder: 'duplo' } }, ACERTOU);
  assert.equal(e.times[1].arsenal.duplo, 1);
  assert.equal(e.times[1].sequencia, 0);
  assert.deepEqual(e.times[2].tiros, {});
  assert.equal(r.eventos[0].ignorado, true);
});

test('o poder guardado continua no arsenal depois de errar uma pergunta (a sequência zera, o poder não)', function () {
  const e = partidaMao();
  e.times[1].arsenal.cruz = 1;
  e.times[1].sequencia = 5;
  JuizTimes.registrarAcertos(e, { 1: false, 2: true });
  assert.equal(e.times[1].sequencia, 0);
  assert.equal(e.times[1].arsenal.cruz, 1);
});

test('trocar é aplicado uma vez só, mesmo com ataque válido junto', function () {
  const e = partidaMao();
  e.times[1].sequencia = 6;
  JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 5, c: 5, poder: 'cruz', trocar: 'cruz' } }, ACERTOU);
  assert.equal(e.times[1].arsenal.cruz, 0, 'trocou e usou');
  assert.equal(e.times[1].sequencia, 0);
});

test('podeMover: com arsenal, ou com sequência que permite trocar por mover; senão não', function () {
  const e = partidaMao();
  assert.equal(JuizTimes.podeMover(e, 1, { poder: 'mover' }), false);
  e.times[1].arsenal.mover = 1;
  assert.equal(JuizTimes.podeMover(e, 1, { poder: 'mover' }), true);
  e.times[1].arsenal.mover = 0; e.times[1].sequencia = 3;
  assert.equal(JuizTimes.podeMover(e, 1, { poder: 'mover', trocar: 'mover' }), true);
  assert.equal(JuizTimes.podeMover(e, 1, { poder: 'mover' }), false);
  assert.equal(JuizTimes.podeMover(e, 1, { poder: 'normal' }), false);
});

// ---------- Anfitrião: etapa de movimento ----------
const PERGS = [{ tipo: 'digitar', pergunta: 'P1', resposta: '1' }, { tipo: 'digitar', pergunta: 'P2', resposta: '2' }];
function montar(cfg) {
  const rel = criarRelogio(), con = criarConexaoFalsa();
  con.definirJogadores({ a1: { conectado: true }, b1: { conectado: true } });
  const times = [{ id: 1, nome: 'A', alunos: ['a1'], navios: NA() }, { id: 2, nome: 'B', alunos: ['b1'], navios: NA() }];
  const anf = Anfitriao.criar({ conexao: con, config: Object.assign({}, CFG, cfg), times: times, perguntas: PERGS, relogio: rel, aleatorio: function () { return 0.5; } });
  return { anf: anf, con: con, rel: rel };
}
const certa = function (pub) { return PERGS.find(function (p) { return p.pergunta === pub.pergunta.texto; }).resposta; };
function todosAcertam(m) { const r = certa(m.con.ultimoPublico()); m.con.simularResposta('a1', r); m.con.simularResposta('b1', r); }

test('mover declarado no ataque abre a etapa movimento com tempo extra e aviso aos outros times', function () {
  const m = montar(); m.anf.iniciar();
  m.anf.estado().times[2].arsenal.mover = 1;
  todosAcertam(m);
  m.con.simularAtaque(2, { poder: 'mover', por: 'b1' });
  m.rel.avancar(10000);
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'movimento');
  assert.deepEqual(p.movedores, [2]);
  assert.equal(p.ate, m.rel.agora() + 20000, 'tempo extra: o dobro do tempo da pergunta (mínimo 15 s)');
});

test('movimento fecha antes quando quem move já mandou o destino, e o navio muda de lugar', function () {
  const m = montar(); m.anf.iniciar();
  m.anf.estado().times[2].arsenal.mover = 1;
  todosAcertam(m);
  m.con.simularAtaque(2, { poder: 'mover', por: 'b1' });
  m.rel.avancar(10000);
  m.con.simularAtaque(2, { poder: 'mover', mover: { navio: 'n2', l: 6, c: 6, orientacao: 'v' }, por: 'b1' });
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'resultado');
  assert.deepEqual(m.con.naviosGravados[2].navios.n2, { l: 6, c: 6, orientacao: 'v', tamanho: 2 });
  assert.ok(p.eventos.some(function (e) { return e.poder === 'mover' && e.atacante === 2; }));
});

test('movimento sem destino até o fim do tempo: o movimento é ignorado e nada é gasto', function () {
  const m = montar(); m.anf.iniciar();
  m.anf.estado().times[2].arsenal.mover = 1;
  todosAcertam(m);
  m.con.simularAtaque(2, { poder: 'mover', por: 'b1' });
  m.rel.avancar(10000);
  m.rel.avancar(20000);
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'resultado');
  assert.equal(p.times[2].arsenal.mover, 1);
  assert.deepEqual(m.anf.estado().times[2].navios.n2, { l: 0, c: 0, orientacao: 'h', tamanho: 2 });
});

test('sem mover declarado não existe etapa de movimento; mover sem poder não abre a etapa', function () {
  const m = montar(); m.anf.iniciar();
  todosAcertam(m);
  m.con.simularAtaque(1, { alvo: 2, l: 5, c: 5, poder: 'normal', por: 'a1' });
  m.rel.avancar(10000);
  assert.equal(m.con.ultimoPublico().fase, 'resultado');
  const n = montar(); n.anf.iniciar();
  todosAcertam(n);
  n.con.simularAtaque(2, { poder: 'mover', por: 'b1' });   // sem arsenal nem sequência
  n.rel.avancar(10000);
  assert.equal(n.con.ultimoPublico().fase, 'resultado');
});

test('retomar durante o movimento reinicia a etapa com tempo cheio', async function () {
  const m = montar(); m.anf.iniciar();
  m.anf.estado().times[2].arsenal.mover = 1;
  todosAcertam(m);
  m.con.simularAtaque(2, { poder: 'mover', por: 'b1' });
  m.rel.avancar(10000);
  m.rel.avancar(5000);
  const m2 = montar();
  const anf2 = Anfitriao.criar({ conexao: m.con, config: CFG, times: [], perguntas: PERGS, relogio: m.rel, aleatorio: function () { return 0.5; } });
  assert.equal(await anf2.retomar(), true);
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'movimento');
  assert.deepEqual(p.movedores, [2]);
  assert.equal(p.ate, m.rel.agora() + 20000);
});

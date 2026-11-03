'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Anfitriao = require('../js/anfitriao.js');
const { criarRelogio, criarConexaoFalsa } = require('./conexao-falsa.js');

const NA = function () { return { n2: { l: 0, c: 0, orientacao: 'h', tamanho: 2 } }; };
const PERGS = [
  { tipo: 'digitar', pergunta: 'P1', resposta: '1' }, { tipo: 'digitar', pergunta: 'P2', resposta: '2' },
  { tipo: 'digitar', pergunta: 'P3', resposta: '3' }
];
const CFG = { modo: 'classico', tiro: 'turbo', resposta: 'todos', segundos: 10 };

function montar(opcoes) {
  opcoes = opcoes || {};
  const rel = opcoes.relogio || criarRelogio();
  const con = opcoes.conexao || criarConexaoFalsa();
  const times = [{ id: 1, nome: 'A', alunos: ['a1', 'a2'], navios: NA() }, { id: 2, nome: 'B', alunos: ['b1'], navios: NA() }];
  con.definirJogadores({ a1: { conectado: true }, a2: { conectado: true }, b1: { conectado: true } });
  const anf = Anfitriao.criar({ conexao: con, config: Object.assign({}, CFG, opcoes.cfg), times: times,
                                perguntas: opcoes.perguntas || PERGS, relogio: rel, aleatorio: function () { return 0.5; } });
  return { anf: anf, con: con, rel: rel };
}
const certa = function (pub) { return PERGS.find(function (p) { return p.pergunta === pub.pergunta.texto; }).resposta; };
function todosAcertam(m) {
  const r = certa(m.con.ultimoPublico());
  ['a1', 'a2', 'b1'].forEach(function (u) { m.con.simularResposta(u, r); });
}

test('a rodada 1 publica fase pergunta com ate = agora + segundos', function () {
  const m = montar(); m.anf.iniciar();
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'pergunta'); assert.equal(p.rodada, 1);
  assert.equal(p.ate, m.rel.agora() + 10000);
});

test('a pergunta publicada não contém a resposta certa', function () {
  const m = montar({ perguntas: [{ tipo: 'escolha', pergunta: 'Q', certa: 'CERTA9', erradas: ['x1', 'x2', 'x3'] }] });
  m.anf.iniciar();
  const p = m.con.ultimoPublico();
  assert.equal(p.pergunta.opcoes.length, 4);
  assert.ok(p.pergunta.opcoes.indexOf('CERTA9') >= 0);
  assert.equal(JSON.stringify(p).indexOf('"certa"'), -1);
  const d = montar(); d.anf.iniciar();
  assert.equal(JSON.stringify(d.con.ultimoPublico()).indexOf('"resposta"'), -1);
});

test('após o prazo, times que acertaram vão para ataque; se ninguém acertou, pula para resultado', function () {
  const m = montar(); m.anf.iniciar();
  todosAcertam(m);
  assert.equal(m.con.ultimoPublico().fase, 'ataque');
  assert.equal(m.con.ultimoPublico().times[1].acertou, true);
  const n = montar(); n.anf.iniciar();
  n.rel.avancar(10000);
  assert.equal(n.con.ultimoPublico().fase, 'resultado');
  assert.equal(n.con.ultimoPublico().times[1].acertou, false);
});

test('ataques enviados são aplicados e publicados em resultado com eventos e tiros', function () {
  const m = montar(); m.anf.iniciar();
  todosAcertam(m);
  m.con.simularAtaque(1, { alvo: 2, l: 5, c: 5, poder: 'normal', por: 'a1' });
  m.rel.avancar(10000);
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'resultado');
  assert.equal(p.eventos.length, 1);
  assert.equal(p.times[2].tiros['5,5'], 'agua');
});

test('fase pergunta fecha antes quando todos os conectados já responderam, e não antes disso', function () {
  const m = montar(); m.anf.iniciar();
  m.con.simularResposta('a1', 'x'); m.con.simularResposta('a2', 'x');
  assert.equal(m.con.ultimoPublico().fase, 'pergunta');
  m.con.simularResposta('b1', 'x');
  assert.notEqual(m.con.ultimoPublico().fase, 'pergunta');
});

test('a vez do time (vezDe) alterna a cada rodada', function () {
  const m = montar(); m.anf.iniciar();
  assert.equal(m.con.ultimoPublico().times[1].vezDe, 'a1');
  m.rel.avancar(10000); m.rel.avancar(5000);
  assert.equal(m.con.ultimoPublico().rodada, 2);
  assert.equal(m.con.ultimoPublico().times[1].vezDe, 'a2');
});

test('fim publica vencedores e para de agendar', function () {
  const m = montar({ cfg: { modo: 'rapido' } }); m.anf.iniciar();
  const r = certa(m.con.ultimoPublico());
  m.con.simularResposta('a1', r); m.con.simularResposta('a2', r); m.con.simularResposta('b1', 'errado');
  m.con.simularAtaque(1, { alvo: 2, l: 0, c: 0, poder: 'normal', por: 'a1' });
  m.rel.avancar(10000);
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'fim');
  assert.deepEqual(p.fim, { vencedores: [1], empate: false });
  assert.equal(m.rel.pendentes(), 0);
});

test('banco com 3 perguntas aguenta 8 rodadas sem erro', function () {
  const m = montar(); m.anf.iniciar();
  for (let i = 0; i < 8; i++) { m.rel.avancar(10000); m.rel.avancar(5000); }
  assert.equal(m.con.ultimoPublico().rodada, 9);
  assert.equal(m.con.ultimoPublico().fase, 'pergunta');
});

test('retomar depois de recarregar mantém navios, sequência e rodada', async function () {
  const m = montar(); m.anf.iniciar();
  todosAcertam(m);
  m.con.simularAtaque(1, { alvo: 2, l: 5, c: 5, poder: 'normal', por: 'a1' });
  m.rel.avancar(10000); m.rel.avancar(5000);   // rodada 2 começa
  const antes = m.con.ultimoPublico();
  const m2 = montar({ conexao: m.con, relogio: m.rel });
  assert.equal(await m2.anf.retomar(), true);
  const depois = m.con.ultimoPublico();
  assert.equal(depois.rodada, antes.rodada);
  assert.equal(depois.fase, 'pergunta');
  assert.equal(depois.times[1].sequencia, antes.times[1].sequencia);
  assert.equal(depois.times[2].tiros['5,5'], 'agua');
  assert.equal(depois.ate, m.rel.agora() + 10000);
});

test('pausar impede a troca de fase; retomar volta com tempo cheio', async function () {
  const m = montar(); m.anf.iniciar();
  m.anf.pausar();
  assert.equal(m.con.ultimoPublico().pausada, true);
  m.rel.avancar(60000);
  assert.equal(m.con.ultimoPublico().fase, 'pergunta');
  await m.anf.retomar();
  assert.equal(m.con.ultimoPublico().pausada, false);
  assert.equal(m.con.ultimoPublico().ate, m.rel.agora() + 10000);
});

test('desconexão na rodada 2 ainda é percebida: vezDe pula o aluno desconectado', function () {
  const m = montar(); m.anf.iniciar();
  m.rel.avancar(10000); m.rel.avancar(5000);   // rodada 2: vez de a2
  m.con.desconectar('a2');
  m.con.simularResposta('a1', 'x'); m.con.simularResposta('b1', 'x');   // só os conectados respondem: fecha antes do prazo
  assert.notEqual(m.con.ultimoPublico().fase, 'pergunta');
  assert.equal(m.con.ultimoPublico().times[1].vezDe, 'a1');
});

test('mover navio: o anfitrião grava o novo lugar dos navios do time e publica os torpedos', function () {
  const m = montar({ cfg: { torpedos: 2 } }); m.anf.iniciar();
  assert.equal(m.con.ultimoPublico().times[1].torpedos, 4);
  m.anf.estado().times[2].arsenal.mover = 1;
  todosAcertam(m);
  m.con.simularAtaque(2, { poder: 'mover', mover: { navio: 'n2', l: 6, c: 6, orientacao: 'v' }, por: 'b1' });
  m.rel.avancar(10000);
  assert.deepEqual(m.con.naviosGravados[2].navios.n2, { l: 6, c: 6, orientacao: 'v', tamanho: 2 });
  assert.equal(m.con.naviosGravados[2].pronto, true);
  assert.equal(m.con.ultimoPublico().times[2].arsenal.mover, 0);
});

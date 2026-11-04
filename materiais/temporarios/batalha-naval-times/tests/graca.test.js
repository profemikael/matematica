'use strict';
// Resposta digitada que chega logo depois do fim do tempo (envio automático do que estava escrito) ainda vale.
const test = require('node:test');
const assert = require('node:assert/strict');
const Anfitriao = require('../js/anfitriao.js');
const { criarRelogio, criarConexaoFalsa } = require('./conexao-falsa.js');

const PERGS = [{ tipo: 'digitar', pergunta: 'P1', resposta: '1' }];
const CFG = { modo: 'classico', tiro: 'normal', resposta: 'todos', segundos: 10 };
const NA = function () { return { n2: { l: 0, c: 0, orientacao: 'h', tamanho: 2 } }; };

function montar(gracaMs) {
  const rel = criarRelogio(), con = criarConexaoFalsa();
  con.definirJogadores({ a1: { conectado: true }, b1: { conectado: true } });
  const times = [{ id: 1, nome: 'A', alunos: ['a1'], navios: NA() }, { id: 2, nome: 'B', alunos: ['b1'], navios: NA() }];
  const opcoes = { conexao: con, config: CFG, times: times, perguntas: PERGS, relogio: rel, aleatorio: function () { return 0.5; } };
  if (gracaMs !== undefined) opcoes.gracaMs = gracaMs;
  const anf = Anfitriao.criar(opcoes);
  return { anf: anf, con: con, rel: rel };
}

test('com tolerância, a resposta certa que chega logo depois do tempo ainda vale', function () {
  const m = montar(1500); m.anf.iniciar();
  m.con.simularResposta('b1', '1');
  m.rel.avancar(10000);                                   // o tempo da pergunta acabou
  assert.equal(m.con.ultimoPublico().fase, 'pergunta', 'ainda esperando as respostas em trânsito');
  m.con.simularResposta('a1', '1');                       // chega 0,5 s depois, com a resposta certa
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'ataque');
  assert.equal(p.times[1].acertou, true, 'a resposta digitada a tempo e enviada logo depois vale');
});

test('com tolerância, o prazo termina mesmo se alguém nunca responder', function () {
  const m = montar(1500); m.anf.iniciar();
  m.con.simularResposta('b1', '1');
  m.rel.avancar(10000);
  m.rel.avancar(1500);
  const p = m.con.ultimoPublico();
  assert.equal(p.fase, 'ataque');
  assert.equal(p.times[1].acertou, false, 'sem resposta conta como errado');
  assert.equal(p.times[2].acertou, true);
});

test('resposta que chega depois da tolerância não vale', function () {
  const m = montar(1500); m.anf.iniciar();
  m.con.simularResposta('b1', '1');
  m.rel.avancar(11600);
  m.con.simularResposta('a1', '1');
  assert.equal(m.con.ultimoPublico().times[1].acertou, false);
});

test('sem tolerância configurada, o comportamento é o de antes (fecha na hora)', function () {
  const m = montar(); m.anf.iniciar();
  m.rel.avancar(10000);
  assert.notEqual(m.con.ultimoPublico().fase, 'pergunta');
});

test('o prazo mostrado aos alunos continua sendo o tempo da pergunta, sem somar a tolerância', function () {
  const m = montar(1500); m.anf.iniciar();
  assert.equal(m.con.ultimoPublico().ate, m.rel.agora() + 10000);
});

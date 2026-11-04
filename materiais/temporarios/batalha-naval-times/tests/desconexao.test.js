'use strict';
// Aluno que desliga o Chromebook ou fecha a aba (some o sinal de vida): sai do time e o time continua.
const test = require('node:test');
const assert = require('node:assert/strict');
const Anfitriao = require('../js/anfitriao.js');
const { criarRelogio, criarConexaoFalsa } = require('./conexao-falsa.js');

const PERGS = [{ tipo: 'digitar', pergunta: 'P1', resposta: '1' }, { tipo: 'digitar', pergunta: 'P2', resposta: '2' }];
const CFG = { modo: 'classico', tiro: 'normal', resposta: 'todos', segundos: 10 };
const NA = function () { return { n2: { l: 0, c: 0, orientacao: 'h', tamanho: 2 } }; };
const certa = function (pub) { return PERGS.find(function (p) { return p.pergunta === pub.pergunta.texto; }).resposta; };

// Limite de 12 s sem sinal nos testes. Linha do tempo: rodada 1 em 0 s, pergunta até 10 s, resultado até 15 s, rodada 2 em 15 s.
function montar() {
  const rel = criarRelogio(), con = criarConexaoFalsa();
  const agora = rel.agora();
  const vivo = function (nome, time) { return { nome: nome, time: time, conectado: true, vistoEm: agora, entrouEm: agora }; };
  const jogadores = { a1: vivo('Ana', 1), a2: vivo('Beto', 1), b1: vivo('Cida', 2) };
  con.definirJogadores(jogadores);
  const times = [{ id: 1, nome: 'Time Azul', alunos: ['a1', 'a2'], navios: NA() }, { id: 2, nome: 'Time Verde', alunos: ['b1'], navios: NA() }];
  const anf = Anfitriao.criar({ conexao: con, config: CFG, times: times, perguntas: PERGS, relogio: rel, aleatorio: function () { return 0.5; }, semSinalMs: 12000 });
  // sinal de vida: atualiza vistoEm de quem ainda está ligado (os outros ficam parados no tempo)
  const sinal = function (uids) {
    uids.forEach(function (u) { jogadores[u] = Object.assign({}, jogadores[u], { vistoEm: rel.agora(), conectado: true }); });
    con.definirJogadores(jogadores);
  };
  // chega na rodada 2 com Ana e Cida mandando sinal e o Beto sumido desde o começo
  const ateRodada2 = function () { anf.iniciar(); rel.avancar(10000); sinal(['a1', 'b1']); rel.avancar(5000); };
  return { anf: anf, con: con, rel: rel, sinal: sinal, ateRodada2: ateRodada2 };
}

test('aluno sem sinal de vida (Chromebook desligado) é tirado do time na rodada seguinte e o time continua', function () {
  const m = montar(); m.anf.iniciar();
  assert.deepEqual(m.con.ultimoPublico().times[1].alunos, ['a1', 'a2']);
  m.rel.avancar(10000); m.sinal(['a1', 'b1']); m.rel.avancar(5000);
  const p = m.con.ultimoPublico();
  assert.equal(p.rodada, 2);
  assert.deepEqual(p.times[1].alunos, ['a1'], 'Beto saiu do time');
  assert.ok(p.avisos.some(function (a) { return /Beto saiu do Time Azul/.test(a); }), JSON.stringify(p.avisos));
});

test('com o aluno fora do time, a regra "todos acertam" vale só para quem ficou', function () {
  const m = montar(); m.ateRodada2();
  const r = certa(m.con.ultimoPublico());
  m.con.simularResposta('a1', r); m.con.simularResposta('b1', r);
  assert.equal(m.con.ultimoPublico().times[1].acertou, true, 'o time acerta só com a Ana');
});

test('o aluno sumido não trava: a pergunta fecha quando os outros já responderam', function () {
  const m = montar(); m.ateRodada2();
  const r = certa(m.con.ultimoPublico());
  m.con.simularResposta('a1', r);
  assert.equal(m.con.ultimoPublico().fase, 'pergunta', 'ainda falta a Cida');
  m.con.simularResposta('b1', r);
  assert.notEqual(m.con.ultimoPublico().fase, 'pergunta', 'não esperou o Beto');
});

test('aluno que some DURANTE a pergunta deixa de ser esperado quando o sinal dele passa do limite', function () {
  const rel = criarRelogio(), con = criarConexaoFalsa();
  const agora = rel.agora();
  const jogadores = { a1: { nome: 'Ana', time: 1, conectado: true, vistoEm: agora }, a2: { nome: 'Beto', time: 1, conectado: true, vistoEm: agora },
                      b1: { nome: 'Cida', time: 2, conectado: true, vistoEm: agora } };
  con.definirJogadores(jogadores);
  const anf = Anfitriao.criar({ conexao: con, config: Object.assign({}, CFG, { segundos: 30 }), perguntas: PERGS, relogio: rel, aleatorio: function () { return 0.5; }, semSinalMs: 12000,
    times: [{ id: 1, nome: 'A', alunos: ['a1', 'a2'], navios: NA() }, { id: 2, nome: 'B', alunos: ['b1'], navios: NA() }] });
  anf.iniciar();
  rel.avancar(5000);                                          // 5 s: Beto ainda conta como presente
  const r = certa(con.ultimoPublico());
  con.simularResposta('a1', r); con.simularResposta('b1', r);
  assert.equal(con.ultimoPublico().fase, 'pergunta', 'ainda espera o Beto (sinal recente)');
  rel.avancar(10000);                                         // 15 s: Ana e Cida mandam sinal, o Beto não
  ['a1', 'b1'].forEach(function (u) { jogadores[u] = Object.assign({}, jogadores[u], { vistoEm: rel.agora() }); });
  con.definirJogadores(jogadores);
  assert.notEqual(con.ultimoPublico().fase, 'pergunta', 'o Beto passou de 12 s sem sinal: não é mais esperado');
  assert.equal(con.ultimoPublico().times[1].acertou, true);
});

test('aluno que volta (sinal de vida de novo) é recolocado no time na rodada seguinte', function () {
  const m = montar(); m.ateRodada2();
  assert.deepEqual(m.con.ultimoPublico().times[1].alunos, ['a1']);
  m.rel.avancar(10000);                                      // rodada 2 acaba (resultado até 30 s)
  m.sinal(['a1', 'a2', 'b1']);                               // Beto ligou o Chromebook de novo
  m.rel.avancar(5000);
  const p = m.con.ultimoPublico();
  assert.equal(p.rodada, 3);
  assert.deepEqual(p.times[1].alunos, ['a1', 'a2']);
  assert.ok(p.avisos.some(function (a) { return /Beto voltou para o Time Azul/.test(a); }), JSON.stringify(p.avisos));
});

test('o último aluno do time nunca é tirado (o time não fica sem ninguém)', function () {
  const m = montar(); m.anf.iniciar();
  m.rel.avancar(10000); m.rel.avancar(5000);                 // ninguém mandou sinal: todos sumidos na rodada 2
  const p = m.con.ultimoPublico();
  assert.deepEqual(p.times[2].alunos, ['b1'], 'time de 1 aluno continua com ele');
  assert.deepEqual(p.times[1].alunos, ['a1', 'a2'], 'time não é esvaziado');
});

test('jogadores sem vistoEm contam só pelo campo conectado (sem quebrar)', function () {
  const rel = criarRelogio(), con = criarConexaoFalsa();
  con.definirJogadores({ a1: { conectado: true, time: 1 }, b1: { conectado: true, time: 2 } });
  const anf = Anfitriao.criar({ conexao: con, config: CFG, perguntas: PERGS, relogio: rel, aleatorio: function () { return 0.5; },
    times: [{ id: 1, nome: 'A', alunos: ['a1'], navios: NA() }, { id: 2, nome: 'B', alunos: ['b1'], navios: NA() }] });
  anf.iniciar();
  rel.avancar(10000); rel.avancar(5000); rel.avancar(40000);
  assert.deepEqual(con.ultimoPublico().times[1].alunos, ['a1']);
});

test('aluno marcado como desconectado pelo Firebase também sai do time', function () {
  const m = montar(); m.anf.iniciar();
  m.con.desconectar('a2');
  m.rel.avancar(10000); m.sinal(['a1', 'b1']); m.rel.avancar(5000);
  assert.deepEqual(m.con.ultimoPublico().times[1].alunos, ['a1']);
});

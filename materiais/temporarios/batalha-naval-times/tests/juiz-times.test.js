'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const JuizTimes = require('../js/juiz-times.js');
const Regras = require('../../batalha-naval/js/regras.js');

const CFG = { modo: 'classico', tiro: 'turbo', resposta: 'todos', segundos: 10 };

function partidaComTimes(tamanhos, cfg) {
  const times = tamanhos.map(function (n, i) {
    const alunos = [];
    for (let k = 0; k < n; k++) alunos.push('t' + (i + 1) + 'a' + (k + 1));
    return { id: i + 1, nome: 'Time ' + (i + 1), alunos: alunos, navios: Regras.gerarFrotaAleatoria(Math.random) };
  });
  return JuizTimes.criarPartida(Object.assign({}, CFG, cfg || {}), times);
}
const todosConectados = function (estado) {
  const c = {};
  Object.values(estado.times).forEach(function (t) { t.alunos.forEach(function (u) { c[u] = true; }); });
  return c;
};
const PERG = { tipo: 'digitar', pergunta: '2+2', resposta: '4' };

test('criarPartida lança erro com menos de 2 times com alunos', function () {
  assert.throws(function () { partidaComTimes([2]); });
  assert.throws(function () { partidaComTimes([2, 0]); });
});

test('quemEscolhe alterna entre os alunos do time a cada rodada', function () {
  const e = partidaComTimes([2, 1]);
  const c = todosConectados(e);
  e.rodada = 1; assert.equal(JuizTimes.quemEscolhe(e, 1, c), 't1a1');
  e.rodada = 2; assert.equal(JuizTimes.quemEscolhe(e, 1, c), 't1a2');
  e.rodada = 3; assert.equal(JuizTimes.quemEscolhe(e, 1, c), 't1a1');
  e.rodada = 2; assert.equal(JuizTimes.quemEscolhe(e, 2, c), 't2a1');
});

test('quemEscolhe pula aluno desconectado e devolve null se ninguém do time está conectado', function () {
  const e = partidaComTimes([2, 1]);
  const c = todosConectados(e);
  e.rodada = 2; c.t1a2 = false;
  assert.equal(JuizTimes.quemEscolhe(e, 1, c), 't1a1');
  c.t1a1 = false;
  assert.equal(JuizTimes.quemEscolhe(e, 1, c), null);
});

test('avaliarRespostas modo todos: só acerta se todos os conectados acertam', function () {
  const e = partidaComTimes([2, 1]);
  const c = todosConectados(e);
  const r = { t1a1: { texto: '4', em: 1 }, t1a2: { texto: '5', em: 2 }, t2a1: { texto: '4', em: 3 } };
  assert.deepEqual(JuizTimes.avaliarRespostas(e, PERG, r, c), { 1: false, 2: true });
});

test('avaliarRespostas modo todos: sem resposta conta como errado, mas aluno desconectado é ignorado', function () {
  const e = partidaComTimes([2, 1]);
  const c = todosConectados(e);
  const r = { t1a1: { texto: '4', em: 1 }, t2a1: { texto: '4', em: 3 } };
  assert.equal(JuizTimes.avaliarRespostas(e, PERG, r, c)[1], false);
  c.t1a2 = false;
  assert.equal(JuizTimes.avaliarRespostas(e, PERG, r, c)[1], true);
});

test('avaliarRespostas time sem ninguém conectado nunca acerta', function () {
  const e = partidaComTimes([2, 1]);
  const c = todosConectados(e);
  c.t1a1 = false; c.t1a2 = false;
  const r = { t1a1: { texto: '4', em: 1 }, t1a2: { texto: '4', em: 2 }, t2a1: { texto: '4', em: 3 } };
  assert.equal(JuizTimes.avaliarRespostas(e, PERG, r, c)[1], false);
});

test('avaliarRespostas modo primeiro: vale a resposta com menor em entre os do time', function () {
  const e = partidaComTimes([2, 1], { resposta: 'primeiro' });
  const c = todosConectados(e);
  assert.equal(JuizTimes.avaliarRespostas(e, PERG, { t1a1: { texto: '9', em: 1 }, t1a2: { texto: '4', em: 5 } }, c)[1], false);
  assert.equal(JuizTimes.avaliarRespostas(e, PERG, { t1a1: { texto: '9', em: 5 }, t1a2: { texto: '4', em: 1 } }, c)[1], true);
  assert.equal(JuizTimes.avaliarRespostas(e, PERG, {}, c)[1], false);
});

test('avaliarRespostas ignora times eliminados', function () {
  const e = partidaComTimes([1, 1, 1]);
  e.times[3].vivo = false;
  const r = JuizTimes.avaliarRespostas(e, PERG, {}, todosConectados(e));
  assert.deepEqual(Object.keys(r), ['1', '2']);
});

test('registrarAcertos soma 1 ao acertar e zera ao errar', function () {
  const e = partidaComTimes([1, 1]);
  JuizTimes.registrarAcertos(e, { 1: true, 2: true });
  JuizTimes.registrarAcertos(e, { 1: true, 2: false });
  assert.equal(e.times[1].sequencia, 2);
  assert.equal(e.times[2].sequencia, 0);
});

// ---------- Task 2: trocas do Turbo e casas dos poderes ----------
test('trocasPossiveis com limiar padrão 3 e 6', function () {
  const e = partidaComTimes([1, 1]);
  e.times[1].sequencia = 2; assert.deepEqual(JuizTimes.trocasPossiveis(e, 1), []);
  e.times[1].sequencia = 3; assert.deepEqual(JuizTimes.trocasPossiveis(e, 1), ['duplo', 'mover', 'radar3', 'torpedo2']);
  e.times[1].sequencia = 6; assert.deepEqual(JuizTimes.trocasPossiveis(e, 1), ['cruz', 'x', 'radar4', 'torpedo5']);
});

test('trocasPossiveis vazio no modo normal mesmo com sequência alta', function () {
  const e = partidaComTimes([1, 1], { tiro: 'normal' });
  e.times[1].sequencia = 9;
  assert.deepEqual(JuizTimes.trocasPossiveis(e, 1), []);
});

test('trocasPossiveis respeita limiares da configuração', function () {
  const e = partidaComTimes([1, 1], { limiarDuplo: 2, limiarCruz: 4 });
  e.times[1].sequencia = 2; assert.deepEqual(JuizTimes.trocasPossiveis(e, 1), ['duplo', 'mover', 'radar3', 'torpedo2']);
  e.times[1].sequencia = 4; assert.deepEqual(JuizTimes.trocasPossiveis(e, 1), ['cruz', 'x', 'radar4', 'torpedo5']);
});

test('trocar duplo consome a sequência e põe 1 no arsenal', function () {
  const e = partidaComTimes([1, 1]);
  e.times[1].sequencia = 3;
  assert.equal(JuizTimes.trocar(e, 1, 'duplo'), true);
  assert.equal(e.times[1].sequencia, 0);
  assert.equal(e.times[1].arsenal.duplo, 1);
});

test('trocar não permitido devolve false e não muda nada', function () {
  const e = partidaComTimes([1, 1]);
  e.times[1].sequencia = 3;
  assert.equal(JuizTimes.trocar(e, 1, 'cruz'), false);
  assert.equal(e.times[1].sequencia, 3);
  assert.equal(e.times[1].arsenal.cruz, 0);
});

test('casasDoPoder cruz no canto A1 só devolve as casas dentro do mar', function () {
  assert.deepEqual(JuizTimes.casasDoPoder('cruz', 0, 0).sort(), ['0,0', '0,1', '1,0']);
});

test('casasDoPoder duplo vertical usa a casa de baixo; duplo normal a da direita', function () {
  assert.deepEqual(JuizTimes.casasDoPoder('duplo', 2, 2, true), ['2,2', '3,2']);
  assert.deepEqual(JuizTimes.casasDoPoder('duplo', 2, 2, false), ['2,2', '2,3']);
});

test('casasDoPoder x no centro devolve 5 casas e normal devolve 1', function () {
  assert.equal(JuizTimes.casasDoPoder('x', 5, 5).length, 5);
  assert.deepEqual(JuizTimes.casasDoPoder('normal', 5, 5), ['5,5']);
});

// ---------- Task 3: ataques simultâneos, eliminação e fim ----------
const navio = function (l, c, o, t) { return { l: l, c: c, orientacao: o, tamanho: t }; };
function partidaMao(naviosPorTime, cfg) {
  const times = naviosPorTime.map(function (n, i) { return { id: i + 1, nome: 'T' + (i + 1), alunos: ['u' + (i + 1)], navios: n }; });
  return JuizTimes.criarPartida(Object.assign({}, CFG, cfg || {}), times);
}
const NA = { n2: navio(0, 0, 'h', 2) };            // um navio: A1-B1 ... casas 0,0 e 0,1
const ACERTOU = { 1: true, 2: true, 3: true };

test('um ataque na água marca agua e nenhum navio afunda', function () {
  const e = partidaMao([NA, NA]);
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 5, c: 5, poder: 'normal' } }, ACERTOU);
  assert.deepEqual(e.times[2].tiros, { '5,5': 'agua' });
  assert.equal(r.eventos[0].afundou, false);
  assert.equal(r.fim, null);
});

test('acerto no classico marca só a casa; no rapido afunda o navio inteiro', function () {
  const c = partidaMao([NA, NA]);
  JuizTimes.resolverRodada(c, { 1: { alvo: 2, l: 0, c: 0, poder: 'normal' } }, ACERTOU);
  assert.deepEqual(c.times[2].tiros, { '0,0': 'acerto' });
  assert.equal(c.times[2].vivo, true);
  const r = partidaMao([NA, NA], { modo: 'rapido' });
  const res = JuizTimes.resolverRodada(r, { 1: { alvo: 2, l: 0, c: 0, poder: 'normal' } }, ACERTOU);
  assert.equal(r.times[2].vivo, false);
  assert.deepEqual(res.eliminados, [2]);
});

test('dois times na mesma casa do mesmo adversário: os dois eventos registram o acerto', function () {
  const e = partidaMao([NA, NA, NA]);
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 3, l: 0, c: 0, poder: 'normal' }, 2: { alvo: 3, l: 0, c: 0, poder: 'normal' } }, ACERTOU);
  assert.deepEqual(r.eventos.map(function (x) { return x.acertos; }), [['0,0'], ['0,0']]);
});

test('dois tiros que completam um navio juntos o marcam afundado', function () {
  const e = partidaMao([NA, NA, NA]);
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 3, l: 0, c: 0, poder: 'normal' }, 2: { alvo: 3, l: 0, c: 1, poder: 'normal' } }, ACERTOU);
  assert.equal(e.times[3].vivo, false);
  assert.deepEqual(e.times[3].afundadas.sort(), ['0,0', '0,1']);
  assert.ok(r.eventos.every(function (x) { return x.afundou; }));
});

test('time que errou a pergunta não ataca mesmo enviando ataque', function () {
  const e = partidaMao([NA, NA]);
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 0, c: 0, poder: 'normal' } }, { 1: false, 2: true });
  assert.deepEqual(e.times[2].tiros, {});
  assert.equal(r.eventos.length, 0);
});

test('ataque inválido é ignorado sem lançar erro', function () {
  const e = partidaMao([NA, NA, NA]);
  e.times[3].vivo = false;
  e.times[2].tiros['4,4'] = 'agua';
  const ataques = {
    1: { alvo: 3, l: 0, c: 0, poder: 'normal' },
    2: { alvo: 2, l: 0, c: 0, poder: 'normal' }
  };
  let r = JuizTimes.resolverRodada(e, ataques, ACERTOU);
  assert.ok(r.eventos.every(function (x) { return x.ignorado === true; }));
  r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 10, c: 0, poder: 'normal' } }, { 1: true });
  assert.equal(r.eventos[0].ignorado, true);
  r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 4, c: 4, poder: 'normal' } }, { 1: true });
  assert.equal(r.eventos[0].ignorado, true);
});

test('poder que o time não tem vira tiro normal e não gasta arsenal; poder do arsenal gasta 1', function () {
  const e = partidaMao([NA, NA]);
  let r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 5, c: 5, poder: 'cruz' } }, ACERTOU);
  assert.equal(r.eventos[0].poder, 'normal');
  assert.equal(r.eventos[0].casas.length, 1);
  e.times[1].arsenal.cruz = 1;
  r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 7, c: 7, poder: 'cruz' } }, ACERTOU);
  assert.equal(r.eventos[0].casas.length, 5);
  assert.equal(e.times[1].arsenal.cruz, 0);
});

test('trocar + poder no mesmo ataque funciona com sequência suficiente', function () {
  const e = partidaMao([NA, NA]);
  e.times[1].sequencia = 3;
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 5, c: 5, poder: 'duplo', trocar: 'duplo' } }, ACERTOU);
  assert.equal(r.eventos[0].poder, 'duplo');
  assert.equal(r.eventos[0].casas.length, 2);
  assert.equal(e.times[1].sequencia, 0);
  assert.equal(e.times[1].arsenal.duplo, 0);
});

test('fim: último time vivo vence', function () {
  const e = partidaMao([NA, NA], { modo: 'rapido' });
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 0, c: 0, poder: 'normal' } }, { 1: true, 2: false });
  assert.deepEqual(r.fim, { vencedores: [1], empate: false });
});

test('fim: dois últimos caem na mesma rodada dá empate entre eles', function () {
  const e = partidaMao([NA, NA], { modo: 'rapido' });
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 0, c: 0, poder: 'normal' }, 2: { alvo: 1, l: 0, c: 0, poder: 'normal' } }, ACERTOU);
  assert.deepEqual(r.fim, { vencedores: [1, 2], empate: true });
});

// ---------- Poderes extras: mover navio, radar e torpedo ----------
test('casasDoPoder radar3 no canto devolve 9 casas dentro do mar; radar4 devolve 16 e escorrega da borda', function () {
  assert.deepEqual(JuizTimes.casasDoPoder('radar3', 0, 0).sort(), ['0,0', '0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2']);
  assert.equal(JuizTimes.casasDoPoder('radar4', 5, 5).length, 16);
  const canto = JuizTimes.casasDoPoder('radar4', 9, 9);
  assert.equal(canto.length, 16);
  assert.ok(canto.indexOf('6,6') >= 0 && canto.indexOf('9,9') >= 0);
});

test('radar diz se há navio na área sem marcar nenhuma casa e gasta o arsenal', function () {
  const e = partidaMao([NA, NA]);
  e.times[1].arsenal.radar3 = 1;
  let r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 1, c: 1, poder: 'radar3' } }, ACERTOU);
  assert.equal(r.eventos[0].radar, true);
  assert.equal(r.eventos[0].tem, true);
  assert.deepEqual(e.times[2].tiros, {});
  assert.equal(e.times[1].arsenal.radar3, 0);
  e.times[1].arsenal.radar3 = 1;
  r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 7, c: 7, poder: 'radar3' } }, ACERTOU);
  assert.equal(r.eventos[0].tem, false);
});

test('mover navio intacto: muda a posição, gasta 1 do arsenal e vale antes do radar da mesma rodada', function () {
  const e = partidaMao([NA, NA]);
  e.times[2].arsenal.mover = 1;
  e.times[1].arsenal.radar3 = 1;
  const r = JuizTimes.resolverRodada(e, {
    2: { poder: 'mover', mover: { navio: 'n2', l: 5, c: 5, orientacao: 'v' } },
    1: { alvo: 2, l: 1, c: 1, poder: 'radar3' }
  }, ACERTOU);
  assert.deepEqual(e.times[2].navios.n2, { l: 5, c: 5, orientacao: 'v', tamanho: 2 });
  assert.equal(e.times[2].arsenal.mover, 0);
  assert.equal(r.eventos.find(function (x) { return x.poder === 'radar3'; }).tem, false);
  assert.ok(r.eventos.some(function (x) { return x.poder === 'mover' && x.atacante === 2; }));
});

test('mover inválido é ignorado e não gasta nada: navio atingido, casa sobreposta, fora do mar, casa já atirada', function () {
  const dois = function () { return { n2: navio(0, 0, 'h', 2), n3: navio(5, 5, 'h', 3) }; };
  const casos = [
    function (e) { e.times[2].tiros['0,0'] = 'acerto'; return { navio: 'n2', l: 3, c: 3, orientacao: 'h' }; },
    function () { return { navio: 'n2', l: 5, c: 4, orientacao: 'h' }; },
    function () { return { navio: 'n2', l: 9, c: 9, orientacao: 'h' }; },
    function (e) { e.times[2].tiros['3,3'] = 'agua'; return { navio: 'n2', l: 3, c: 3, orientacao: 'h' }; },
    function () { return { navio: 'inexistente', l: 3, c: 3, orientacao: 'h' }; }
  ];
  casos.forEach(function (montar) {
    const e = partidaMao([NA, dois()]);
    e.times[2].arsenal.mover = 1;
    const mover = montar(e);
    const antes = JSON.stringify(e.times[2].navios);
    const r = JuizTimes.resolverRodada(e, { 2: { poder: 'mover', mover: mover } }, ACERTOU);
    assert.equal(r.eventos[0].ignorado, true);
    assert.equal(JSON.stringify(e.times[2].navios), antes);
    assert.equal(e.times[2].arsenal.mover, 1);
  });
});

test('trocar mover e usar no mesmo ataque funciona com sequência suficiente', function () {
  const e = partidaMao([NA, NA]);
  e.times[1].sequencia = 3;
  JuizTimes.resolverRodada(e, { 1: { poder: 'mover', trocar: 'mover', mover: { navio: 'n2', l: 4, c: 4, orientacao: 'h' } } }, ACERTOU);
  assert.deepEqual(e.times[1].navios.n2, { l: 4, c: 4, orientacao: 'h', tamanho: 2 });
  assert.equal(e.times[1].sequencia, 0);
});

test('torpedos do time: só no turbo com classico, por aluno; torpedo afunda o navio inteiro e gasta 1', function () {
  const um = function (cfg, alunos) {
    return JuizTimes.criarPartida(Object.assign({}, CFG, cfg), [
      { id: 1, nome: 'A', alunos: alunos, navios: NA() }, { id: 2, nome: 'B', alunos: ['b'], navios: NA() }]);
  };
  function NA() { return { n2: navio(0, 0, 'h', 2) }; }
  assert.equal(um({ torpedos: 2 }, ['a', 'a2']).times[1].torpedos, 4);
  assert.equal(um({ torpedos: 2, modo: 'rapido' }, ['a']).times[1].torpedos, 0);
  assert.equal(um({ torpedos: 2, tiro: 'normal' }, ['a']).times[1].torpedos, 0);
  const e = um({ torpedos: 1 }, ['a']);
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 0, c: 0, poder: 'torpedo' } }, ACERTOU);
  assert.equal(e.times[2].vivo, false);
  assert.equal(r.eventos[0].poder, 'torpedo');
  assert.equal(e.times[1].torpedos, 0);
  const f = um({ torpedos: 0 }, ['a']);
  const r2 = JuizTimes.resolverRodada(f, { 1: { alvo: 2, l: 0, c: 0, poder: 'torpedo' } }, ACERTOU);
  assert.equal(r2.eventos[0].poder, 'normal');
  assert.equal(f.times[2].vivo, true);
});

// ---------- Torpedos como prêmio da sequência ----------

test('torpedos como prêmio: nível 1 dá 2 e nível 2 dá 5 torpedos (somam ao saldo); no Rápido não aparecem', function () {
  const e = partidaComTimes([1, 1], { torpedos: 1 });
  assert.equal(e.times[1].torpedos, 1);
  e.times[1].sequencia = 3;
  assert.equal(JuizTimes.trocar(e, 1, 'torpedo2'), true);
  assert.equal(e.times[1].torpedos, 3);
  assert.equal(e.times[1].sequencia, 0);
  e.times[1].sequencia = 6;
  assert.equal(JuizTimes.trocar(e, 1, 'torpedo2'), false);
  assert.equal(JuizTimes.trocar(e, 1, 'torpedo5'), true);
  assert.equal(e.times[1].torpedos, 8);
  const r = partidaComTimes([1, 1], { modo: 'rapido' });
  r.times[1].sequencia = 3; assert.deepEqual(JuizTimes.trocasPossiveis(r, 1), ['duplo', 'mover', 'radar3']);
  r.times[1].sequencia = 6; assert.deepEqual(JuizTimes.trocasPossiveis(r, 1), ['cruz', 'x', 'radar4']);
  assert.equal(JuizTimes.trocar(r, 1, 'torpedo2'), false);
});

test('trocar por torpedos e usar um torpedo no mesmo ataque afunda o navio inteiro', function () {
  const NB = function () { return { n2: { l: 0, c: 0, orientacao: 'h', tamanho: 2 } }; };
  const e = JuizTimes.criarPartida(Object.assign({}, CFG), [{ id: 1, nome: 'A', alunos: ['a'], navios: NB() }, { id: 2, nome: 'B', alunos: ['b'], navios: NB() }]);
  e.times[1].sequencia = 3;
  const r = JuizTimes.resolverRodada(e, { 1: { alvo: 2, l: 0, c: 0, poder: 'torpedo', trocar: 'torpedo2' } }, { 1: true, 2: false });
  assert.equal(r.eventos[0].poder, 'torpedo');
  assert.equal(e.times[2].vivo, false);
  assert.equal(e.times[1].torpedos, 1);
});

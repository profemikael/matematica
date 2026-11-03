// Juiz dos times: regras puras do jogo em times. Sem DOM e sem Firebase.
// Reaproveita Regras (navios e tiros) e Perguntas (conferir resposta) do jogo atual, sem alterá-los.
(function (raiz) {
  'use strict';

  const Regras = raiz.Regras || (typeof require !== 'undefined' ? require('../../batalha-naval/js/regras.js') : null);
  const Perguntas = raiz.Perguntas || (typeof require !== 'undefined' ? require('../../batalha-naval/js/perguntas.js') : null);

  const LIMIAR_DUPLO = 3;
  const LIMIAR_CRUZ = 6;

  function vivos(estado) {
    return Object.keys(estado.times).map(Number).filter(function (id) { return estado.times[id].vivo; });
  }

  function criarPartida(config, times) {
    if (times.filter(function (t) { return t.alunos.length > 0; }).length < 2) throw new Error('A partida precisa de pelo menos 2 times com alunos.');
    const estado = { config: Object.assign({ modo: 'classico', tiro: 'normal', resposta: 'todos', segundos: 10,
                                              limiarDuplo: LIMIAR_DUPLO, limiarCruz: LIMIAR_CRUZ }, config),
                     rodada: 0, times: {} };
    times.filter(function (t) { return t.alunos.length > 0; }).forEach(function (t) {
      estado.times[t.id] = { id: t.id, nome: t.nome, alunos: t.alunos.slice(), navios: t.navios, tiros: {}, afundadas: [],
                             vivo: true, sequencia: 0, arsenal: { duplo: 0, cruz: 0, x: 0 } };
    });
    return estado;
  }

  // Aluno da vez: rodízio pelos alunos do time, pulando os desconectados.
  function quemEscolhe(estado, timeId, conectados) {
    const alunos = estado.times[timeId].alunos;
    const n = alunos.length;
    const base = Math.max(0, estado.rodada - 1) % n;
    for (let i = 0; i < n; i++) {
      const uid = alunos[(base + i) % n];
      if (conectados[uid]) return uid;
    }
    return null;
  }

  function avaliarRespostas(estado, pergunta, respostas, conectados) {
    const acertos = {};
    vivos(estado).forEach(function (id) {
      const presentes = estado.times[id].alunos.filter(function (u) { return conectados[u]; });
      if (presentes.length === 0) { acertos[id] = false; return; }
      const certa = function (u) { return !!respostas[u] && Perguntas.conferir(pergunta, respostas[u].texto); };
      if (estado.config.resposta === 'primeiro') {
        const com = presentes.filter(function (u) { return !!respostas[u]; })
          .sort(function (a, b) { return (respostas[a].em || 0) - (respostas[b].em || 0); });
        acertos[id] = com.length > 0 && certa(com[0]);
      } else {
        acertos[id] = presentes.every(certa);
      }
    });
    return acertos;
  }

  function registrarAcertos(estado, acertos) {
    vivos(estado).forEach(function (id) {
      const t = estado.times[id];
      t.sequencia = acertos[id] ? t.sequencia + 1 : 0;
    });
  }

  const DESLOCAMENTOS = {
    normal: [[0, 0]],
    duplo: [[0, 0], [0, 1]],
    duploEmPe: [[0, 0], [1, 0]],
    cruz: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
    x: [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]
  };

  function trocasPossiveis(estado, timeId) {
    if (estado.config.tiro !== 'turbo') return [];
    const seq = estado.times[timeId].sequencia;
    if (seq >= estado.config.limiarCruz) return ['cruz', 'x'];
    if (seq >= estado.config.limiarDuplo) return ['duplo'];
    return [];
  }

  function trocar(estado, timeId, poder) {
    if (trocasPossiveis(estado, timeId).indexOf(poder) < 0) return false;
    const t = estado.times[timeId];
    t.arsenal[poder] += 1;
    t.sequencia = 0;
    return true;
  }

  // Casas (chaves "l,c") que o poder atinge, dentro do mar 10x10; a casa escolhida vem primeiro.
  function casasDoPoder(poder, l, c, vertical) {
    const chave = poder === 'duplo' && vertical ? 'duploEmPe' : poder;
    return (DESLOCAMENTOS[chave] || DESLOCAMENTOS.normal)
      .map(function (d) { return [l + d[0], c + d[1]]; })
      .filter(function (p) { return p[0] >= 0 && p[0] < Regras.TAMANHO && p[1] >= 0 && p[1] < Regras.TAMANHO; })
      .map(function (p) { return Regras.chave(p[0], p[1]); });
  }

  function ehInteiro09(v) { return Number.isInteger(v) && v >= 0 && v < Regras.TAMANHO; }

  function todasAtingidas(navios, tiros) {
    return Object.keys(navios).every(function (id) {
      return Regras.casasDoNavio(navios[id]).every(function (k) { return tiros[Regras.chave(k.l, k.c)] === 'acerto'; });
    });
  }

  // Resolve os ataques da rodada ao mesmo tempo: todos contra o tabuleiro como estava no começo da rodada.
  function resolverRodada(estado, ataques, acertos) {
    const vivosAntes = vivos(estado);
    const antes = {};
    vivosAntes.forEach(function (id) { antes[id] = Object.assign({}, estado.times[id].tiros); });
    const eventos = [];
    const novosTiros = {};   // alvo -> { chave: 'agua'|'acerto' }

    vivosAntes.forEach(function (id) {
      const a = ataques[id];
      if (!a || acertos[id] !== true) return;
      const t = estado.times[id];
      const alvo = estado.times[a.alvo];
      const ignorar = function () {
        eventos.push({ atacante: id, alvo: a.alvo, casas: [], agua: [], acertos: [], afundou: false, ignorado: true, poder: 'normal' });
      };
      if (!alvo || !alvo.vivo || a.alvo === id || !ehInteiro09(a.l) || !ehInteiro09(a.c) || antes[a.alvo] === undefined
          || antes[a.alvo][Regras.chave(a.l, a.c)]) { ignorar(); return; }
      if (a.trocar) trocar(estado, id, a.trocar);
      let poder = 'normal';
      if (estado.config.tiro === 'turbo' && a.poder && a.poder !== 'normal' && t.arsenal[a.poder] >= 1) {
        poder = a.poder;
        t.arsenal[poder] -= 1;
      }
      const casas = casasDoPoder(poder, a.l, a.c, !!a.vertical).filter(function (ch) { return !antes[a.alvo][ch]; });
      const r = Regras.resolverTiroMultiplo(alvo.navios, antes[a.alvo], estado.config.modo, casas, false);
      const acu = novosTiros[a.alvo] = novosTiros[a.alvo] || {};
      r.agua.forEach(function (ch) { acu[ch] = acu[ch] || 'agua'; });
      r.acertos.forEach(function (ch) { acu[ch] = 'acerto'; });
      eventos.push({ atacante: id, alvo: a.alvo, casas: casas, agua: r.agua, acertos: r.acertos, afundou: r.afundados.length > 0, poder: poder });
    });

    Object.keys(novosTiros).forEach(function (alvoId) {
      const alvo = estado.times[alvoId];
      Object.keys(novosTiros[alvoId]).forEach(function (ch) {
        if (alvo.tiros[ch] !== 'acerto') alvo.tiros[ch] = novosTiros[alvoId][ch];
      });
      // Navios completados (por um tiro ou pela soma de vários) entram em afundadas.
      Object.keys(alvo.navios).forEach(function (nid) {
        const cs = Regras.casasDoNavio(alvo.navios[nid]).map(function (k) { return Regras.chave(k.l, k.c); });
        if (cs.every(function (ch) { return alvo.tiros[ch] === 'acerto'; }) && alvo.afundadas.indexOf(cs[0]) < 0) {
          cs.forEach(function (ch) { alvo.afundadas.push(ch); });
          eventos.forEach(function (ev) {
            if (String(ev.alvo) === String(alvoId) && ev.acertos.some(function (ch) { return cs.indexOf(ch) >= 0; })) ev.afundou = true;
          });
        }
      });
    });

    const eliminados = [];
    vivosAntes.forEach(function (id) {
      const t = estado.times[id];
      if (todasAtingidas(t.navios, t.tiros)) { t.vivo = false; eliminados.push(id); }
    });
    const restam = vivos(estado);
    let fim = null;
    if (restam.length === 1) fim = { vencedores: restam, empate: false };
    else if (restam.length === 0) fim = { vencedores: vivosAntes, empate: true };
    return { eventos: eventos, eliminados: eliminados, fim: fim };
  }

  const JuizTimes = { criarPartida, quemEscolhe, avaliarRespostas, registrarAcertos, vivos,
                      trocasPossiveis, trocar, casasDoPoder, resolverRodada };
  raiz.JuizTimes = JuizTimes;
  if (typeof module !== 'undefined' && module.exports) module.exports = JuizTimes;
})(typeof window !== 'undefined' ? window : globalThis);

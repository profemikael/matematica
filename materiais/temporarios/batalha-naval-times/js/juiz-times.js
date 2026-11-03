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

  const JuizTimes = { criarPartida, quemEscolhe, avaliarRespostas, registrarAcertos, vivos };
  raiz.JuizTimes = JuizTimes;
  if (typeof module !== 'undefined' && module.exports) module.exports = JuizTimes;
})(typeof window !== 'undefined' ? window : globalThis);

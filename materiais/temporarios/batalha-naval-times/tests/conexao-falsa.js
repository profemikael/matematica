'use strict';
// Relógio manual e conexão falsa em memória para testar o anfitrião sem Firebase nem timers reais.
function criarRelogio() {
  let agora = 1000000;
  let seq = 0;
  let fila = [];
  return {
    agora: function () { return agora; },
    agendar: function (fn, ms) {
      const t = { id: ++seq, em: agora + ms, fn: fn };
      fila.push(t);
      return function () { fila = fila.filter(function (x) { return x.id !== t.id; }); };
    },
    avancar: function (ms) {
      const alvo = agora + ms;
      for (;;) {
        fila.sort(function (a, b) { return a.em - b.em || a.id - b.id; });
        if (fila.length === 0 || fila[0].em > alvo) break;
        const t = fila.shift();
        agora = Math.max(agora, t.em);
        t.fn();
      }
      agora = alvo;
    },
    pendentes: function () { return fila.length; }
  };
}

function criarConexaoFalsa() {
  let publico = null;
  let estadoSalvo = null;
  let jogadores = {};
  const respostas = {};
  const ataques = {};
  const ouvJog = [], ouvResp = [], ouvAtq = [];
  let rodadaAtual = 0;

  function copia(v) { return JSON.parse(JSON.stringify(v || {})); }
  function avisar(lista, rodada, valor) {
    lista.slice().forEach(function (o) { if (rodada === undefined || o.rodada === rodada) o.cb(copia(valor)); });
  }
  function ouvir(lista, o) { lista.push(o); return function () { const i = lista.indexOf(o); if (i >= 0) lista.splice(i, 1); }; }

  return {
    horaServidor: function () { return 0; },
    publicar: function (p) { publico = JSON.parse(JSON.stringify(p)); rodadaAtual = p.rodada || rodadaAtual; },
    salvarEstado: function (e) { estadoSalvo = JSON.stringify(e); },
    lerEstado: function () { return Promise.resolve(estadoSalvo ? JSON.parse(estadoSalvo) : null); },
    lerNavios: function () { return Promise.resolve({}); },
    naviosGravados: {},
    gravarNavios: function (timeId, navios, pronto) { this.naviosGravados[timeId] = { navios: JSON.parse(JSON.stringify(navios)), pronto: pronto }; },
    aoJogadores: function (cb) { const f = ouvir(ouvJog, { cb: cb }); cb(copia(jogadores)); return f; },
    aoRespostas: function (rodada, cb) { const f = ouvir(ouvResp, { rodada: rodada, cb: cb }); cb(copia(respostas[rodada])); return f; },
    aoAtaques: function (rodada, cb) { const f = ouvir(ouvAtq, { rodada: rodada, cb: cb }); cb(copia(ataques[rodada])); return f; },
    // ---- só para os testes ----
    ultimoPublico: function () { return publico; },
    definirJogadores: function (obj) { jogadores = obj; avisar(ouvJog, undefined, jogadores); },
    desconectar: function (uid) { jogadores[uid] = Object.assign({}, jogadores[uid], { conectado: false }); avisar(ouvJog, undefined, jogadores); },
    simularResposta: function (uid, texto, em) {
      const r = rodadaAtual;
      respostas[r] = respostas[r] || {};
      respostas[r][uid] = { texto: texto, em: em === undefined ? Date.now() : em };
      avisar(ouvResp, r, respostas[r]);
    },
    simularAtaque: function (timeId, ataque) {
      const r = rodadaAtual;
      ataques[r] = ataques[r] || {};
      ataques[r][timeId] = ataque;
      avisar(ouvAtq, r, ataques[r]);
    }
  };
}

module.exports = { criarRelogio, criarConexaoFalsa };

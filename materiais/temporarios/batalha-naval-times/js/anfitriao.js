// Anfitrião: o computador do professor é o juiz da partida em times.
// Controla o relógio e as fases (pergunta → ataque → resultado), aplica as regras do JuizTimes e publica o estado.
// Não conhece DOM nem Firebase: fala só com a "conexão" (ver o plano).
(function (raiz) {
  'use strict';

  const JuizTimes = raiz.JuizTimes || (typeof require !== 'undefined' ? require('./juiz-times.js') : null);
  const Regras = raiz.Regras || (typeof require !== 'undefined' ? require('../../batalha-naval/js/regras.js') : null);
  const Perguntas = raiz.Perguntas || (typeof require !== 'undefined' ? require('../../batalha-naval/js/perguntas.js') : null);

  const RESULTADO_MS = 5000;

  // opcoes = { conexao, config, times, perguntas, relogio: { agora(), agendar(fn, ms) → cancelar }, aleatorio, aoMudar?(publico) }
  function criar(opcoes) {
    const con = opcoes.conexao;
    const relogio = opcoes.relogio;
    const aleatorio = opcoes.aleatorio || Math.random;
    const perguntas = opcoes.perguntas;

    let estado = null;          // estado do JuizTimes
    let fase = 'espera';
    let monte = null;
    let perguntaIdx = null;
    let perguntaPublica = null; // { texto, tipo, opcoes? } — nunca com a resposta certa
    let acertos = null;
    let eventos = [];
    let fim = null;
    let ate = 0;
    let pausada = false;
    let respostas = {};
    let ataques = {};
    let conectados = {};
    let cancelarRelogio = null;
    let desinscrever = [];
    let pararJogadores = null;

    function limparRelogio() { if (cancelarRelogio) { cancelarRelogio(); cancelarRelogio = null; } }
    function limparOuvintes() { desinscrever.forEach(function (f) { f(); }); desinscrever = []; }

    function naviosRestantes(t) {
      return Object.keys(t.navios).filter(function (id) {
        return !Regras.casasDoNavio(t.navios[id]).every(function (k) { return t.tiros[Regras.chave(k.l, k.c)] === 'acerto'; });
      }).length;
    }

    function montarPublico() {
      const times = {};
      Object.keys(estado.times).forEach(function (id) {
        const t = estado.times[id];
        times[id] = { nome: t.nome, alunos: t.alunos, vivo: t.vivo, sequencia: t.sequencia, arsenal: t.arsenal,
                      naviosRestantes: naviosRestantes(t), acertou: acertos ? !!acertos[id] : null,
                      vezDe: t.vivo ? JuizTimes.quemEscolhe(estado, id, conectados) : null,
                      tiros: t.tiros, afundadas: t.afundadas };
      });
      return { fase: fase, rodada: estado.rodada, ate: ate, pausada: pausada, pergunta: perguntaPublica,
               times: times, eventos: eventos, fim: fim };
    }

    function publicar() {
      const pub = montarPublico();
      con.publicar(pub);
      con.salvarEstado({ estado: estado, fase: fase, monte: monte, perguntaIdx: perguntaIdx, perguntaPublica: perguntaPublica,
                         acertos: acertos, eventos: eventos, fim: fim, pausada: pausada });
      if (opcoes.aoMudar) opcoes.aoMudar(pub);
    }

    function agendar(ms, fn) {
      limparRelogio();
      ate = relogio.agora() + ms;
      cancelarRelogio = relogio.agendar(function () { cancelarRelogio = null; fn(); }, ms);
    }

    function escolherPublica(p) {
      if (p.tipo === 'escolha') {
        return { texto: p.pergunta, tipo: 'escolha', opcoes: Perguntas.embaralhar([p.certa].concat(p.erradas).map(String), aleatorio) };
      }
      return { texto: p.pergunta, tipo: 'digitar' };
    }

    // ---- fases ----
    function iniciarRodada() {
      limparOuvintes();
      estado.rodada += 1;
      acertos = null; eventos = []; respostas = {}; ataques = {};
      perguntaIdx = Perguntas.sortear(monte, aleatorio);
      perguntaPublica = escolherPublica(perguntas[perguntaIdx]);
      comecarPergunta();
    }

    function comecarPergunta() {
      fase = 'pergunta';
      respostas = {};
      limparOuvintes();
      desinscrever.push(con.aoRespostas(estado.rodada, function (r) { respostas = r || {}; talvezFecharPergunta(); }));
      agendar(estado.config.segundos * 1000, encerrarPergunta);
      publicar();
    }

    function talvezFecharPergunta() {
      if (fase !== 'pergunta' || pausada) return;
      const presentes = [];
      JuizTimes.vivos(estado).forEach(function (id) {
        estado.times[id].alunos.forEach(function (u) { if (conectados[u]) presentes.push(u); });
      });
      if (presentes.length > 0 && presentes.every(function (u) { return !!respostas[u]; })) encerrarPergunta();
    }

    function encerrarPergunta() {
      if (fase !== 'pergunta') return;
      limparRelogio(); limparOuvintes();
      acertos = JuizTimes.avaliarRespostas(estado, perguntas[perguntaIdx], respostas, conectados);
      JuizTimes.registrarAcertos(estado, acertos);
      const algum = Object.keys(acertos).some(function (id) { return acertos[id]; });
      if (algum) comecarAtaque(); else fecharRodada();
    }

    function comecarAtaque() {
      fase = 'ataque';
      ataques = {};
      limparOuvintes();
      desinscrever.push(con.aoAtaques(estado.rodada, function (a) { ataques = a || {}; }));
      agendar(estado.config.segundos * 1000, encerrarAtaque);
      publicar();
    }

    function encerrarAtaque() {
      if (fase !== 'ataque') return;
      limparRelogio(); limparOuvintes();
      fecharRodada();
    }

    // Aplica os ataques (se houver) e passa para o resultado ou para o fim.
    function fecharRodada() {
      const r = JuizTimes.resolverRodada(estado, ataques, acertos);
      eventos = r.eventos;
      if (r.fim) {
        fase = 'fim'; fim = r.fim; ate = 0;
        publicar();
        return;
      }
      fase = 'resultado';
      agendar(RESULTADO_MS, iniciarRodada);
      publicar();
    }

    function observarJogadores() {
      if (pararJogadores) pararJogadores();
      pararJogadores = con.aoJogadores(function (j) {
        conectados = {};
        Object.keys(j || {}).forEach(function (u) { conectados[u] = !!j[u].conectado; });
        if (estado && fase === 'pergunta') talvezFecharPergunta();
      });
    }

    // ---- interface ----
    function iniciar() {
      estado = JuizTimes.criarPartida(opcoes.config, opcoes.times);
      monte = Perguntas.criarMonte(perguntas.length, aleatorio);
      fim = null; pausada = false;
      observarJogadores();
      iniciarRodada();
    }

    // Reinicia a fase atual com o tempo cheio (depois de pausa ou de recarregar a página).
    function continuarFase() {
      pausada = false;
      if (fase === 'pergunta') comecarPergunta();
      else if (fase === 'ataque') comecarAtaque();
      else if (fase === 'resultado') { agendar(RESULTADO_MS, iniciarRodada); publicar(); }
      else publicar();
    }

    async function retomar() {
      if (!estado) {
        const s = await con.lerEstado();
        if (!s) return false;
        estado = s.estado; fase = s.fase; monte = s.monte; perguntaIdx = s.perguntaIdx; perguntaPublica = s.perguntaPublica;
        acertos = s.acertos; eventos = s.eventos || []; fim = s.fim;
        Object.keys(estado.times).forEach(function (id) {
          const t = estado.times[id];
          t.tiros = t.tiros || {}; t.afundadas = t.afundadas || [];
        });
        observarJogadores();
      }
      continuarFase();
      return true;
    }

    function pausar() {
      if (!estado || fase === 'fim') return;
      limparRelogio();
      pausada = true;
      publicar();
    }

    function encerrar() {
      limparRelogio(); limparOuvintes();
      if (pararJogadores) { pararJogadores(); pararJogadores = null; }
      if (!estado) return;
      fase = 'fim'; fim = { vencedores: [], empate: false, encerrada: true }; ate = 0;
      publicar();
    }

    return { iniciar: iniciar, retomar: retomar, pausar: pausar, encerrar: encerrar, estado: function () { return estado; } };
  }

  const Anfitriao = { criar: criar, RESULTADO_MS: RESULTADO_MS };
  raiz.Anfitriao = Anfitriao;
  if (typeof module !== 'undefined' && module.exports) module.exports = Anfitriao;
})(typeof window !== 'undefined' ? window : globalThis);

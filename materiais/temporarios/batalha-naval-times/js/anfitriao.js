// Anfitrião: o computador do professor é o juiz da partida em times.
// Controla o relógio e as fases (regras → pergunta → ataque → resultado), aplica as regras do JuizTimes e publica o estado.
// Não conhece DOM nem Firebase: fala só com a "conexão" (ver o plano).
(function (raiz) {
  'use strict';

  const JuizTimes = raiz.JuizTimes || (typeof require !== 'undefined' ? require('./juiz-times.js') : null);
  const Regras = raiz.Regras || (typeof require !== 'undefined' ? require('../../batalha-naval/js/regras.js') : null);
  const Perguntas = raiz.Perguntas || (typeof require !== 'undefined' ? require('../../batalha-naval/js/perguntas.js') : null);

  const RESULTADO_MS = 5000;

  // opcoes = { conexao, config, times, perguntas, relogio: { agora(), agendar(fn, ms) → cancelar }, aleatorio, aoMudar?(publico),
  //            cartaoRegras? (true: antes da rodada 1, todos os conectados leem as regras e clicam "Entendi") }
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
    let movedores = [];   // times que declararam mover navio e estão na etapa de movimento
    let ate = 0;
    let pausada = false;
    let respostas = {};
    let ataques = {};
    let jogadoresBrutos = {};   // como o Firebase mostra os jogadores (nome, time, conectado, vistoEm)
    let avisos = [];            // "Beto saiu do Time Azul", "Beto voltou..." (da rodada atual)
    let aceitaram = [];         // fase 'regras': quem já clicou "Entendi" no cartão das regras
    const semSinalMs = opcoes.semSinalMs || 15000;
    let cancelarRelogio = null;
    let desinscrever = [];
    let pararJogadores = null;

    // Presente = marcado como conectado E mandando sinal de vida há pouco (pega Chromebook desligado ou fechado,
    // que o Firebase só perceberia depois de cerca de 1 minuto). Sem vistoEm (jogadores antigos) vale só "conectado".
    function estaPresente(uid) {
      const j = jogadoresBrutos[uid];
      if (!j || !j.conectado) return false;
      if (typeof j.vistoEm === 'number' && relogio.agora() - j.vistoEm > semSinalMs) return false;
      return true;
    }
    function mapaConectados() {
      const m = {};
      Object.keys(jogadoresBrutos).forEach(function (u) { m[u] = estaPresente(u); });
      return m;
    }
    function nomeDe(uid) { return (jogadoresBrutos[uid] && jogadoresBrutos[uid].nome) || 'Um aluno'; }

    // No começo de cada rodada: quem sumiu sai do time (o time nunca fica vazio) e quem voltou é recolocado.
    function sincronizarTimes() {
      avisos = [];
      const presentes = mapaConectados();
      JuizTimes.vivos(estado).forEach(function (id) {
        const t = estado.times[id];
        const saindo = t.alunos.filter(function (u) { return !presentes[u]; });
        if (saindo.length > 0 && saindo.length < t.alunos.length) {
          saindo.forEach(function (u) { avisos.push(nomeDe(u) + ' saiu do ' + t.nome + ' (desconectou)'); });
          t.alunos = t.alunos.filter(function (u) { return presentes[u]; });
        }
        Object.keys(jogadoresBrutos)
          .filter(function (u) { return jogadoresBrutos[u].time === Number(id) && presentes[u] && t.alunos.indexOf(u) < 0; })
          .sort(function (a, b) { return (jogadoresBrutos[a].entrouEm || 0) - (jogadoresBrutos[b].entrouEm || 0); })
          .forEach(function (u) { t.alunos.push(u); avisos.push(nomeDe(u) + ' voltou para o ' + t.nome); });
      });
    }

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
                      naviosRestantes: naviosRestantes(t), torpedos: t.torpedos, acertou: acertos ? !!acertos[id] : null,
                      vezDe: t.vivo ? JuizTimes.quemEscolhe(estado, id, mapaConectados()) : null,
                      tiros: t.tiros, afundadas: t.afundadas };
      });
      return { fase: fase, rodada: estado.rodada, ate: ate, pausada: pausada, pergunta: perguntaPublica,
               times: times, eventos: eventos, fim: fim, movedores: movedores, avisos: avisos, aceitaram: aceitaram };
    }

    function publicar() {
      const pub = montarPublico();
      con.publicar(pub);
      con.salvarEstado({ estado: estado, fase: fase, monte: monte, perguntaIdx: perguntaIdx, perguntaPublica: perguntaPublica,
                         acertos: acertos, eventos: eventos, fim: fim, pausada: pausada, movedores: movedores });
      if (opcoes.aoMudar) opcoes.aoMudar(pub);
    }

    // `extra`: tolerância depois do prazo mostrado (respostas digitadas que ainda estão chegando); o prazo publicado não muda.
    function agendar(ms, fn, extra) {
      limparRelogio();
      ate = relogio.agora() + ms;
      cancelarRelogio = relogio.agendar(function () { cancelarRelogio = null; fn(); }, ms + (extra || 0));
    }

    function escolherPublica(p) {
      if (p.tipo === 'escolha') {
        return { texto: p.pergunta, tipo: 'escolha', opcoes: Perguntas.embaralhar([p.certa].concat(p.erradas).map(String), aleatorio) };
      }
      return { texto: p.pergunta, tipo: 'digitar' };
    }

    // ---- fases ----
    // Cartão das regras: sem prazo; a rodada 1 começa quando todos os alunos conectados dos times clicaram "Entendi".
    function comecarRegras() {
      fase = 'regras'; ate = 0;
      talvezFecharRegras();
      if (fase === 'regras') publicar();
    }

    function talvezFecharRegras() {
      if (fase !== 'regras' || pausada) return;
      const presentes = [];
      JuizTimes.vivos(estado).forEach(function (id) {
        estado.times[id].alunos.forEach(function (u) { if (estaPresente(u)) presentes.push(u); });
      });
      const novos = presentes.filter(function (u) { return jogadoresBrutos[u] && jogadoresBrutos[u].aceitouRegras === true; });
      if (presentes.length > 0 && novos.length === presentes.length) { iniciarRodada(); return; }
      if (novos.join(',') !== aceitaram.join(',')) { aceitaram = novos; publicar(); }
    }

    function iniciarRodada() {
      limparOuvintes();
      estado.rodada += 1;
      sincronizarTimes();
      acertos = null; eventos = []; respostas = {}; ataques = {}; movedores = [];
      perguntaIdx = Perguntas.sortear(monte, aleatorio);
      perguntaPublica = escolherPublica(perguntas[perguntaIdx]);
      comecarPergunta();
    }

    function comecarPergunta() {
      fase = 'pergunta';
      respostas = {};
      limparOuvintes();
      desinscrever.push(con.aoRespostas(estado.rodada, function (r) { respostas = r || {}; talvezFecharPergunta(); }));
      agendar(estado.config.segundos * 1000, encerrarPergunta, opcoes.gracaMs || 0);
      publicar();
    }

    function talvezFecharPergunta() {
      if (fase !== 'pergunta' || pausada) return;
      const presentes = [];
      JuizTimes.vivos(estado).forEach(function (id) {
        estado.times[id].alunos.forEach(function (u) { if (estaPresente(u)) presentes.push(u); });
      });
      if (presentes.length > 0 && presentes.every(function (u) { return !!respostas[u]; })) encerrarPergunta();
    }

    function encerrarPergunta() {
      if (fase !== 'pergunta') return;
      limparRelogio(); limparOuvintes();
      acertos = JuizTimes.avaliarRespostas(estado, perguntas[perguntaIdx], respostas, mapaConectados());
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
      const quem = JuizTimes.vivos(estado).filter(function (id) {
        return acertos[id] && JuizTimes.podeMover(estado, id, ataques[id]);
      });
      if (quem.length > 0) comecarMovimento(quem); else fecharRodada();
    }

    // Etapa de movimento: tempo extra para quem declarou mover navio; os outros times veem o aviso.
    function segundosMover() {
      return estado.config.segundosMover || Math.max(15, estado.config.segundos * 2);
    }

    function comecarMovimento(quem) {
      fase = 'movimento';
      movedores = quem;
      limparOuvintes();
      desinscrever.push(con.aoAtaques(estado.rodada, function (a) { ataques = a || {}; talvezFecharMovimento(); }));
      agendar(segundosMover() * 1000, encerrarMovimento);
      publicar();
    }

    function talvezFecharMovimento() {
      if (fase !== 'movimento' || pausada) return;
      const prontos = movedores.every(function (id) {
        const m = ataques[id] && ataques[id].mover;
        return !!m && Number.isInteger(m.l) && Number.isInteger(m.c);
      });
      if (prontos) encerrarMovimento();
    }

    function encerrarMovimento() {
      if (fase !== 'movimento') return;
      limparRelogio(); limparOuvintes();
      fecharRodada();
    }

    // Aplica os ataques (se houver) e passa para o resultado ou para o fim.
    function fecharRodada() {
      const r = JuizTimes.resolverRodada(estado, ataques, acertos);
      eventos = r.eventos;
      // Navios movidos: o time precisa ver o novo lugar no próprio mar.
      eventos.forEach(function (e) {
        if (e.poder === 'mover' && !e.ignorado && con.gravarNavios) con.gravarNavios(e.atacante, estado.times[e.atacante].navios, true);
      });
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
        jogadoresBrutos = j || {};
        if (estado && fase === 'pergunta') talvezFecharPergunta();
        if (estado && fase === 'regras') talvezFecharRegras();
      });
    }

    // ---- interface ----
    function iniciar() {
      estado = JuizTimes.criarPartida(opcoes.config, opcoes.times);
      monte = Perguntas.criarMonte(perguntas.length, aleatorio);
      fim = null; pausada = false; aceitaram = [];
      observarJogadores();
      if (opcoes.cartaoRegras) comecarRegras(); else iniciarRodada();
    }

    // Professor: começa a rodada 1 sem esperar quem ainda não clicou "Entendi".
    function comecarJa() { if (estado && fase === 'regras') iniciarRodada(); }

    // Reinicia a fase atual com o tempo cheio (depois de pausa ou de recarregar a página).
    function continuarFase() {
      pausada = false;
      if (fase === 'regras') comecarRegras();
      else if (fase === 'pergunta') comecarPergunta();
      else if (fase === 'ataque') comecarAtaque();
      else if (fase === 'movimento') comecarMovimento(movedores);
      else if (fase === 'resultado') { agendar(RESULTADO_MS, iniciarRodada); publicar(); }
      else publicar();
    }

    async function retomar() {
      if (!estado) {
        const s = await con.lerEstado();
        if (!s) return false;
        estado = s.estado; fase = s.fase; monte = s.monte; perguntaIdx = s.perguntaIdx; perguntaPublica = s.perguntaPublica;
        acertos = s.acertos; eventos = s.eventos || []; fim = s.fim; movedores = s.movedores || [];
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

    return { iniciar: iniciar, comecarJa: comecarJa, retomar: retomar, pausar: pausar, encerrar: encerrar, estado: function () { return estado; } };
  }

  const Anfitriao = { criar: criar, RESULTADO_MS: RESULTADO_MS };
  raiz.Anfitriao = Anfitriao;
  if (typeof module !== 'undefined' && module.exports) module.exports = Anfitriao;
})(typeof window !== 'undefined' ? window : globalThis);

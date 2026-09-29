// Cliente: o "cérebro" de um jogador online. Sem DOM e sem Firebase.
// Recebe os recados da sala (na ordem), aplica nas regras, responde os tiros quando é o defensor,
// guarda a ficha para voltar depois de uma queda e avisa a tela do que mudou.
(function (raiz) {
  'use strict';

  const Regras = raiz.Regras || (typeof require !== 'undefined' ? require('./regras.js') : null);
  const Perguntas = raiz.Perguntas || (typeof require !== 'undefined' ? require('./perguntas.js') : null);

  const MS_CONTA = 10000;

  function criar(opcoes) {
    const conexao = opcoes.conexao;
    const eu = opcoes.eu;
    const aleatorio = opcoes.aleatorio || Math.random;
    const perguntas = opcoes.perguntas;
    const ouvintes = [];
    const fichaInicial = opcoes.ficha || null;
    // Tempo para responder cada conta, escolhido por quem criou a sala (1 a 15 s; salas antigas: 10 s).
    const msConta = Math.min(15, Math.max(1, Math.round(Number(opcoes.config.segundos) || 10))) * 1000;

    let partida = 1;
    let estado = null;
    let monte = fichaInicial && fichaInicial.monte ? fichaInicial.monte : Perguntas.criarMonte(perguntas.length, aleatorio);
    let pergunta = fichaInicial && fichaInicial.pergunta ? fichaInicial.pergunta : null;
    const naviosPorPartida = Object.assign({}, fichaInicial && fichaInicial.naviosPorPartida);
    if (fichaInicial && fichaInicial.partida && fichaInicial.navios && !naviosPorPartida[fichaInicial.partida]) {
      naviosPorPartida[fichaInicial.partida] = fichaInicial.navios;
    }
    let turno = 0;
    let inicioBatalha = null;
    let sincronizado = false;
    let revelei = false;
    let revanches = {};
    let ultimoMirarEm = 0;
    let respondiTiroDoTurno = 0;

    function novaPartidaLocal(navios) {
      estado = Regras.novaPartida({ nomes: opcoes.nomes, modo: opcoes.config.modo, tempoMin: opcoes.config.tempoMin, eu: eu });
      if (navios) estado.jogadores[eu].navios = navios;
      turno = 0;
      respondiTiroDoTurno = 0;
      inicioBatalha = null;
      revelei = false;
      revanches = {};
    }
    novaPartidaLocal(naviosPorPartida[1] || null);

    function avisar(evento) { ouvintes.forEach(function (f) { f(evento); }); }

    function guardar() {
      naviosPorPartida[partida] = estado.jogadores[eu].navios;
      if (opcoes.guardar) opcoes.guardar({ partida: partida, navios: estado.jogadores[eu].navios, naviosPorPartida: naviosPorPartida, monte: monte, pergunta: pergunta });
    }

    function enviar(tipo, dados) {
      conexao.enviar(Object.assign({ partida: partida, tipo: tipo, jogador: eu }, dados || {}));
    }

    function cumprirObrigacoes() {
      if (!sincronizado) return;
      if (estado.fase === 'batalha' && estado.etapa === 'aguardando_resultado' && estado.vez !== eu && respondiTiroDoTurno !== turno) {
        respondiTiroDoTurno = turno;
        const meu = estado.jogadores[eu];
        const r = Regras.resolverTiro(meu.navios, meu.tiros, estado.config.modo, estado.mira.l, estado.mira.c);
        enviar('resultado', r);
      }
      if (estado.fase === 'fim' && !revelei) {
        revelei = true;
        enviar('revelar', { navios: estado.jogadores[eu].navios });
      }
    }

    function receber(recado) {
      if (recado.partida !== partida) return;
      if (recado.tipo === 'revanche') {
        if (estado.fase !== 'fim') return;
        revanches[recado.jogador] = true;
        avisar({ tipo: 'revanche', recado: recado });
        if (revanches[0] && revanches[1]) {
          partida += 1;
          if (sincronizado) pergunta = null;
          novaPartidaLocal(naviosPorPartida[partida] || null);
          guardar();
          avisar({ tipo: 'nova_partida' });
        }
        return;
      }
      const acao = Object.assign({}, recado, { acao: recado.tipo });
      const faseAntes = estado.fase;
      const r = Regras.aplicar(estado, acao, aleatorio);
      if (!r.ok) return;
      estado = r.estado;
      if (recado.tipo === 'mirar') { turno += 1; ultimoMirarEm = recado.em; }
      if (recado.tipo === 'resultado' && recado.jogador === eu) respondiTiroDoTurno = turno;
      if (recado.tipo === 'revelar' && recado.jogador === eu) revelei = true;
      if (faseAntes === 'posicionamento' && estado.fase === 'batalha') inicioBatalha = recado.em;
      if (recado.tipo === 'mirar' && recado.jogador === eu && sincronizado) sortearPergunta();
      if (recado.tipo === 'responder' && recado.jogador === eu && perguntaDestaVez()) {
        pergunta = null;
        guardar();
      }
      avisar({ tipo: recado.tipo, recado: recado });
      cumprirObrigacoes();
    }

    function perguntaDestaVez() { return !!pergunta && pergunta.partida === partida && pergunta.turno === turno; }

    function sortearPergunta() {
      if (perguntaDestaVez()) return;
      pergunta = { partida: partida, turno: turno, idx: Perguntas.sortear(monte, aleatorio), fim: ultimoMirarEm + msConta };
      guardar();
    }

    function marcarSincronizado() {
      sincronizado = true;
      if (estado.fase === 'batalha' && estado.vez === eu && estado.etapa === 'responder') sortearPergunta();
      if (estado.fase === 'batalha' && estado.vez === eu && estado.etapa === 'responder' && perguntaDestaVez()) {
        if (pergunta.respondida) {
          enviar('responder', { certa: pergunta.certa === true });
        } else if (conexao.horaServidor() >= pergunta.fim) {
          responder(null);
        }
      }
      if (estado.fase === 'batalha' && estado.vez === eu && estado.etapa === 'resultado') passarVez();
      cumprirObrigacoes();
      avisar({ tipo: 'sincronizado' });
    }

    function presenca(jogadores) {
      avisar({ tipo: 'presenca', jogadores: jogadores });
    }

    function local(acao) {
      const r = Regras.aplicar(estado, acao, aleatorio);
      if (r.ok) {
        estado = r.estado;
        guardar();
        avisar({ tipo: 'local' });
      }
      return r;
    }

    function pronto() {
      if (Object.keys(estado.jogadores[eu].navios).length !== Regras.FROTA.length) return false;
      guardar();
      enviar('pronto');
      return true;
    }

    function mirar(l, c) {
      if (estado.fase !== 'batalha' || estado.vez !== eu || estado.etapa !== 'escolher') return false;
      if (estado.jogadores[1 - eu].tiros[Regras.chave(l, c)]) return false;
      enviar('mirar', { l: l, c: c });
      return true;
    }

    function responder(texto) {
      if (!perguntaDestaVez() || pergunta.respondida || estado.etapa !== 'responder' || estado.vez !== eu) return null;
      const p = perguntas[pergunta.idx];
      const certa = texto !== null && texto !== undefined && Perguntas.conferir(p, texto);
      Perguntas.registrarResultado(monte, pergunta.idx, certa);
      pergunta.respondida = true;
      pergunta.certa = certa;
      guardar();
      enviar('responder', { certa: certa });
      return { certa: certa };
    }

    function passarVez() {
      if (estado.fase !== 'batalha' || estado.vez !== eu || estado.etapa !== 'resultado') return false;
      enviar('passar_vez', { tempoEsgotado: tempoAcabou() });
      return true;
    }

    function encerrar() {
      if (estado.fase === 'fim') return false;
      enviar('encerrar');
      return true;
    }

    function pedirRevanche() {
      if (estado.fase !== 'fim' || revanches[eu]) return false;
      enviar('revanche');
      return true;
    }

    function tempoRestanteMs() {
      if (!estado.config.tempoMin || inicioBatalha === null) return null;
      return Math.max(0, estado.config.tempoMin * 60000 - (conexao.horaServidor() - inicioBatalha));
    }

    function tempoAcabou() {
      return estado.tempoEsgotado || tempoRestanteMs() === 0;
    }

    function perguntaAtual() {
      if (!perguntaDestaVez() || pergunta.respondida || estado.etapa !== 'responder' || estado.vez !== eu) return null;
      return { pergunta: perguntas[pergunta.idx], fim: pergunta.fim };
    }

    return {
      get estado() { return estado; },
      get partida() { return partida; },
      get revanches() { return Object.assign({}, revanches); },
      get sincronizado() { return sincronizado; },
      get fimDaConta() { return ultimoMirarEm + msConta; },
      get msConta() { return msConta; },
      receber: receber,
      marcarSincronizado: marcarSincronizado,
      presenca: presenca,
      posicionar: function (navio, l, c, orientacao) { return local({ acao: 'posicionar', navio: navio, l: l, c: c, orientacao: orientacao }); },
      remover: function (navio) { return local({ acao: 'remover', navio: navio }); },
      aleatorio: function () { return local({ acao: 'aleatorio' }); },
      limpar: function () { return local({ acao: 'limpar' }); },
      pronto: pronto,
      mirar: mirar,
      responder: responder,
      passarVez: passarVez,
      encerrar: encerrar,
      pedirRevanche: pedirRevanche,
      tempoAcabou: tempoAcabou,
      tempoRestanteMs: tempoRestanteMs,
      perguntaAtual: perguntaAtual,
      aoMudar: function (f) { ouvintes.push(f); }
    };
  }

  const Cliente = { MS_CONTA: MS_CONTA, criar: criar };
  raiz.Cliente = Cliente;
  if (typeof module !== 'undefined' && module.exports) module.exports = Cliente;
})(typeof window !== 'undefined' ? window : globalThis);

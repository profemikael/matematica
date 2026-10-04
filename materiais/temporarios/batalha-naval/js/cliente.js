// Cliente: o "cérebro" de um jogador online. Sem DOM e sem Firebase.
// Recebe os recados da sala (na ordem), aplica nas regras, responde os tiros quando é o defensor,
// guarda a ficha para voltar depois de uma queda e avisa a tela do que mudou.
(function (raiz) {
  'use strict';

  const Regras = raiz.Regras || (typeof require !== 'undefined' ? require('./regras.js') : null);
  const Perguntas = raiz.Perguntas || (typeof require !== 'undefined' ? require('./perguntas.js') : null);

  const MS_CONTA = 10000;

  // opcoes = {
  //   conexao: { enviar(recado), horaServidor() },   ← vem da sala (Firebase ou falsa)
  //   eu: 0 | 1, nomes: [n0, n1], config: { banco, modo, tempoMin }, perguntas: [pergunta],
  //   ficha: { partida, navios, monte, pergunta } | null,   ← partida salva neste Chromebook
  //   guardar(ficha),                                    ← chamado sempre que a ficha muda
  //   aleatorio: () => número em [0, 1)
  // }
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
    let pergunta = fichaInicial && fichaInicial.pergunta ? fichaInicial.pergunta : null;  // { partida, turno, idx, fim, respondida?, certa? }
    // Meus navios de cada partida da sala (1, 2, ...): quem volta relê TODAS as partidas e precisa dos navios de cada uma.
    const naviosPorPartida = Object.assign({}, fichaInicial && fichaInicial.naviosPorPartida);
    if (fichaInicial && fichaInicial.partida && fichaInicial.navios && !naviosPorPartida[fichaInicial.partida]) {
      naviosPorPartida[fichaInicial.partida] = fichaInicial.navios;
    }
    let turno = 0;               // quantos "mirar" já aconteceram nesta partida
    let inicioBatalha = null;    // hora do servidor em que a batalha começou
    let sincronizado = false;    // já leu todos os recados antigos?
    let revelei = false;
    let revanches = {};
    let ultimoMirarEm = 0;       // hora do servidor do último "mirar"
    let respondiTiroDoTurno = 0; // último turno em que mandei o resultado como defensor

    function novaPartidaLocal(navios) {
      estado = Regras.novaPartida({ nomes: opcoes.nomes, modo: opcoes.config.modo, tempoMin: opcoes.config.tempoMin, eu: eu,
                                    tiro: opcoes.config.tiro, torpedos: opcoes.config.torpedos });
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

    // ---------- Obrigações automáticas (só depois de sincronizado) ----------

    function cumprirObrigacoes() {
      if (!sincronizado) return;
      // Sou o defensor e há um tiro esperando meu resultado.
      if (estado.fase === 'batalha' && estado.etapa === 'aguardando_resultado' && estado.vez !== eu && respondiTiroDoTurno !== turno) {
        respondiTiroDoTurno = turno;
        const meu = estado.jogadores[eu];
        const mira = estado.mira;
        const especial = mira.torpedo || (mira.casas && mira.casas.length > 1);   // Turbo: duplo, cruz ou torpedo
        const r = especial
          ? Regras.resolverTiroMultiplo(meu.navios, meu.tiros, estado.config.modo, mira.casas, mira.torpedo)
          : Regras.resolverTiro(meu.navios, meu.tiros, estado.config.modo, mira.l, mira.c);
        enviar('resultado', r);
      }
      // A partida acabou: mostro meu mar.
      if (estado.fase === 'fim' && !revelei) {
        revelei = true;
        enviar('revelar', { navios: estado.jogadores[eu].navios });
      }
    }

    // ---------- Recados vindos da sala ----------

    function receber(recado) {
      if (recado.partida !== partida) return;
      if (recado.tipo === 'revanche') {
        if (estado.fase !== 'fim') return;
        revanches[recado.jogador] = true;
        avisar({ tipo: 'revanche', recado: recado });
        if (revanches[0] && revanches[1]) {
          partida += 1;
          // Ao vivo, a pergunta antiga some. Na releitura, a da ficha fica: ela sabe de qual partida é (perguntaDestaVez).
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
      if (!r.ok) return;   // recado repetido ou fora de hora: ignorado
      estado = r.estado;
      // Cada "mirar" (tiro) ou "pedir_mover" (⚓) abre uma continha: conta como um turno novo.
      if (recado.tipo === 'mirar' || recado.tipo === 'pedir_mover') { turno += 1; ultimoMirarEm = recado.em; }
      if (recado.tipo === 'resultado' && recado.jogador === eu) respondiTiroDoTurno = turno;
      if (recado.tipo === 'revelar' && recado.jogador === eu) revelei = true;
      if (faseAntes === 'posicionamento' && estado.fase === 'batalha') inicioBatalha = recado.em;
      // Minha continha: sorteia quando meu "mirar" volta (durante a releitura, só no fim — ver marcarSincronizado).
      if ((recado.tipo === 'mirar' || recado.tipo === 'pedir_mover') && recado.jogador === eu && sincronizado) sortearPergunta();
      if (recado.tipo === 'responder' && recado.jogador === eu && perguntaDestaVez()) {
        pergunta = null;
        guardar();
      }
      avisar({ tipo: recado.tipo, recado: recado });
      cumprirObrigacoes();
    }

    // A pergunta guardada é a deste turno (desta partida)?
    function perguntaDestaVez() { return !!pergunta && pergunta.partida === partida && pergunta.turno === turno; }

    function sortearPergunta() {
      if (perguntaDestaVez()) return;   // a ficha já tem a pergunta deste turno
      pergunta = { partida: partida, turno: turno, idx: Perguntas.sortear(monte, aleatorio), fim: ultimoMirarEm + msConta };
      guardar();
    }

    // Chamado pela sala quando terminou de entregar os recados antigos.
    function marcarSincronizado() {
      sincronizado = true;
      if (estado.fase === 'batalha' && estado.vez === eu && estado.etapa === 'responder') sortearPergunta();
      if (estado.fase === 'batalha' && estado.vez === eu && estado.etapa === 'responder' && perguntaDestaVez()) {
        if (pergunta.respondida) {
          // Eu já tinha respondido, mas o recado se perdeu (a aba fechou antes de chegar): reenvia a mesma resposta.
          enviar('responder', { certa: pergunta.certa === true });
        } else if (conexao.horaServidor() >= pergunta.fim) {
          // Voltei no meio da minha continha e o tempo já passou: conta como tempo esgotado.
          responder(null);
        }
      }
      // Voltei com o resultado do meu tiro já na tela: passo a vez.
      if (estado.fase === 'batalha' && estado.vez === eu && estado.etapa === 'resultado') passarVez();
      cumprirObrigacoes();
      avisar({ tipo: 'sincronizado' });
    }

    function presenca(jogadores) {
      avisar({ tipo: 'presenca', jogadores: jogadores });
    }

    // ---------- Ações do meu jogador ----------

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

    // torpedo = true para disparar um torpedo (Turbo + Clássico, com saldo); vertical = true gira o tiro duplo.
    // poder = 'duplo' | 'cruz' | 'x' | 'torpedo' (ou true = torpedo) para usar um poder; vertical = true gira o duplo.
    function mirar(l, c, poder, vertical) {
      if (poder === true) poder = 'torpedo';
      if (estado.fase !== 'batalha' || estado.vez !== eu || estado.etapa !== 'escolher') return false;
      if (estado.jogadores[1 - eu].tiros[Regras.chave(l, c)]) return false;
      if (poder && !Regras.temPoder(estado.jogadores[eu], poder)) return false;
      const dados = { l: l, c: c };
      if (poder) dados.poder = poder;
      if (vertical && poder === 'duplo') dados.vertical = true;
      enviar('mirar', dados);
      return true;
    }

    // ---------- Arsenal do Turbo ----------

    // Troca a sequência por um poder ('duplo' | 'mover' com 5–9; 'cruz' | 'x' com 10 ou mais).
    function trocar(poder) {
      if (estado.fase !== 'batalha' || estado.vez !== eu || estado.etapa !== 'escolher') return false;
      if (Regras.trocasPossiveis(estado, eu).indexOf(poder) < 0) return false;
      enviar('trocar', { poder: poder });
      return true;
    }

    // Usa o ⚓: abre a continha; acertando, a etapa vira 'movendo'.
    function pedirMover() {
      if (estado.fase !== 'batalha' || estado.vez !== eu || estado.etapa !== 'escolher') return false;
      if (!Regras.temPoder(estado.jogadores[eu], 'mover')) return false;
      enviar('pedir_mover');
      return true;
    }

    // Move o navio no meu computador (as posições nunca vão para a sala) e guarda na ficha.
    function moverNavio(navio, l, c, orientacao) {
      return local({ acao: 'mover_navio', navio: navio, l: l, c: c, orientacao: orientacao });
    }

    // Encerra o movimento (moveu ou desistiu) e passa a vez.
    function concluirMover(desistiu) {
      if (estado.fase !== 'batalha' || estado.vez !== eu || estado.etapa !== 'movendo') return false;
      enviar('mover', { desistiu: desistiu === true, tempoEsgotado: tempoAcabou() });
      return true;
    }

    // texto = o que o aluno respondeu; null = tempo esgotado sem nada digitado. Devolve { certa } ou null.
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

    // ---------- Relógio da partida ----------

    function tempoRestanteMs() {
      if (!estado.config.tempoMin || inicioBatalha === null) return null;
      return Math.max(0, estado.config.tempoMin * 60000 - (conexao.horaServidor() - inicioBatalha));
    }

    // true quando a partida tem tempo e ele já acabou (a faixa "última rodada" e o passar_vez usam isto).
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
      get msConta() { return msConta; },   // até quando vai a continha do turno atual (hora do servidor)
      receber: receber,
      marcarSincronizado: marcarSincronizado,
      presenca: presenca,
      posicionar: function (navio, l, c, orientacao) { return local({ acao: 'posicionar', navio: navio, l: l, c: c, orientacao: orientacao }); },
      remover: function (navio) { return local({ acao: 'remover', navio: navio }); },
      aleatorio: function () { return local({ acao: 'aleatorio' }); },
      limpar: function () { return local({ acao: 'limpar' }); },
      pronto: pronto,
      mirar: mirar,
      trocar: trocar,
      pedirMover: pedirMover,
      moverNavio: moverNavio,
      concluirMover: concluirMover,
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

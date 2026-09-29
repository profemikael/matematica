// Regras: o "juiz" da partida. Guarda o estado e aplica as ações. Não sabe nada de tela nem de internet.
// Online: cada computador conhece só os PRÓPRIOS navios (jogador `eu`); o tiro tem duas etapas:
// o atirador manda "responder" e o computador do defensor manda o "resultado".
(function (raiz) {
  'use strict';

  const TAMANHO = 10;
  const FROTA = [
    { id: 'n4', tamanho: 4 },
    { id: 'n3a', tamanho: 3 },
    { id: 'n3b', tamanho: 3 },
    { id: 'n2', tamanho: 2 }
  ];
  const TOTAL_CASAS_FROTA = FROTA.reduce(function (s, n) { return s + n.tamanho; }, 0);
  const LETRAS = 'ABCDEFGHIJ';

  function chave(l, c) { return l + ',' + c; }
  function nomeCasa(l, c) { return LETRAS[c] + (l + 1); }
  function dentro(l, c) { return l >= 0 && l < TAMANHO && c >= 0 && c < TAMANHO; }
  function tamanhoDe(id) { return FROTA.find(function (n) { return n.id === id; }).tamanho; }

  // navio = { l, c, orientacao: 'h' | 'v', tamanho }
  function casasDoNavio(navio) {
    const casas = [];
    for (let i = 0; i < navio.tamanho; i++) {
      casas.push(navio.orientacao === 'h' ? { l: navio.l, c: navio.c + i } : { l: navio.l + i, c: navio.c });
    }
    return casas;
  }

  // Devolve null se pode, ou o motivo. `navios` = { id: navio } já posicionados; o próprio `id` é ignorado.
  function podePosicionar(navios, id, navio) {
    const novas = casasDoNavio(navio);
    if (!novas.every(function (k) { return dentro(k.l, k.c); })) return 'fora do tabuleiro';
    for (const outroId in navios) {
      if (outroId === id) continue;
      const outras = casasDoNavio(navios[outroId]);
      for (const a of novas) {
        for (const b of outras) {
          if (Math.abs(a.l - b.l) <= 1 && Math.abs(a.c - b.c) <= 1) return 'encosta em outro navio';
        }
      }
    }
    return null;
  }

  function gerarFrotaAleatoria(aleatorio) {
    for (;;) {
      const navios = {};
      let conseguiu = true;
      for (const n of FROTA) {
        let colocado = false;
        for (let t = 0; t < 200 && !colocado; t++) {
          const navio = {
            l: Math.floor(aleatorio() * TAMANHO),
            c: Math.floor(aleatorio() * TAMANHO),
            orientacao: aleatorio() < 0.5 ? 'h' : 'v',
            tamanho: n.tamanho
          };
          if (podePosicionar(navios, n.id, navio) === null) { navios[n.id] = navio; colocado = true; }
        }
        if (!colocado) { conseguiu = false; break; }
      }
      if (conseguiu) return navios;
    }
  }

  function navioNaCasa(navios, l, c) {
    for (const id in navios) {
      if (casasDoNavio(navios[id]).some(function (k) { return k.l === l && k.c === c; })) return id;
    }
    return null;
  }

  // O defensor calcula o resultado de um tiro com os próprios navios (não altera nada).
  // Devolve { efeito: 'agua'|'acerto'|'afundou', casas: [chave], tamanho?, casasNavio?: [chave] } — pronto para o recado "resultado".
  function resolverTiro(navios, tiros, modo, l, c) {
    const id = navioNaCasa(navios, l, c);
    if (id === null) return { efeito: 'agua', casas: [chave(l, c)] };
    const doNavio = casasDoNavio(navios[id]).map(function (k) { return chave(k.l, k.c); });
    const alvo = modo === 'rapido' ? doNavio : [chave(l, c)];
    const casas = alvo.filter(function (ch) { return tiros[ch] !== 'acerto'; });
    const afundou = doNavio.every(function (ch) { return tiros[ch] === 'acerto' || casas.indexOf(ch) >= 0; });
    if (afundou) return { efeito: 'afundou', casas: casas, tamanho: navios[id].tamanho, casasNavio: doNavio };
    return { efeito: 'acerto', casas: casas };
  }

  function novaPartida(config) {
    const nomes = (config.nomes || []).map(function (n, i) {
      const limpo = String(n || '').trim();
      return limpo === '' ? 'Jogador ' + (i + 1) : limpo;
    });
    while (nomes.length < 2) nomes.push('Jogador ' + (nomes.length + 1));
    function jogador() {
      return { navios: {}, pronto: false, tiros: {}, afundadas: [], contas: { certas: 0, total: 0 } };
    }
    return {
      config: { nomes: nomes, modo: config.modo === 'rapido' ? 'rapido' : 'classico', tempoMin: config.tempoMin || 0 },
      eu: config.eu === 1 ? 1 : 0,
      fase: 'posicionamento',
      jogadores: [jogador(), jogador()],
      vez: 0,
      etapa: 'escolher',       // escolher | responder | aguardando_resultado | resultado
      mira: null,              // { l, c } escolhida no turno atual
      ultimoTurno: null,       // { jogador, l, c, acertouConta, tiro }
      tempoEsgotado: false,
      vencedor: null,          // 0 | 1 | 'empate'
      motivoFim: null          // afundou | tempo_casas | tempo_contas | tempo_empate | encerrada
    };
  }

  // Casas de navio do jogador `alvo` que já foram atingidas.
  function casasAtingidas(estado, alvo) {
    const tiros = estado.jogadores[alvo].tiros;
    return Object.keys(tiros).filter(function (k) { return tiros[k] === 'acerto'; }).length;
  }

  // Chaves "l,c" das casas de navios afundados do jogador `alvo`.
  function casasAfundadas(estado, alvo) {
    return estado.jogadores[alvo].afundadas.slice();
  }

  function decidirPorPlacar(estado, motivoSeEmpateTotal) {
    estado.fase = 'fim';
    const casas = [casasAtingidas(estado, 1), casasAtingidas(estado, 0)]; // casas que cada jogador acertou
    const contas = [estado.jogadores[0].contas.certas, estado.jogadores[1].contas.certas];
    if (casas[0] !== casas[1]) {
      estado.vencedor = casas[0] > casas[1] ? 0 : 1;
      estado.motivoFim = motivoSeEmpateTotal || 'tempo_casas';
    } else if (contas[0] !== contas[1]) {
      estado.vencedor = contas[0] > contas[1] ? 0 : 1;
      estado.motivoFim = motivoSeEmpateTotal || 'tempo_contas';
    } else {
      estado.vencedor = 'empate';
      estado.motivoFim = motivoSeEmpateTotal || 'tempo_empate';
    }
  }

  function recusar(estado, motivo) { return { ok: false, motivo: motivo, estado: estado }; }

  // Aplica uma ação e devolve { ok, estado, motivo? }. Nunca altera o estado recebido.
  // Ações locais (só no meu computador): posicionar, remover, aleatorio, limpar.
  // Recados (chegam pela sala, iguais nos dois computadores): pronto, mirar, responder, resultado,
  // passar_vez (com tempoEsgotado), encerrar, revelar.
  function aplicar(estadoAntigo, acao, aleatorio) {
    aleatorio = aleatorio || Math.random;
    const estado = structuredClone(estadoAntigo);
    const a = acao.acao;
    const eu = estado.eu;

    if (['posicionar', 'remover', 'aleatorio', 'limpar'].includes(a)) {
      if (estado.fase !== 'posicionamento') return recusar(estadoAntigo, 'não é hora de posicionar');
      if (estado.jogadores[eu].pronto) return recusar(estadoAntigo, 'você já confirmou');
      const j = estado.jogadores[eu];
      if (a === 'posicionar') {
        if (!FROTA.some(function (n) { return n.id === acao.navio; })) return recusar(estadoAntigo, 'navio desconhecido');
        const navio = { l: acao.l, c: acao.c, orientacao: acao.orientacao === 'v' ? 'v' : 'h', tamanho: tamanhoDe(acao.navio) };
        const motivo = podePosicionar(j.navios, acao.navio, navio);
        if (motivo) return recusar(estadoAntigo, motivo);
        j.navios[acao.navio] = navio;
      } else if (a === 'remover') {
        delete j.navios[acao.navio];
      } else if (a === 'aleatorio') {
        j.navios = gerarFrotaAleatoria(aleatorio);
      } else {
        j.navios = {};
      }
      return { ok: true, estado: estado };
    }

    if (a === 'pronto') {
      if (estado.fase !== 'posicionamento') return recusar(estadoAntigo, 'não é hora de posicionar');
      const j = estado.jogadores[acao.jogador];
      if (!j || j.pronto) return recusar(estadoAntigo, 'já estava pronto');
      if (acao.jogador === eu && Object.keys(j.navios).length !== FROTA.length) return recusar(estadoAntigo, 'posicione todos os navios');
      j.pronto = true;
      if (estado.jogadores[0].pronto && estado.jogadores[1].pronto) {
        estado.fase = 'batalha';
        estado.vez = 0;
        estado.etapa = 'escolher';
      }
      return { ok: true, estado: estado };
    }

    if (a === 'revelar') {
      if (estado.fase !== 'fim') return recusar(estadoAntigo, 'a partida não terminou');
      if (acao.jogador !== eu) estado.jogadores[acao.jogador].navios = acao.navios || {};
      return { ok: true, estado: estado };
    }

    if (a === 'encerrar') {
      if (estado.fase === 'fim') return recusar(estadoAntigo, 'a partida já terminou');
      decidirPorPlacar(estado, 'encerrada');
      return { ok: true, estado: estado };
    }

    if (estado.fase !== 'batalha') return recusar(estadoAntigo, 'a partida não está em andamento');

    if (a === 'resultado') {
      if (estado.etapa !== 'aguardando_resultado') return recusar(estadoAntigo, 'não há tiro esperando resultado');
      const defensor = 1 - estado.vez;
      if (acao.jogador !== defensor) return recusar(estadoAntigo, 'só o defensor responde o tiro');
      const d = estado.jogadores[defensor];
      const tiro = { tipo: acao.efeito, casas: acao.casas || [] };
      if (acao.efeito === 'agua') {
        d.tiros[chave(estado.mira.l, estado.mira.c)] = 'agua';
        tiro.casas = [chave(estado.mira.l, estado.mira.c)];
      } else {
        tiro.casas.forEach(function (ch) { d.tiros[ch] = 'acerto'; });
        if (acao.efeito === 'afundou') {
          tiro.tamanho = acao.tamanho;
          tiro.casasNavio = acao.casasNavio || [];
          tiro.casasNavio.forEach(function (ch) { if (d.afundadas.indexOf(ch) < 0) d.afundadas.push(ch); });
        }
      }
      estado.ultimoTurno.tiro = tiro;
      estado.etapa = 'resultado';
      if (casasAtingidas(estado, defensor) === TOTAL_CASAS_FROTA) {
        estado.fase = 'fim';
        estado.vencedor = estado.vez;
        estado.motivoFim = 'afundou';
      }
      return { ok: true, estado: estado };
    }

    if (a === 'passar_vez') {
      if (estado.etapa !== 'resultado') return recusar(estadoAntigo, 'o turno ainda não terminou');
      if (acao.jogador !== estado.vez) return recusar(estadoAntigo, 'só quem atirou passa a vez');
      // Quem passa a vez diz se o tempo da partida já tinha acabado (uma pessoa só decide: os dois computadores concordam).
      if (acao.tempoEsgotado === true) estado.tempoEsgotado = true;
      if (estado.tempoEsgotado && estado.vez === 1) {
        decidirPorPlacar(estado);
        return { ok: true, estado: estado };
      }
      estado.vez = 1 - estado.vez;
      estado.etapa = 'escolher';
      estado.mira = null;
      return { ok: true, estado: estado };
    }

    if (acao.jogador !== estado.vez) return recusar(estadoAntigo, 'não é a vez deste jogador');
    const alvo = 1 - estado.vez;

    if (a === 'mirar') {
      if (estado.etapa !== 'escolher') return recusar(estadoAntigo, 'já escolheu a casa neste turno');
      if (!dentro(acao.l, acao.c)) return recusar(estadoAntigo, 'fora do tabuleiro');
      if (estado.jogadores[alvo].tiros[chave(acao.l, acao.c)]) return recusar(estadoAntigo, 'casa já atingida');
      estado.mira = { l: acao.l, c: acao.c };
      estado.etapa = 'responder';
      return { ok: true, estado: estado };
    }

    if (a === 'responder') {
      if (estado.etapa !== 'responder') return recusar(estadoAntigo, 'não há conta para responder');
      const certa = acao.certa === true;
      const atirador = estado.jogadores[estado.vez];
      atirador.contas.total += 1;
      if (certa) atirador.contas.certas += 1;
      estado.ultimoTurno = { jogador: estado.vez, l: estado.mira.l, c: estado.mira.c, acertouConta: certa, tiro: null };
      estado.etapa = certa ? 'aguardando_resultado' : 'resultado';
      return { ok: true, estado: estado };
    }

    return recusar(estadoAntigo, 'ação desconhecida');
  }

  const Regras = {
    TAMANHO, FROTA, TOTAL_CASAS_FROTA, chave, nomeCasa, casasDoNavio, podePosicionar, gerarFrotaAleatoria,
    navioNaCasa, resolverTiro, novaPartida, casasAtingidas, casasAfundadas, aplicar
  };
  raiz.Regras = Regras;
  if (typeof module !== 'undefined' && module.exports) module.exports = Regras;
})(typeof window !== 'undefined' ? window : globalThis);

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

  // Meus navios que ainda podem mover (nenhuma casa atingida). Só para a minha tela: o colega não sabe disso.
  function naviosQuePodemMover(jogador) {
    return Object.keys(jogador.navios).filter(function (id) {
      return casasDoNavio(jogador.navios[id]).every(function (k) { return jogador.tiros[chave(k.l, k.c)] !== 'acerto'; });
    });
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

  // ---------- Modo Turbo: tiros especiais e torpedo ----------

  // O defensor calcula o resultado de um tiro de várias casas (duplo, cruz) ou de torpedo, com os próprios navios.
  // Devolve { efeito: 'multiplo', agua: [chave], acertos: [chave], afundados: [{ tamanho, casasNavio }] }.
  function resolverTiroMultiplo(navios, tiros, modo, casas, torpedo) {
    const sim = Object.assign({}, tiros);
    const r = { efeito: 'multiplo', agua: [], acertos: [], afundados: [] };
    casas.forEach(function (ch) {
      const p = ch.split(',').map(Number);
      const id = navioNaCasa(navios, p[0], p[1]);
      if (id === null) { if (!sim[ch]) { sim[ch] = 'agua'; r.agua.push(ch); } return; }
      const doNavio = casasDoNavio(navios[id]).map(function (k) { return chave(k.l, k.c); });
      const jaAfundado = doNavio.every(function (x) { return sim[x] === 'acerto'; });
      (modo === 'rapido' || torpedo ? doNavio : [ch]).forEach(function (x) {
        if (sim[x] !== 'acerto') { sim[x] = 'acerto'; r.acertos.push(x); }
      });
      if (!jaAfundado && doNavio.every(function (x) { return sim[x] === 'acerto'; })) {
        r.afundados.push({ tamanho: navios[id].tamanho, casasNavio: doNavio });
      }
    });
    return r;
  }

  const DESLOCAMENTOS = {
    normal: [[0, 0]],
    torpedo: [[0, 0]],
    duplo: [[0, 0], [0, 1]],
    duploEmPe: [[0, 0], [1, 0]],   // tiro duplo girado: a casa escolhida e a de baixo
    cruz: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
    x: [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]   // tiro em X: a casa e as 4 diagonais
  };

  // Arsenal do Turbo: a sequência de acertos é trocada por poderes, guardados para usar quando quiser.
  const PODERES_DE_TIRO = ['duplo', 'cruz', 'x'];
  const TROCAS_5 = ['duplo', 'mover'];
  const TROCAS_10 = ['cruz', 'x'];

  // Trocas que `jogador` pode fazer agora: sequência 5–9 → duplo ou mover; 10 ou mais → cruz ou x.
  function trocasPossiveis(estado, jogador) {
    if (estado.config.tiro !== 'turbo') return [];
    const seq = estado.jogadores[jogador].sequencia;
    return seq >= 10 ? TROCAS_10.slice() : seq >= 5 ? TROCAS_5.slice() : [];
  }

  // O poder pode ser usado? (torpedo: saldo da sala; os outros: arsenal)
  function temPoder(jogadorEstado, poder) {
    if (poder === 'torpedo') return jogadorEstado.torpedos > 0;
    return !!jogadorEstado.arsenal && jogadorEstado.arsenal[poder] > 0;
  }

  // Formato do tiro: o poder armado ('duplo' | 'cruz' | 'x' | 'torpedo'), ou 'normal' sem poder.
  // Não há mais tiro especial automático: os poderes vêm das trocas do arsenal. (poder = true vale 'torpedo'.)
  function formatoDoTiro(estado, jogador, poder) {
    if (poder === true) return 'torpedo';
    return poder && DESLOCAMENTOS[poder] && poder !== 'duploEmPe' ? poder : 'normal';
  }

  // Casas que o tiro vai atingir (chaves), sem as que caem fora do mar ou já foram atingidas.
  // A casa escolhida vem primeiro. vertical = true gira o tiro duplo (casa + a de baixo). Devolve { formato, casas }.
  function casasDoTiro(estado, jogador, l, c, poder, vertical) {
    const formato = formatoDoTiro(estado, jogador, poder);
    const tirosAlvo = estado.jogadores[1 - jogador].tiros;
    const casas = DESLOCAMENTOS[formato === 'duplo' && vertical ? 'duploEmPe' : formato]
      .map(function (d) { return [l + d[0], c + d[1]]; })
      .filter(function (p, i) { return dentro(p[0], p[1]) && (i === 0 || !tirosAlvo[chave(p[0], p[1])]); })
      .map(function (p) { return chave(p[0], p[1]); });
    return { formato: formato, casas: casas };
  }

  // Torpedos por aluno: só no Turbo com afundar Clássico (0 a 3); em qualquer outro caso, 0.
  function torpedosDaSala(config) {
    if (config.tiro !== 'turbo' || config.modo === 'rapido') return 0;
    return Math.min(3, Math.max(0, Math.round(Number(config.torpedos) || 0)));
  }

  function novaPartida(config) {
    const nomes = (config.nomes || []).map(function (n, i) {
      const limpo = String(n || '').trim();
      return limpo === '' ? 'Jogador ' + (i + 1) : limpo;
    });
    while (nomes.length < 2) nomes.push('Jogador ' + (nomes.length + 1));
    const torpedos = torpedosDaSala(config);
    function jogador() {
      return { navios: {}, pronto: false, tiros: {}, afundadas: [], contas: { certas: 0, total: 0 },
               sequencia: 0, maiorSequencia: 0, torpedos: torpedos, arsenal: { duplo: 0, mover: 0, cruz: 0, x: 0 } };
    }
    const cfg = { nomes: nomes, modo: config.modo === 'rapido' ? 'rapido' : 'classico', tempoMin: config.tempoMin || 0 };
    if (config.tiro === 'turbo') { cfg.tiro = 'turbo'; cfg.torpedos = torpedos; }   // sala Normal: igual a antes
    return {
      config: cfg,
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

    // Mover navio (Turbo): só na minha vez, depois de acertar a conta (etapa 'movendo'); navio intacto;
    // nova posição válida e sem nenhuma casa onde o colega já atirou. Ação local (as posições não saem do computador).
    if (a === 'mover_navio') {
      if (estado.fase !== 'batalha' || estado.vez !== eu || estado.etapa !== 'movendo') return recusar(estadoAntigo, 'não é hora de mover');
      const j = estado.jogadores[eu];
      const atual = j.navios[acao.navio];
      if (!atual) return recusar(estadoAntigo, 'navio desconhecido');
      if (casasDoNavio(atual).some(function (k) { return j.tiros[chave(k.l, k.c)] === 'acerto'; })) return recusar(estadoAntigo, 'só navio intacto pode mover');
      const novo = { l: acao.l, c: acao.c, orientacao: acao.orientacao === 'v' ? 'v' : 'h', tamanho: atual.tamanho };
      const motivo = podePosicionar(j.navios, acao.navio, novo);
      if (motivo) return recusar(estadoAntigo, motivo);
      if (casasDoNavio(novo).some(function (k) { return j.tiros[chave(k.l, k.c)]; })) return recusar(estadoAntigo, 'casa onde o colega já atirou');
      j.navios[acao.navio] = novo;
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
      if (acao.efeito === 'multiplo') {   // Turbo: tiro duplo, cruz ou torpedo
        const agua = acao.agua || [], acertos = acao.acertos || [], afundados = acao.afundados || [];
        agua.forEach(function (ch) { if (!d.tiros[ch]) d.tiros[ch] = 'agua'; });
        acertos.forEach(function (ch) { d.tiros[ch] = 'acerto'; });
        afundados.forEach(function (n) {
          (n.casasNavio || []).forEach(function (ch) { d.tiros[ch] = 'acerto'; if (d.afundadas.indexOf(ch) < 0) d.afundadas.push(ch); });
        });
        tiro.casas = agua.concat(acertos);
        tiro.agua = agua;
        tiro.acertos = acertos;
        tiro.afundados = afundados;
      } else if (acao.efeito === 'agua') {
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

    // Fim do movimento (Turbo): encerra a vez de quem moveu (ou desistiu), com a mesma regra de tempo do passar_vez.
    if (a === 'mover') {
      if (estado.etapa !== 'movendo') return recusar(estadoAntigo, 'não está movendo');
      if (acao.jogador !== estado.vez) return recusar(estadoAntigo, 'só quem está movendo encerra');
      estado.ultimoTurno.moveu = acao.desistiu !== true;
      estado.etapa = 'resultado';
      return aplicar(estado, { acao: 'passar_vez', jogador: acao.jogador, tempoEsgotado: acao.tempoEsgotado }, aleatorio);
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

    // Trocar a sequência por um poder do arsenal (só na minha vez, antes de escolher o alvo).
    if (a === 'trocar') {
      if (estado.etapa !== 'escolher') return recusar(estadoAntigo, 'só antes de escolher o alvo');
      if (trocasPossiveis(estado, estado.vez).indexOf(acao.poder) < 0) return recusar(estadoAntigo, 'troca não disponível');
      const j = estado.jogadores[estado.vez];
      j.sequencia = 0;
      j.arsenal[acao.poder] += 1;
      return { ok: true, estado: estado };
    }

    // Usar o ⚓: abre a continha (como um "mirar" sem casa); acertando, a etapa vira 'movendo'.
    if (a === 'pedir_mover') {
      if (estado.etapa !== 'escolher') return recusar(estadoAntigo, 'só antes de escolher o alvo');
      if (!temPoder(estado.jogadores[estado.vez], 'mover')) return recusar(estadoAntigo, 'sem movimento no arsenal');
      estado.mira = { l: null, c: null, formato: 'mover', casas: [], poder: 'mover', mover: true, torpedo: false, vertical: false };
      estado.etapa = 'responder';
      return { ok: true, estado: estado };
    }

    if (a === 'mirar') {
      if (estado.etapa !== 'escolher') return recusar(estadoAntigo, 'já escolheu a casa neste turno');
      if (!dentro(acao.l, acao.c)) return recusar(estadoAntigo, 'fora do tabuleiro');
      if (estado.jogadores[alvo].tiros[chave(acao.l, acao.c)]) return recusar(estadoAntigo, 'casa já atingida');
      const poder = acao.torpedo === true ? 'torpedo' : (acao.poder || null);
      if (poder !== null && ['torpedo'].concat(PODERES_DE_TIRO).indexOf(poder) < 0) return recusar(estadoAntigo, 'poder desconhecido');
      if (poder === 'torpedo' && estado.jogadores[estado.vez].torpedos <= 0) return recusar(estadoAntigo, 'sem torpedos');
      if (poder && poder !== 'torpedo' && !temPoder(estado.jogadores[estado.vez], poder)) return recusar(estadoAntigo, 'poder não está no arsenal');
      const vertical = acao.vertical === true;
      const tiro = casasDoTiro(estado, estado.vez, acao.l, acao.c, poder, vertical);
      estado.mira = { l: acao.l, c: acao.c, formato: tiro.formato, casas: tiro.casas, poder: poder, torpedo: poder === 'torpedo', vertical: vertical };
      estado.etapa = 'responder';
      return { ok: true, estado: estado };
    }

    if (a === 'responder') {
      if (estado.etapa !== 'responder') return recusar(estadoAntigo, 'não há conta para responder');
      const certa = acao.certa === true;
      const atirador = estado.jogadores[estado.vez];
      atirador.contas.total += 1;
      if (certa) atirador.contas.certas += 1;
      atirador.sequencia = certa ? atirador.sequencia + 1 : 0;
      if (atirador.sequencia > atirador.maiorSequencia) atirador.maiorSequencia = atirador.sequencia;
      // O poder armado (torpedo, duplo, cruz, x, mover) é gasto mesmo errando a conta.
      if (estado.mira.poder === 'torpedo') atirador.torpedos -= 1;
      else if (estado.mira.poder) atirador.arsenal[estado.mira.poder] -= 1;
      estado.ultimoTurno = { jogador: estado.vez, l: estado.mira.l, c: estado.mira.c, acertouConta: certa, tiro: null };
      if (estado.mira.formato !== 'normal') {   // só em tiros especiais e no mover (a sala Normal fica igual a antes)
        estado.ultimoTurno.formato = estado.mira.formato;
        estado.ultimoTurno.casas = estado.mira.casas;
      }
      if (estado.mira.mover) {
        estado.ultimoTurno.mover = true;
        estado.etapa = certa ? 'movendo' : 'resultado';
        return { ok: true, estado: estado };
      }
      estado.etapa = certa ? 'aguardando_resultado' : 'resultado';
      return { ok: true, estado: estado };
    }

    return recusar(estadoAntigo, 'ação desconhecida');
  }

  const Regras = {
    TAMANHO, FROTA, TOTAL_CASAS_FROTA, chave, nomeCasa, casasDoNavio, podePosicionar, gerarFrotaAleatoria,
    navioNaCasa, resolverTiro, resolverTiroMultiplo, formatoDoTiro, casasDoTiro, torpedosDaSala, trocasPossiveis, temPoder,
    naviosQuePodemMover,
    novaPartida, casasAtingidas, casasAfundadas, aplicar
  };
  raiz.Regras = Regras;
  if (typeof module !== 'undefined' && module.exports) module.exports = Regras;
})(typeof window !== 'undefined' ? window : globalThis);

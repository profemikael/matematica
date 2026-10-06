// Painel do professor — o "cérebro" de assistir uma sala. Sem DOM e sem Firebase.
// Recebe os dados crus de uma sala (config, jogadores, recados) e refaz a partida com as mesmas regras
// do jogo, como um espectador que não conhece navio de ninguém. Devolve um resumo para os cartões e a torcida.
(function (raiz) {
  'use strict';

  const Regras = raiz.Regras || (typeof require !== 'undefined' ? require('./regras.js') : null);

  const MS_FORA = 2 * 60000;          // os dois fora do jogo há mais disso → parada
  const MS_SEM_JOGADA = 15 * 60000;   // nenhuma jogada há mais disso → parada

  const NOME_FORMATO = { duplo: '⚡ tiro duplo', cruz: '✚ tiro em cruz', x: '✖ tiro em X', torpedo: '🚀 torpedo',
                         radar3: '📡 radar 3×3', radar4: '📡 radar 4×4' };
  const NOME_PODER = { duplo: '⚡ tiro duplo', mover: '⚓ mover navio', cruz: '✚ tiro em cruz', x: '✖ tiro em X',
                       radar3: '📡 radar 3×3', radar4: '📡 radar 4×4' };

  // Recados em ordem de índice (a sala guarda { "0": {...}, "1": {...} }; aceita também uma lista).
  function emOrdem(recados) {
    if (!recados) return [];
    if (Array.isArray(recados)) return recados.filter(Boolean);
    return Object.keys(recados).map(Number).filter(Number.isInteger).sort(function (a, b) { return a - b; })
      .map(function (k) { return recados[k]; }).filter(Boolean);
  }

  function nomeDe(sala, j) {
    const p = sala.jogadores && sala.jogadores[j];
    const n = p && String(p.nome || '').trim();
    return n || 'Jogador ' + (j + 1);
  }

  // A conta que o aluno respondeu, para a linha do tempo e a torcida (sem nunca ter a resposta certa).
  // resposta: texto digitado/escolhido; tempo: true quando o tempo acabou sem resposta. Salas antigas: sem pergunta.
  function contaDoRecado(r) {
    return { pergunta: r.pergunta || null, resposta: r.resposta === undefined ? undefined : r.resposta, certa: r.certa === true,
             tempo: Object.prototype.hasOwnProperty.call(r, 'resposta') && r.resposta === null };
  }

  function textoTiro(quem, u) {
    const t = u.tiro;
    const onde = Regras.nomeCasa(u.l, u.c);
    if (t.tipo === 'multiplo') {
      const partes = [];
      if (t.acertos.length) partes.push(t.acertos.length + ' 💥');
      if (t.agua.length) partes.push(t.agua.length + ' 🌊');
      t.afundados.forEach(function (n) { partes.push('☠️ afundou o navio de ' + n.tamanho); });
      return quem + ' usou ' + (NOME_FORMATO[u.formato] || 'tiro') + ' em ' + onde + ' → ' + (partes.join(' · ') || 'nada');
    }
    if (t.tipo === 'agua') return quem + ' atirou em ' + onde + ' → 🌊 água';
    if (t.tipo === 'acerto') return quem + ' atirou em ' + onde + ' → 💥 acertou';
    return quem + ' atirou em ' + onde + ' → ☠️ afundou o navio de ' + t.tamanho;
  }

  function navioAfundadosNoTiro(t) {
    if (!t) return 0;
    if (t.tipo === 'multiplo') return t.afundados.length;
    return t.tipo === 'afundou' ? 1 : 0;
  }

  // sala = { config, jogadores, recados, criadaEm }; opcoes = { agora } (hora do servidor, para "sem internet há N min").
  function resumir(sala, opcoes) {
    PainelModelo.chamadas += 1;
    sala = sala || {};
    opcoes = opcoes || {};
    const config = sala.config || {};
    const nomes = [nomeDe(sala, 0), nomeDe(sala, 1)];
    const msConta = Math.min(15, Math.max(1, Math.round(Number(config.segundos) || 10))) * 1000;

    let partida = 1;
    let estado, turno, mirarEm, inicioBatalha, fimEm, linha, afundados, revanches, resposta, contaPendente;
    function novaPartida() {
      estado = Regras.novaPartida({ nomes: nomes, modo: config.modo, tempoMin: config.tempoMin, eu: -1,
                                    tiro: config.tiro, torpedos: config.torpedos });
      turno = 0; mirarEm = null; inicioBatalha = null; fimEm = null; linha = []; afundados = [0, 0]; revanches = {};
      resposta = null; contaPendente = null;
    }
    novaPartida();
    function anotar(r, texto, conta) { linha.push({ texto: texto, em: r.em || null, conta: conta || null }); }

    const recados = emOrdem(sala.recados);
    recados.forEach(function (r) {
      if (r.partida !== partida) return;
      if (r.tipo === 'revanche') {
        if (estado.fase !== 'fim') return;
        revanches[r.jogador] = true;
        if (revanches[0] && revanches[1]) { partida += 1; novaPartida(); }
        return;
      }
      const res = Regras.aplicar(estado, Object.assign({}, r, { acao: r.tipo }));
      if (!res.ok) return;   // repetido ou fora de hora: ignorado, como no jogo
      const faseAntes = estado.fase;
      estado = res.estado;
      const quem = typeof r.jogador === 'number' ? nomes[r.jogador] : '';
      const u = estado.ultimoTurno;
      switch (r.tipo) {
        case 'mirar':
        case 'pedir_mover':
          turno += 1; mirarEm = r.em || null; resposta = null; contaPendente = null;
          break;
        case 'responder':
          resposta = Object.assign({ jogador: r.jogador }, contaDoRecado(r));
          if (r.certa === true) { contaPendente = contaDoRecado(r); break; }
          contaPendente = null;
          if (u && u.mover) anotar(r, '✗ ' + quem + ' errou a conta — perdeu o ⚓', contaDoRecado(r));
          else if (u && u.radar) anotar(r, '✗ ' + quem + ' errou a conta — perdeu o radar', contaDoRecado(r));
          else anotar(r, '✗ ' + quem + ' errou a conta — nenhum tiro', contaDoRecado(r));
          break;
        case 'resultado':
          afundados[u.jogador] += navioAfundadosNoTiro(u.tiro);
          anotar(r, textoTiro(nomes[u.jogador], u), contaPendente);
          contaPendente = null;
          break;
        case 'radar':
          anotar(r, '📡 ' + nomes[u.jogador] + ' usou o ' + NOME_FORMATO[u.formato].replace('📡 ', '') + ' → ' + (u.tem ? 'tem navio' : 'nada'), contaPendente);
          contaPendente = null;
          break;
        case 'mover':
          anotar(r, r.desistiu ? quem + ' desistiu de mover o navio' : '⚓ ' + quem + ' moveu um navio', contaPendente);
          contaPendente = null;
          break;
        case 'trocar':
          anotar(r, '🔄 ' + quem + ' trocou a sequência por ' + (NOME_PODER[r.poder] || r.poder));
          break;
        case 'encerrar':
          anotar(r, '⏹ Partida encerrada');
          break;
      }
      if (faseAntes === 'posicionamento' && estado.fase === 'batalha') { inicioBatalha = r.em || null; anotar(r, '⚔ A batalha começou!'); }
      if (faseAntes !== 'fim' && estado.fase === 'fim') {
        fimEm = r.em || null;
        anotar(r, estado.vencedor === 'empate' ? '🤝 Empate!' : '🏆 ' + nomes[estado.vencedor] + ' venceu!');
      }
    });

    // Conta em andamento: a cadeira de quem responde diz qual é (só se for deste turno desta partida).
    let conta = null;
    if (estado.fase === 'batalha' && estado.etapa === 'responder') {
      const cadeira = sala.jogadores && sala.jogadores[estado.vez];
      const c = cadeira && cadeira.conta;
      conta = { jogador: estado.vez, pergunta: null, opcoes: null, fim: mirarEm === null ? null : mirarEm + msConta };
      if (c && c.partida === partida && c.turno === turno) { conta.pergunta = c.pergunta || null; conta.opcoes = c.opcoes || null; }
    }

    const temSegundo = !!(sala.jogadores && sala.jogadores[1]);
    // Hora da última jogada (último recado de qualquer partida da sala; sem recados, a criação da sala).
    let ultimaJogadaEm = sala.criadaEm || null;
    recados.forEach(function (r) { if (r.em && (ultimaJogadaEm === null || r.em > ultimaJogadaEm)) ultimaJogadaEm = r.em; });
    const jogadores = [0, 1].map(function (j) {
      const p = (sala.jogadores && sala.jogadores[j]) || null;
      const e = estado.jogadores[j];
      const total = e.contas.total, certas = e.contas.certas;
      const offline = !!p && p.conectado === false;
      return {
        nome: nomes[j], presente: !!p, conectado: !!p && p.conectado !== false,
        offlineMs: offline && opcoes.agora && p.vistoEm ? Math.max(0, opcoes.agora - p.vistoEm) : null,
        certas: certas, erradas: total - certas, total: total, pct: total ? Math.round(100 * certas / total) : null,
        sequencia: e.sequencia, maiorSequencia: e.maiorSequencia, arsenal: Object.assign({}, e.arsenal), torpedos: e.torpedos
      };
    });

    // Parada (o painel esconde): não terminou e os alunos saíram há mais de 2 min, ou ninguém joga há 15 min.
    const presentes = jogadores.filter(function (p) { return p.presente; });
    const todosForaHa2min = presentes.length > 0 && presentes.every(function (p) { return !p.conectado && p.offlineMs !== null && p.offlineMs > MS_FORA; });
    const semJogadaHa15min = !!opcoes.agora && ultimaJogadaEm !== null && opcoes.agora - ultimaJogadaEm > MS_SEM_JOGADA;
    const parada = estado.fase !== 'fim' && (todosForaHa2min || semJogadaHa15min);

    return {
      nomes: nomes,
      ultimaJogadaEm: ultimaJogadaEm,
      parada: parada,
      config: { modo: estado.config.modo, turbo: config.tiro === 'turbo', tempoMin: config.tempoMin || 0, segundos: msConta / 1000,
                torpedos: estado.config.torpedos || 0 },
      criadaEm: sala.criadaEm || null,
      partida: partida,
      turno: turno,            // quantas contas (mirar/pedir_mover) já houve nesta partida
      fase: !temSegundo ? 'aguardando' : estado.fase,
      estado: estado,
      vez: estado.vez,
      etapa: estado.etapa,
      mira: estado.mira,
      ultimoTurno: estado.ultimoTurno,
      // placar[j] = casas de navio que o jogador j acertou no mar do colega
      placar: [Regras.casasAtingidas(estado, 1), Regras.casasAtingidas(estado, 0)],
      afundados: afundados,
      jogadores: jogadores,
      conta: conta,
      resposta: resposta,
      inicioBatalha: inicioBatalha,
      fimEm: fimEm,             // hora em que a partida terminou (o relógio para aqui)
      vencedor: estado.vencedor,
      motivoFim: estado.motivoFim,
      linha: linha.slice().reverse(),
      totalRecados: recados.length
    };
  }

  // Revelação da torcida no 0 da contagem: { texto, som } | { radar, texto, som, casas, defensor } |
  // { esperando } (o computador do defensor ainda não respondeu) | { cancelar } (a partida acabou ou a vez passou
  // sem o resultado — a tela escura não pode ficar presa no projetor).
  function revelacao(r) {
    const u = r && r.ultimoTurno;
    if (!u) return { cancelar: true };
    const quem = r.nomes[u.jogador];
    if (!u.acertouConta) {
      return { texto: (r.resposta && r.resposta.tempo ? '⏰ ' + quem + ': tempo esgotado!' : '✗ ' + quem + ' errou a conta!') +
        (u.mover ? ' Não vai mover.' : u.radar ? ' Perdeu o radar.' : ''), som: 'errado' };
    }
    if (u.mover) return { texto: '⚓ ' + quem + ' acertou e vai mover um navio!' };
    const pendente = u.radar ? u.tem === undefined : !u.tiro;
    if (pendente) return r.fase === 'batalha' && r.etapa === 'aguardando_resultado' ? { esperando: true } : { cancelar: true };
    if (u.radar) {
      return { radar: true, texto: '📡 ' + quem + ' usou o radar: ' + (u.tem ? 'tem navio!' : 'nada.'), som: u.tem ? 'radarTem' : 'radarNada',
               casas: u.casas, defensor: 1 - u.jogador };
    }
    const t = u.tiro;
    const afundou = t.tipo === 'afundou' || (t.tipo === 'multiplo' && t.afundados.length > 0);
    const acertou = t.tipo === 'acerto' || (t.tipo === 'multiplo' && t.acertos.length > 0);
    if (afundou) return { texto: '☠️ ' + quem + ' afundou um navio!', som: 'afundou' };
    if (acertou) return { texto: '💥 ' + quem + ' acertou!', som: 'explosao' };
    return { texto: '🌊 Água!', som: 'agua' };
  }

  const PainelModelo = { resumir: resumir, revelacao: revelacao, NOME_FORMATO: NOME_FORMATO,
                         chamadas: 0 };   // quantas vezes resumir rodou (o teste de fumaça confere que o painel não recalcula à toa)
  raiz.PainelModelo = PainelModelo;
  if (typeof module !== 'undefined' && module.exports) module.exports = PainelModelo;
})(typeof window !== 'undefined' ? window : globalThis);

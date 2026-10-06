// Regras do Jogo da Memória: motor puro (sem tela e sem internet).
// Todos os computadores aplicam a MESMA lista de recados, na mesma ordem, e chegam ao mesmo estado.
// Recado = { partida, vez, tipo: 'comecar' | 'virar' | 'tempo' | 'pular', jogador, em (hora do servidor), ... }
(function (raiz) {
  'use strict';

  const MAX_JOGADORES = 8;
  const TEMPOS = [10, 15, 20, 25, 30, 0];          // 0 = sem limite
  const TEMPO_PADRAO = 30;
  const TAMANHOS = [10, 20, 30, 40];
  const GRADES = { 10: [5, 4], 20: [8, 5], 30: [10, 6], 40: [10, 8] };   // pares → [colunas, linhas]
  const PAUSA_MS = 2000;      // depois de um par, erro ou tempo esgotado: as cartas ficam à mostra e o relógio espera
  const FOLGA_QUEDA_MS = 2000;   // quem estava na vez caiu: espera isto antes de pular (um F5 rápido não perde a vez)
  const FOLGA_TEMPO_MS = 3000;   // tempo esgotado e o computador da vez não avisou: outro avisa depois disto
  const CORES = [
    { nome: 'Vermelho', emoji: '🔴', cor: '#e04848' },
    { nome: 'Azul', emoji: '🔵', cor: '#3b7be0' },
    { nome: 'Verde', emoji: '🟢', cor: '#2fa65a' },
    { nome: 'Amarelo', emoji: '🟡', cor: '#e8b20c' },
    { nome: 'Roxo', emoji: '🟣', cor: '#8a4fd0' },
    { nome: 'Laranja', emoji: '🟠', cor: '#ef7d1a' },
    { nome: 'Marrom', emoji: '🟤', cor: '#8b5a3c' },
    { nome: 'Preto', emoji: '⚫', cor: '#3a3a3a' }
  ];

  function embaralhar(lista, aleatorio) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Jogadores conectados, em ordem de lugar (0..7). jogadores = { lugar: { nome, id, time, conectado } }
  function lugaresConectados(jogadores) {
    return Object.keys(jogadores || {}).map(Number).filter(function (l) {
      return jogadores[l] && jogadores[l].conectado;
    }).sort(function (a, b) { return a - b; });
  }

  // Anfitrião = o conectado de menor lugar (quem criou a sala; se ele sair, o próximo assume). Ninguém → undefined.
  function anfitriao(jogadores) { return lugaresConectados(jogadores)[0]; }

  // Pode começar? → { ok, motivo }
  function podeComecar(config, jogadores) {
    const lugares = lugaresConectados(jogadores);
    if (config.modo === 'solo') {
      return lugares.length >= 2 ? { ok: true } : { ok: false, motivo: 'Esperando pelo menos 2 jogadores.' };
    }
    const semTime = lugares.filter(function (l) {
      const t = jogadores[l].time;
      return !(Number.isInteger(t) && t >= 0 && t < config.times);
    });
    if (semTime.length) return { ok: false, motivo: 'Todos precisam escolher um time.' };
    const comGente = new Set(lugares.map(function (l) { return jogadores[l].time; }));
    if (comGente.size < 2) return { ok: false, motivo: 'Pelo menos 2 times precisam ter jogadores.' };
    return { ok: true };
  }

  // O anfitrião prepara a partida (vai no recado 'comecar'): sorteia quais pares do banco entram,
  // embaralha as cartas e a ordem dos times, e congela quem está em cada time.
  // Carta = parDoBanco * 2 + lado (0 = lado a, 1 = lado b).
  function prepararPartida(config, jogadores, totalParesBanco, aleatorio) {
    aleatorio = aleatorio || Math.random;
    const escolhidos = embaralhar(Array.from({ length: totalParesBanco }, function (_, i) { return i; }), aleatorio)
      .slice(0, config.pares);
    const cartas = [];
    escolhidos.forEach(function (p) { cartas.push(p * 2, p * 2 + 1); });
    const lugares = lugaresConectados(jogadores);
    let times;
    if (config.modo === 'solo') {
      times = lugares.map(function (l) { return { id: l, membros: [l] }; });
    } else {
      times = [];
      for (let t = 0; t < config.times; t++) {
        const membros = lugares.filter(function (l) { return jogadores[l].time === t; });
        if (membros.length) times.push({ id: t, membros: membros });
      }
    }
    return { cartas: embaralhar(cartas, aleatorio), times: embaralhar(times, aleatorio) };
  }

  function novoEstado() {
    return { partida: 0, fase: 'espera', cartas: [], times: [], abertas: [], vez: 0, timeDaVez: null,
      jogador: null, inicioVez: 0, pontos: {}, indiceMembro: {}, ultimo: null };
  }

  function posicaoDoTime(estado, id) {
    for (let i = 0; i < estado.times.length; i++) if (estado.times[i].id === id) return i;
    return -1;
  }

  function darVez(estado, posTime, indice, inicio) {
    const time = estado.times[posTime];
    estado.timeDaVez = time.id;
    estado.indiceMembro[time.id] = indice;
    estado.jogador = time.membros[indice];
    estado.vez += 1;
    estado.inicioVez = inicio;
    estado.abertas = [];
  }

  // Passa a vez para o próximo time da ordem; dentro dele, o próximo membro do rodízio.
  function passarVez(estado, inicio) {
    const pos = (posicaoDoTime(estado, estado.timeDaVez) + 1) % estado.times.length;
    const time = estado.times[pos];
    darVez(estado, pos, (estado.indiceMembro[time.id] + 1) % time.membros.length, inicio);
  }

  function fecharAbertas(estado) {
    estado.abertas.forEach(function (i) { estado.cartas[i].situacao = 'fechada'; });
    estado.abertas = [];
  }

  function prazo(config, estado) {
    return config.tempo > 0 ? estado.inicioVez + config.tempo * 1000 : Infinity;
  }

  // Aplica um recado. Recados de outra partida, de outra vez ou que não fazem sentido agora são ignorados
  // (devolve false) — assim recados repetidos ou atrasados nunca bagunçam o jogo.
  function aplicar(config, estado, r) {
    if (!r || typeof r !== 'object') return false;
    if (r.tipo === 'comecar') {
      if (r.partida !== estado.partida + 1 || estado.fase === 'jogo') return false;
      if (!Array.isArray(r.cartas) || !Array.isArray(r.times) || r.times.length === 0) return false;
      const partida = r.partida;
      Object.assign(estado, novoEstado());
      estado.partida = partida;
      estado.fase = 'jogo';
      estado.cartas = r.cartas.map(function (c) { return { par: Math.floor(c / 2), lado: c % 2, situacao: 'fechada', time: null }; });
      estado.times = r.times.map(function (t) { return { id: t.id, membros: t.membros.slice() }; });
      estado.times.forEach(function (t) { estado.pontos[t.id] = 0; estado.indiceMembro[t.id] = -1; });
      darVez(estado, 0, 0, r.em);
      return true;
    }
    if (estado.fase !== 'jogo' || r.partida !== estado.partida || r.vez !== estado.vez) return false;

    if (r.tipo === 'virar') {
      const i = r.carta;
      const carta = estado.cartas[i];
      if (r.jogador !== estado.jogador || !carta || carta.situacao !== 'fechada' || estado.abertas.length >= 2) return false;
      if (r.em > prazo(config, estado)) return false;   // chegou depois do fim do tempo
      carta.situacao = 'aberta';
      estado.abertas.push(i);
      if (estado.abertas.length < 2) return true;
      const a = estado.abertas[0];
      const b = estado.abertas[1];
      if (estado.cartas[a].par === estado.cartas[b].par) {
        estado.cartas[a].situacao = estado.cartas[b].situacao = 'achada';
        estado.cartas[a].time = estado.cartas[b].time = estado.timeDaVez;
        estado.pontos[estado.timeDaVez] += 1;
        estado.ultimo = { tipo: 'par', cartas: [a, b], time: estado.timeDaVez, jogador: estado.jogador, vez: estado.vez };
        if (estado.cartas.every(function (c) { return c.situacao === 'achada'; })) {
          estado.fase = 'fim';
          estado.abertas = [];
          return true;
        }
        if (config.acerto === 'passa') {
          passarVez(estado, r.em + PAUSA_MS);
        } else {
          const pos = posicaoDoTime(estado, estado.timeDaVez);
          darVez(estado, pos, estado.indiceMembro[estado.timeDaVez], r.em + PAUSA_MS);
        }
      } else {
        estado.ultimo = { tipo: 'erro', cartas: [a, b], time: estado.timeDaVez, jogador: estado.jogador, vez: estado.vez };
        fecharAbertas(estado);
        passarVez(estado, r.em + PAUSA_MS);
      }
      return true;
    }

    if (r.tipo === 'tempo') {
      if (r.em < prazo(config, estado)) return false;   // relógio adiantado: ainda não acabou
      estado.ultimo = { tipo: 'tempo', cartas: estado.abertas.slice(), time: estado.timeDaVez, jogador: estado.jogador, vez: estado.vez };
      fecharAbertas(estado);
      passarVez(estado, r.em + PAUSA_MS);
      return true;
    }

    if (r.tipo === 'pular') {
      // Quem estava na vez caiu. r.alvo = lugar de quem recebe a vez (escolhido por quem manda, pela presença).
      let pos = -1;
      let indice = -1;
      estado.times.forEach(function (t, p) {
        const k = t.membros.indexOf(r.alvo);
        if (k >= 0) { pos = p; indice = k; }
      });
      if (pos < 0 || r.alvo === estado.jogador) return false;
      estado.ultimo = { tipo: 'pular', cartas: estado.abertas.slice(), time: estado.timeDaVez, jogador: estado.jogador, vez: estado.vez };
      fecharAbertas(estado);
      darVez(estado, pos, indice, r.em);
      return true;
    }
    return false;
  }

  function calcular(config, recados) {
    const estado = novoEstado();
    (recados || []).forEach(function (r) { aplicar(config, estado, r); });
    return estado;
  }

  // Quem recebe a vez se quem está nela caiu: o próximo membro conectado do mesmo time; se não houver,
  // o próximo membro conectado dos times seguintes (na ordem). Ninguém conectado → null.
  function proximoConectado(estado, jogadores) {
    const on = function (l) { return !!(jogadores[l] && jogadores[l].conectado); };
    const pos = posicaoDoTime(estado, estado.timeDaVez);
    const n = estado.times.length;
    for (let passo = 0; passo < n; passo++) {
      const time = estado.times[(pos + passo) % n];
      const m = time.membros.length;
      const base = estado.indiceMembro[time.id];
      for (let k = 1; k <= m; k++) {
        const l = time.membros[(base + k + m) % m];
        if (passo === 0 && l === estado.jogador) continue;
        if (on(l)) return l;
      }
    }
    return null;
  }

  // O que ESTE computador deve mandar agora para a partida andar (ou null).
  // - quem está na vez caiu há mais de FOLGA_QUEDA_MS → o primeiro conectado manda 'pular';
  // - o tempo acabou → quem está na vez manda 'tempo' (se ele não mandar em FOLGA_TEMPO_MS, o primeiro conectado manda).
  function acaoPendente(config, estado, jogadores, eu, agora) {
    if (estado.fase !== 'jogo') return null;
    const atual = jogadores[estado.jogador];
    const primeiro = lugaresConectados(jogadores).filter(function (l) { return l !== estado.jogador; })[0];
    if (!atual || !atual.conectado) {
      if (eu !== primeiro) return null;
      if (atual && agora - (atual.vistoEm || 0) < FOLGA_QUEDA_MS) return null;
      const alvo = proximoConectado(estado, jogadores);
      return alvo === null ? null : { tipo: 'pular', alvo: alvo };
    }
    const fim = prazo(config, estado);
    if (eu === estado.jogador && agora >= fim) return { tipo: 'tempo' };
    if (eu === primeiro && agora >= fim + FOLGA_TEMPO_MS) return { tipo: 'tempo' };
    return null;
  }

  // Pódio: times em ordem de pontos; empatados dividem a posição. → [{ id, pontos, posicao }]
  function classificacao(estado) {
    const lista = estado.times.map(function (t) { return { id: t.id, pontos: estado.pontos[t.id] || 0 }; })
      .sort(function (a, b) { return b.pontos - a.pontos; });
    lista.forEach(function (item, i) {
      item.posicao = i > 0 && item.pontos === lista[i - 1].pontos ? lista[i - 1].posicao : i + 1;
    });
    return lista;
  }

  const Regras = {
    MAX_JOGADORES, TEMPOS, TEMPO_PADRAO, TAMANHOS, GRADES, PAUSA_MS, FOLGA_QUEDA_MS, FOLGA_TEMPO_MS, CORES,
    embaralhar, lugaresConectados, anfitriao, podeComecar, prepararPartida, novoEstado, aplicar, calcular,
    proximoConectado, acaoPendente, classificacao, prazo
  };
  raiz.Regras = Regras;
  if (typeof module !== 'undefined' && module.exports) module.exports = Regras;
})(typeof window !== 'undefined' ? window : globalThis);

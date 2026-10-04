// Sons do jogo, criados pelo próprio navegador (Web Audio) — nenhum arquivo de áudio.
// Sons.tocar('agua' | 'explosao' | 'afundou' | 'torpedo' | 'errado' | 'tic' | 'vitoria')
// O botão 🔊/🔇 liga e desliga; o Chromebook lembra a escolha. Sons.tocados guarda o que tocou (para os testes).
(function (raiz) {
  'use strict';

  const CHAVE = 'bn-som';
  let ctx = null;
  let eco = null;
  let ligado = true;
  try { ligado = localStorage.getItem(CHAVE) !== 'desligado'; } catch (e) { /* sem armazenamento: começa ligado */ }

  function audio() {
    const Contexto = raiz.AudioContext || raiz.webkitAudioContext;
    if (!Contexto) return null;
    if (!ctx) {
      ctx = new Contexto();
      // Eco de "mar aberto": ruído que vai sumindo (2,2 s), para o som não ficar seco.
      eco = ctx.createConvolver();
      const dur = 2.2;
      const buf = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
      }
      eco.buffer = buf;
      const ganhoEco = ctx.createGain();
      ganhoEco.gain.value = 0.55;
      eco.connect(ganhoEco).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function saida(no, quantoEco) {
    no.connect(ctx.destination);
    if (quantoEco) { const g = ctx.createGain(); g.gain.value = quantoEco; no.connect(g).connect(eco); }
  }

  function envelope(ganho, inicio, pico, ataque, queda) {
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(pico * 0.8 + 0.0001, inicio + ataque);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + ataque + queda);
  }

  function ruidoFiltrado(tipoFiltro, f0, f1, inicio, duracao, pico, q, quantoEco, ataque) {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (duracao + 0.2)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filtro = ctx.createBiquadFilter();
    filtro.type = tipoFiltro;
    filtro.Q.value = q || 1;
    filtro.frequency.setValueAtTime(f0, inicio);
    filtro.frequency.exponentialRampToValueAtTime(f1, inicio + duracao);
    const g = ctx.createGain();
    envelope(g, inicio, pico, ataque || 0.01, duracao);
    src.connect(filtro).connect(g);
    saida(g, quantoEco);
    src.start(inicio);
    src.stop(inicio + duracao + 0.2);
  }

  function tom(tipo, f0, f1, inicio, duracao, pico, quantoEco, ataque) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, inicio);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, inicio + duracao);
    envelope(g, inicio, pico, ataque || 0.008, duracao);
    o.connect(g);
    saida(g, quantoEco);
    o.start(inicio);
    o.stop(inicio + duracao + 0.05);
  }

  const SONS = {
    // 🌊 Água (versão B escolhida pelo professor): mergulho com ondinha, baixo e suave.
    agua: function (t) {
      ruidoFiltrado('bandpass', 900, 260, t, 0.7, 0.35, 0.7, 0.3, 0.03);
      ruidoFiltrado('lowpass', 600, 200, t + 0.25, 0.9, 0.18, 0.7, 0.3, 0.2);
      [0.18, 0.32].forEach(function (d) { tom('sine', 420, 760, t + d, 0.06, 0.08, 0.2); });
    },
    // 💥 Explosão (versão C escolhida): "BUM" grave e cheio, de canhão, com eco.
    explosao: function (t) {
      ruidoFiltrado('lowpass', 3500, 200, t, 0.08, 1.0, 0.5, 0.5, 0.002);
      tom('sine', 75, 32, t, 1.2, 1.0, 0.7, 0.004);
      tom('triangle', 150, 50, t, 0.6, 0.5, 0.6, 0.004);
      ruidoFiltrado('bandpass', 700, 120, t, 1.5, 0.7, 0.8, 0.9, 0.01);
    },
    // 🚢 Afundou: a explosão C + um estrondo mais longe + o navio afundando com borbulhas.
    afundou: function (t) {
      SONS.explosao(t);
      ruidoFiltrado('lowpass', 900, 80, t + 0.5, 1.8, 0.7, 0.7, 0.9, 0.05);
      tom('sine', 60, 28, t + 0.5, 1.6, 0.7, 0.6, 0.02);
      [1.3, 1.5, 1.65, 1.85, 2.0].forEach(function (d, i) { tom('sine', 260 + i * 40, 600 + i * 60, t + d, 0.07, 0.12, 0.3); });
    },
    // 🚀 Torpedo saindo: "zuuum".
    torpedo: function (t) {
      ruidoFiltrado('bandpass', 400, 2600, t, 0.7, 0.6, 2.5, 0.3);
      tom('sawtooth', 180, 420, t, 0.7, 0.12, 0.2);
    },
    // ✗ Conta errada / tempo esgotado.
    errado: function (t) { tom('square', 196, 140, t, 0.35, 0.25, 0.2); },
    // ⏱ Um número da contagem 3, 2, 1.
    tic: function (t) { tom('square', 1300, 1300, t, 0.04, 0.25); },
    // 🏆 Vitória.
    vitoria: function (t) {
      [523, 659, 784, 1047].forEach(function (f, i) { tom('triangle', f, f, t + i * 0.13, 0.25, 0.45, 0.3); });
      tom('triangle', 1047, 1047, t + 0.55, 0.6, 0.45, 0.4);
      tom('triangle', 784, 784, t + 0.55, 0.6, 0.3, 0.4);
    }
  };

  function tocar(nome) {
    if (!ligado || !SONS[nome]) return;
    Sons.tocados.push(nome);
    try {
      if (!audio()) return;
      SONS[nome](ctx.currentTime + 0.02);
    } catch (e) { /* som nunca pode quebrar o jogo */ }
  }

  function definir(valor) {
    ligado = !!valor;
    try { localStorage.setItem(CHAVE, ligado ? 'ligado' : 'desligado'); } catch (e) { /* sem armazenamento */ }
    if (ligado) audio();   // o clique no botão "destrava" o áudio do navegador
  }

  const Sons = {
    tocados: [],
    tocar: tocar,
    ligado: function () { return ligado; },
    alternar: function () { definir(!ligado); return ligado; }
  };
  raiz.Sons = Sons;

  // O navegador só deixa tocar som depois de algum clique na página: no primeiro clique, prepara o áudio.
  raiz.addEventListener('pointerdown', function () { if (ligado) audio(); }, { once: true });
})(window);

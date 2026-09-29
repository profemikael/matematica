// Tela: desenha tabuleiros e troca de telas. Não decide nada sobre o jogo.
(function (raiz) {
  'use strict';

  const LETRAS = 'ABCDEFGHIJ';

  function mostrar(idTela) {
    document.querySelectorAll('.tela').forEach(function (s) { s.hidden = s.id !== idTela; });
    window.scrollTo(0, 0);
  }

  // Cria a grade 10×10 uma única vez; depois só troca as classes com pintar().
  // eventos = { aoClicar(l, c), aoPassar(l, c), aoSair() } — todos opcionais.
  function criarTabuleiro(elemento, eventos) {
    eventos = eventos || {};
    elemento.innerHTML = '';
    elemento.classList.add('tabuleiro');
    const casas = [];
    elemento.appendChild(document.createElement('div')).className = 'rotulo';
    for (let c = 0; c < 10; c++) {
      const r = document.createElement('div');
      r.className = 'rotulo';
      r.textContent = LETRAS[c];
      elemento.appendChild(r);
    }
    for (let l = 0; l < 10; l++) {
      const r = document.createElement('div');
      r.className = 'rotulo';
      r.textContent = String(l + 1);
      elemento.appendChild(r);
      casas.push([]);
      for (let c = 0; c < 10; c++) {
        const casa = document.createElement('button');
        casa.type = 'button';
        casa.className = 'casa';
        casa.setAttribute('aria-label', LETRAS[c] + (l + 1));
        casa.addEventListener('click', function () { if (eventos.aoClicar) eventos.aoClicar(l, c); });
        casa.addEventListener('mouseenter', function () { if (eventos.aoPassar) eventos.aoPassar(l, c); });
        elemento.appendChild(casa);
        casas[l].push(casa);
      }
    }
    elemento.addEventListener('mouseleave', function () { if (eventos.aoSair) eventos.aoSair(); });
    // Camada dos navios desenhados e do fogo, por cima das casas (não recebe cliques).
    const camada = document.createElement('div');
    camada.className = 'camada-navios';
    elemento.appendChild(camada);

    // op = { navios, tiros, esconder: [chaves], afundadas: [chaves], previa: { casas, valida }, destaque: chave, mirada: chave, clicavel(l, c) }
    function pintar(op) {
      const naviosCasas = new Set();
      if (op.navios) {
        Object.values(op.navios).forEach(function (n) {
          Regras.casasDoNavio(n).forEach(function (k) { naviosCasas.add(Regras.chave(k.l, k.c)); });
        });
      }
      const esconder = new Set(op.esconder || []);
      const afundadas = new Set(op.afundadas || []);
      const previa = new Map();
      if (op.previa) op.previa.casas.forEach(function (k) { previa.set(Regras.chave(k.l, k.c), op.previa.valida); });
      for (let l = 0; l < 10; l++) {
        for (let c = 0; c < 10; c++) {
          const ch = Regras.chave(l, c);
          const casa = casas[l][c];
          const tiro = esconder.has(ch) ? undefined : (op.tiros || {})[ch];
          const clicavel = op.clicavel ? op.clicavel(l, c) : false;
          casa.className = 'casa';
          casa.textContent = '';
          if (naviosCasas.has(ch)) casa.classList.add('navio');
          if (tiro === 'agua') { casa.classList.add('agua'); casa.textContent = '🌊'; }
          if (tiro === 'acerto') casa.classList.add('acerto');   // o fogo é desenhado na camada dos navios
          if (tiro === 'acerto' && afundadas.has(ch)) casa.classList.add('afundado');
          if (previa.has(ch)) casa.classList.add(previa.get(ch) ? 'previa-ok' : 'previa-ruim');
          if (op.destaque === ch) casa.classList.add('destaque');
          if (op.mirada === ch) casa.classList.add('mirada');
          if (clicavel) casa.classList.add('clicavel');
          casa.disabled = !clicavel;
        }
      }
      desenharNavios(op, esconder);
    }

    // Navios conhecidos (os meus, ou os do colega revelados no fim) são desenhados inteiros; do colega durante a
    // batalha, só os que já afundaram (reconstruídos pelas casas afundadas). Fogo em cada casa atingida.
    function desenharNavios(op, esconder) {
      const tiros = op.tiros || {};
      const atingida = function (ch) { return !esconder.has(ch) && tiros[ch] === 'acerto'; };
      let navios;
      if (op.navios && Object.keys(op.navios).length) {
        navios = Object.values(op.navios).map(function (n) {
          const afundado = Regras.casasDoNavio(n).every(function (k) { return atingida(Regras.chave(k.l, k.c)); });
          return { l: n.l, c: n.c, orientacao: n.orientacao, tamanho: n.tamanho, afundado: afundado };
        });
      } else {
        navios = NaviosSVG.naviosDasCasas((op.afundadas || []).filter(atingida));
      }
      NaviosSVG.desenhar(camada, navios, Object.keys(tiros).filter(atingida));
    }
    return { pintar: pintar };
  }

  function formatarTempo(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  raiz.Tela = { mostrar: mostrar, criarTabuleiro: criarTabuleiro, formatarTempo: formatarTempo };
})(window);

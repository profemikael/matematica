// Navios desenhados (SVG) por cima do tabuleiro: cruzador (4), destróier (3), patrulha (2), fogo nos acertos.
// A camada de desenhos fica por cima das casas e não atrapalha os cliques (pointer-events: none).
(function (raiz) {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';
  const TIPO_POR_TAMANHO = { 4: 'cruzador', 3: 'destroier', 2: 'patrulha' };

  const DESENHOS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="d-conves" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef1f4"/><stop offset="1" stop-color="#b9c3cc"/></linearGradient>
  <linearGradient id="d-casco" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d7a87"/><stop offset=".6" stop-color="#46525e"/><stop offset="1" stop-color="#27313a"/></linearGradient>
  <linearGradient id="d-frente" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe5ea"/><stop offset="1" stop-color="#8f9ba7"/></linearGradient>
  <linearGradient id="d-topo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3dae0"/></linearGradient>
  <linearGradient id="d-chamine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b6570"/><stop offset=".5" stop-color="#a9b3bd"/><stop offset="1" stop-color="#4a535d"/></linearGradient>
  <radialGradient id="d-chama" cx=".5" cy=".75" r=".65"><stop offset="0" stop-color="#fff6b0"/><stop offset=".4" stop-color="#ffb02e"/><stop offset=".8" stop-color="#f0541e"/><stop offset="1" stop-color="#c62a12"/></radialGradient>

  <symbol id="cruzador" viewBox="0 0 160 40">
    <ellipse cx="80" cy="36" rx="74" ry="3.5" fill="rgba(0,40,80,.3)"/>
    <path d="M2 27 q4 -2 8 0 M3 31 q5 -2 9 0" stroke="rgba(255,255,255,.85)" fill="none" stroke-width="1.2"/>
    <path d="M8 24 L130 23 Q150 25 153 26 L135 35 L16 35 Q8 31 8 24 Z" fill="url(#d-casco)" stroke="#1f272e" stroke-width=".8"/>
    <path d="M12 33 L136 33" stroke="#b3261e" stroke-width="2"/>
    <g fill="#e8eef3"><circle cx="24" cy="29" r="1.1"/><circle cx="34" cy="29" r="1.1"/><circle cx="44" cy="29" r="1.1"/><circle cx="54" cy="29" r="1.1"/><circle cx="64" cy="29" r="1.1"/><circle cx="74" cy="29" r="1.1"/><circle cx="84" cy="29" r="1.1"/><circle cx="94" cy="29" r="1.1"/><circle cx="104" cy="29" r="1.1"/><circle cx="114" cy="29" r="1.1"/></g>
    <path d="M8 24 Q7 16 16 14 L128 13 Q150 17 153 26 L130 23 Z" fill="url(#d-conves)" stroke="#6f7b86" stroke-width=".6"/>
    <g stroke="rgba(120,130,140,.35)" stroke-width=".5"><path d="M20 16 L124 15"/><path d="M18 19 L128 18"/><path d="M16 22 L130 21"/></g>
    <ellipse cx="34" cy="18" rx="7" ry="3.5" fill="#7d8894"/><ellipse cx="34" cy="16.5" rx="7" ry="3.5" fill="url(#d-topo)" stroke="#6f7b86" stroke-width=".6"/>
    <path d="M28 16 L14 15.2 M28 17.2 L14 16.6" stroke="#3b444d" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="118" cy="18" rx="7" ry="3.5" fill="#7d8894"/><ellipse cx="118" cy="16.5" rx="7" ry="3.5" fill="url(#d-topo)" stroke="#6f7b86" stroke-width=".6"/>
    <path d="M124 16 L140 15.4 M124 17.2 L140 16.8" stroke="#3b444d" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="52" y="10" width="34" height="11" fill="url(#d-frente)" stroke="#6f7b86" stroke-width=".6"/>
    <polygon points="52,10 86,10 90,7 56,7" fill="url(#d-topo)" stroke="#6f7b86" stroke-width=".6"/>
    <g fill="#2b3a4a"><rect x="56" y="13" width="3" height="2.5"/><rect x="61" y="13" width="3" height="2.5"/><rect x="66" y="13" width="3" height="2.5"/><rect x="71" y="13" width="3" height="2.5"/><rect x="76" y="13" width="3" height="2.5"/><rect x="81" y="13" width="3" height="2.5"/></g>
    <rect x="61" y="3" width="15" height="7" fill="url(#d-frente)" stroke="#6f7b86" stroke-width=".6"/>
    <polygon points="61,3 76,3 79,1 64,1" fill="url(#d-topo)"/>
    <rect x="63" y="5" width="11" height="2" fill="#2b3a4a"/>
    <rect x="90" y="7" width="7" height="12" fill="url(#d-chamine)"/><ellipse cx="93.5" cy="7" rx="3.5" ry="1.4" fill="#2f363c"/>
    <path d="M13 15 L13 6" stroke="#4b5560" stroke-width=".8"/><path d="M13 6 L20 7.5 L13 9 Z" fill="#1f8a3b"/>
    <path d="M150 24 q6 1 9 4 M150 28 q5 1 8 3" stroke="rgba(255,255,255,.9)" fill="none" stroke-width="1.2"/>
  </symbol>

  <symbol id="destroier" viewBox="0 0 120 40">
    <ellipse cx="60" cy="36" rx="55" ry="3.5" fill="rgba(0,40,80,.3)"/>
    <path d="M2 27 q4 -2 8 0" stroke="rgba(255,255,255,.85)" fill="none" stroke-width="1.2"/>
    <path d="M8 24 L96 23 Q112 25 115 26 L100 35 L16 35 Q8 31 8 24 Z" fill="url(#d-casco)" stroke="#1f272e" stroke-width=".8"/>
    <path d="M12 33 L102 33" stroke="#b3261e" stroke-width="2"/>
    <g fill="#e8eef3"><circle cx="22" cy="29" r="1.1"/><circle cx="32" cy="29" r="1.1"/><circle cx="42" cy="29" r="1.1"/><circle cx="52" cy="29" r="1.1"/><circle cx="62" cy="29" r="1.1"/><circle cx="72" cy="29" r="1.1"/><circle cx="82" cy="29" r="1.1"/></g>
    <path d="M8 24 Q7 16 16 14 L94 13 Q112 17 115 26 L96 23 Z" fill="url(#d-conves)" stroke="#6f7b86" stroke-width=".6"/>
    <ellipse cx="88" cy="18" rx="6" ry="3" fill="#7d8894"/><ellipse cx="88" cy="16.8" rx="6" ry="3" fill="url(#d-topo)" stroke="#6f7b86" stroke-width=".6"/>
    <path d="M93 16.6 L106 16" stroke="#3b444d" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="40" y="10" width="26" height="11" fill="url(#d-frente)" stroke="#6f7b86" stroke-width=".6"/>
    <polygon points="40,10 66,10 70,7 44,7" fill="url(#d-topo)" stroke="#6f7b86" stroke-width=".6"/>
    <g fill="#2b3a4a"><rect x="44" y="13" width="3" height="2.5"/><rect x="49" y="13" width="3" height="2.5"/><rect x="54" y="13" width="3" height="2.5"/><rect x="59" y="13" width="3" height="2.5"/></g>
    <rect x="28" y="9" width="6" height="11" fill="url(#d-chamine)"/><ellipse cx="31" cy="9" rx="3" ry="1.2" fill="#2f363c"/>
    <path d="M53 7 L53 0" stroke="#4b5560" stroke-width="1"/><path d="M50 2 L56 2" stroke="#4b5560" stroke-width="1"/>
    <path d="M112 24 q5 1 7 4" stroke="rgba(255,255,255,.9)" fill="none" stroke-width="1.2"/>
  </symbol>

  <symbol id="patrulha" viewBox="0 0 80 40">
    <ellipse cx="40" cy="36" rx="36" ry="3.2" fill="rgba(0,40,80,.3)"/>
    <path d="M6 24 L58 23 Q72 25 75 26 L62 35 L12 35 Q6 31 6 24 Z" fill="url(#d-casco)" stroke="#1f272e" stroke-width=".8"/>
    <path d="M10 33 L64 33" stroke="#b3261e" stroke-width="2"/>
    <path d="M6 24 Q6 17 13 15 L58 14 Q72 18 75 26 L58 23 Z" fill="url(#d-conves)" stroke="#6f7b86" stroke-width=".6"/>
    <rect x="24" y="11" width="20" height="10" fill="url(#d-frente)" stroke="#6f7b86" stroke-width=".6"/>
    <polygon points="24,11 44,11 47,8 27,8" fill="url(#d-topo)" stroke="#6f7b86" stroke-width=".6"/>
    <rect x="27" y="13" width="14" height="3" fill="#2b3a4a"/>
    <path d="M34 8 L34 1" stroke="#4b5560" stroke-width="1"/><circle cx="34" cy="1.5" r="1.3" fill="#d33"/>
    <path d="M72 24 q5 1 7 4" stroke="rgba(255,255,255,.9)" fill="none" stroke-width="1.2"/>
  </symbol>

  <!-- Fogo grande com fumaça: cobre quase todo o quadrado -->
  <symbol id="fogo" viewBox="0 0 40 40">
    <circle cx="13" cy="8" r="7" fill="rgba(60,60,60,.55)"/><circle cx="24" cy="5" r="6" fill="rgba(80,80,80,.45)"/><circle cx="31" cy="10" r="5" fill="rgba(70,70,70,.4)"/>
    <path d="M20 39 C5 36 2 24 9 15 C9 22 13 24 14 19 C14 12 18 8 21 3 C23 11 29 12 28 20 C31 18 32 15 32 12 C39 21 37 35 20 39 Z" fill="url(#d-chama)"/>
    <path d="M20 37 C11 35 10 27 14 21 C15 26 18 26 18 23 C19 19 21 16 23 13 C24 19 28 21 27 26 C29 25 30 23 30 21 C33 28 30 35 20 37 Z" fill="#ffd45a"/>
    <path d="M20 35 C15 34 15 29 17 26 C18 29 20 29 20 27 C21 25 22 23 23 21 C24 26 27 28 25 31 C25 33 23 35 20 35 Z" fill="#fff6c8"/>
  </symbol>
</defs></svg>`;

  function garantirDesenhos() {
    if (document.getElementById('cruzador')) return;
    document.body.insertAdjacentHTML('afterbegin', DESENHOS);
  }

  function usar(simbolo, largura, altura) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + largura + ' ' + altura);
    svg.setAttribute('preserveAspectRatio', 'none');
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#' + simbolo);
    svg.appendChild(use);
    return svg;
  }

  // Posição de uma casa na camada (a camada começa na casa A1; cada casa mede --casa + 2px de espaço).
  function posicionar(el, l, c, largura, altura) {
    el.style.left = 'calc(' + c + ' * (var(--casa) + 2px))';
    el.style.top = 'calc(' + l + ' * (var(--casa) + 2px))';
    el.style.width = 'calc(' + largura + ' * (var(--casa) + 2px) - 2px)';
    el.style.height = 'calc(' + altura + ' * (var(--casa) + 2px) - 2px)';
  }

  // Agrupa casas afundadas ("l,c") em navios: navios nunca se encostam, então cada grupo ligado é um navio.
  function naviosDasCasas(chaves) {
    const resto = new Set(chaves);
    const navios = [];
    resto.forEach(function (inicio) {
      if (!resto.has(inicio)) return;
      const grupo = [];
      const pilha = [inicio];
      resto.delete(inicio);
      while (pilha.length) {
        const ch = pilha.pop();
        grupo.push(ch.split(',').map(Number));
        const p = ch.split(',').map(Number);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          const viz = (p[0] + d[0]) + ',' + (p[1] + d[1]);
          if (resto.has(viz)) { resto.delete(viz); pilha.push(viz); }
        });
      }
      const ls = grupo.map(function (k) { return k[0]; });
      const cs = grupo.map(function (k) { return k[1]; });
      const l = Math.min.apply(null, ls);
      const c = Math.min.apply(null, cs);
      navios.push({ l: l, c: c, orientacao: Math.max.apply(null, ls) > l ? 'v' : 'h', tamanho: grupo.length, afundado: true });
    });
    return navios;
  }

  // navios: [{ l, c, orientacao, tamanho, afundado }]; fogos: ["l,c"] (casas atingidas).
  function desenhar(camada, navios, fogos) {
    garantirDesenhos();
    camada.innerHTML = '';
    navios.forEach(function (n) {
      const tipo = TIPO_POR_TAMANHO[n.tamanho];
      if (!tipo) return;
      const caixa = document.createElement('div');
      caixa.className = 'navio-svg' + (n.afundado ? ' afundado' : '');
      caixa.dataset.tipo = tipo;
      const vertical = n.orientacao === 'v';
      posicionar(caixa, n.l, n.c, vertical ? 1 : n.tamanho, vertical ? n.tamanho : 1);
      const desenho = usar(tipo, n.tamanho * 40, 40);
      desenho.classList.add(vertical ? 'desenho-vertical' : 'desenho');
      if (vertical) {   // desenha deitado e gira 90° (a largura vira a altura da caixa)
        desenho.style.width = 'calc(' + n.tamanho + ' * (var(--casa) + 2px) - 2px)';
        desenho.style.height = 'var(--casa)';
      }
      caixa.appendChild(desenho);
      camada.appendChild(caixa);
    });
    (fogos || []).forEach(function (ch) {
      const p = ch.split(',').map(Number);
      const f = document.createElement('div');
      f.className = 'fogo-svg';
      posicionar(f, p[0], p[1], 1, 1);
      f.appendChild(usar('fogo', 40, 40));
      camada.appendChild(f);
    });
  }

  raiz.NaviosSVG = { desenhar: desenhar, naviosDasCasas: naviosDasCasas };
})(window);

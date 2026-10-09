// Tabuleiro: desenha as cartas com coordenadas (A, B, C… em cima; 1, 2, 3… do lado), o placar e a carta ampliada.
// Não decide nada sobre o jogo: só desenha o estado que recebe.
(function (raiz) {
  'use strict';

  const LETRAS = 'ABCDEFGHIJ';

  function coordenada(i, colunas) { return LETRAS[i % colunas] + (Math.floor(i / colunas) + 1); }

  // Monta uma grade com rótulos (letras a partir de letraInicial, linhas 1, 2, 3…) e as cartas [inicio, inicio + qtd).
  function montarGrade(grade, colunas, letraInicial, inicio, qtd, criarCarta) {
    grade.style.gridTemplateColumns = '1.4em repeat(' + colunas + ', var(--carta-l))';
    grade.appendChild(document.createElement('div')).className = 'rotulo';
    for (let c = 0; c < colunas; c++) {
      const r = document.createElement('div');
      r.className = 'rotulo';
      r.textContent = LETRAS[letraInicial + c];
      grade.appendChild(r);
    }
    for (let k = 0; k < qtd; k++) {
      if (k % colunas === 0) {
        const r = document.createElement('div');
        r.className = 'rotulo';
        r.textContent = String(k / colunas + 1);
        grade.appendChild(r);
      }
      grade.appendChild(criarCarta(inicio + k));
    }
  }

  // Cria o tabuleiro de uma partida. banco = banco do jeito escolhido; cartas = números do recado 'comecar'.
  // jeito 'perguntas': dois baralhos lado a lado — perguntas (colunas A–E) e respostas (F–J), 5 colunas cada.
  // aoClicar(indice) é chamado quando o aluno clica numa carta.
  function criar(elemento, pares, banco, cartas, aoClicar, jeito) {
    const doisBaralhos = jeito === 'perguntas';
    const colunas = doisBaralhos ? 10 : Regras.GRADES[pares][0];          // colunas no total
    const linhas = doisBaralhos ? pares / 5 : Regras.GRADES[pares][1];
    const metade = cartas.length / 2;
    const botoes = [];
    function coordenadaDe(i) {
      if (!doisBaralhos) return coordenada(i, colunas);
      return i < metade ? coordenada(i, 5) : LETRAS[5 + (i - metade) % 5] + (Math.floor((i - metade) / 5) + 1);
    }
    function criarCarta(i) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'carta';
      b.dataset.indice = String(i);
      b.setAttribute('aria-label', coordenadaDe(i));
      const verso = doisBaralhos && i >= metade ? '!' : '?';
      b.innerHTML = '<div class="miolo"><div class="verso">' + verso + '</div><div class="frente">' +
        Desenhos.carta(Bancos.ladoDaCarta(banco, cartas[i]), 'bancos/') + '</div></div>';
      b.addEventListener('click', function () { aoClicar(i); });
      botoes[i] = b;
      return b;
    }

    elemento.innerHTML = '';
    elemento.classList.toggle('dois-baralhos', doisBaralhos);
    elemento.style.gridTemplateColumns = '';
    if (doisBaralhos) {
      [['perguntas', '📝 Perguntas', 0, 0], ['respostas', '✅ Respostas', 5, metade]].forEach(function (d) {
        const caixa = document.createElement('div');
        caixa.className = 'baralho ' + d[0];
        const h = document.createElement('h3');
        h.textContent = d[1];
        const grade = document.createElement('div');
        grade.className = 'grade';
        caixa.appendChild(h);
        caixa.appendChild(grade);
        montarGrade(grade, 5, d[2], d[3], metade, criarCarta);
        elemento.appendChild(caixa);
      });
    } else {
      montarGrade(elemento, colunas, 0, 0, cartas.length, criarCarta);
    }

    // Carta do maior tamanho que cabe na tela (o placar fica ao lado, a faixa em cima).
    // Pode ser até 1,5 vez mais larga que alta: sobra largura quando há muitas linhas.
    function ajustar() {
      const largura = Math.min(window.innerWidth, 1366) - 48 - 260 - 14 - 30 - (doisBaralhos ? 40 : 0);
      const altura = window.innerHeight - elemento.getBoundingClientRect().top + window.scrollY - 24 - 22 - (doisBaralhos ? 24 : 0);
      const a = Math.floor(Math.min((altura - 4 * linhas) / linhas, 150));
      const l = Math.floor(Math.min((largura - 4 * colunas) / colunas, a * 1.5));
      document.documentElement.style.setProperty('--carta-a', Math.max(44, Math.min(a, l)) + 'px');
      document.documentElement.style.setProperty('--carta-l', Math.max(44, l) + 'px');
    }
    window.addEventListener('resize', ajustar);
    requestAnimationFrame(ajustar);

    // estado = do motor de regras; op = { clicavel: bool, ladoTravado: 0 | 1 | null, corDoTime(id) }
    // ladoTravado: dois baralhos com a 1ª carta virada — o baralho dela não aceita a 2ª.
    function pintar(estado, op) {
      estado.cartas.forEach(function (c, i) {
        const b = botoes[i];
        b.classList.toggle('virada', c.situacao !== 'fechada');
        b.classList.toggle('achada', c.situacao === 'achada');
        b.classList.toggle('clicavel', !!op.clicavel && c.situacao === 'fechada' && c.lado !== op.ladoTravado);
        if (c.situacao === 'achada') b.style.setProperty('--cor-time', op.corDoTime(c.time));
        else b.style.removeProperty('--cor-time');
      });
    }

    function brilhar(indices) {
      indices.forEach(function (i) {
        const b = botoes[i];
        if (!b) return;
        b.classList.remove('nova');
        void b.offsetWidth;   // reinicia a animação
        b.classList.add('nova');
      });
    }

    function parar() { window.removeEventListener('resize', ajustar); }

    return { pintar: pintar, brilhar: brilhar, parar: parar, coordenada: coordenadaDe };
  }

  // Placar ao lado do tabuleiro. times = estado.times (na ordem do jogo).
  // info(time) → { nome, cor }; nomeJogador(lugar); conectado(lugar)
  function desenharPlacar(elemento, estado, info, nomeJogador, conectado) {
    elemento.innerHTML = '';
    estado.times.forEach(function (t) {
      const i = info(t.id);
      const div = document.createElement('div');
      div.className = 'time' + (t.id === estado.timeDaVez && estado.fase === 'jogo' ? ' na-vez' : '');
      div.style.setProperty('--cor', i.cor);
      div.dataset.time = String(t.id);
      const topo = document.createElement('div');
      topo.className = 'time-topo';
      topo.innerHTML = '<span></span><span class="pontos"></span>';
      topo.firstChild.textContent = i.nome;
      topo.lastChild.textContent = String(estado.pontos[t.id] || 0);
      div.appendChild(topo);
      if (t.membros.length > 1 || i.mostrarMembros) {
        const ul = document.createElement('ul');
        t.membros.forEach(function (l) {
          const li = document.createElement('li');
          li.textContent = nomeJogador(l);
          if (l === estado.jogador && estado.fase === 'jogo') li.className = 'joga';
          else if (!conectado(l)) li.className = 'saiu';
          ul.appendChild(li);
        });
        div.appendChild(ul);
      } else if (!conectado(t.membros[0])) {
        topo.firstChild.textContent += ' (saiu)';
      }
      elemento.appendChild(div);
    });
  }

  // Mostra 1 ou 2 cartas grandes no centro. tipo = '' | 'par' | 'erro'.
  function ampliar(lados, tipo, texto) {
    const caixa = document.getElementById('ampliacao');
    const cartas = document.getElementById('ampliacao-cartas');
    cartas.innerHTML = '';
    lados.forEach(function (lado) {
      const d = document.createElement('div');
      d.className = 'grande';
      d.innerHTML = Desenhos.carta(lado, 'bancos/');
      cartas.appendChild(d);
    });
    caixa.className = 'ampliacao' + (tipo ? ' ' + tipo : '');
    document.getElementById('ampliacao-texto').textContent = texto || '';
    caixa.hidden = false;
  }
  function fecharAmpliacao() { document.getElementById('ampliacao').hidden = true; }

  const Tabuleiro = { criar, desenharPlacar, ampliar, fecharAmpliacao, coordenada };
  raiz.Tabuleiro = Tabuleiro;
})(window);

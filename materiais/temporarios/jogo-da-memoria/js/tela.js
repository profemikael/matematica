// Tela: troca de telas, sala de espera e pódio. Não decide nada sobre o jogo.
(function (raiz) {
  'use strict';

  function mostrar(idTela) {
    document.querySelectorAll('.tela').forEach(function (s) { s.hidden = s.id !== idTela; });
    document.body.classList.toggle('jogando', idTela === 'tela-jogo');   // cabeçalho compacto: mais espaço para as cartas
  }

  // Nome e cor de um "time" do motor: em times, o time colorido; cada um por si, o próprio jogador.
  function infoTime(config, id, jogadores) {
    const cor = Regras.CORES[id] || Regras.CORES[0];
    if (config.modo === 'times') return { nome: cor.emoji + ' ' + cor.nome, cor: cor.cor, mostrarMembros: true };
    const j = jogadores[id];
    return { nome: j ? j.nome : 'Jogador', cor: cor.cor, mostrarMembros: false };
  }

  function textoConfig(config, banco) {
    const modo = config.modo === 'times' ? config.times + ' times' : 'cada um por si';
    const tempo = config.tempo > 0 ? config.tempo + ' s por vez' : 'sem limite de tempo';
    const acerto = config.acerto === 'passa' ? 'acertou, passa a vez' : 'acertou, joga de novo';
    const jeito = config.jeito === 'perguntas' ? ' · perguntas e respostas' : '';
    return (banco ? banco.titulo + ' · ' : '') + config.pares + ' pares' + jeito + ' · ' + modo + ' · ' + tempo + ' · ' + acerto;
  }

  // Sala de espera. op = { config, jogadores, eu, anfitriao (lugar), aoEscolherTime(lugar, time) }
  function desenharEspera(elemento, op) {
    elemento.innerHTML = '';
    const lugares = Regras.lugaresConectados(op.jogadores);
    const souAnfitriao = op.eu === op.anfitriao;

    function itemJogador(l) {
      const li = document.createElement('li');
      const nome = document.createElement('span');
      nome.textContent = op.jogadores[l].nome + (l === op.anfitriao ? ' 👑' : '') + (l === op.eu ? ' (você)' : '');
      if (l === op.eu) nome.className = 'eu';
      li.appendChild(nome);
      li.dataset.lugar = String(l);
      if (op.config.modo === 'times' && souAnfitriao) {
        const sel = document.createElement('select');
        sel.title = 'Mudar de time';
        sel.innerHTML = '<option value="">—</option>';
        for (let t = 0; t < op.config.times; t++) {
          const o = document.createElement('option');
          o.value = String(t);
          o.textContent = Regras.CORES[t].emoji + ' ' + Regras.CORES[t].nome;
          sel.appendChild(o);
        }
        const atual = op.jogadores[l].time;
        sel.value = Number.isInteger(atual) && atual < op.config.times ? String(atual) : '';
        sel.addEventListener('change', function () { if (sel.value !== '') op.aoEscolherTime(l, Number(sel.value)); });
        li.appendChild(sel);
      }
      return li;
    }

    function grupo(titulo, cor, membros, time) {
      const div = document.createElement('div');
      div.className = 'grupo' + (time === null ? ' sem-time' : '');
      if (cor) div.style.setProperty('--cor', cor);
      if (time !== null) div.dataset.time = String(time);
      const h = document.createElement('h3');
      h.textContent = titulo;
      div.appendChild(h);
      const ul = document.createElement('ul');
      membros.forEach(function (l) { ul.appendChild(itemJogador(l)); });
      div.appendChild(ul);
      if (time !== null && op.jogadores[op.eu] && op.jogadores[op.eu].time !== time) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'botao mini';
        b.textContent = 'Entrar neste time';
        b.addEventListener('click', function () { op.aoEscolherTime(op.eu, time); });
        div.appendChild(b);
      }
      elemento.appendChild(div);
    }

    if (op.config.modo === 'solo') {
      grupo('Jogadores (' + lugares.length + ' de ' + Regras.MAX_JOGADORES + ')', null, lugares, null);
      return;
    }
    const semTime = lugares.filter(function (l) {
      const t = op.jogadores[l].time;
      return !(Number.isInteger(t) && t < op.config.times);
    });
    for (let t = 0; t < op.config.times; t++) {
      const c = Regras.CORES[t];
      grupo(c.emoji + ' ' + c.nome, c.cor, lugares.filter(function (l) { return op.jogadores[l].time === t; }), t);
    }
    if (semTime.length) grupo('Sem time ainda', null, semTime, null);
  }

  // Pódio no fim. → título ("Ana venceu!" / "Empate!")
  function desenharPodio(elemento, estado, config, jogadores) {
    const lista = Regras.classificacao(estado);
    const medalhas = ['🥇', '🥈', '🥉'];
    elemento.innerHTML = '';
    lista.forEach(function (item) {
      const info = infoTime(config, item.id, jogadores);
      const li = document.createElement('li');
      li.style.setProperty('--cor', info.cor);
      if (item.posicao === 1) li.className = 'primeiro';
      const quem = document.createElement('span');
      quem.className = 'quem';
      quem.textContent = (medalhas[item.posicao - 1] || item.posicao + 'º') + ' ' + info.nome;
      if (config.modo === 'times') {
        const time = estado.times.find(function (t) { return t.id === item.id; });
        const small = document.createElement('small');
        small.textContent = time.membros.map(function (l) { return jogadores[l] ? jogadores[l].nome : '?'; }).join(', ');
        quem.appendChild(small);
      }
      const pts = document.createElement('strong');
      pts.textContent = item.pontos + (item.pontos === 1 ? ' par' : ' pares');
      li.appendChild(quem);
      li.appendChild(pts);
      elemento.appendChild(li);
    });
    const primeiros = lista.filter(function (i) { return i.posicao === 1; });
    if (primeiros.length > 1) {
      return 'Empate! ' + primeiros.map(function (i) { return infoTime(config, i.id, jogadores).nome; }).join(' e ') +
        ' com ' + primeiros[0].pontos + ' pares';
    }
    const v = infoTime(config, primeiros[0].id, jogadores).nome;
    return (config.modo === 'times' ? 'Time ' + v : v) + ' venceu! 🏆';
  }

  const Tela = { mostrar, infoTime, textoConfig, desenharEspera, desenharPodio };
  raiz.Tela = Tela;
})(window);

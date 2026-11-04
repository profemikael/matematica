// Cola das telas do jogo em times. Só DOM: as regras estão no JuizTimes e o relógio no Anfitrião.
// Todo texto que vem de alunos (nomes) entra na página com textContent, nunca com innerHTML.
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const NOMES_TIMES = ['', 'Azul', 'Verde', 'Amarelo', 'Vermelho'];
  const CORES_TIMES = ['', '#2563EB', '#16A34A', '#CA8A04', '#DC2626'];
  const ROTULO_PODER = { normal: 'Tiro normal', duplo: '⚡ Tiro duplo', cruz: '✚ Tiro em cruz', x: '✖ Tiro em X', torpedo: '🚀 Torpedo',
                         mover: '⚓ Mover navio', radar3: '📡 Radar 3×3', radar4: '📡 Radar 4×4' };
  const CHAVE_SENHA = 'bnt-senha', CHAVE_NOME = 'bnt-nome', CHAVE_ID = 'bnt-id', CHAVE_FICHA = 'bnt-ficha';

  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function apagar(k) { try { localStorage.removeItem(k); } catch (e) { /* sem armazenamento */ } }
  function nomeTime(id) { return 'Time ' + NOMES_TIMES[id]; }
  function criarEl(tag, texto, classe) {
    const e = document.createElement(tag);
    if (texto !== undefined && texto !== null) e.textContent = texto;
    if (classe) e.className = classe;
    return e;
  }
  function limpar(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function meuId() {
    let id = ler(CHAVE_ID);
    if (!id) { id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); gravar(CHAVE_ID, id); }
    return id;
  }

  // ---------------- estado ----------------
  let carteiroAntigo = null;   // só para conferir a senha da turma (as regras do jogo atual já existem)
  let carteiro = null;
  let senha = null, codigo = null, conexao = null, config = null, souAnfitriao = false, anfitriao = null;
  let jogadores = {}, naviosSala = {}, publico = null, bancos = [];
  let relogioTela = null;
  let tabPos = null;
  let tabs = {};   // id do time -> tabuleiro desenhado (os 4 mares ficam na tela ao mesmo tempo)
  let navioSel = null, orientacaoSel = 'h';
  let ultimaChaveFase = null, rodadaRespondida = 0;
  let alvoSel = null, mira = null, poderSel = 'normal', trocarSel = null, verticalSel = false;
  let moverNavioSel = null, moverOri = 'h', moverEnviado = null, ultimaMov = null;
  let popupRodada = 0;
  let campoPergunta = null, enviarPergunta = null, timerEnvioAuto = null;
  let radares = {};   // alvo (id do time) -> [{ casas, tem, poder, rodada }] dos radares do MEU time

  function eu() { return { id: meuId(), nome: ($('nome').value || ler(CHAVE_NOME) || 'Aluno').trim().slice(0, 20) || 'Aluno' }; }
  function meuTime() { const j = jogadores[meuId()]; return j && j.time ? j.time : 0; }
  function agora() { return conexao ? conexao.horaServidor() : Date.now(); }

  // ---------------- início ----------------
  function mostrarSenha(erro) { $('senha-erro').textContent = erro || ''; Tela.mostrar('tela-senha'); }
  function mostrarInicio() { $('nome').value = ler(CHAVE_NOME) || ''; Tela.mostrar('tela-inicio'); }

  async function conferirSenha(texto) {
    const s = Sala.normalizarSenha(texto);
    if (!s) return { ok: false, erro: 'A senha tem de 4 a 30 letras minúsculas ou números.' };
    try {
      if (!(await carteiroAntigo.verificarSenha(s))) return { ok: false, erro: 'Senha da turma não aceita.' };
      return { ok: true, senha: s };
    } catch (e) { return { ok: false, erro: 'Sem conexão com o Firebase. Tente de novo.' }; }
  }

  $('form-senha').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const r = await conferirSenha($('senha').value);
    if (!r.ok) { $('senha-erro').textContent = r.erro; return; }
    senha = r.senha; gravar(CHAVE_SENHA, senha);
    mostrarInicio();
  });
  $('btn-trocar-senha').addEventListener('click', function () { apagar(CHAVE_SENHA); apagar(CHAVE_FICHA); mostrarSenha(''); });
  Array.prototype.forEach.call(document.querySelectorAll('.btn-voltar-inicio'), function (b) { b.addEventListener('click', mostrarInicio); });

  function nomeValido() {
    const n = $('nome').value.trim();
    if (!n) { $('inicio-erro').textContent = 'Escreva o seu nome.'; return false; }
    gravar(CHAVE_NOME, n.slice(0, 20));
    $('inicio-erro').textContent = '';
    return true;
  }

  // ---------------- criar sala ----------------
  for (let s = 5; s <= 15; s++) { const o = criarEl('option', s + ' segundos'); o.value = String(s); if (s === 10) o.selected = true; $('segundos').appendChild(o); }
  function atualizarOpcoesTurbo() {
    const turbo = document.querySelector('input[name=tiro]:checked').value === 'turbo';
    $('linha-limiares').hidden = !turbo;
    $('linha-torpedos').hidden = !(turbo && document.querySelector('input[name=modo]:checked').value === 'classico');
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name=tiro], input[name=modo]'), function (r) { r.addEventListener('change', atualizarOpcoesTurbo); });

  async function carregarBancos() {
    if (bancos.length) return;
    $('avisos-bancos').textContent = '';
    bancos = await Perguntas.carregarBancos(BANCOS, '../batalha-naval/bancos/');
    limpar($('banco'));
    bancos.forEach(function (b) {
      if (b.erro) { $('avisos-bancos').appendChild(criarEl('li', b.arquivo + ': ' + b.erro)); return; }
      const o = criarEl('option', b.titulo + ' (' + b.perguntas.length + ')'); o.value = b.arquivo; $('banco').appendChild(o);
    });
  }

  $('btn-criar').addEventListener('click', async function () {
    if (!nomeValido()) return;
    $('criar-erro').textContent = '';
    Tela.mostrar('tela-criar');
    await carregarBancos();
  });
  $('btn-entrar').addEventListener('click', function () { if (nomeValido()) { $('entrar-erro').textContent = ''; Tela.mostrar('tela-entrar'); } });

  $('form-criar').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (!$('banco').value) { $('criar-erro').textContent = 'Escolha um banco de perguntas.'; return; }
    const cfg = {
      banco: $('banco').value, segundos: Number($('segundos').value),
      modo: document.querySelector('input[name=modo]:checked').value,
      tiro: document.querySelector('input[name=tiro]:checked').value,
      resposta: document.querySelector('input[name=resposta]:checked').value,
      limiarDuplo: Math.max(1, Number($('limiar-duplo').value) || 3), limiarCruz: Math.max(1, Number($('limiar-cruz').value) || 6),
      torpedos: $('linha-torpedos').hidden ? 0 : Number($('torpedos').value) || 0
    };
    try {
      const j = eu();
      codigo = await carteiro.criarSala(senha, cfg, j);
      config = cfg; souAnfitriao = true;
      gravar(CHAVE_FICHA, JSON.stringify({ senha: senha, codigo: codigo }));
      abrirSala();
    } catch (e) { $('criar-erro').textContent = e.message; }
  });

  $('form-entrar').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const cod = $('codigo').value.trim();
    try {
      const j = eu();
      const r = await carteiro.entrarNaSala(senha, cod, j);
      codigo = cod; config = r.config; souAnfitriao = r.anfitriao === j.id;
      gravar(CHAVE_FICHA, JSON.stringify({ senha: senha, codigo: codigo }));
      abrirSala();
    } catch (e) { $('entrar-erro').textContent = e.message; }
  });

  // ---------------- sala ----------------
  function abrirSala() {
    const j = eu();
    conexao = carteiro.abrir(senha, codigo, j);
    conexao.aoConexao(function (ligado) { $('sem-conexao').hidden = ligado; });
    conexao.aoJogadores(function (obj) { jogadores = obj; if (!$('tela-sala').hidden) renderSala(); if (publico) renderBatalha(); });
    conexao.aoNavios(function (obj) { naviosSala = obj; if (!$('tela-sala').hidden) renderSala(); if (!$('tela-posicionar').hidden) renderPosicionar(); if (publico) renderTabuleiros(); });
    conexao.aoPublico(function (p) {
      publico = p;
      if (p.fase === 'fim') mostrarFim(); else { if ($('tela-batalha').hidden) Tela.mostrar('tela-batalha'); renderBatalha(); }
    });
    try { radares = JSON.parse(sessionStorage.getItem('bnt-radares-' + codigo)) || {}; } catch (e) { radares = {}; }
    $('sala-codigo').textContent = codigo;
    $('btn-iniciar').hidden = !souAnfitriao;
    Tela.mostrar('tela-sala');
    renderSala();
    if (souAnfitriao) tentarRetomar();
    if (!relogioTela) relogioTela = setInterval(atualizarTempo, 250);
  }

  function alunosDoTime(t) {
    return Object.keys(jogadores).filter(function (u) { return jogadores[u].time === t; })
      .sort(function (a, b) { return (jogadores[a].entrouEm || 0) - (jogadores[b].entrouEm || 0); });
  }

  function timePronto(t) {
    const n = naviosSala[t];
    return !!n && n.pronto === true && n.navios && Object.keys(n.navios).length === Regras.FROTA.length;
  }

  function podeIniciar() {
    const comAlunos = [1, 2, 3, 4].filter(function (t) { return alunosDoTime(t).length > 0; });
    return comAlunos.length >= 2 && comAlunos.every(timePronto);
  }

  function renderSala() {
    const total = Object.keys(jogadores).length;
    $('sala-contagem').textContent = total + ' de ' + SalaTimes.MAX_ALUNOS + ' jogadores' + (total >= SalaTimes.MAX_ALUNOS ? ' — sala cheia' : '');
    const caixa = $('sala-times');
    limpar(caixa);
    [1, 2, 3, 4, 0].forEach(function (t) {
      if (t === 0 && alunosDoTime(0).length === 0) return;
      const col = criarEl('div', null, 'time-col');
      col.style.setProperty('--cor-time', t === 0 ? '#6B7280' : CORES_TIMES[t]);
      col.appendChild(criarEl('h3', t === 0 ? 'Sem time ainda' : nomeTime(t)));
      const ul = criarEl('ul');
      alunosDoTime(t).forEach(function (u) {
        const li = criarEl('li', jogadores[u].nome + (u === meuId() ? ' (você)' : ''), (u === meuId() ? 'eu' : '') + (jogadores[u].conectado ? '' : ' off'));
        if (souAnfitriao && !publico) {
          const sel = criarEl('select');
          if (t === 0) { const o0 = criarEl('option', 'mover para...'); o0.value = '0'; o0.selected = true; sel.appendChild(o0); }
          [1, 2, 3, 4].forEach(function (x) { const o = criarEl('option', nomeTime(x)); o.value = String(x); if (x === t) o.selected = true; sel.appendChild(o); });
          sel.addEventListener('change', function () { if (Number(sel.value) > 0) conexao.moverJogador(u, Number(sel.value)); });
          li.appendChild(sel);
        }
        ul.appendChild(li);
      });
      col.appendChild(ul);
      if (t > 0 && alunosDoTime(t).length > 0) col.appendChild(criarEl('p', timePronto(t) ? '✓ navios prontos' : 'navios: aguardando', timePronto(t) ? 'pronto' : 'nao-pronto'));
      if (t > 0 && !publico && meuTime() !== t) {
        const b = criarEl('button', 'Entrar neste time', 'botao');
        b.type = 'button';
        b.addEventListener('click', function () { conexao.escolherTime(meuId(), t); });
        col.appendChild(b);
      }
      caixa.appendChild(col);
    });
    $('btn-posicionar').hidden = meuTime() === 0;
    $('btn-iniciar').disabled = !podeIniciar();
    $('sala-erro').textContent = souAnfitriao && !podeIniciar() ? 'Para iniciar: pelo menos 2 times com alunos, todos com os navios prontos.' : '';
  }

  $('btn-sair-sala').addEventListener('click', sairDaSala);
  $('btn-fim-sair').addEventListener('click', sairDaSala);
  function sairDaSala() {
    if (anfitriao) { anfitriao.encerrar(); anfitriao = null; }
    if (conexao) { conexao.fechar(); conexao = null; }
    apagar(CHAVE_FICHA);
    jogadores = {}; naviosSala = {}; radares = {}; publico = null; souAnfitriao = false; ultimaChaveFase = null; mira = null;
    mostrarInicio();
  }

  // ---------------- posicionar ----------------
  function navioDe(id) { return Regras.FROTA.find(function (n) { return n.id === id; }); }
  function meusNavios() { const n = naviosSala[meuTime()]; return n && n.navios ? n.navios : {}; }
  function souPronto() { const n = naviosSala[meuTime()]; return !!(n && n.pronto); }

  function gravarMeusNavios(navios, pronto) {
    naviosSala[meuTime()] = { navios: navios, pronto: !!pronto };   // aparece na hora; o Firebase confirma em seguida
    conexao.gravarNavios(meuTime(), navios, pronto);
    if (!$('tela-posicionar').hidden) renderPosicionar();
  }

  $('btn-posicionar').addEventListener('click', function () {
    if (!tabPos) {
      tabPos = Tela.criarTabuleiro($('pos-tabuleiro'), { aoClicar: aoClicarPosicao, aoPassar: aoPassarPosicao, aoSair: function () { pintarPos(null); } });
      $('pos-tabuleiro').parentNode.style.setProperty('--casa', 'min(40px, calc((100vw - 60px) / 11))');
    }
    Tela.mostrar('tela-posicionar');
    renderPosicionar();
  });
  $('btn-pos-voltar').addEventListener('click', function () { Tela.mostrar('tela-sala'); renderSala(); });

  function proximoLivre(navios) {
    const livre = Regras.FROTA.find(function (n) { return !navios[n.id]; });
    return livre ? livre.id : null;
  }

  let ultimaPassada = null;

  function girarPosicao() {
    orientacaoSel = orientacaoSel === 'h' ? 'v' : 'h';
    renderPosicionar();
    if (ultimaPassada) aoPassarPosicao(ultimaPassada.l, ultimaPassada.c);
  }

  function aoClicarPosicao(l, c) {
    if (souPronto()) return;
    const navios = Object.assign({}, meusNavios());
    // Clicar em qualquer casa de um navio já colocado levanta o navio: depois é só escolher o novo lugar.
    const idNaCasa = Regras.navioNaCasa(navios, l, c);
    if (idNaCasa) {
      orientacaoSel = navios[idNaCasa].orientacao;
      delete navios[idNaCasa];
      navioSel = idNaCasa;
      $('pos-dica').textContent = 'Navio levantado: clique no mar para escolher o novo lugar (R gira).';
      gravarMeusNavios(navios, false);
      if (ultimaPassada) aoPassarPosicao(ultimaPassada.l, ultimaPassada.c);
      return;
    }
    if (!navioSel) { $('pos-dica').textContent = 'Escolha um navio da lista.'; return; }
    const novo = { l: l, c: c, orientacao: orientacaoSel, tamanho: navioDe(navioSel).tamanho };
    const motivo = Regras.podePosicionar(navios, navioSel, novo);
    if (motivo) { $('pos-dica').textContent = 'Não dá: ' + motivo + '.'; return; }
    navios[navioSel] = novo;
    $('pos-dica').textContent = '';
    navioSel = proximoLivre(navios);   // já deixa o próximo navio escolhido
    gravarMeusNavios(navios, false);
  }

  function renderPosicionar() {
    $('pos-titulo').textContent = 'Navios do ' + nomeTime(meuTime());
    const navios = meusNavios();
    const pronto = souPronto();
    if (!navioSel && !pronto) navioSel = proximoLivre(navios);
    const lista = $('pos-navios');
    limpar(lista);
    Regras.FROTA.forEach(function (n) {
      const b = criarEl('button', 'Navio de ' + n.tamanho + (navios[n.id] ? ' ✓' : ''), 'botao' + (navioSel === n.id ? ' ativo' : ''));
      b.type = 'button'; b.disabled = pronto;
      b.addEventListener('click', function () { navioSel = n.id; renderPosicionar(); });
      lista.appendChild(b);
    });
    $('pos-orientacao').textContent = orientacaoSel === 'h' ? 'deitado' : 'em pé';
    $('btn-pronto').disabled = Object.keys(navios).length !== Regras.FROTA.length;
    $('btn-pronto').textContent = pronto ? '✎ Desmarcar “Pronto” para mexer' : '✔ Pronto';
    ['btn-girar', 'btn-aleatorio', 'btn-limpar'].forEach(function (id) { $(id).disabled = pronto; });
    pintarPos(null);
  }

  // Prévia do navio sob o mouse, com todas as casas que ele ocupa: verde se cabe, vermelho se não cabe.
  function pintarPos(previa) {
    const pronto = souPronto();
    const op = { navios: meusNavios(), tiros: {}, clicavel: function () { return !pronto; } };
    if (previa) op.previa = previa;
    tabPos.pintar(op);
  }

  function aoPassarPosicao(l, c) {
    ultimaPassada = { l: l, c: c };
    if (souPronto() || !navioSel) return;
    if (Regras.navioNaCasa(meusNavios(), l, c)) { pintarPos(null); return; }   // em cima de um navio: clicar levanta
    const navio = { l: l, c: c, orientacao: orientacaoSel, tamanho: navioDe(navioSel).tamanho };
    pintarPos({ casas: Regras.casasDoNavio(navio), valida: Regras.podePosicionar(meusNavios(), navioSel, navio) === null });
  }
  $('btn-girar').addEventListener('click', girarPosicao);
  $('btn-aleatorio').addEventListener('click', function () { navioSel = null; gravarMeusNavios(Regras.gerarFrotaAleatoria(Math.random), false); });
  $('btn-limpar').addEventListener('click', function () { navioSel = null; gravarMeusNavios({}, false); });
  $('btn-pronto').addEventListener('click', function () { gravarMeusNavios(meusNavios(), !souPronto()); });

  // Tecla R gira o navio (no posicionamento e na etapa de movimento), a menos que o aluno esteja digitando.
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'r' && ev.key !== 'R') return;
    if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (!$('tela-posicionar').hidden) { ev.preventDefault(); girarPosicao(); return; }
    if (publico && movendoAtivo()) {
      ev.preventDefault();
      moverOri = moverOri === 'h' ? 'v' : 'h';
      renderBatalha();
      if (moverNavioSel && ultimaMov) pintarMar(meuTime(), previaMovimento(ultimaMov.l, ultimaMov.c));
    }
  });

  // ---------------- iniciar (anfitrião) ----------------
  function criarAnfitriao(perguntas, times) {
    return Anfitriao.criar({
      conexao: conexao, config: config, times: times, perguntas: perguntas, gracaMs: 1500,
      relogio: { agora: function () { return conexao.horaServidor(); },
                 agendar: function (fn, ms) { const h = setTimeout(fn, ms); return function () { clearTimeout(h); }; } }
    });
  }

  $('btn-iniciar').addEventListener('click', async function () {
    if (!podeIniciar() || anfitriao) return;
    await carregarBancos();
    const banco = bancos.find(function (b) { return b.arquivo === config.banco; });
    if (!banco || banco.erro) { $('sala-erro').textContent = 'O banco de perguntas não pôde ser carregado.'; return; }
    const times = [1, 2, 3, 4].filter(function (t) { return alunosDoTime(t).length > 0; }).map(function (t) {
      return { id: t, nome: nomeTime(t), alunos: alunosDoTime(t), navios: naviosSala[t].navios };
    });
    anfitriao = criarAnfitriao(banco.perguntas, times);
    anfitriao.iniciar();
  });

  async function tentarRetomar() {
    try {
      const s = await conexao.lerEstado();
      if (!s) return;
      await carregarBancos();
      const banco = bancos.find(function (b) { return b.arquivo === config.banco; });
      if (!banco || banco.erro) return;
      anfitriao = criarAnfitriao(banco.perguntas, []);
      await anfitriao.retomar();
    } catch (e) { console.warn('não foi possível retomar', e); }
  }

  $('btn-pausar').addEventListener('click', function () { if (anfitriao) anfitriao.pausar(); });
  $('btn-retomar').addEventListener('click', function () { if (anfitriao) anfitriao.retomar(); });
  $('btn-encerrar').addEventListener('click', function () { if (anfitriao && confirm('Encerrar a partida para todos?')) anfitriao.encerrar(); });

  // ---------------- batalha ----------------
  function atualizarTempo() {
    if (!publico || publico.fase === 'fim' || publico.fase === 'espera') { $('bat-tempo').textContent = ''; return; }
    if (publico.pausada) { $('bat-tempo').textContent = '⏸'; return; }
    const ms = publico.ate - agora();
    $('bat-tempo').textContent = '⏱ ' + Math.max(0, Math.ceil(ms / 1000)) + ' s';
  }

  const TEXTO_FASE = { pergunta: 'Responda a pergunta!', ataque: 'Hora de atacar!', movimento: 'Movimento de navios!', resultado: 'Resultado da rodada' };

  function renderBatalha() {
    if (!publico) return;
    const p = publico, t = meuTime(), meu = t ? p.times[t] : null;
    $('bat-rodada').textContent = 'Rodada ' + p.rodada;
    $('bat-fase').textContent = TEXTO_FASE[p.fase] || '';
    $('bat-pausa').hidden = !p.pausada;
    $('bat-anfitriao').hidden = !souAnfitriao;
    $('btn-pausar').hidden = !!p.pausada;
    $('btn-retomar').hidden = !p.pausada;
    atualizarTempo();

    const chave = p.rodada + ':' + p.fase;
    const mudou = chave !== ultimaChaveFase;
    if (mudou) {
      ultimaChaveFase = chave;
      if (p.fase === 'pergunta') { mira = null; poderSel = 'normal'; trocarSel = null; verticalSel = false; alvoSel = null; moverNavioSel = null; moverEnviado = null; }
      if (p.fase === 'movimento') { moverNavioSel = null; }
    }

    $('bat-pergunta').hidden = !(p.fase === 'pergunta' && meu && meu.vivo);
    $('bat-ataque').hidden = !(p.fase === 'ataque' && meu && meu.vivo);
    if (mudou && p.fase === 'pergunta') { montarPergunta(); $('radar-aviso').hidden = true; }
    if (p.fase === 'ataque') montarAtaque();
    if (mudou && p.fase === 'ataque') talvezMostrarEscolha();
    if (p.fase !== 'ataque') $('poder-escolha').hidden = true;
    renderMovimento();

    let msg = '';
    if (!meu) msg = 'Você está só assistindo (não está em nenhum time).';
    else if (!meu.vivo) msg = 'Seu time foi eliminado. Você continua acompanhando a partida.';
    else if (p.fase === 'ataque' && meu.acertou === false) msg = 'Seu time errou a pergunta e não ataca nesta rodada.';
    else if (p.fase === 'resultado' && meu.acertou === false) msg = 'Seu time errou a pergunta nesta rodada.';
    $('bat-mensagem').textContent = msg;

    renderEventos();
    renderTabuleiros();
    renderPlacar($('bat-placar'), false);
    agendarEnvioAutomatico();
  }

  // Quando o tempo acaba, o que o aluno já digitou e ainda não enviou é enviado sozinho (e vale se estiver certo).
  function agendarEnvioAutomatico() {
    clearTimeout(timerEnvioAuto);
    if (!publico || publico.fase !== 'pergunta' || publico.pausada || !campoPergunta || rodadaRespondida === publico.rodada) return;
    const rodada = publico.rodada;
    timerEnvioAuto = setTimeout(function () {
      if (!publico || publico.fase !== 'pergunta' || publico.pausada || publico.rodada !== rodada || rodadaRespondida === rodada || !campoPergunta) return;
      const texto = campoPergunta.value.trim();
      campoPergunta.disabled = true;   // acabou o tempo: não dá mais para digitar
      if (texto) enviarPergunta(texto);
    }, Math.max(0, publico.ate - agora()));
  }

  function montarPergunta() {
    const caixa = $('bat-pergunta');
    limpar(caixa);
    const pr = publico.pergunta;
    campoPergunta = null; enviarPergunta = null;
    caixa.appendChild(criarEl('p', pr.texto, 'conta-pergunta'));
    if (rodadaRespondida === publico.rodada) { caixa.appendChild(criarEl('p', '✔ Resposta enviada. Aguarde...', 'feedback')); return; }
    const enviar = function (texto) {
      rodadaRespondida = publico.rodada;
      conexao.enviarResposta(publico.rodada, texto);
      limpar(caixa);
      caixa.appendChild(criarEl('p', pr.texto, 'conta-pergunta'));
      caixa.appendChild(criarEl('p', '✔ Resposta enviada. Aguarde...', 'feedback'));
    };
    if (pr.tipo === 'escolha') {
      const g = criarEl('div', null, 'opcoes-times');
      pr.opcoes.forEach(function (o) {
        const b = criarEl('button', o, 'botao'); b.type = 'button';
        b.addEventListener('click', function () { enviar(o); });
        g.appendChild(b);
      });
      caixa.appendChild(g);
    } else {
      const f = criarEl('form'); const i = criarEl('input'); i.type = 'text'; i.autocomplete = 'off'; i.setAttribute('inputmode', 'decimal');
      const b = criarEl('button', 'Enviar', 'botao principal'); b.type = 'submit';
      f.appendChild(i); f.appendChild(b);
      campoPergunta = i; enviarPergunta = enviar;
      f.addEventListener('submit', function (ev) { ev.preventDefault(); if (i.value.trim()) enviar(i.value.trim()); });
      caixa.appendChild(f);
      i.focus();
    }
  }

  function trocasDoTime(meu) {
    const t = meuTime();
    return JuizTimes.trocasPossiveis({ config: config, times: (function () { const o = {}; o[t] = { sequencia: meu.sequencia }; return o; })() }, t);
  }

  const DICA_PODER = { duplo: 'atinge 2 casas seguidas', cruz: 'atinge 5 casas em cruz', x: 'atinge 5 casas em X',
                       mover: 'move um navio seu (etapa extra com mais tempo; os outros times são avisados)',
                       radar3: 'diz se há navio numa área 3×3', radar4: 'diz se há navio numa área 4×4' };

  function navioIntacto(navio, meu) {
    return Regras.casasDoNavio(navio).every(function (k) { return meu.tiros[Regras.chave(k.l, k.c)] !== 'acerto'; });
  }

  // O que o meu time decidiu nesta rodada (poder, troca da sequência, alvo). Sempre reenviado inteiro quando algo muda.
  function enviarEscolha() {
    if (!publico) return;
    const doc = { poder: poderSel, vertical: verticalSel };
    if (trocarSel) doc.trocar = trocarSel;
    if (mira && poderSel !== 'mover') { doc.alvo = mira.alvo; doc.l = mira.l; doc.c = mira.c; }
    conexao.enviarAtaque(publico.rodada, meuTime(), doc);
  }

  // Escolha de poder quando a sequência chega a um nível (e de novo ao chegar no próximo).
  function talvezMostrarEscolha() {
    const t = meuTime(), meu = t && publico ? publico.times[t] : null;
    if (!meu || !meu.vivo || meu.acertou !== true || config.tiro !== 'turbo' || popupRodada === publico.rodada) return;
    if (meu.sequencia !== config.limiarDuplo && meu.sequencia !== config.limiarCruz) return;
    const opcoes = trocasDoTime(meu);
    if (opcoes.length === 0) return;
    popupRodada = publico.rodada;
    if (meu.vezDe !== meuId()) return;   // só quem escolhe nesta rodada decide; os outros veem o aviso no painel
    $('poder-titulo').textContent = '🎉 Sequência de ' + meu.sequencia + ' acertos!';
    $('poder-sub').textContent = 'Troque a sequência por um poder. Você pode usar agora ou guardar para depois (errar uma pergunta zera a sequência, mas o poder guardado fica).';
    const caixa = $('poder-botoes');
    limpar(caixa);
    opcoes.forEach(function (p) {
      const linha = criarEl('div', null, 'poder-linha');
      const nome = criarEl('div'); nome.appendChild(criarEl('b', ROTULO_PODER[p])); nome.appendChild(criarEl('small', DICA_PODER[p]));
      const botoes = criarEl('div', null, 'botoes');
      const agoraBtn = criarEl('button', 'Usar agora', 'botao principal'); agoraBtn.type = 'button';
      const guardarBtn = criarEl('button', 'Guardar', 'botao'); guardarBtn.type = 'button';
      const escolher = function (usarAgora) {
        trocarSel = p; poderSel = usarAgora ? p : 'normal'; mira = null;
        $('poder-escolha').hidden = true;
        montarAtaque(); renderTabuleiros(); enviarEscolha();
      };
      agoraBtn.addEventListener('click', function () { escolher(true); });
      guardarBtn.addEventListener('click', function () { escolher(false); });
      botoes.appendChild(agoraBtn); botoes.appendChild(guardarBtn);
      linha.appendChild(nome); linha.appendChild(botoes);
      caixa.appendChild(linha);
    });
    $('poder-escolha').hidden = false;
  }
  $('poder-pular').addEventListener('click', function () { $('poder-escolha').hidden = true; });

  function montarAtaque() {
    const caixa = $('bat-ataque');
    limpar(caixa);
    const t = meuTime(), meu = t ? publico.times[t] : null;
    if (!meu || !meu.vivo || meu.acertou !== true) return;
    if (meu.vezDe !== meuId()) {
      const j = jogadores[meu.vezDe];
      caixa.appendChild(criarEl('p', '✔ Seu time acertou! Quem escolhe o alvo agora: ' + (j ? j.nome : 'um colega'), 'feedback'));
      if (config.tiro === 'turbo' && trocasDoTime(meu).length > 0) caixa.appendChild(criarEl('p', '🎁 Seu time tem sequência para trocar por um poder: quem escolhe decide.', 'dica'));
      return;
    }
    caixa.appendChild(criarEl('p', poderSel === 'mover' ? '⚓ Você vai mover um navio: na próxima etapa terá mais tempo para escolher qual e onde.' : 'Sua vez de escolher! Clique no mar do adversário que quer atacar.', 'feedback'));
    if (config.tiro === 'turbo') {
      const poderes = criarEl('div', null, 'poderes-times');
      const opcoesPoder = [{ p: 'normal', rotulo: ROTULO_PODER.normal, trocar: null }];
      ['duplo', 'cruz', 'x', 'mover', 'radar3', 'radar4'].forEach(function (p) {
        if (meu.arsenal[p] > 0) opcoesPoder.push({ p: p, rotulo: ROTULO_PODER[p] + ' (guardado: ' + meu.arsenal[p] + ')', trocar: null });
        else if (trocarSel === p) opcoesPoder.push({ p: p, rotulo: ROTULO_PODER[p] + ' (da sua sequência)', trocar: p });
        else if (trocasDoTime(meu).indexOf(p) >= 0) opcoesPoder.push({ p: p, rotulo: ROTULO_PODER[p] + ' — gastar a sequência', trocar: p });
      });
      if (meu.torpedos > 0) opcoesPoder.push({ p: 'torpedo', rotulo: ROTULO_PODER.torpedo + ' (restam ' + meu.torpedos + ')', trocar: null });
      opcoesPoder.forEach(function (o) {
        const b = criarEl('button', o.rotulo, 'botao' + (poderSel === o.p ? ' ativo' : '')); b.type = 'button';
        b.addEventListener('click', function () {
          poderSel = o.p; if (o.trocar) trocarSel = o.trocar; mira = null;
          montarAtaque(); renderTabuleiros(); enviarEscolha();
        });
        poderes.appendChild(b);
      });
      if (poderSel === 'duplo') {
        const g = criarEl('button', '↻ Girar o duplo: ' + (verticalSel ? 'em pé' : 'deitado'), 'botao'); g.type = 'button';
        g.addEventListener('click', function () { verticalSel = !verticalSel; mira = null; montarAtaque(); renderTabuleiros(); enviarEscolha(); });
        poderes.appendChild(g);
      }
      caixa.appendChild(poderes);
      if (trocarSel) {
        const linha = criarEl('p', null, 'guardado');
        linha.appendChild(document.createTextNode('🎁 Sequência trocada por ' + ROTULO_PODER[trocarSel] + ': ' + (poderSel === trocarSel ? 'vai usar agora. ' : 'fica guardado no arsenal. ')));
        const des = criarEl('button', 'Desfazer troca', 'botao'); des.type = 'button';
        des.addEventListener('click', function () { if (poderSel === trocarSel) poderSel = 'normal'; trocarSel = null; mira = null; montarAtaque(); renderTabuleiros(); enviarEscolha(); });
        linha.appendChild(des);
        caixa.appendChild(linha);
      }
      caixa.appendChild(criarEl('p', 'Sequência do time: ' + meu.sequencia, 'dica'));
    }
    if (mira) caixa.appendChild(criarEl('p', 'Alvo marcado: ' + Regras.nomeCasa(mira.l, mira.c) + ' no ' + nomeTime(mira.alvo) + '. Pode mudar até o tempo acabar.', 'mensagem'));
  }

  // Clicar no mar de outro time escolhe o alvo do ataque; clicar no meu mar só serve na etapa de movimento.
  function aoClicarMar(t, l, c) {
    if (t === meuTime()) { aoClicarMeuMar(l, c); return; }
    if (!ataquePossivel() || poderSel === 'mover') return;
    const dados = publico.times[t];
    if (!dados || !dados.vivo) return;
    if (dados.tiros[Regras.chave(l, c)] && !ehRadar()) return;
    alvoSel = t;
    mira = { alvo: t, l: l, c: c };
    enviarEscolha();
    montarAtaque();
    renderTabuleiros();
  }

  function ehRadar() { return poderSel === 'radar3' || poderSel === 'radar4'; }

  // ---- etapa de movimento: tempo extra; clicar em qualquer casa de um navio o levanta, depois clicar no novo lugar ----
  function movendoAtivo() {
    const t = meuTime(), meu = t && publico ? publico.times[t] : null;
    return !!(publico && publico.fase === 'movimento' && meu && meu.vivo && (publico.movedores || []).indexOf(t) >= 0 && meu.vezDe === meuId() && !publico.pausada);
  }

  // Meus navios como eu os vejo: com o navio levantado fora do mar e o já movido no novo lugar.
  function naviosMostrados() {
    const t = meuTime();
    const base = Object.assign({}, naviosSala[t] ? naviosSala[t].navios || {} : {});
    if (publico && publico.fase === 'movimento' && movendoAtivo()) {
      if (moverEnviado && base[moverEnviado.navio]) {
        base[moverEnviado.navio] = { l: moverEnviado.l, c: moverEnviado.c, orientacao: moverEnviado.orientacao, tamanho: base[moverEnviado.navio].tamanho };
      }
      if (moverNavioSel) delete base[moverNavioSel];
    }
    return base;
  }

  function naviosOriginais() { return naviosSala[meuTime()] ? naviosSala[meuTime()].navios || {} : {}; }

  function motivoMovimento(navios, id, novo) {
    const meu = publico.times[meuTime()];
    const m = Regras.podePosicionar(navios, id, novo);
    if (m) return m;
    if (Regras.casasDoNavio(novo).some(function (k) { return meu.tiros[Regras.chave(k.l, k.c)]; })) return 'casa onde já atiraram';
    return null;
  }

  function aoClicarMeuMar(l, c) {
    if (!movendoAtivo()) return;
    const t = meuTime(), meu = publico.times[t];
    const navios = naviosMostrados();
    const idNaCasa = Regras.navioNaCasa(navios, l, c);
    if (idNaCasa) {
      if (!navioIntacto(navios[idNaCasa], meu)) { $('bat-mensagem').textContent = 'Esse navio já foi atingido e não pode mudar de lugar.'; return; }
      moverOri = navios[idNaCasa].orientacao;
      moverNavioSel = idNaCasa;
      $('bat-mensagem').textContent = '';
      renderBatalha();
      return;
    }
    if (!moverNavioSel) { $('bat-mensagem').textContent = 'Clique em qualquer casa de um navio seu para levantá-lo.'; return; }
    const novo = { l: l, c: c, orientacao: moverOri, tamanho: naviosOriginais()[moverNavioSel].tamanho };
    const motivo = motivoMovimento(navios, moverNavioSel, novo);
    if (motivo) { $('bat-mensagem').textContent = 'Não dá: ' + motivo + '.'; return; }
    moverEnviado = { navio: moverNavioSel, l: l, c: c, orientacao: moverOri };
    moverNavioSel = null;
    const doc = { poder: 'mover', mover: moverEnviado };
    if (trocarSel) doc.trocar = trocarSel;
    conexao.enviarAtaque(publico.rodada, t, doc);
    $('bat-mensagem').textContent = '';
    renderBatalha();
  }

  function previaMovimento(l, c) {
    const navios = naviosMostrados();
    const novo = { l: l, c: c, orientacao: moverOri, tamanho: naviosOriginais()[moverNavioSel].tamanho };
    return { casas: Regras.casasDoNavio(novo), valida: motivoMovimento(navios, moverNavioSel, novo) === null };
  }

  function renderMovimento() {
    const bm = $('bat-movimento');
    bm.hidden = !publico || publico.fase !== 'movimento';
    if (bm.hidden) return;
    limpar(bm);
    const t = meuTime(), quem = publico.movedores || [];
    const nomes = quem.map(nomeTime).join(' e ');
    if (movendoAtivo()) {
      bm.appendChild(criarEl('p', '⚓ Sua vez de mover! Clique em qualquer casa de um navio seu para levantá-lo e depois no novo lugar. R gira.', 'feedback'));
      bm.appendChild(criarEl('p', moverNavioSel ? 'Navio levantado (' + (moverOri === 'h' ? 'deitado' : 'em pé') + '): escolha o novo lugar no SEU mar.'
        : moverEnviado ? '✔ Navio colocado em ' + Regras.nomeCasa(moverEnviado.l, moverEnviado.c) + '. Pode trocar de ideia até o tempo acabar.' : 'Nenhum navio levantado ainda.', 'mensagem'));
    } else if (quem.indexOf(t) >= 0) {
      const j = publico.times[t] ? jogadores[publico.times[t].vezDe] : null;
      bm.appendChild(criarEl('p', '⚓ ' + (j ? j.nome : 'Seu colega') + ' está movendo um navio do seu time...', 'feedback'));
    } else {
      bm.appendChild(criarEl('p', '⚓ ' + nomes + (quem.length > 1 ? ' estão' : ' está') + ' mudando um navio de lugar... aguarde, o tempo da rodada está maior.', 'feedback'));
      bm.appendChild(criarEl('p', 'Os radares que você já usou nesse time ficam desatualizados.', 'dica'));
    }
  }

  function previaDe(l, c) {
    const casas = JuizTimes.casasDoPoder(poderSel, l, c, verticalSel).map(function (ch) { const p = ch.split(',').map(Number); return { l: p[0], c: p[1] }; });
    return { casas: casas, valida: true, radar: ehRadar() };
  }

  function ataquePossivel() {
    const t = meuTime(), meu = t && publico ? publico.times[t] : null;
    return !!(publico && publico.fase === 'ataque' && meu && meu.vivo && meu.acertou === true && meu.vezDe === meuId() && !publico.pausada);
  }

  // Como pintar o mar do time t: o meu mostra meus navios; os outros só os tiros que já levaram.
  function opMar(t, previa) {
    const dados = publico.times[t];
    if (t === meuTime()) {
      const op = { navios: naviosMostrados(), tiros: dados.tiros, afundadas: dados.afundadas, clicavel: function () { return movendoAtivo(); } };
      if (previa) op.previa = previa;
      return op;
    }
    const op = { tiros: dados.tiros, afundadas: dados.afundadas,
                 clicavel: function (l, c) { return ataquePossivel() && poderSel !== 'mover' && dados.vivo && (ehRadar() || !dados.tiros[Regras.chave(l, c)]); } };
    if (previa) op.previa = previa;
    if (mira && mira.alvo === t) op.mirada = Regras.chave(mira.l, mira.c);
    return op;
  }

  function pintarMar(t, previa) { tabs[t].pintar(opMar(t, previa)); marcarRadares(t); }

  function renderTabuleiros() {
    const meuT = meuTime();
    [1, 2, 3, 4].forEach(function (t) {
      const dados = publico.times[t];
      $('mar-' + t).hidden = !dados;
      if (!dados) return;
      if (!tabs[t]) {
        tabs[t] = Tela.criarTabuleiro($('mar-tab-' + t), {
          aoClicar: function (l, c) { aoClicarMar(t, l, c); },
          aoPassar: function (l, c) {
            if (t === meuTime()) { ultimaMov = { l: l, c: c }; if (movendoAtivo() && moverNavioSel && !Regras.navioNaCasa(naviosMostrados(), l, c)) pintarMar(t, previaMovimento(l, c)); }
            else if (ataquePossivel() && poderSel !== 'mover') pintarMar(t, previaDe(l, c));
          },
          aoSair: function () { if (publico && publico.times[t]) pintarMar(t, null); }
        });
      }
      $('mar-titulo-' + t).textContent = (t === meuT ? 'Meu mar — ' : 'Mar do ') + nomeTime(t) + (dados.vivo ? '' : ' (eliminado)');
      $('mar-' + t).classList.toggle('meu-mar', t === meuT);
      $('mar-' + t).classList.toggle('eliminado', !dados.vivo);
      pintarMar(t, null);
    });
    faixaRadar();
  }

  let ultimoEventoRodada = 0;
  function renderEventos() {
    const ul = $('bat-eventos');
    limpar(ul);
    if (publico.fase !== 'resultado' && publico.fase !== 'fim') return;
    (publico.eventos || []).forEach(function (e) {
      let texto = nomeTime(e.atacante) + ' atacou ' + nomeTime(e.alvo);
      if (e.ignorado && e.alvo === e.atacante) texto = nomeTime(e.atacante) + ' tentou mover um navio, mas não deu.';
      else if (e.ignorado) texto += ': ataque sem efeito.';
      else if (e.poder === 'mover') texto = nomeTime(e.atacante) + ' reorganizou os navios ⚓';
      else if (e.radar) {
        texto = nomeTime(e.atacante) + ' usou ' + ROTULO_PODER[e.poder] + ' em ' + nomeTime(e.alvo);
        if (e.atacante === meuTime()) texto += ': ' + (e.tem ? '🟢 há navio na área!' : '⚪ nenhum navio na área.');
      } else {
        const nomes = e.casas.map(function (ch) { const p = ch.split(',').map(Number); return Regras.nomeCasa(p[0], p[1]); }).join(', ');
        texto += ' em ' + nomes + (e.poder !== 'normal' ? ' (' + ROTULO_PODER[e.poder] + ')' : '') + ': ' +
          (e.afundou ? '💥 afundou um navio!' : e.acertos.length ? '🔥 acertou!' : '🌊 água.');
      }
      ul.appendChild(criarEl('li', texto));
    });
    if ((publico.eventos || []).length === 0) ul.appendChild(criarEl('li', 'Nenhum time atacou nesta rodada.'));
    if (publico.rodada !== ultimoEventoRodada && publico.fase === 'resultado') {
      ultimoEventoRodada = publico.rodada;
      const ev = publico.eventos || [];
      ev.forEach(function (e) { if (e.poder === 'mover' && !e.ignorado && e.atacante !== meuTime()) marcarVelhos(e.atacante); });
      const meuRadar = ev.find(function (e) { return e.radar && e.atacante === meuTime(); });
      if (meuRadar) { Sons.tocar(meuRadar.tem ? 'radarTem' : 'radarNada'); guardarRadar(meuRadar); mostrarRadar(meuRadar); renderTabuleiros(); }
      else Sons.tocar(ev.some(function (e) { return e.afundou; }) ? 'afundou' : ev.some(function (e) { return e.acertos && e.acertos.length; }) ? 'explosao' : ev.length ? 'agua' : 'errado');
    }
  }

  let radarTimer = null;
  function guardarRadar(e) {
    radares[e.alvo] = (radares[e.alvo] || []).concat([{ casas: e.casas, tem: e.tem, poder: e.poder, rodada: publico.rodada }]);
    salvarRadares();
  }

  function salvarRadares() {
    try { sessionStorage.setItem('bnt-radares-' + codigo, JSON.stringify(radares)); } catch (x) { /* sem armazenamento */ }
  }

  // Um time mudou um navio de lugar: os radares que eu já tinha usado nele passam a ser só o retrato de antes.
  function marcarVelhos(timeId) {
    let mudou = false;
    (radares[timeId] || []).forEach(function (r) { if (r.rodada < publico.rodada && !r.velho) { r.velho = true; mudou = true; } });
    if (mudou) salvarRadares();
  }

  // Deixa as casas dos radares já usados coloridas no mar de cada adversário.
  function marcarRadares(t) {
    (radares[t] || []).forEach(function (r) {
      r.casas.forEach(function (ch) {
        const p = ch.split(',').map(Number);
        const b = $('mar-tab-' + t).querySelector('button[aria-label="' + Regras.nomeCasa(p[0], p[1]) + '"]');
        if (b) { b.classList.remove('radar-tem', 'radar-nao', 'radar-velho'); b.classList.add(r.tem ? 'radar-tem' : 'radar-nao'); if (r.velho) b.classList.add('radar-velho'); }
      });
    });
  }

  // Faixa fixa com o resultado do último radar do meu time (em qualquer adversário).
  function faixaRadar() {
    const msg = $('bat-radar-msg');
    let ultimo = null, alvo = null;
    Object.keys(radares).forEach(function (t) {
      (radares[t] || []).forEach(function (r) { if (!ultimo || r.rodada >= ultimo.rodada) { ultimo = r; alvo = Number(t); } });
    });
    if (!ultimo) { msg.hidden = true; return; }
    const a = ultimo.casas[0].split(',').map(Number), z = ultimo.casas[ultimo.casas.length - 1].split(',').map(Number);
    msg.className = 'radar-msg ' + (ultimo.tem ? 'tem' : 'nao') + (ultimo.velho ? ' velho' : '');
    msg.textContent = '📡 ' + ROTULO_PODER[ultimo.poder] + ' no ' + nomeTime(alvo) + ' (' + Regras.nomeCasa(a[0], a[1]) + ' a ' + Regras.nomeCasa(z[0], z[1]) + '): ' + (ultimo.tem ? 'HÁ NAVIO na área' : 'NÃO HÁ NAVIO na área') + (ultimo.velho ? ' ⚠ O ' + nomeTime(alvo) + ' mudou um navio de lugar depois deste radar: use o radar de novo para atualizar.' : '');
    msg.hidden = false;
  }

  function mostrarRadar(e) {
    const caixa = $('radar-caixa');
    caixa.className = 'radar-caixa ' + (e.tem ? 'tem' : 'nao');
    $('radar-titulo').textContent = e.tem ? '📡 HÁ NAVIO!' : '📡 NÃO HÁ NAVIO!';
    const ch = e.casas[0].split(',').map(Number), fim = e.casas[e.casas.length - 1].split(',').map(Number);
    $('radar-sub').textContent = ROTULO_PODER[e.poder] + ' no ' + nomeTime(e.alvo) + ' (de ' + Regras.nomeCasa(ch[0], ch[1]) + ' até ' + Regras.nomeCasa(fim[0], fim[1]) + ')';
    $('radar-aviso').hidden = false;
    clearTimeout(radarTimer);
    radarTimer = setTimeout(function () { $('radar-aviso').hidden = true; }, 8000);
  }
  $('radar-aviso').addEventListener('click', function () { clearTimeout(radarTimer); $('radar-aviso').hidden = true; });

  function renderPlacar(tbody, soNavios) {
    limpar(tbody);
    Object.keys(publico.times).forEach(function (id) {
      const t = publico.times[id];
      const tr = criarEl('tr', null, t.vivo ? '' : 'fora');
      const nomes = (t.alunos || []).map(function (u) { return jogadores[u] ? jogadores[u].nome : '?'; }).join(', ');
      tr.appendChild(criarEl('td', nomeTime(id)));
      if (soNavios) { tr.appendChild(criarEl('td', String(t.naviosRestantes))); tbody.appendChild(tr); return; }
      tr.appendChild(criarEl('td', nomes));
      tr.appendChild(criarEl('td', String(t.naviosRestantes)));
      tr.appendChild(criarEl('td', String(t.sequencia)));
      tr.appendChild(criarEl('td', config.tiro === 'turbo' ? '⚡' + t.arsenal.duplo + ' ✚' + t.arsenal.cruz + ' ✖' + t.arsenal.x + ' ⚓' + t.arsenal.mover + ' 📡' + (t.arsenal.radar3 + t.arsenal.radar4) + (t.torpedos ? ' 🚀' + t.torpedos : '') : '—'));
      tbody.appendChild(tr);
    });
  }

  // ---------------- fim ----------------
  function mostrarFim() {
    const f = publico.fim || { vencedores: [], empate: false };
    if (f.encerrada) { $('fim-titulo').textContent = 'Partida encerrada'; $('fim-texto').textContent = 'O professor encerrou a partida.'; }
    else if (f.empate) { $('fim-titulo').textContent = '🤝 Empate!'; $('fim-texto').textContent = 'Empate entre: ' + f.vencedores.map(nomeTime).join(' e '); Sons.tocar('vitoria'); }
    else { $('fim-titulo').textContent = '🏆 ' + nomeTime(f.vencedores[0]) + ' venceu!'; $('fim-texto').textContent = 'Último time com navios no mar.'; Sons.tocar('vitoria'); }
    renderPlacar($('fim-placar'), true);
    Tela.mostrar('tela-fim');
  }

  // ---------------- som e partida ----------------
  $('btn-som').addEventListener('click', function () { $('btn-som').textContent = Sons.alternar() ? '🔊' : '🔇'; });

  async function iniciarApp() {
    carteiroAntigo = Sala.criar(FIREBASE_CONFIG);
    carteiro = SalaTimes.criar(FIREBASE_CONFIG);
    const guardada = ler(CHAVE_SENHA);
    if (guardada) { const r = await conferirSenha(guardada); if (r.ok) senha = r.senha; }
    if (!senha) { mostrarSenha(''); return; }
    let ficha = null;
    try { ficha = JSON.parse(ler(CHAVE_FICHA)); } catch (e) { ficha = null; }
    if (ficha && ficha.senha === senha && ficha.codigo) {
      try {
        const j = eu();
        const r = await carteiro.entrarNaSala(senha, ficha.codigo, j);
        codigo = ficha.codigo; config = r.config; souAnfitriao = r.anfitriao === j.id;
        abrirSala();
        return;
      } catch (e) { apagar(CHAVE_FICHA); }
    }
    mostrarInicio();
  }

  iniciarApp().catch(function (e) { $('carregando-texto').textContent = 'Erro ao carregar o jogo: ' + e.message; });
})();

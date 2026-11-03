// Cola das telas do jogo em times. Só DOM: as regras estão no JuizTimes e o relógio no Anfitrião.
// Todo texto que vem de alunos (nomes) entra na página com textContent, nunca com innerHTML.
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const NOMES_TIMES = ['', 'Azul', 'Verde', 'Amarelo', 'Vermelho'];
  const CORES_TIMES = ['', '#2563EB', '#16A34A', '#CA8A04', '#DC2626'];
  const ROTULO_PODER = { normal: 'Tiro normal', duplo: '⚡ Tiro duplo', cruz: '✚ Tiro em cruz', x: '✖ Tiro em X' };
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
  let tabPos = null, tabMeu = null, tabAlvo = null;
  let navioSel = null, orientacaoSel = 'h';
  let ultimaChaveFase = null, rodadaRespondida = 0;
  let alvoSel = null, mira = null, poderSel = 'normal', trocarSel = null, verticalSel = false;

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
  Array.prototype.forEach.call(document.querySelectorAll('input[name=tiro]'), function (r) {
    r.addEventListener('change', function () { $('linha-limiares').hidden = document.querySelector('input[name=tiro]:checked').value !== 'turbo'; });
  });

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
      limiarDuplo: Math.max(1, Number($('limiar-duplo').value) || 3), limiarCruz: Math.max(1, Number($('limiar-cruz').value) || 6)
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
    conexao.aoNavios(function (obj) { naviosSala = obj; if (!$('tela-sala').hidden) renderSala(); if (!$('tela-posicionar').hidden) renderPosicionar(); });
    conexao.aoPublico(function (p) {
      publico = p;
      if (p.fase === 'fim') mostrarFim(); else { if ($('tela-batalha').hidden) Tela.mostrar('tela-batalha'); renderBatalha(); }
    });
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
    jogadores = {}; naviosSala = {}; publico = null; souAnfitriao = false; ultimaChaveFase = null; mira = null;
    mostrarInicio();
  }

  // ---------------- posicionar ----------------
  function navioDe(id) { return Regras.FROTA.find(function (n) { return n.id === id; }); }
  function meusNavios() { const n = naviosSala[meuTime()]; return n && n.navios ? n.navios : {}; }
  function souPronto() { const n = naviosSala[meuTime()]; return !!(n && n.pronto); }

  function gravarMeusNavios(navios, pronto) { conexao.gravarNavios(meuTime(), navios, pronto); }

  $('btn-posicionar').addEventListener('click', function () {
    if (!tabPos) {
      tabPos = Tela.criarTabuleiro($('pos-tabuleiro'), { aoClicar: aoClicarMar });
      $('pos-tabuleiro').parentNode.style.setProperty('--casa', 'min(40px, calc((100vw - 60px) / 11))');
    }
    Tela.mostrar('tela-posicionar');
    renderPosicionar();
  });
  $('btn-pos-voltar').addEventListener('click', function () { Tela.mostrar('tela-sala'); renderSala(); });

  function aoClicarMar(l, c) {
    if (souPronto() || !navioSel) { if (!souPronto()) $('pos-dica').textContent = 'Escolha um navio da lista.'; return; }
    const navios = Object.assign({}, meusNavios());
    const novo = { l: l, c: c, orientacao: orientacaoSel, tamanho: navioDe(navioSel).tamanho };
    const motivo = Regras.podePosicionar(navios, navioSel, novo);
    if (motivo) { $('pos-dica').textContent = 'Não dá: ' + motivo + '.'; return; }
    navios[navioSel] = novo;
    $('pos-dica').textContent = '';
    gravarMeusNavios(navios, false);
    navioSel = null;
  }

  function renderPosicionar() {
    $('pos-titulo').textContent = 'Navios do ' + nomeTime(meuTime());
    const navios = meusNavios();
    const pronto = souPronto();
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
    tabPos.pintar({ navios: navios, tiros: {}, clicavel: function () { return !pronto; } });
  }
  $('btn-girar').addEventListener('click', function () { orientacaoSel = orientacaoSel === 'h' ? 'v' : 'h'; renderPosicionar(); });
  $('btn-aleatorio').addEventListener('click', function () { gravarMeusNavios(Regras.gerarFrotaAleatoria(Math.random), false); });
  $('btn-limpar').addEventListener('click', function () { gravarMeusNavios({}, false); });
  $('btn-pronto').addEventListener('click', function () { gravarMeusNavios(meusNavios(), !souPronto()); });

  // ---------------- iniciar (anfitrião) ----------------
  function criarAnfitriao(perguntas, times) {
    return Anfitriao.criar({
      conexao: conexao, config: config, times: times, perguntas: perguntas,
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

  const TEXTO_FASE = { pergunta: 'Responda a pergunta!', ataque: 'Hora de atacar!', resultado: 'Resultado da rodada' };

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
    if (mudou) { ultimaChaveFase = chave; if (p.fase === 'ataque') { mira = null; poderSel = 'normal'; trocarSel = null; verticalSel = false; alvoSel = null; } }

    $('bat-pergunta').hidden = !(p.fase === 'pergunta' && meu && meu.vivo);
    $('bat-ataque').hidden = !(p.fase === 'ataque' && meu && meu.vivo);
    if (mudou && p.fase === 'pergunta') montarPergunta();
    if (p.fase === 'ataque') montarAtaque();

    let msg = '';
    if (!meu) msg = 'Você está só assistindo (não está em nenhum time).';
    else if (!meu.vivo) msg = 'Seu time foi eliminado. Você continua acompanhando a partida.';
    else if (p.fase === 'ataque' && meu.acertou === false) msg = 'Seu time errou a pergunta e não ataca nesta rodada.';
    else if (p.fase === 'resultado' && meu.acertou === false) msg = 'Seu time errou a pergunta nesta rodada.';
    $('bat-mensagem').textContent = msg;

    renderEventos();
    renderTabuleiros();
    renderPlacar($('bat-placar'), false);
  }

  function montarPergunta() {
    const caixa = $('bat-pergunta');
    limpar(caixa);
    const pr = publico.pergunta;
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
      f.addEventListener('submit', function (ev) { ev.preventDefault(); if (i.value.trim()) enviar(i.value.trim()); });
      caixa.appendChild(f);
      i.focus();
    }
  }

  function trocasDoTime(meu) {
    if (config.tiro !== 'turbo') return [];
    return meu.sequencia >= config.limiarCruz ? ['cruz', 'x'] : meu.sequencia >= config.limiarDuplo ? ['duplo'] : [];
  }

  function adversarios() {
    const t = meuTime();
    return Object.keys(publico.times).map(Number).filter(function (id) { return id !== t && publico.times[id].vivo; });
  }

  function montarAtaque() {
    const caixa = $('bat-ataque');
    limpar(caixa);
    const t = meuTime(), meu = t ? publico.times[t] : null;
    if (!meu || !meu.vivo || meu.acertou !== true) return;
    if (meu.vezDe !== meuId()) {
      const j = jogadores[meu.vezDe];
      caixa.appendChild(criarEl('p', '✔ Seu time acertou! Quem escolhe o alvo agora: ' + (j ? j.nome : 'um colega'), 'feedback'));
      return;
    }
    caixa.appendChild(criarEl('p', 'Sua vez de escolher! Clique no mar do adversário.', 'feedback'));
    const advs = adversarios();
    if (!alvoSel || advs.indexOf(alvoSel) < 0) alvoSel = advs[0] || null;
    const linha = criarEl('div', null, 'poderes-times');
    advs.forEach(function (id) {
      const b = criarEl('button', nomeTime(id), 'botao' + (alvoSel === id ? ' ativo' : '')); b.type = 'button';
      b.addEventListener('click', function () { alvoSel = id; mira = null; montarAtaque(); renderTabuleiros(); });
      linha.appendChild(b);
    });
    caixa.appendChild(linha);
    if (config.tiro === 'turbo') {
      const poderes = criarEl('div', null, 'poderes-times');
      const opcoesPoder = [{ p: 'normal', rotulo: ROTULO_PODER.normal, trocar: null }];
      ['duplo', 'cruz', 'x'].forEach(function (p) {
        if (meu.arsenal[p] > 0) opcoesPoder.push({ p: p, rotulo: ROTULO_PODER[p] + ' (arsenal: ' + meu.arsenal[p] + ')', trocar: null });
        else if (trocasDoTime(meu).indexOf(p) >= 0) opcoesPoder.push({ p: p, rotulo: ROTULO_PODER[p] + ' — gastar a sequência', trocar: p });
      });
      opcoesPoder.forEach(function (o) {
        const b = criarEl('button', o.rotulo, 'botao' + (poderSel === o.p ? ' ativo' : '')); b.type = 'button';
        b.addEventListener('click', function () { poderSel = o.p; trocarSel = o.trocar; mira = null; montarAtaque(); renderTabuleiros(); });
        poderes.appendChild(b);
      });
      if (poderSel === 'duplo') {
        const g = criarEl('button', '↻ Girar o duplo: ' + (verticalSel ? 'em pé' : 'deitado'), 'botao'); g.type = 'button';
        g.addEventListener('click', function () { verticalSel = !verticalSel; mira = null; montarAtaque(); renderTabuleiros(); });
        poderes.appendChild(g);
      }
      caixa.appendChild(poderes);
      caixa.appendChild(criarEl('p', 'Sequência do time: ' + meu.sequencia, 'dica'));
    }
    if (mira) caixa.appendChild(criarEl('p', 'Alvo marcado: ' + Regras.nomeCasa(mira.l, mira.c) + ' no ' + nomeTime(mira.alvo) + '. Pode mudar até o tempo acabar.', 'mensagem'));
  }

  function aoClicarAlvo(l, c) {
    if (!publico || publico.fase !== 'ataque' || publico.pausada) return;
    const t = meuTime(), meu = t ? publico.times[t] : null;
    if (!meu || !meu.vivo || meu.acertou !== true || meu.vezDe !== meuId() || !alvoSel) return;
    if (publico.times[alvoSel].tiros[Regras.chave(l, c)]) return;
    mira = { alvo: alvoSel, l: l, c: c };
    const ataque = { alvo: alvoSel, l: l, c: c, poder: poderSel, vertical: verticalSel };
    if (trocarSel) ataque.trocar = trocarSel;
    conexao.enviarAtaque(publico.rodada, t, ataque);
    montarAtaque();
    renderTabuleiros();
  }

  function previaDe(l, c) {
    const casas = JuizTimes.casasDoPoder(poderSel, l, c, verticalSel).map(function (ch) { const p = ch.split(',').map(Number); return { l: p[0], c: p[1] }; });
    return { casas: casas, valida: true };
  }

  function renderTabuleiros() {
    const p = publico, t = meuTime();
    if (!tabMeu) {
      tabMeu = Tela.criarTabuleiro($('bat-meu'), {});
      tabAlvo = Tela.criarTabuleiro($('bat-alvo'), {
        aoClicar: aoClicarAlvo,
        aoPassar: function (l, c) { if (ataquePossivel()) tabAlvo.pintar(opAlvo(previaDe(l, c))); },
        aoSair: function () { tabAlvo.pintar(opAlvo(null)); }
      });
    }
    const meu = t ? p.times[t] : null;
    $('bat-titulo-meu').textContent = meu ? 'Meu mar (' + nomeTime(t) + ')' : 'Meu mar';
    tabMeu.pintar({ navios: t && naviosSala[t] ? naviosSala[t].navios : {}, tiros: meu ? meu.tiros : {}, afundadas: meu ? meu.afundadas : [] });
    const adv = alvoParaMostrar();
    $('bat-titulo-alvo').textContent = adv ? 'Mar do ' + nomeTime(adv) : 'Mar do adversário';
    tabAlvo.pintar(opAlvo(null));
  }

  function alvoParaMostrar() {
    const advs = adversarios();
    if (alvoSel && advs.indexOf(alvoSel) >= 0) return alvoSel;
    return advs[0] || null;
  }
  function ataquePossivel() {
    const t = meuTime(), meu = t && publico ? publico.times[t] : null;
    return !!(publico && publico.fase === 'ataque' && meu && meu.vivo && meu.acertou === true && meu.vezDe === meuId() && !publico.pausada);
  }
  function opAlvo(previa) {
    const adv = alvoParaMostrar();
    const dados = adv ? publico.times[adv] : null;
    const op = { tiros: dados ? dados.tiros : {}, afundadas: dados ? dados.afundadas : [],
                 clicavel: function (l, c) { return ataquePossivel() && !!dados && !dados.tiros[Regras.chave(l, c)]; } };
    if (previa) op.previa = previa;
    if (mira && mira.alvo === adv) op.mirada = Regras.chave(mira.l, mira.c);
    return op;
  }

  let ultimoEventoRodada = 0;
  function renderEventos() {
    const ul = $('bat-eventos');
    limpar(ul);
    if (publico.fase !== 'resultado' && publico.fase !== 'fim') return;
    (publico.eventos || []).forEach(function (e) {
      let texto = nomeTime(e.atacante) + ' atacou ' + nomeTime(e.alvo);
      if (e.ignorado) texto += ': ataque sem efeito.';
      else {
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
      Sons.tocar(ev.some(function (e) { return e.afundou; }) ? 'afundou' : ev.some(function (e) { return e.acertos && e.acertos.length; }) ? 'explosao' : ev.length ? 'agua' : 'errado');
    }
  }

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
      tr.appendChild(criarEl('td', config.tiro === 'turbo' ? '⚡' + t.arsenal.duplo + ' ✚' + t.arsenal.cruz + ' ✖' + t.arsenal.x : '—'));
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

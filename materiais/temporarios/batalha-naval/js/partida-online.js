// Partida online: liga a tela ao Cliente (cérebro do jogador) e à Sala (Firebase).
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const MS_RESULTADO_CERTO = 2500;   // tempo mostrando o resultado (água/acertou/afundou) antes de passar a vez sozinho
  const MS_RESULTADO_ERRADO = 1500;  // tempo mostrando "Errou!" / "Tempo esgotado!" antes de passar a vez sozinho
  const MS_PARA_ENCERRAR = 2 * 60 * 1000;
  const NOMES_NAVIOS = { n4: 'Navio de 4', n3a: 'Navio de 3', n3b: 'Navio de 3', n2: 'Navio de 2' };

  // ---------- Armazenamento local (nunca pode quebrar o jogo) ----------
  function ler(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; } }
  function gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ } }
  function apagar(chave) { try { localStorage.removeItem(chave); } catch (e) { /* sem armazenamento */ } }

  // Identidade do jogador NESTA ABA (sobrevive ao F5). Cada aba é um jogador diferente — dá para testar com 2 abas.
  // Para voltar depois de fechar a aba, a ficha da partida guarda a identidade usada naquela sala.
  function meuId() {
    let id = null;
    try { id = sessionStorage.getItem('bn-id'); } catch (e) { /* sem armazenamento */ }
    if (!id) id = 'j' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    usarId(id);
    return id;
  }

  // Partida salva: uma ficha por identidade (cada aba tem a sua; duas abas no mesmo navegador não se misturam).
  function chaveFicha(id) { return 'bn-ficha-' + id; }
  function lerFicha() { return ler(chaveFicha(meuId())); }
  function gravarFicha(f) { gravar(chaveFicha(f.id), Object.assign({}, f, { salvaEm: Date.now() })); }
  function apagarFicha(id) { apagar(chaveFicha(id || meuId())); }

  // A ficha desta aba; se não houver (aba nova), a mais recente deste Chromebook para esta senha.
  function fichaParaOferecer() {
    const minha = lerFicha();
    if (minha && minha.senha === senha) return minha;
    let melhor = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.indexOf('bn-ficha-') !== 0) continue;
        const f = ler(k);
        if (f && f.senha === senha && (!melhor || (f.salvaEm || 0) > (melhor.salvaEm || 0))) melhor = f;
      }
    } catch (e) { /* sem armazenamento */ }
    return melhor;
  }
  let fichaOferecida = null;

  function usarId(id) { try { sessionStorage.setItem('bn-id', id); } catch (e) { /* sem armazenamento */ } }

  let carteiro = null;
  let bancos = [];
  let senha = null;
  let sessao = null;        // { codigo, eu, config }
  let conexao = null;
  let cliente = null;
  let jogadoresInfo = {};
  let recadosEsperando = [];
  let salaSincronizada = false;
  let euConectado = true;

  function estado() { return cliente.estado; }
  function eu() { return sessao.eu; }
  function colega() { return 1 - sessao.eu; }
  function nome(j) { return estado().config.nomes[j]; }
  function meuNome() { return ($('nome').value || '').trim() || 'Jogador'; }
  function tamanho(id) { return Regras.FROTA.find(function (n) { return n.id === id; }).tamanho; }
  function mostrarErro(id, texto) { $(id).textContent = texto || ''; }

  // ================= Início: senha e bancos =================

  async function iniciar() {
    if (typeof FIREBASE_CONFIG === 'undefined' || typeof firebase === 'undefined') {
      $('carregando-texto').textContent = '⚠ O jogo online não está configurado (veja CONFIGURAR-FIREBASE.md) ou não há internet.';
      return;
    }
    carteiro = Sala.criar(FIREBASE_CONFIG);
    if (typeof BANCOS !== 'undefined' && Array.isArray(BANCOS)) bancos = await Perguntas.carregarBancos(BANCOS, 'bancos/');
    preencherBancos();
    $('nome').value = ler('bn-nome') || '';
    const guardada = ler('bn-senha');
    if (!guardada) { mostrarSenha(); return; }
    try {
      if (await carteiro.verificarSenha(guardada)) { senha = guardada; mostrarInicio(); }
      else mostrarSenha('A senha mudou. Peça a nova senha ao professor.');
    } catch (e) {
      $('carregando-texto').textContent = '⚠ Sem internet. Confira a conexão e recarregue a página.';
    }
  }

  function preencherBancos() {
    const sel = $('banco');
    sel.innerHTML = '';
    bancos.forEach(function (b, i) {
      const op = document.createElement('option');
      op.value = String(i);
      op.textContent = b.erro ? '⚠ com erro: ' + b.arquivo + ' (' + b.erro + ')' : b.titulo + ' (' + b.perguntas.length + ' perguntas)';
      op.disabled = !!b.erro;
      sel.appendChild(op);
    });
    const primeiro = bancos.findIndex(function (b) { return !b.erro; });
    if (primeiro >= 0) sel.value = String(primeiro);
    $('btn-criar-confirmar').disabled = primeiro < 0;
    const ul = $('avisos-bancos');
    ul.innerHTML = '';
    bancos.reduce(function (acc, b) { return acc.concat(b.avisos); }, []).forEach(function (t) {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function mostrarSenha(aviso) {
    $('senha-aviso').hidden = !aviso;
    $('senha-aviso').textContent = aviso || '';
    mostrarErro('senha-erro');
    $('senha').value = '';
    Tela.mostrar('tela-senha');
    $('senha').focus();
  }

  $('form-senha').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const s = Sala.normalizarSenha($('senha').value);
    if (!s) { mostrarErro('senha-erro', 'A senha tem só letras e números (4 a 30).'); return; }
    mostrarErro('senha-erro', 'Conferindo...');
    try {
      if (await carteiro.verificarSenha(s)) {
        senha = s;
        gravar('bn-senha', s);
        mostrarInicio();
      } else {
        mostrarErro('senha-erro', 'Senha incorreta. Peça a senha ao professor.');
      }
    } catch (e) {
      mostrarErro('senha-erro', 'Sem internet. Tente de novo.');
    }
  });

  $('btn-trocar-senha').addEventListener('click', function () { apagar('bn-senha'); senha = null; mostrarSenha(); });

  async function mostrarInicio() {
    mostrarErro('inicio-erro');
    $('partida-salva').hidden = true;
    Tela.mostrar('tela-inicio');
    const ficha = fichaParaOferecer();
    fichaOferecida = ficha;
    if (!ficha) return;
    try {
      const sala = await carteiro.lerSala(senha, ficha.codigo);
      const outro = sala && sala.jogadores && sala.jogadores[1 - ficha.eu];
      if (!sala) { apagarFicha(ficha.id); return; }
      $('partida-salva-texto').textContent = 'Você tem uma partida na SALA ' + ficha.codigo + (outro ? ' contra ' + outro.nome : '') + '.';
      $('partida-salva').hidden = false;
    } catch (e) { /* sem internet: não oferece */ }
  }

  function lembrarNome() { gravar('bn-nome', meuNome()); }

  $('btn-criar').addEventListener('click', function () { lembrarNome(); mostrarErro('criar-erro'); Tela.mostrar('tela-criar'); });
  $('btn-entrar').addEventListener('click', function () {
    lembrarNome();
    mostrarErro('entrar-erro');
    $('codigo').value = '';
    Tela.mostrar('tela-entrar');
    $('codigo').focus();
  });
  document.querySelectorAll('.btn-voltar-inicio').forEach(function (b) { b.addEventListener('click', mostrarInicio); });

  $('btn-abandonar').addEventListener('click', function () { if (fichaOferecida) apagarFicha(fichaOferecida.id); $('partida-salva').hidden = true; });

  $('btn-voltar-partida').addEventListener('click', async function () {
    const ficha = fichaOferecida;
    if (!ficha) return;
    try {
      if (ficha.id) usarId(ficha.id);
      if (ficha.nome) $('nome').value = ficha.nome;   // volta com o nome daquela partida (outra aba pode ter usado outro)
      const r = await carteiro.entrarNaSala(senha, ficha.codigo, { nome: meuNome(), id: meuId() });
      abrirSala(ficha.codigo, r.eu, r.config);
    } catch (e) {
      mostrarErro('inicio-erro', e.message);
      apagarFicha(ficha.id);
      $('partida-salva').hidden = true;
    }
  });

  // ================= Criar / entrar / esperar =================

  $('form-criar').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const banco = bancos[Number($('banco').value)];
    if (!banco || banco.erro) return;
    const config = {
      banco: banco.arquivo,
      modo: document.querySelector('input[name=modo]:checked').value,
      tempoMin: Number($('tempo').value),
      segundos: Number($('segundos').value),
      tiro: document.querySelector('input[name=tiro]:checked').value,
      torpedos: Number($('torpedos').value)
    };
    mostrarErro('criar-erro', 'Criando...');
    try {
      const codigo = await carteiro.criarSala(senha, config, { nome: meuNome(), id: meuId() });
      mostrarErro('criar-erro');
      abrirSala(codigo, 0, config);
    } catch (e) {
      mostrarErro('criar-erro', navigator.onLine ? e.message : 'Sem internet. Tente de novo.');
    }
  });

  $('form-entrar').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const codigo = $('codigo').value.trim();
    mostrarErro('entrar-erro', 'Entrando...');
    try {
      const r = await carteiro.entrarNaSala(senha, codigo, { nome: meuNome(), id: meuId() });
      if (!bancoDaSala(r.config)) { mostrarErro('entrar-erro', 'Esta sala usa um banco de perguntas que não está disponível.'); return; }
      mostrarErro('entrar-erro');
      abrirSala(codigo, r.eu, r.config);
    } catch (e) {
      mostrarErro('entrar-erro', e.message);
    }
  });

  // Torpedos só com Turbo + afundar Clássico: o seletor aparece só nessa combinação.
  function mostrarLinhaTorpedos() {
    const turboClassico = document.querySelector('input[name=tiro]:checked').value === 'turbo' &&
      document.querySelector('input[name=modo]:checked').value === 'classico';
    $('linha-torpedos').hidden = !turboClassico;
  }
  document.querySelectorAll('input[name=tiro], input[name=modo]').forEach(function (r) { r.addEventListener('change', mostrarLinhaTorpedos); });

  function bancoDaSala(config) {
    return bancos.find(function (b) { return b.arquivo === config.banco && !b.erro; }) || null;
  }

  function abrirSala(codigo, euNaSala, config) {
    fecharSala();
    sessao = { codigo: codigo, eu: euNaSala, config: config };
    if (!fichaDestaSessao(lerFicha(), codigo, euNaSala)) gravarFicha({ senha: senha, codigo: codigo, eu: euNaSala, id: meuId(), nome: meuNome() });
    recadosEsperando = [];
    salaSincronizada = false;
    jogadoresInfo = {};
    $('espera-codigo').textContent = codigo;
    Tela.mostrar('tela-espera');
    conexao = carteiro.abrir(senha, codigo, euNaSala, { nome: meuNome(), id: meuId() }, {
      aoRecado: function (r) { if (cliente) cliente.receber(r); else recadosEsperando.push(r); },
      aoSincronizado: function () { salaSincronizada = true; if (cliente) cliente.marcarSincronizado(); },
      aoJogadores: function (j) {
        jogadoresInfo = j;
        if (!cliente && j[0] && j[1]) iniciarCliente();
        if (cliente) cliente.presenca(j);
      },
      aoConexao: function (ligado) { euConectado = ligado; $('sem-conexao').hidden = ligado; if (cliente) pintarTudo(); }
    });
  }

  // A ficha salva só vale para esta sala, com esta cadeira e esta identidade (outra aba pode ter gravado a dela).
  function fichaDestaSessao(ficha, codigo, euNaSala) {
    return !!ficha && ficha.senha === senha && ficha.codigo === codigo && ficha.eu === euNaSala && ficha.id === meuId();
  }

  function fecharSala() {
    pararTimers();
    $('bat-desconexao').hidden = true;
    if (conexao) conexao.fechar();
    conexao = null;
    cliente = null;
    sessao = null;
  }

  $('btn-cancelar-sala').addEventListener('click', function () { fecharSala(); apagarFicha(); mostrarInicio(); });

  function iniciarCliente() {
    const banco = bancoDaSala(sessao.config);
    if (!banco) { fecharSala(); mostrarInicio(); mostrarErro('inicio-erro', 'Esta sala usa um banco de perguntas que não está disponível.'); return; }
    const ficha = lerFicha();
    const doCodigo = fichaDestaSessao(ficha, sessao.codigo, sessao.eu) ? ficha : null;
    const s = sessao;
    cliente = Cliente.criar({
      conexao: conexao,
      eu: s.eu,
      nomes: [jogadoresInfo[0].nome, jogadoresInfo[1].nome],
      config: s.config,
      perguntas: banco.perguntas,
      ficha: doCodigo && doCodigo.partida ? doCodigo : null,
      guardar: function (f) { gravarFicha(Object.assign({ senha: senha, codigo: s.codigo, eu: s.eu, id: meuId(), nome: meuNome() }, f)); }
    });
    cliente.aoMudar(aoEvento);
    const guardados = recadosEsperando;
    recadosEsperando = [];
    guardados.forEach(function (r) { cliente.receber(r); });
    if (salaSincronizada) cliente.marcarSincronizado();
    cliente.presenca(jogadoresInfo);
    iniciarTimers();
    mostrarFaseAtual();
  }

  // ================= Eventos do cliente =================

  function aoEvento(ev) {
    if (!cliente) return;
    const r = ev.recado;
    switch (ev.tipo) {
      case 'local': pintarPosicionamento(); break;
      case 'pronto': mostrarFaseAtual(); break;
      case 'mirar':
        if (r.jogador === eu()) abrirConta();
        else faixaMira();
        pintarBatalha();
        break;
      case 'responder':
        if (r.jogador === eu()) { if (!r.certa) iniciarAvanco(MS_RESULTADO_ERRADO); }
        else faixa(r.certa ? '✅ ' + nome(r.jogador) + ' acertou a conta! Prepare-se para o impacto!' : '❌ ' + nome(r.jogador) + ' errou a conta! Você escapou!');
        pintarBatalha();
        atualizarBarra();
        break;
      case 'resultado':
        if (r.jogador === eu()) mostrarImpacto();
        else { $('conta-feedback').textContent = '✔ Certo! ' + textoTiro(estado().ultimoTurno.tiro); iniciarAvanco(MS_RESULTADO_CERTO); }
        pintarBatalha();
        atualizarBarra();
        if (estado().fase === 'fim' && r.jogador === eu()) mostrarFim();
        break;
      case 'passar_vez':
        $('conta').hidden = true;
        aguardandoAvanco = false;
        mostrarFaseAtual();
        break;
      case 'encerrar': mostrarFim(); break;
      case 'revelar': if (!$('tela-fim').hidden) mostrarFim(); break;
      case 'revanche': atualizarRevanche(); break;
      case 'nova_partida': mostrarFaseAtual(); break;
      case 'presenca': atualizarPresenca(); break;
      case 'sincronizado': mostrarFaseAtual(); break;
    }
  }

  function mostrarFaseAtual() {
    const e = estado();
    if (e.fase === 'posicionamento') abrirPosicionamento();
    else if (e.fase === 'batalha') entrarBatalha();
    else if (e.fase === 'fim' && (e.etapa !== 'resultado' || !aguardandoAvanco)) mostrarFim();
  }

  // ================= Posicionamento =================

  let navioSel = null;
  let orientacao = 'h';
  let mouseEm = null;

  const tabPos = Tela.criarTabuleiro($('pos-tabuleiro'), {
    aoClicar: clicarPosicionamento,
    aoPassar: function (l, c) { mouseEm = { l: l, c: c }; pintarPosicionamento(); },
    aoSair: function () { mouseEm = null; pintarPosicionamento(); }
  });

  function primeiroLivre() {
    const livre = Regras.FROTA.find(function (n) { return !estado().jogadores[eu()].navios[n.id]; });
    return livre ? livre.id : null;
  }

  function abrirPosicionamento() {
    $('pos-titulo').textContent = '🚢 ' + nome(eu()) + ', posicione seus navios';
    if ($('tela-posicionar').hidden) { orientacao = 'h'; navioSel = primeiroLivre(); mouseEm = null; $('pos-dica').textContent = ''; }
    Tela.mostrar('tela-posicionar');
    pintarPosicionamento();
  }

  function pintarPosicionamento() {
    if (!cliente || estado().fase !== 'posicionamento') return;
    const j = estado().jogadores[eu()];
    const confirmado = j.pronto;
    let previa = null;
    if (!confirmado && mouseEm && navioSel) {
      const navio = { l: mouseEm.l, c: mouseEm.c, orientacao: orientacao, tamanho: tamanho(navioSel) };
      previa = { casas: Regras.casasDoNavio(navio), valida: Regras.podePosicionar(j.navios, navioSel, navio) === null };
    }
    tabPos.pintar({ navios: j.navios, previa: previa, clicavel: function () { return !confirmado; } });
    const lista = $('pos-navios');
    lista.innerHTML = '';
    Regras.FROTA.forEach(function (n) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao';
      if (j.navios[n.id]) b.classList.add('posicionado');
      if (navioSel === n.id) b.classList.add('selecionado');
      b.textContent = NOMES_NAVIOS[n.id] + '  ' + '■'.repeat(n.tamanho) + (j.navios[n.id] ? '  ✔' : '');
      b.addEventListener('click', function () { navioSel = n.id; $('pos-dica').textContent = ''; pintarPosicionamento(); });
      lista.appendChild(b);
    });
    $('pos-orientacao').textContent = orientacao === 'h' ? 'deitado' : 'em pé';
    $('btn-confirmar').disabled = Object.keys(j.navios).length !== Regras.FROTA.length;
    $('pos-controles').hidden = confirmado;
    $('pos-aguardando').hidden = !confirmado;
    $('pos-aguardando').textContent = 'Aguardando ' + nome(colega()) + '... ⏳';
    atualizarPresenca();
  }

  function clicarPosicionamento(l, c) {
    const naCasa = Regras.navioNaCasa(estado().jogadores[eu()].navios, l, c);
    if (naCasa) {
      cliente.remover(naCasa);
      navioSel = naCasa;
      $('pos-dica').textContent = '';
    } else if (navioSel) {
      const r = cliente.posicionar(navioSel, l, c, orientacao);
      if (r.ok) { navioSel = primeiroLivre(); $('pos-dica').textContent = ''; }
      else $('pos-dica').textContent = 'Não dá: ' + r.motivo + '.';
    }
    pintarPosicionamento();
  }

  function girar() { orientacao = orientacao === 'h' ? 'v' : 'h'; pintarPosicionamento(); }

  $('btn-girar').addEventListener('click', girar);
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'r' || ev.key === 'R') && !$('tela-posicionar').hidden) girar();
  });
  $('btn-aleatorio').addEventListener('click', function () { cliente.aleatorio(); navioSel = null; $('pos-dica').textContent = ''; pintarPosicionamento(); });
  $('btn-limpar').addEventListener('click', function () { cliente.limpar(); navioSel = primeiroLivre(); pintarPosicionamento(); });
  $('btn-confirmar').addEventListener('click', function () { cliente.pronto(); });

  // ================= Batalha =================

  const tabMeu = Tela.criarTabuleiro($('bat-meu'));
  const tabAdv = Tela.criarTabuleiro($('bat-adv'), {
    aoClicar: mirar,
    // Ao passar o mouse, só o mar do adversário é repintado (o Meu mar não muda; poupa Chromebook fraco).
    aoPassar: function (l, c) { mouseAdv = { l: l, c: c }; pintarMarAdversario(); },
    aoSair: function () { mouseAdv = null; pintarMarAdversario(); }
  });
  let destaque = null;          // casa(s) do último tiro recebido, piscando no Meu mar
  let timerDestaque = null;
  let mouseAdv = null;          // casa do mar do adversário sob o mouse (prévia do tiro)
  let torpedoArmado = false;

  const ROTULO_FORMATO = { duplo: '⚡ TIRO DUPLO', cruz: '✚ TIRO EM CRUZ', torpedo: '🚀 TORPEDO' };
  const AVISO_FORMATO = { duplo: '⚡ Tiro duplo!', cruz: '✚ Tiro em cruz!', torpedo: '🚀 Torpedo!' };

  function faixa(texto) { $('faixa-texto').textContent = texto; }
  function turbo() { return estado().config.tiro === 'turbo'; }
  function comFormato(formato) { return ROTULO_FORMATO[formato] ? ' com ' + ROTULO_FORMATO[formato] : ''; }

  // "Beto mirou em C7 com ⚡ TIRO DUPLO e está respondendo... ⏱ 7 s" — atualizada a cada ~250 ms.
  function colegaRespondendo() {
    const e = estado();
    return e.fase === 'batalha' && e.vez === colega() && e.etapa === 'responder' && e.mira;
  }
  function faixaMira() {
    if (!colegaRespondendo()) return;
    const e = estado();
    const resta = Math.max(0, Math.ceil((cliente.fimDaConta - conexao.horaServidor()) / 1000));
    faixa('🎯 ' + nome(colega()) + ' mirou em ' + Regras.nomeCasa(e.mira.l, e.mira.c) + comFormato(e.mira.formato) +
      ' e está respondendo... ⏱ ' + resta + ' s');
  }

  function entrarBatalha() {
    Tela.mostrar('tela-batalha');
    const e = estado();
    if (e.vez !== eu() || e.etapa !== 'escolher') torpedoArmado = false;
    if (e.vez === eu()) {
      if (e.etapa === 'escolher') {
        const u = e.ultimoTurno;
        faixa(u && u.jogador === colega() ? resumoTurno(u) + ' Agora é sua vez: escolha uma casa no mar do adversário.' : 'Sua vez: escolha uma casa no mar do adversário.');
      } else if (e.etapa === 'responder') abrirConta();
    } else if (e.etapa === 'escolher') {
      faixa('🎯 ' + nome(colega()) + ' está escolhendo um alvo...');
    } else if (e.etapa === 'responder') {
      faixaMira();
    }
    atualizarBarra();
    atualizarPresenca();
    pintarBatalha();
  }

  function paraCasas(chaves) { return chaves.map(function (ch) { const p = ch.split(','); return { l: Number(p[0]), c: Number(p[1]) }; }); }

  function pintarBatalha() {
    if (!cliente || estado().fase === 'posicionamento') return;
    const e = estado();
    const miradaEmMim = e.fase === 'batalha' && e.vez === colega() && e.mira && (e.etapa === 'responder' || e.etapa === 'aguardando_resultado')
      ? (e.mira.casas || [Regras.chave(e.mira.l, e.mira.c)]) : null;
    tabMeu.pintar({
      navios: e.jogadores[eu()].navios,
      tiros: e.jogadores[eu()].tiros,
      afundadas: Regras.casasAfundadas(e, eu()),
      destaque: destaque,
      mirada: miradaEmMim
    });
    pintarMarAdversario();
  }

  function pintarMarAdversario() {
    if (!cliente || estado().fase === 'posicionamento') return;
    const e = estado();
    const tirosAdv = e.jogadores[colega()].tiros;
    const minhaVezDeMirar = euConectado && e.fase === 'batalha' && e.vez === eu() && e.etapa === 'escolher';
    // Prévia do tiro (1 casa, duplo, cruz ou torpedo) sob o mouse, na minha vez.
    let previa = null;
    if (minhaVezDeMirar && mouseAdv && !tirosAdv[Regras.chave(mouseAdv.l, mouseAdv.c)]) {
      previa = { casas: paraCasas(Regras.casasDoTiro(e, eu(), mouseAdv.l, mouseAdv.c, torpedoArmado).casas), valida: true };
    }
    tabAdv.pintar({
      tiros: tirosAdv,
      afundadas: Regras.casasAfundadas(e, colega()),
      previa: previa,
      clicavel: function (l, c) { return minhaVezDeMirar && !tirosAdv[Regras.chave(l, c)]; }
    });
    atualizarTurbo();
  }

  function atualizarBarra() {
    const e = estado();
    $('bat-vez').textContent = e.vez === eu() ? '🎯 Sua vez' : '⏳ Vez de ' + nome(e.vez);
    $('bat-placar').textContent = nome(0) + ': ' + Regras.casasAtingidas(e, 1) + ' casas · ' + nome(1) + ': ' + Regras.casasAtingidas(e, 0) + ' casas';
    atualizarTurbo();
  }

  // Turbo: "🔥 Sequência: 3 · faltam 2 para ⚡ tiro duplo" e o botão do torpedo.
  function atualizarTurbo() {
    const e = estado();
    $('turbo').hidden = !turbo() || e.fase !== 'batalha';
    if (!turbo()) return;
    const eu0 = e.jogadores[eu()];
    const seq = eu0.sequencia;
    const alvo = seq < 5 ? 5 : Math.max(10, (Math.floor(seq / 5) + 1) * 5);
    const poder = alvo === 5 ? '⚡ tiro duplo' : '✚ tiro em cruz';
    $('bat-sequencia').textContent = '🔥 Sequência: ' + seq + ' · ' + (torpedoArmado
      ? '🚀 torpedo armado: se acertar, o tiro sai como torpedo' + (alvo - seq === 1 ? ' (no lugar do ' + poder + ')' : '')
      : (alvo - seq === 1 ? 'se acertar a próxima: ' + poder + '!' : 'faltam ' + (alvo - seq) + ' para ' + poder));
    const b = $('btn-torpedo');
    b.hidden = !e.config.torpedos;
    const podeArmar = e.fase === 'batalha' && e.vez === eu() && e.etapa === 'escolher' && eu0.torpedos > 0;
    if (!podeArmar) torpedoArmado = false;
    b.disabled = !podeArmar;
    b.classList.toggle('armado', torpedoArmado);
    b.textContent = torpedoArmado ? '🚀 Torpedo armado — clique para desarmar' : '🚀 Torpedo (' + eu0.torpedos + ')';
  }

  $('btn-torpedo').addEventListener('click', function () { torpedoArmado = !torpedoArmado; pintarBatalha(); });

  // Resultado de um tiro (para quem atirou e para quem foi atingido). Tiros do Turbo vêm como 'multiplo'.
  function textoTiro(tiro) {
    if (tiro.tipo === 'multiplo') {
      if (tiro.afundados.length) return tiro.afundados.map(function (n) { return '🚢 Afundou o navio de ' + n.tamanho + '!'; }).join(' ');
      if (tiro.acertos.length) return '💥 Acertou ' + tiro.acertos.length + (tiro.acertos.length === 1 ? ' casa!' : ' casas!');
      return '🌊 Água!';
    }
    if (tiro.tipo === 'agua') return '🌊 Água!';
    if (tiro.tipo === 'acerto') return '💥 Acertou!';
    return '🚢 Afundou o navio de ' + tiro.tamanho + '!';
  }

  function textoImpacto(tiro) {
    if (tiro.tipo === 'multiplo') {
      if (tiro.afundados.length) return tiro.afundados.map(function (n) { return '🚢 Seu navio de ' + n.tamanho + ' afundou!'; }).join(' ');
      if (tiro.acertos.length) return '💥 ' + tiro.acertos.length + (tiro.acertos.length === 1 ? ' casa do seu navio foi atingida!' : ' casas dos seus navios foram atingidas!');
      return '🌊 Água!';
    }
    if (tiro.tipo === 'agua') return '🌊 Água!';
    if (tiro.tipo === 'acerto') return '💥 Seu navio foi atingido!';
    return '🚢 Seu navio de ' + tiro.tamanho + ' afundou!';
  }

  function resumoTurno(u) {
    const quem = nome(u.jogador);
    if (!u.acertouConta) return quem + ' errou a continha — nenhum tiro.';
    const onde = quem + ' atirou em ' + Regras.nomeCasa(u.l, u.c) + comFormato(u.formato) + ': ';
    if (u.tiro.tipo === 'multiplo') return onde + textoImpacto(u.tiro);
    if (u.tiro.tipo === 'agua') return onde + '🌊 água.';
    if (u.tiro.tipo === 'acerto') return onde + '💥 acertou!';
    return onde + '🚢 afundou seu navio de ' + u.tiro.tamanho + '!';
  }

  function mostrarImpacto() {
    const u = estado().ultimoTurno;
    faixa(textoImpacto(u.tiro));
    destaque = u.casas || Regras.chave(u.l, u.c);
    clearTimeout(timerDestaque);
    timerDestaque = setTimeout(function () { destaque = null; pintarBatalha(); }, 4000);
  }

  function mirar(l, c) {
    if (!euConectado) return;
    if (cliente.mirar(l, c, torpedoArmado)) torpedoArmado = false;   // a continha abre quando o recado "mirar" voltar
  }

  // ================= Continha =================

  let intervaloConta = null;
  let respondido = true;
  let aguardandoAvanco = false;
  let momentoResultado = 0;
  let timerAvanco = null;

  function abrirConta() {
    const pa = cliente.perguntaAtual();
    if (!pa || !respondido && !$('conta').hidden) return;
    const p = pa.pergunta;
    $('conta-casa').textContent = Regras.nomeCasa(estado().mira.l, estado().mira.c);
    $('conta-pergunta').textContent = p.pergunta;
    const aviso = AVISO_FORMATO[estado().mira.formato];
    $('conta-poder').hidden = !aviso;
    $('conta-poder').textContent = aviso || '';
    $('conta-feedback').textContent = '';
    $('conta-avanco').hidden = true;
    const opcoes = $('conta-opcoes');
    opcoes.innerHTML = '';
    if (p.tipo === 'escolha') {
      $('conta-form').hidden = true;
      Perguntas.embaralhar([p.certa].concat(p.erradas), Math.random).forEach(function (texto) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'botao';
        b.textContent = texto;
        b.addEventListener('click', function () { responder(String(texto)); });
        opcoes.appendChild(b);
      });
    } else {
      $('conta-form').hidden = false;
      $('conta-input').value = '';
      $('conta-input').disabled = false;
    }
    $('conta').hidden = false;
    if (p.tipo !== 'escolha') $('conta-input').focus();
    respondido = false;
    aguardandoAvanco = false;
    clearInterval(intervaloConta);
    intervaloConta = setInterval(tickConta, 100);
    tickConta();
  }

  function tickConta() {
    const pa = cliente && cliente.perguntaAtual();
    if (!pa) { clearInterval(intervaloConta); return; }
    const resta = pa.fim - conexao.horaServidor();
    if (resta <= 0) {
      // Tempo acabou: vale o que o aluno já digitou (mesmo sem Enter). Campo vazio = tempo esgotado.
      const digitado = pa.pergunta.tipo === 'escolha' ? '' : $('conta-input').value;
      $('conta-segundos').textContent = '0 s';
      responder(digitado.trim() === '' ? null : digitado);
      return;
    }
    $('conta-barra').style.width = Math.min(100, resta / cliente.msConta * 100) + '%';
    $('conta-barra').classList.toggle('pouco', resta <= 3000);
    $('conta-segundos').textContent = Math.ceil(resta / 1000) + ' s';
  }

  $('conta-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    const texto = $('conta-input').value;
    if (texto.trim() === '') return;   // Enter sem resposta não gasta a vez
    responder(texto);
  });

  function responder(texto) {
    if (respondido) return;
    respondido = true;
    clearInterval(intervaloConta);
    const r = cliente.responder(texto);
    $('conta-input').disabled = true;
    $('conta-opcoes').querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    if (!r) return;
    $('conta-feedback').textContent = r.certa ? '✔ Certo! Disparando... 🎯' : (texto === null ? '⏰ Tempo esgotado!' : '✗ Errou!');
  }

  // Depois do resultado, a vez passa sozinha; um clique na janela adianta.
  function iniciarAvanco(ms) {
    aguardandoAvanco = true;
    momentoResultado = Date.now();
    const barra = $('conta-avanco-barra');
    $('conta-avanco').hidden = false;
    barra.style.transition = 'none';
    barra.style.width = '100%';
    void barra.offsetWidth;   // força o navegador a aplicar os 100% antes de animar
    barra.style.transition = 'width ' + ms + 'ms linear';
    barra.style.width = '0%';
    clearTimeout(timerAvanco);
    timerAvanco = setTimeout(avancar, ms);
  }

  function avancar() {
    if (!aguardandoAvanco) return;
    aguardandoAvanco = false;
    clearTimeout(timerAvanco);
    $('conta-avanco').hidden = true;
    $('conta').hidden = true;
    if (estado().fase === 'fim') mostrarFim();
    else cliente.passarVez();
  }

  $('conta').addEventListener('click', function () {
    // Ignora o próprio clique/Enter que enviou a resposta (ele também chega aqui).
    if (aguardandoAvanco && Date.now() - momentoResultado > 400) avancar();
  });

  // ================= Relógio, presença e desconexão =================

  let intervaloGeral = null;

  function iniciarTimers() {
    clearInterval(intervaloGeral);
    intervaloGeral = setInterval(function () {
      if (!cliente) return;
      const resta = cliente.tempoRestanteMs();
      $('bat-relogio').hidden = resta === null;
      if (resta !== null) $('bat-relogio').textContent = '⏱ ' + Tela.formatarTempo(resta);
      $('bat-aviso-tempo').hidden = !(estado().fase === 'batalha' && cliente.tempoAcabou());
      faixaMira();
      atualizarPresenca();
    }, 250);
  }

  function pararTimers() {
    clearInterval(intervaloGeral);
    clearInterval(intervaloConta);
    clearTimeout(timerAvanco);
    clearTimeout(timerDestaque);
    respondido = true;
    aguardandoAvanco = false;
    destaque = null;
    $('conta').hidden = true;
  }

  function atualizarPresenca() {
    if (!cliente) return;
    const outro = jogadoresInfo[colega()];
    const ligado = !!(outro && outro.conectado);
    const texto = ligado ? '● ' + nome(colega()) + ' online' : '⚠ ' + nome(colega()) + ' fora do jogo';
    $('bat-colega').textContent = texto;
    $('bat-colega').classList.toggle('fora', !ligado);
    const pronto = estado().jogadores[colega()].pronto;
    $('pos-colega').textContent = nome(colega()) + ': ' + (!ligado ? 'fora do jogo ⚠' : pronto ? 'pronto ✔' : 'posicionando...');
    const fora = !ligado && estado().fase !== 'fim';
    $('bat-desconexao').hidden = !fora;
    if (fora) {
      const tempoFora = outro && outro.vistoEm ? Math.max(0, conexao.horaServidor() - outro.vistoEm) : 0;
      $('bat-desconexao-texto').textContent = '⚠ ' + nome(colega()) + ' desconectou — aguardando ele voltar... (' + Tela.formatarTempo(tempoFora) + ')';
      $('btn-encerrar').hidden = tempoFora < MS_PARA_ENCERRAR;
    }
  }

  $('btn-encerrar').addEventListener('click', function () { cliente.encerrar(); });

  // ================= Fim de jogo =================

  const tabFim = [Tela.criarTabuleiro($('fim-tab0')), Tela.criarTabuleiro($('fim-tab1'))];

  function mostrarFim() {
    clearInterval(intervaloConta);
    $('conta').hidden = true;
    const e = estado();
    const motivos = {
      afundou: 'Afundou todos os navios do adversário!',
      tempo_casas: 'O tempo acabou — venceu quem acertou mais casas de navio.',
      tempo_contas: 'O tempo acabou — empate em casas; venceu quem acertou mais continhas.',
      tempo_empate: 'O tempo acabou — empate em casas e em continhas.',
      encerrada: 'A partida foi encerrada (um jogador saiu).'
    };
    $('fim-titulo').textContent = e.vencedor === 'empate' ? '🤝 Empate!' : e.vencedor === eu() ? '🏆 Você venceu!' : '🏆 ' + nome(e.vencedor) + ' venceu!';
    $('fim-motivo').textContent = motivos[e.motivoFim] || '';
    $('fim-col-seq').hidden = e.config.tiro !== 'turbo';
    const corpo = $('fim-stats');
    corpo.innerHTML = '';
    [0, 1].forEach(function (i) {
      const tr = document.createElement('tr');
      const contas = e.jogadores[i].contas;
      const colunas = [nome(i), String(Regras.casasAtingidas(e, 1 - i)), contas.certas + ' de ' + contas.total];
      if (e.config.tiro === 'turbo') colunas.push(String(e.jogadores[i].maiorSequencia));
      colunas.forEach(function (t) {
        const td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      corpo.appendChild(tr);
      const conhecido = Object.keys(e.jogadores[i].navios).length > 0;
      $('fim-nome' + i).textContent = 'Mar de ' + nome(i) + (conhecido ? '' : ' (revelando...)');
      tabFim[i].pintar({ navios: e.jogadores[i].navios, tiros: e.jogadores[i].tiros, afundadas: Regras.casasAfundadas(e, i) });
    });
    atualizarRevanche();
    Tela.mostrar('tela-fim');
  }

  function atualizarRevanche() {
    if (!cliente) return;
    const r = cliente.revanches;
    let texto = '';
    if (r[eu()] && !r[colega()]) texto = 'Aguardando ' + nome(colega()) + ' aceitar a revanche...';
    else if (r[colega()] && !r[eu()]) texto = nome(colega()) + ' quer revanche! Clique em "Jogar de novo".';
    $('fim-revanche').textContent = texto;
    $('btn-de-novo').disabled = !!r[eu()];
  }

  $('btn-de-novo').addEventListener('click', function () { cliente.pedirRevanche(); });
  $('btn-sair').addEventListener('click', function () { fecharSala(); apagarFicha(); mostrarInicio(); });

  // ================= Tudo =================

  function pintarTudo() {
    if (!cliente) return;
    if (estado().fase === 'posicionamento') pintarPosicionamento();
    else pintarBatalha();
  }

  iniciar();
})();

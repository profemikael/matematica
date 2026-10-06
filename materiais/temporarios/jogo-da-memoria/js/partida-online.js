// Partida online: liga as telas ao motor de regras (Regras) e ao carteiro do Firebase (Sala).
// Com ?local=1 no endereço, usa o carteiro local dos testes (abas do mesmo navegador, sem internet).
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const MS_AMPLIAR = 2000;        // a 1ª carta fica ampliada isto (ou até um clique)
  const MS_REENVIO = 1500;        // 'tempo'/'pular' que não pegou é mandado de novo depois disto

  // ---------- Armazenamento local (nunca pode quebrar o jogo) ----------
  function ler(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; } }
  function gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ } }
  function apagar(chave) { try { localStorage.removeItem(chave); } catch (e) { /* sem armazenamento */ } }

  // Identidade do jogador NESTA ABA (sobrevive ao F5). Cada aba é um jogador diferente.
  function usarId(id) { try { sessionStorage.setItem('mem-id', id); } catch (e) { /* sem armazenamento */ } }
  function meuId() {
    let id = null;
    try { id = sessionStorage.getItem('mem-id'); } catch (e) { /* sem armazenamento */ }
    if (!id) id = 'j' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    usarId(id);
    return id;
  }

  // Ficha da sala: para voltar depois de fechar a aba (uma ficha por identidade).
  function chaveFicha(id) { return 'mem-ficha-' + id; }
  function gravarFicha(f) { gravar(chaveFicha(f.id), Object.assign({}, f, { salvaEm: Date.now() })); }
  function apagarFicha(id) { apagar(chaveFicha(id || meuId())); }
  function fichaParaOferecer() {
    const minha = ler(chaveFicha(meuId()));
    if (minha && minha.senha === senha) return minha;
    let melhor = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.indexOf('mem-ficha-') !== 0) continue;
        const f = ler(k);
        if (f && f.senha === senha && (!melhor || (f.salvaEm || 0) > (melhor.salvaEm || 0))) melhor = f;
      }
    } catch (e) { /* sem armazenamento */ }
    return melhor;
  }

  let carteiro = null;
  let bancos = [];
  let senha = null;
  let fichaOferecida = null;
  let sessao = null;          // { codigo, eu, config, banco }
  let conexao = null;
  let jogadores = {};
  let estado = Regras.novoEstado();
  let sincronizado = false;
  let tabuleiro = null;
  let tabuleiroDaPartida = 0;
  let clicavelAntes = null;
  let cliquePendente = null;  // { vez, abertas } — meu clique enviado, esperando voltar
  let enviados = {};          // 'partida:vez:tipo' → hora do último envio
  let ultimoTic = null;
  let laco = null;
  let timerAmpliacao = null;
  let timerAviso = null;
  let timerFim = null;
  let mostrarFim = false;

  function meuNome() { return ($('nome').value || '').trim(); }
  function mostrarErro(id, texto) { $(id).textContent = texto || ''; }
  function config() { return sessao.config; }
  function eu() { return sessao.eu; }
  function nome(l) { return jogadores[l] ? jogadores[l].nome : 'Jogador'; }
  function conectado(l) { return !!(jogadores[l] && jogadores[l].conectado); }
  function anfitriao() { return Regras.anfitriao(jogadores); }
  function agora() { return conexao ? conexao.horaServidor() : Date.now(); }
  function info(id) { return Tela.infoTime(config(), id, jogadores); }

  // ================= Início: senha, bancos e desenhos =================

  async function iniciar() {
    const local = /[?&]local=1/.test(location.search);
    if (local) {
      await Bancos.carregarScript('testes/carteiro-local.js');
      carteiro = CarteiroLocal.criar();
    } else {
      if (typeof FIREBASE_CONFIG === 'undefined' || typeof firebase === 'undefined') {
        $('carregando-texto').textContent = '⚠ Sem internet (ou o jogo online não está configurado). Confira a conexão e recarregue a página.';
        return;
      }
      carteiro = Sala.criar(FIREBASE_CONFIG);
    }
    if (typeof DESENHOS !== 'undefined') for (const d of DESENHOS) await Bancos.carregarScript('desenhos/' + d);
    if (typeof BANCOS !== 'undefined') bancos = await Bancos.carregarBancos(BANCOS, 'bancos/');
    preencherBancos();
    $('nome').value = ler('mem-nome') || '';
    const guardada = ler('mem-senha');
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
      op.textContent = b.erro ? '⚠ com erro: ' + b.arquivo + ' (' + b.erro + ')' : b.titulo + ' (' + b.pares.length + ' pares)';
      op.disabled = !!b.erro;
      sel.appendChild(op);
    });
    const primeiro = bancos.findIndex(function (b) { return !b.erro; });
    if (primeiro >= 0) sel.value = String(primeiro);
    $('btn-criar-confirmar').disabled = primeiro < 0;
    preencherPares();
    const ul = $('avisos-bancos');
    ul.innerHTML = '';
    bancos.filter(function (b) { return b.erro; }).forEach(function (b) {
      const li = document.createElement('li');
      li.textContent = 'Banco com problema: ' + b.arquivo + ' — ' + b.erro;
      ul.appendChild(li);
    });
  }

  // Só os tamanhos que o banco escolhido consegue preencher.
  function preencherPares() {
    const b = bancos[Number($('banco').value)];
    const caixa = $('opcoes-pares');
    caixa.innerHTML = '';
    const tamanhos = b && !b.erro ? b.tamanhos : [];
    tamanhos.forEach(function (n, i) {
      const l = document.createElement('label');
      l.className = 'opcao';
      l.innerHTML = '<input type="radio" name="pares" value="' + n + '"' + (i === 0 ? ' checked' : '') + '> ' + n + ' pares';
      caixa.appendChild(l);
    });
  }
  $('banco').addEventListener('change', preencherPares);
  document.querySelectorAll('input[name=modo]').forEach(function (r) {
    r.addEventListener('change', function () { $('qtd-times').disabled = !document.querySelector('input[name=modo][value=times]').checked; });
  });

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
        gravar('mem-senha', s);
        mostrarInicio();
      } else {
        mostrarErro('senha-erro', 'Senha incorreta. Peça a senha ao professor.');
      }
    } catch (e) {
      mostrarErro('senha-erro', 'Sem internet. Tente de novo.');
    }
  });

  $('btn-trocar-senha').addEventListener('click', function () { apagar('mem-senha'); senha = null; mostrarSenha(); });

  // ================= Início: nome, criar, entrar, voltar =================

  function mostrarInicio() {
    mostrarErro('inicio-erro');
    $('capa-banco').textContent = 'Encontre os pares!';
    Tela.mostrar('tela-inicio');
    oferecerSala();
  }

  async function oferecerSala() {
    $('sala-salva').hidden = true;
    const ficha = fichaParaOferecer();
    fichaOferecida = ficha;
    if (!ficha) return;
    try {
      const sala = await carteiro.lerSala(senha, ficha.codigo);
      const jog = sala && sala.jogadores ? sala.jogadores : {};
      const meu = Object.keys(jog).some(function (l) { return jog[l] && jog[l].id === ficha.id; });
      if (!sala || !meu) { apagarFicha(ficha.id); return; }
      $('sala-salva-texto').textContent = 'Você estava na SALA ' + ficha.codigo + '.';
      $('sala-salva').hidden = false;
    } catch (e) { /* sem internet: não oferece */ }
  }

  $('btn-esquecer-sala').addEventListener('click', function () {
    if (fichaOferecida) apagarFicha(fichaOferecida.id);
    $('sala-salva').hidden = true;
  });
  $('btn-voltar-sala').addEventListener('click', function () {
    if (!fichaOferecida) return;
    usarId(fichaOferecida.id);
    if (!meuNome()) $('nome').value = fichaOferecida.nome || '';
    entrar(fichaOferecida.codigo, 'inicio-erro');
  });

  function conferirNome() {
    if (!meuNome()) { mostrarErro('inicio-erro', 'Escreva seu nome.'); $('nome').focus(); return false; }
    gravar('mem-nome', meuNome());
    return true;
  }

  $('btn-criar').addEventListener('click', function () {
    if (!conferirNome()) return;
    mostrarErro('criar-erro');
    Tela.mostrar('tela-criar');
  });
  $('btn-entrar').addEventListener('click', function () {
    if (!conferirNome()) return;
    mostrarErro('entrar-erro');
    $('codigo').value = '';
    Tela.mostrar('tela-entrar');
    $('codigo').focus();
  });
  $('btn-criar-voltar').addEventListener('click', mostrarInicio);
  $('btn-entrar-voltar').addEventListener('click', mostrarInicio);

  $('form-criar').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const banco = bancos[Number($('banco').value)];
    const pares = document.querySelector('input[name=pares]:checked');
    if (!banco || banco.erro || !pares) { mostrarErro('criar-erro', 'Escolha um banco.'); return; }
    const modo = document.querySelector('input[name=modo]:checked').value;
    const cfg = {
      banco: banco.arquivo,
      pares: Number(pares.value),
      modo: modo,
      times: modo === 'times' ? Number($('qtd-times').value) : 0,
      tempo: Number($('tempo').value),
      acerto: document.querySelector('input[name=acerto]:checked').value
    };
    mostrarErro('criar-erro', 'Criando a sala...');
    $('btn-criar-confirmar').disabled = true;
    try {
      const codigo = await carteiro.criarSala(senha, cfg, { nome: meuNome(), id: meuId() });
      abrirSala(codigo, 0, cfg);
    } catch (e) {
      mostrarErro('criar-erro', e.message || 'Não foi possível criar a sala.');
    } finally {
      $('btn-criar-confirmar').disabled = false;
    }
  });

  $('form-entrar').addEventListener('submit', function (ev) {
    ev.preventDefault();
    entrar($('codigo').value.trim(), 'entrar-erro');
  });

  let entrando = false;   // trava contra clique duplo em "Entrar" / "Voltar para a sala"
  async function entrar(codigo, idErro) {
    if (entrando) return;
    entrando = true;
    mostrarErro(idErro, 'Entrando...');
    try {
      const r = await carteiro.entrarNaSala(senha, codigo, { nome: meuNome(), id: meuId() });
      mostrarErro(idErro);
      abrirSala(codigo, r.eu, r.config);
    } catch (e) {
      mostrarErro(idErro, e.message || 'Não foi possível entrar. Tente de novo.');
    } finally {
      entrando = false;
    }
  }

  // ================= Sala aberta =================

  function abrirSala(codigo, lugar, cfg) {
    const banco = bancos.find(function (b) { return b.arquivo === cfg.banco && !b.erro; });
    if (!banco) {
      mostrarErro('inicio-erro', 'Este computador não tem o banco "' + cfg.banco + '". Recarregue a página (F5).');
      Tela.mostrar('tela-inicio');
      return;
    }
    if (conexao) conexao.fechar();   // nunca duas salas abertas ao mesmo tempo
    conexao = null;
    sessao = { codigo: codigo, eu: lugar, config: cfg, banco: banco };
    gravarFicha({ senha: senha, codigo: codigo, id: meuId(), nome: meuNome() });
    estado = Regras.novoEstado();
    jogadores = {};
    sincronizado = false;
    enviados = {};
    cliquePendente = null;
    mostrarFim = false;
    if (tabuleiro) tabuleiro.parar();
    tabuleiro = null;
    tabuleiroDaPartida = 0;
    $('capa-banco').textContent = banco.titulo;
    $('espera-codigo').textContent = codigo;
    $('espera-config').textContent = Tela.textoConfig(cfg, null);
    $('carregando-texto').textContent = 'Entrando na sala ' + codigo + '...';
    Tela.mostrar('tela-carregando');
    conexao = carteiro.abrir(senha, codigo, lugar, { nome: meuNome(), id: meuId() }, {
      aoRecado: aoRecado,
      aoSincronizado: function () { sincronizado = true; mostrarFim = estado.fase === 'fim'; atualizar(); },
      aoJogadores: function (j) { jogadores = j || {}; atualizar(); },
      aoConexao: function (ligado) { $('sem-conexao').hidden = ligado; }
    });
    clearInterval(laco);
    laco = setInterval(passo, 250);
  }

  function sairDaSala() {
    clearInterval(laco);
    clearTimeout(timerFim);
    Tabuleiro.fecharAmpliacao();
    if (conexao) conexao.fechar();
    conexao = null;
    apagarFicha();
    sessao = null;
    if (tabuleiro) tabuleiro.parar();
    tabuleiro = null;
    mostrarInicio();
  }
  $('btn-sair-espera').addEventListener('click', sairDaSala);
  $('btn-sair-fim').addEventListener('click', sairDaSala);

  function aoRecado(r) {
    if (!Regras.aplicar(config(), estado, r)) return;
    if (sincronizado) reagir(r);
    atualizar();
  }

  // Sons, carta ampliada e avisos — só para recados que chegam ao vivo (não ao reconstruir a sala).
  function reagir(r) {
    const banco = sessao.banco;
    const lado = function (i) { const c = estado.cartas[i]; return Bancos.ladoDaCarta(banco, c.par * 2 + c.lado); };
    clearTimeout(timerAmpliacao);
    if (r.tipo === 'comecar') {
      Tabuleiro.fecharAmpliacao();
      clearTimeout(timerFim);
      mostrarFim = false;
      Sons.tocar('virar');
      return;
    }
    if (r.tipo === 'virar') {
      if (estado.abertas.length === 1 && estado.abertas[0] === r.carta) {
        Sons.tocar('virar');
        Tabuleiro.ampliar([lado(r.carta)], '', Tabuleiro.coordenada(r.carta, Regras.GRADES[config().pares][0]));
        timerAmpliacao = setTimeout(Tabuleiro.fecharAmpliacao, MS_AMPLIAR);
        return;
      }
      const u = estado.ultimo;
      const par = u.tipo === 'par';
      Tabuleiro.ampliar(u.cartas.map(lado), par ? 'par' : 'erro', par ? 'Par! ✔' : 'Não é par ✗');
      Sons.tocar(par ? 'par' : 'erro');
      if (par && tabuleiro) tabuleiro.brilhar(u.cartas);
      timerAmpliacao = setTimeout(Tabuleiro.fecharAmpliacao, Regras.PAUSA_MS - 200);
      if (estado.fase === 'fim') {
        timerFim = setTimeout(function () { mostrarFim = true; Sons.tocar('vitoria'); atualizar(); }, Regras.PAUSA_MS);
      }
      return;
    }
    Tabuleiro.fecharAmpliacao();
    if (r.tipo === 'tempo') { Sons.tocar('tempo'); avisar('⏱ Tempo esgotado!'); }
    if (r.tipo === 'pular') avisar(nome(estado.ultimo.jogador) + ' saiu — a vez passou.');
  }

  function avisar(texto) {
    const p = $('aviso-flutuante');
    p.textContent = texto;
    p.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { p.hidden = true; }, Regras.PAUSA_MS - 200);
  }

  $('ampliacao').addEventListener('click', function () { clearTimeout(timerAmpliacao); Tabuleiro.fecharAmpliacao(); });

  // ================= Desenhar =================

  function atualizar() {
    if (!sessao || !sincronizado) return;
    if (estado.fase === 'espera') { desenharEspera(); return; }
    if (estado.fase === 'fim' && mostrarFim) { desenharFim(); return; }
    desenharJogo();
  }

  function desenharEspera() {
    const host = anfitriao();
    Tela.desenharEspera($('espera-grupos'), {
      config: config(), jogadores: jogadores, eu: eu(), anfitriao: host,
      aoEscolherTime: function (l, t) { carteiro.mudarTime(senha, sessao.codigo, l, t); }
    });
    const pode = Regras.podeComecar(config(), jogadores);
    const souHost = host === eu();
    $('btn-comecar').hidden = !souHost;
    $('btn-comecar').disabled = !pode.ok;
    $('espera-motivo').textContent = souHost
      ? (pode.ok ? 'Todos prontos? Clique em Começar.' : pode.motivo)
      : 'Esperando ' + nome(host) + ' começar a partida...';
    Tela.mostrar('tela-espera');
  }

  function comecar() {
    const p = Regras.prepararPartida(config(), jogadores, sessao.banco.pares.length);
    conexao.enviar({ partida: estado.partida + 1, vez: 0, tipo: 'comecar', jogador: eu(), cartas: p.cartas, times: p.times });
    $('btn-comecar').disabled = true;
    $('btn-de-novo').disabled = true;
  }
  $('btn-comecar').addEventListener('click', comecar);
  $('btn-de-novo').addEventListener('click', comecar);

  function possoClicar() {
    if (estado.fase !== 'jogo' || estado.jogador !== eu() || estado.abertas.length >= 2) return false;
    if (cliquePendente && cliquePendente.vez === estado.vez && cliquePendente.abertas === estado.abertas.length) return false;
    return agora() >= estado.inicioVez;
  }

  function clicar(i) {
    if (!possoClicar() || estado.cartas[i].situacao !== 'fechada') return;
    cliquePendente = { vez: estado.vez, abertas: estado.abertas.length };
    conexao.enviar({ partida: estado.partida, vez: estado.vez, tipo: 'virar', jogador: eu(), carta: i });
    pintarTabuleiro();
  }

  function pintarTabuleiro() {
    clicavelAntes = possoClicar();
    tabuleiro.pintar(estado, { clicavel: clicavelAntes, corDoTime: function (id) { return info(id).cor; } });
  }

  function desenharJogo() {
    if (!tabuleiro || tabuleiroDaPartida !== estado.partida) {
      if (tabuleiro) tabuleiro.parar();
      Tela.mostrar('tela-jogo');
      tabuleiro = Tabuleiro.criar($('tabuleiro'), config().pares, sessao.banco,
        estado.cartas.map(function (c) { return c.par * 2 + c.lado; }), clicar);
      tabuleiroDaPartida = estado.partida;
    }
    pintarTabuleiro();
    Tabuleiro.desenharPlacar($('placar'), estado, info, nome, conectado);
    desenharFaixa();
    Tela.mostrar('tela-jogo');
  }

  function restante() {
    if (config().tempo <= 0) return null;
    const ms = Regras.prazo(config(), estado) - Math.max(agora(), estado.inicioVez);
    return Math.max(0, Math.ceil(ms / 1000));
  }

  function desenharFaixa() {
    if (estado.fase !== 'jogo') {
      $('faixa-texto').textContent = 'Fim de jogo!';
      $('relogio').textContent = '';
      return;
    }
    const minha = estado.jogador === eu();
    const i = info(estado.timeDaVez);
    let texto;
    if (minha) texto = estado.abertas.length === 1 ? 'Sua vez! Vire a segunda carta.' : 'Sua vez! Vire uma carta.';
    else texto = 'Vez de ' + nome(estado.jogador) + (config().modo === 'times' ? ' (' + i.nome + ')' : '');
    $('faixa-texto').textContent = texto;
    $('faixa').classList.toggle('minha-vez', minha);
    $('faixa').style.setProperty('--cor', i.cor);
    const s = restante();
    $('relogio').textContent = s === null ? '' : '⏱ ' + s;
    $('relogio').classList.toggle('pouco', s !== null && s <= 5);
    if (minha && s !== null && s <= 5 && s > 0 && ultimoTic !== estado.vez + ':' + s) { ultimoTic = estado.vez + ':' + s; Sons.tocar('tic'); }
  }

  function desenharFim() {
    Tabuleiro.fecharAmpliacao();
    $('fim-titulo').textContent = Tela.desenharPodio($('podio'), estado, config(), jogadores);
    const host = anfitriao();
    $('btn-de-novo').hidden = host !== eu();
    $('btn-de-novo').disabled = false;
    $('fim-aguarde').textContent = host === eu() ? '' : 'Esperando ' + nome(host) + ' para jogar de novo...';
    Tela.mostrar('tela-fim');
  }

  // A cada 250 ms: relógio, cartas clicáveis quando a pausa acaba, e o que este computador precisa avisar.
  function passo() {
    if (!sessao || !sincronizado || !conexao) return;
    if (estado.fase === 'jogo' && tabuleiro) {
      desenharFaixa();
      if (possoClicar() !== clicavelAntes) pintarTabuleiro();
    }
    const acao = Regras.acaoPendente(config(), estado, jogadores, eu(), agora());
    if (!acao) return;
    const chave = estado.partida + ':' + estado.vez + ':' + acao.tipo;
    if (enviados[chave] && Date.now() - enviados[chave] < MS_REENVIO) return;
    enviados[chave] = Date.now();
    const recado = { partida: estado.partida, vez: estado.vez, tipo: acao.tipo, jogador: eu() };
    if (acao.tipo === 'pular') recado.alvo = acao.alvo;
    conexao.enviar(recado);
  }

  // ---------- Som ----------
  function desenharSom() { $('btn-som').textContent = Sons.ligado() ? '🔊' : '🔇'; }
  $('btn-som').addEventListener('click', function () { Sons.alternar(); desenharSom(); });
  desenharSom();

  // Para os testes de fumaça lerem o estado (só leitura).
  window.Memoria = { estado: function () { return estado; }, eu: function () { return sessao ? sessao.eu : null; } };

  iniciar();
})();

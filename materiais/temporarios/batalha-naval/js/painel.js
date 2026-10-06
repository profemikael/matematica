// Painel do professor: liga o Firebase às telas do painel (senhas das turmas, cartões, torcida).
// Só LÊ as salas: nunca escreve nada. Os números vêm do PainelModelo (as mesmas regras do jogo).
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const CHAVE_SENHAS = 'bn-painel-senhas';
  const CHAVE_MODO = 'bn-painel-conta';
  const CHAVE_SOM = 'bn-painel-som';
  const CHAVE_OCULTAS = 'bn-painel-ocultas';
  const MS_RADAR = 3000;

  function ler(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; } }
  function gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ } }

  let sala = null;                                   // Sala do Firebase (só leitura)
  let senhas = (ler(CHAVE_SENHAS) || []).filter(function (s) { return Sala.normalizarSenha(s) === s; });
  const turmas = {};                                 // senha → { salas: { codigo: dados }, erro, parar }
  let aberta = null;                                 // { senha, codigo } na torcida
  let modoConta = ['esconder', 'depois', 'aovivo'].indexOf(ler(CHAVE_MODO)) >= 0 ? ler(CHAVE_MODO) : 'depois';
  let somLigado = ler(CHAVE_SOM) === true;
  // Salas ocultadas pelo professor ("senha/codigo"), só as de hoje: os códigos de sala voltam a valer no dia seguinte.
  function hoje() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  const guardadas = ler(CHAVE_OCULTAS);
  let ocultas = guardadas && guardadas.dia === hoje() && Array.isArray(guardadas.lista) ? guardadas.lista : [];
  let verParadas = false;
  let verOcultas = false;
  const tabs = {};

  // ================= Início =================

  function iniciar() {
    if (!window.firebase || !window.FIREBASE_CONFIG) { $('carregando-texto').textContent = 'Não foi possível carregar o Firebase. Confira a internet e recarregue.'; return; }
    sala = Sala.criar(window.FIREBASE_CONFIG);
    firebase.database().ref('.info/connected').on('value', function (s) { $('sem-conexao').hidden = s.val() === true; });
    tabs[0] = Tela.criarTabuleiro($('tor-mar-0'));
    tabs[1] = Tela.criarTabuleiro($('tor-mar-1'));
    mostrarBotaoSom();
    pintarChaveConta();
    senhas.forEach(observar);
    if (senhas.length) mostrarGeral(); else mostrarTurmas(false);
    setInterval(pintar, 1000);   // relógios e "sem internet há N min"
  }

  // ================= Turmas (senhas) =================

  function mostrarTurmas(podeCancelar) {
    $('turma-erro').textContent = '';
    $('turma-senha').value = '';
    $('btn-cancelar-turma').hidden = !podeCancelar;
    Tela.mostrar('tela-turmas');
    $('turma-senha').focus();
  }

  $('form-turma').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const s = Sala.normalizarSenha($('turma-senha').value);
    if (!s) { $('turma-erro').textContent = 'A senha tem só letras e números (4 a 30).'; return; }
    if (senhas.indexOf(s) >= 0) { mostrarGeral(); return; }
    $('turma-erro').textContent = 'Conferindo...';
    let ok;
    try { ok = await sala.verificarSenha(s); } catch (e) { $('turma-erro').textContent = 'Sem internet. Tente de novo.'; return; }
    if (!ok) { $('turma-erro').textContent = 'Senha não aceita.'; return; }
    senhas.push(s);
    gravar(CHAVE_SENHAS, senhas);
    observar(s);
    mostrarGeral();
  });
  $('btn-cancelar-turma').addEventListener('click', mostrarGeral);
  $('btn-mais-turma').addEventListener('click', function () { mostrarTurmas(true); });

  function removerTurma(s) {
    if (turmas[s] && turmas[s].parar) turmas[s].parar();
    delete turmas[s];
    senhas = senhas.filter(function (x) { return x !== s; });
    gravar(CHAVE_SENHAS, senhas);
    if ($('filtro-turma').value === s) $('filtro-turma').value = '';
    if (!senhas.length) mostrarTurmas(false); else pintar();
  }

  function inicioDoDia() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function observar(s) {
    const t = { salas: {}, erro: false, parar: null };
    turmas[s] = t;
    t.parar = sala.observarTurma(s, inicioDoDia(), {
      aoSala: function (codigo, dados) {
        if (dados) t.salas[codigo] = dados; else delete t.salas[codigo];
        agendarPintura();
      },
      aoErro: function () { t.erro = true; agendarPintura(); }
    });
  }

  let pinturaAgendada = false;
  function agendarPintura() {
    if (pinturaAgendada) return;
    pinturaAgendada = true;
    requestAnimationFrame(function () { pinturaAgendada = false; pintar(); });
  }

  function pintar() {
    if (!$('tela-geral').hidden) pintarGeral();
    if (!$('tela-torcida').hidden) pintarTorcida();
  }

  // ================= Textos =================

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function minutos(ms) {
    const m = Math.floor(ms / 60000);
    return m < 1 ? 'menos de 1 min' : m + ' min';
  }

  function nomeModo(r) { return (r.config.modo === 'rapido' ? 'Rápido' : 'Clássico') + (r.config.turbo ? ' · Turbo' : ''); }

  function relogio(r, agora) { return r.inicioBatalha ? '⏱ ' + Tela.formatarTempo(Math.max(0, (r.fimEm || agora) - r.inicioBatalha)) : ''; }

  // "⚠️ Beto sem internet há 3 min" (só enquanto a partida não acabou), ou null.
  function avisoRede(r) {
    if (r.fase === 'fim') return null;
    for (let j = 0; j < 2; j++) {
      const p = r.jogadores[j];
      if (p.presente && !p.conectado) return '⚠️ ' + p.nome + ' sem internet' + (p.offlineMs !== null ? ' há ' + minutos(p.offlineMs) : '');
    }
    return null;
  }

  function situacao(r) {
    const rede = avisoRede(r);
    if (rede) return rede;
    if (r.fase === 'aguardando') return '⏳ aguardando o 2º jogador';
    if (r.fase === 'posicionamento') return '⚓ posicionando navios';
    if (r.fase === 'fim') return r.vencedor === 'empate' ? '🤝 empate' : '🏆 ' + r.nomes[r.vencedor] + ' venceu';
    return '🎯 vez de ' + r.nomes[r.vez] + (r.etapa === 'responder' ? ' — respondendo' : '');
  }

  function linhaStats(r, j) {
    const p = r.jogadores[j];
    return p.nome + ': ' + p.certas + ' ✔ ' + p.erradas + ' ✗' + (p.pct === null ? '' : ' · ' + p.pct + '%') + ' · 🔥 maior sequência ' + p.maiorSequencia;
  }

  // Conta com o que o aluno respondeu, sem nunca a resposta certa. "7 × 8 = 56 ✔", "7 × 8 → respondeu 54 ✗".
  function textoConta(c) {
    if (!c) return '';
    if (!c.pergunta) return c.certa ? '✔ acertou a conta' : (c.tempo ? '⏰ tempo esgotado' : '✗ errou a conta');
    const p = String(c.pergunta).replace(/\s*=\s*\?\s*$/, '');
    const sep = /[a-zà-ú]/i.test(p) ? ' → ' : ' = ';
    if (c.certa) return p + sep + c.resposta + ' ✔';
    if (c.tempo) return p + ' → ⏰ Tempo esgotado';
    return p + ' → respondeu ' + c.resposta + ' ✗';
  }

  // ================= Visão geral =================

  function mostrarGeral() {
    aberta = null;
    esconderSuspense();
    Tela.mostrar('tela-geral');
    pintarGeral();
  }

  // Resumo de cada sala guardado: só recalcula quando os dados da sala mudam (o Firebase entrega um objeto novo)
  // ou a cada 20 s (para "sem internet há N min" e "parada"). Com muitas salas, o computador do projetor não pesa.
  const resumos = {};
  const MS_RESUMO = 20000;
  function resumoDe(senha, codigo, dados, agora) {
    const k = senha + '/' + codigo;
    const c = resumos[k];
    if (c && c.dados === dados && agora - c.quando < MS_RESUMO) return c.r;
    const r = PainelModelo.resumir(dados, { agora: agora });
    resumos[k] = { dados: dados, quando: agora, r: r };
    return r;
  }

  // Chips das turmas e o filtro: só refeitos quando a lista de senhas (ou o erro de alguma) muda.
  let assinaturaChips = null;
  function pintarChips() {
    const assinatura = JSON.stringify(senhas.map(function (s) { return [s, !!(turmas[s] && turmas[s].erro)]; }));
    if (assinatura === assinaturaChips) return;
    assinaturaChips = assinatura;
    const chips = $('chips-turmas');
    chips.innerHTML = '';
    senhas.forEach(function (s) {
      const t = turmas[s];
      const c = el('span', 'chip' + (t && t.erro ? ' erro' : ''), s + (t && t.erro ? ' — senha não aceita' : ''));
      const x = el('button', '', '✕');
      x.type = 'button';
      x.title = 'Remover esta turma do painel';
      x.addEventListener('click', function () { removerTurma(s); });
      c.appendChild(x);
      chips.appendChild(c);
    });
    const filtro = $('filtro-turma');
    const atual = filtro.value;
    filtro.innerHTML = '';
    filtro.appendChild(el('option', '', 'Todas')).value = '';
    senhas.forEach(function (s) { filtro.appendChild(el('option', '', s)).value = s; });
    filtro.value = senhas.indexOf(atual) >= 0 ? atual : '';
  }
  $('filtro-turma').addEventListener('change', function () { pintarGeral(); });

  // Cartões reaproveitados por sala: só o conteúdo que mudou é trocado (o clique e o foco nunca se perdem).
  const cartoesPorSala = {};
  function pintarGeral() {
    pintarChips();
    const agora = sala.horaServidor();
    const filtro = $('filtro-turma').value;
    const lista = [];
    senhas.forEach(function (s) {
      if (filtro && filtro !== s) return;
      const t = turmas[s];
      if (!t) return;
      Object.keys(t.salas).forEach(function (codigo) {
        lista.push({ senha: s, codigo: codigo, r: resumoDe(s, codigo, t.salas[codigo], agora) });
      });
    });
    lista.sort(function (a, b) {
      const fa = a.r.fase === 'fim' ? 1 : 0, fb = b.r.fase === 'fim' ? 1 : 0;
      return fa - fb || (b.r.criadaEm || 0) - (a.r.criadaEm || 0);
    });
    // Escondidas: as que o professor ocultou (✕) e as paradas (alunos saíram / ninguém joga há 15 min).
    const ocultadas = lista.filter(function (x) { return ocultas.indexOf(chaveSala(x)) >= 0; });
    const paradas = lista.filter(function (x) { return ocultas.indexOf(chaveSala(x)) < 0 && x.r.parada; });
    mudarTexto($('btn-paradas'), verParadas ? 'esconder paradas' : 'mostrar paradas (' + paradas.length + ')');
    $('btn-paradas').hidden = paradas.length === 0;
    mudarTexto($('btn-ocultas'), verOcultas ? 'esconder ocultas' : 'mostrar ocultas (' + ocultadas.length + ')');
    $('btn-ocultas').hidden = ocultadas.length === 0;
    const visiveis = lista.filter(function (x) {
      if (ocultas.indexOf(chaveSala(x)) >= 0) return verOcultas;
      return !x.r.parada || verParadas;
    });
    $('geral-vazio').hidden = visiveis.length > 0;
    const cartoes = $('cartoes');
    const ficam = {};
    visiveis.forEach(function (x, i) {
      const k = chaveSala(x);
      ficam[k] = true;
      let c = cartoesPorSala[k];
      if (!c) {
        c = { el: el('div', 'cartao-sala'), assinatura: null, relogio: null };
        c.el.tabIndex = 0;
        c.el.setAttribute('role', 'button');
        c.el.dataset.senha = x.senha;
        c.el.dataset.codigo = x.codigo;
        c.el.addEventListener('click', function () { abrirTorcida(x.senha, x.codigo); });
        c.el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') abrirTorcida(x.senha, x.codigo); });
        cartoesPorSala[k] = c;
      }
      preencherCartao(c, x, agora);
      if (cartoes.children[i] !== c.el) cartoes.insertBefore(c.el, cartoes.children[i] || null);
    });
    Object.keys(cartoesPorSala).forEach(function (k) {
      if (!ficam[k]) { cartoesPorSala[k].el.remove(); delete cartoesPorSala[k]; }
    });
  }

  function mudarTexto(e, texto) { if (e.textContent !== texto) e.textContent = texto; }

  function preencherCartao(c, x, agora) {
    const r = x.r;
    const oculta = ocultas.indexOf(chaveSala(x)) >= 0;
    const partes = {
      classe: 'cartao-sala' + (r.fase === 'fim' ? ' terminada' : '') + (avisoRede(r) ? ' alerta-rede' : '') + (r.parada || oculta ? ' apagada' : ''),
      topo: x.senha + ' · sala ' + x.codigo + ' · ' + nomeModo(r),
      oculta: oculta,
      placar: r.nomes[0] + '  ' + r.placar[0] + ' × ' + r.placar[1] + '  ' + r.nomes[1],
      afundados: 'placar em casas atingidas · navios afundados ' + r.afundados[0] + ' × ' + r.afundados[1],
      situacao: situacao(r),
      stats: r.fase !== 'aguardando' ? [linhaStats(r, 0), linhaStats(r, 1)] : null,
      partida: r.partida > 1 ? r.partida + 'ª partida' : null,
      parada: r.parada ? '💤 parada — sem jogadas há ' + minutos(agora - (r.ultimaJogadaEm || agora)) : null
    };
    const assinatura = JSON.stringify(partes);
    if (assinatura !== c.assinatura) {
      c.assinatura = assinatura;
      const b = c.el;
      b.className = partes.classe;
      b.innerHTML = '';
      const topo = el('div', 'cs-topo');
      topo.appendChild(el('span', '', partes.topo));
      c.relogio = topo.appendChild(el('span', 'cs-relogio', ''));
      const x2 = el('button', 'cs-ocultar', oculta ? '↺' : '✕');
      x2.type = 'button';
      x2.title = oculta ? 'Mostrar de novo' : 'Ocultar esta sala (só no seu painel)';
      x2.addEventListener('click', function (ev) { ev.stopPropagation(); alternarOculta(x); });
      topo.appendChild(x2);
      b.appendChild(topo);
      b.appendChild(el('div', 'cs-placar', partes.placar));
      b.appendChild(el('div', 'cs-afundados', partes.afundados));
      b.appendChild(el('div', 'cs-situacao', partes.situacao));
      if (partes.stats) {
        const st = el('div', 'cs-stats');
        partes.stats.forEach(function (t) { st.appendChild(el('span', '', t)); });
        b.appendChild(st);
      }
      if (partes.partida) b.appendChild(el('div', 'cs-partida', partes.partida));
      if (partes.parada) b.appendChild(el('div', 'cs-partida', partes.parada));
    }
    mudarTexto(c.relogio, relogio(r, agora));   // o relógio muda a cada segundo sem refazer o cartão
  }

  // Ocultar / mostrar uma sala (só neste computador; o jogo dos alunos não muda).
  function chaveSala(x) { return x.senha + '/' + x.codigo; }
  function alternarOculta(x) {
    const k = chaveSala(x);
    ocultas = ocultas.indexOf(k) >= 0 ? ocultas.filter(function (o) { return o !== k; }) : ocultas.concat(k);
    gravar(CHAVE_OCULTAS, { dia: hoje(), lista: ocultas });
    pintarGeral();
  }
  $('btn-paradas').addEventListener('click', function () { verParadas = !verParadas; pintarGeral(); });
  $('btn-ocultas').addEventListener('click', function () { verOcultas = !verOcultas; pintarGeral(); });

  // ================= Visão de torcida =================

  let vista = null;          // { partida, turno } da última revelação começada (para não repetir)
  let radarVisivel = null;   // { defensor, casas } piscando por 3 s depois do radar
  let timerRadar = null;
  let susp = { fase: null, timer: null, esperaDesde: 0 };   // fase: null | contando | esperando | revelado

  function abrirTorcida(senha, codigo) {
    aberta = { senha: senha, codigo: codigo };
    vista = null;
    radarVisivel = null;
    esconderSuspense();
    Tela.mostrar('tela-torcida');
    pintarTorcida(true);
  }

  $('btn-voltar-geral').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    mostrarGeral();
  });
  $('btn-tela-cheia').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else if ($('tela-torcida').requestFullscreen) $('tela-torcida').requestFullscreen().catch(function () {});
  });

  function pintarChaveConta() {
    document.querySelectorAll('.chave-conta [data-modo]').forEach(function (b) { b.classList.toggle('ativo', b.dataset.modo === modoConta); });
  }
  document.querySelectorAll('.chave-conta [data-modo]').forEach(function (b) {
    b.addEventListener('click', function () { modoConta = b.dataset.modo; gravar(CHAVE_MODO, modoConta); pintarChaveConta(); pintar(); });
  });

  function mostrarBotaoSom() { $('btn-som').textContent = somLigado ? '🔊' : '🔇'; }
  $('btn-som').addEventListener('click', function () {
    somLigado = !somLigado;
    gravar(CHAVE_SOM, somLigado);
    if (somLigado && !Sons.ligado()) Sons.alternar();   // o clique também "destrava" o áudio do navegador
    mostrarBotaoSom();
  });
  function som(nome) { if (somLigado) Sons.tocar(nome); }

  function dadosAbertos() {
    const t = aberta && turmas[aberta.senha];
    return t ? t.salas[aberta.codigo] || null : null;
  }

  // Casas a piscar no mar de `defensor`: a mira ao vivo (responder / esperando o resultado) ou a área do radar.
  function miradaNoMar(r, defensor) {
    if (radarVisivel && radarVisivel.defensor === defensor) return radarVisivel.casas;
    const m = r.mira;
    if (r.fase !== 'batalha' || !m || m.mover || 1 - r.vez !== defensor) return null;
    if (r.etapa !== 'responder' && r.etapa !== 'aguardando_resultado') return null;
    return m.casas && m.casas.length ? m.casas : [Regras.chave(m.l, m.c)];
  }

  function textoFaixa(r, agora) {
    const quem = r.nomes[r.vez];
    if (r.fase === 'aguardando') return '⏳ Aguardando o 2º jogador entrar na sala...';
    if (r.fase === 'posicionamento') return '⚓ Os dois estão posicionando os navios...';
    if (r.fase === 'fim') return r.vencedor === 'empate' ? '🤝 Empate!' : '🏆 ' + r.nomes[r.vencedor] + ' venceu!';
    if (r.etapa === 'escolher') return '🎯 Vez de ' + quem + ' — escolhendo o alvo...';
    if (r.etapa === 'responder') {
      const resta = r.conta && r.conta.fim ? ' ⏱ ' + Math.max(0, Math.ceil((r.conta.fim - agora) / 1000)) + ' s' : '';
      if (r.mira.mover) return '⚓ ' + quem + ' vai mover um navio — respondendo...' + resta;
      if (r.mira.radar) return '📡 ' + quem + ' vai usar o ' + PainelModelo.NOME_FORMATO[r.mira.formato].replace('📡 ', '') + ' em ' + Regras.nomeCasa(r.mira.l, r.mira.c) + ' — respondendo...' + resta;
      const com = r.mira.formato !== 'normal' && PainelModelo.NOME_FORMATO[r.mira.formato] ? ' com ' + PainelModelo.NOME_FORMATO[r.mira.formato] : '';
      return '🎯 ' + quem + ' mirou em ' + Regras.nomeCasa(r.mira.l, r.mira.c) + com + ' — respondendo...' + resta;
    }
    if (r.etapa === 'aguardando_resultado') return '⏳ ' + quem + ' respondeu...';
    if (r.etapa === 'movendo') return '⚓ ' + quem + ' está movendo um navio...';
    return r.linha.length ? r.linha[0].texto : '';
  }

  function pintarConta(r, agora) {
    const caixa = $('tor-conta');
    caixa.innerHTML = '';
    if (r.fase !== 'batalha') return;
    if (r.conta) {   // respondendo agora
      const quem = r.nomes[r.conta.jogador];
      const resta = r.conta.fim ? ' ⏱ ' + Math.max(0, Math.ceil((r.conta.fim - agora) / 1000)) + ' s' : '';
      if (modoConta === 'aovivo' && r.conta.pergunta) {
        caixa.appendChild(el('div', 'pergunta', r.conta.pergunta + ' ' + resta));
        if (r.conta.opcoes) {
          const op = el('div', 'opcoes');
          r.conta.opcoes.forEach(function (o) { op.appendChild(el('span', '', o)); });
          caixa.appendChild(op);
        }
      } else {
        caixa.appendChild(el('div', '', quem + ' está respondendo...' + resta));
      }
      return;
    }
    // Já respondeu (até o próximo tiro): mostra conforme a chave — nunca a resposta certa.
    if (!r.resposta || (r.etapa !== 'aguardando_resultado' && r.etapa !== 'resultado' && r.etapa !== 'movendo')) return;
    const c = r.resposta;
    const quem = r.nomes[c.jogador] + ': ';
    const classe = c.certa ? 'certa' : 'errada';
    if (modoConta === 'esconder') caixa.appendChild(el('div', classe, quem + (c.certa ? '✔ acertou' : (c.tempo ? '⏰ tempo esgotado' : '✗ errou'))));
    else caixa.appendChild(el('div', classe, quem + textoConta(c)));
  }

  function pintarStats(r) {
    const caixa = $('tor-stats');
    caixa.innerHTML = '';
    [0, 1].forEach(function (j) {
      const p = r.jogadores[j];
      const d = el('div');
      d.appendChild(el('p', '', linhaStats(r, j) + (r.config.turbo ? ' · sequência ' + p.sequencia : '')));
      if (r.config.turbo) {
        const a = p.arsenal;
        d.appendChild(el('p', '', 'Arsenal: ⚡ ' + a.duplo + ' · ⚓ ' + a.mover + ' · ✚ ' + a.cruz + ' · ✖ ' + a.x +
          ' · 📡3×3 ' + a.radar3 + ' · 📡4×4 ' + a.radar4 + (r.config.torpedos ? ' · 🚀 ' + p.torpedos : '')));
      }
      caixa.appendChild(d);
    });
  }

  function pintarLinha(r) {
    const ol = $('tor-linha');
    ol.innerHTML = '';
    r.linha.slice(0, 40).forEach(function (x) {
      const li = el('li', '', x.texto);
      if (x.conta && modoConta !== 'esconder' && x.conta.pergunta) li.appendChild(el('span', 'conta', '  (' + textoConta(x.conta) + ')'));
      ol.appendChild(li);
    });
  }

  function pintarTorcida(primeira) {
    const dados = dadosAbertos();
    if (!dados) { $('tor-info').textContent = 'Esta sala não aparece mais.'; return; }
    const agora = sala.horaServidor();
    const r = resumoAberto(dados);
    const e = r.estado;
    $('tor-info').textContent = aberta.senha + ' · sala ' + aberta.codigo + ' · ' + nomeModo(r) + (r.partida > 1 ? ' · ' + r.partida + 'ª partida' : '') + '  ' + relogio(r, agora);
    $('tor-placar').textContent = r.nomes[0] + '  ' + r.placar[0] + ' × ' + r.placar[1] + '  ' + r.nomes[1];
    $('tor-afundados').textContent = 'placar em casas atingidas · navios afundados ' + r.afundados[0] + ' × ' + r.afundados[1];
    $('tor-titulo-1').textContent = 'Mar de ' + r.nomes[1] + ' — ' + r.nomes[0] + ' ataca aqui';
    $('tor-titulo-0').textContent = 'Mar de ' + r.nomes[0] + ' — ' + r.nomes[1] + ' ataca aqui';
    [0, 1].forEach(function (j) {
      // Os navios nunca aparecem: só água, fogo e os afundados (que o atacante já descobriu).
      tabs[j].pintar({ tiros: e.jogadores[j].tiros, afundadas: Regras.casasAfundadas(e, j), mirada: miradaNoMar(r, j), clicavel: function () { return false; } });
    });
    const aviso = avisoRede(r);
    $('tor-faixa-texto').textContent = (aviso ? aviso + ' · ' : '') + textoFaixa(r, agora);
    pintarConta(r, agora);
    pintarStats(r);
    pintarLinha(r);
    acompanharSuspense(r, primeira === true);
  }

  // ================= Contagem 3, 2, 1 e revelação (como na tela dos alunos) =================

  function duracaoSuspenseMs(dados) {
    const s = Number(dados && dados.config && dados.config.suspense);
    return Math.min(3, Math.max(0.1, isFinite(s) && s > 0 ? s : 1)) * 1000;
  }

  function esconderSuspense() {
    clearTimeout(susp.timer);
    susp = { fase: null, timer: null, esperaDesde: 0 };
    $('tor-suspense').hidden = true;
  }

  // Um "responder" novo começa a contagem; a revelação espera o resultado do defensor (tiro ou radar).
  function acompanharSuspense(r, primeira) {
    if (r.fase === 'posicionamento' || r.fase === 'aguardando') return;
    const chave = r.partida + ':' + r.turno;
    const respondido = r.resposta && r.etapa !== 'responder';
    if (primeira) { vista = respondido ? chave : null; return; }   // ao abrir, não repete o que já passou
    if (respondido && vista !== chave) {
      vista = chave;
      contar(r);
      return;
    }
    if (susp.fase === 'esperando') revelar();
  }

  function contar(r) {
    clearTimeout(susp.timer);
    susp.fase = 'contando';
    const passo = duracaoSuspenseMs(dadosAbertos()) / 3;
    const u = r.ultimoTurno;
    $('tor-suspense-titulo').textContent = u.mover ? '⚓ ' + r.nomes[u.jogador] + ' quer mover um navio…'
      : u.radar ? '📡 ' + r.nomes[u.jogador] + ' ligou o radar…'
        : '🎯 ' + r.nomes[u.jogador] + ' respondeu — tiro em ' + Regras.nomeCasa(u.l, u.c) + '…';
    $('tor-suspense-texto').textContent = '';
    $('tor-suspense').hidden = false;
    let n = 3;
    (function proximo() {
      if (n <= 0) { $('tor-suspense-numero').textContent = ''; revelar(); return; }
      $('tor-suspense-numero').textContent = String(n);
      som('tic');
      n -= 1;
      susp.timer = setTimeout(proximo, passo);
    })();
  }

  // No 0 da contagem: o modelo decide (texto, esperar o defensor, ou desistir). Esperando, no máximo 10 s;
  // um clique na tela escura também fecha. Assim ela nunca fica presa cobrindo o projetor.
  const MS_ESPERA_MAX = 10000;
  function revelar() {
    const dados = dadosAbertos();
    if (!dados) { esconderSuspense(); return; }
    const v = PainelModelo.revelacao(resumoAberto(dados));
    if (v.cancelar) { esconderSuspense(); return; }
    if (v.esperando) {
      if (susp.fase !== 'esperando') { susp.fase = 'esperando'; susp.esperaDesde = Date.now(); $('tor-suspense-texto').textContent = '…'; }
      if (Date.now() - susp.esperaDesde > MS_ESPERA_MAX) esconderSuspense();
      return;
    }
    if (v.radar) {
      // Como no jogo: a tela escura fecha e a área pisca no mar por 3 s; depois some.
      esconderSuspense();
      susp.fase = 'revelado';
      radarVisivel = { defensor: v.defensor, casas: v.casas };
      $('tor-faixa-texto').textContent = v.texto;
      som(v.som);
      clearTimeout(timerRadar);
      timerRadar = setTimeout(function () { radarVisivel = null; pintar(); }, MS_RADAR);
      pintar();
      return;
    }
    susp.fase = 'revelado';
    $('tor-suspense-texto').textContent = v.texto;
    if (v.som) som(v.som);
    clearTimeout(susp.timer);
    susp.timer = setTimeout(esconderSuspense, 2000);
  }
  $('tor-suspense').addEventListener('click', esconderSuspense);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !$('tor-suspense').hidden) esconderSuspense(); });

  // Resumo da sala aberta na torcida (guardado como na visão geral: só recalcula quando os dados mudam).
  function resumoAberto(dados) { return resumoDe(aberta.senha, aberta.codigo, dados, sala.horaServidor()); }

  iniciar();
})();

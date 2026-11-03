// Sala dos times: o "carteiro" do Firebase. Cria/entra na sala, escolhe time (máximo 8 alunos), presença,
// e entrega respostas, ataques, navios e o estado público. Implementa a "conexão" que o Anfitrião usa.
// Usa o SDK "compat" do Firebase (scripts clássicos carregados no index.html).
// Caminho: turmas/<senha>/salas-times/<código>. Estado público e estado do anfitrião são gravados como TEXTO (JSON),
// porque o Firebase apaga objetos e listas vazios.
(function (raiz) {
  'use strict';

  const MAX_ALUNOS = 8;
  const MS_24H = 24 * 60 * 60 * 1000;
  const AGORA = function () { return firebase.database.ServerValue.TIMESTAMP; };

  function negado(e) { return /permission/i.test(String((e && (e.code || e.message)) || e)); }

  function criar(firebaseConfig) {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const db = app.database();
    let desvio = 0;
    db.ref('.info/serverTimeOffset').on('value', function (s) { desvio = s.val() || 0; });
    function horaServidor() { return Date.now() + desvio; }
    function refSala(senha, codigo) { return db.ref('turmas/' + senha + '/salas-times/' + codigo); }

    async function verificarSenha(senha) {
      try { await refSala(senha, '0000').child('criadaEm').once('value'); return true; }
      catch (e) { if (negado(e)) return false; throw e; }
    }

    // Cria a sala com um código de 4 números livre (ou com mais de 24 h) e põe o anfitrião como primeiro aluno.
    async function criarSala(senha, config, jogador) {
      for (let tentativa = 0; tentativa < 25; tentativa++) {
        const codigo = String(1000 + Math.floor(Math.random() * 9000));
        try {
          const existente = (await refSala(senha, codigo).child('criadaEm').once('value')).val();
          if (existente && existente > horaServidor() - MS_24H) continue;   // código em uso: tenta outro
          await refSala(senha, codigo).set({
            criadaEm: AGORA(), config: config, anfitriao: jogador.id,
            jogadores: {}
          });
          await refSala(senha, codigo).child('jogadores/' + jogador.id)
            .set({ nome: jogador.nome, time: 0, entrouEm: AGORA(), conectado: true, vistoEm: AGORA() });
          return codigo;
        } catch (e) {
          if (!negado(e)) throw e;   // código ocupado: tenta outro
        }
      }
      throw new Error('Não foi possível criar a sala. Tente de novo.');
    }

    // Entra na sala (ou volta para a própria vaga). Erros com mensagem em português para o aluno.
    async function entrarNaSala(senha, codigo, jogador) {
      if (!/^[0-9]{4}$/.test(codigo)) throw new Error('O código tem 4 números.');
      const snap = await refSala(senha, codigo).once('value');
      const sala = snap.val();
      if (!sala || !sala.criadaEm || sala.criadaEm < horaServidor() - MS_24H) throw new Error('Sala não encontrada.');
      const atuais = sala.jogadores || {};
      if (!atuais[jogador.id]) {
        const r = await refSala(senha, codigo).child('jogadores').transaction(function (cur) {
          cur = cur || {};
          if (cur[jogador.id]) return cur;
          if (Object.keys(cur).length >= MAX_ALUNOS) return;   // cheia: desiste
          cur[jogador.id] = { nome: jogador.nome, time: 0, entrouEm: AGORA(), conectado: true, vistoEm: AGORA() };
          return cur;
        });
        if (!r.committed) throw new Error('A sala já tem ' + MAX_ALUNOS + ' jogadores.');
      }
      return { config: sala.config, anfitriao: sala.anfitriao };
    }

    // Abre a sala para jogar. Devolve a conexão (contrato do plano) com os métodos dos alunos.
    function abrir(senha, codigo, jogador) {
      const sala = refSala(senha, codigo);
      const eu = sala.child('jogadores/' + jogador.id);
      const conectado = db.ref('.info/connected');
      let fechada = false;
      const ouvintes = [];   // [ref, evento, função]

      function ouvir(ref, evento, fn) { ref.on(evento, fn); ouvintes.push([ref, evento, fn]); return function () { ref.off(evento, fn); }; }

      function aoConectado(s) {
        const ligado = s.val() === true;
        if (conexao.aoConexaoCb) conexao.aoConexaoCb(ligado);
        if (!ligado) return;
        eu.onDisconnect().update({ conectado: false, vistoEm: AGORA() });
        eu.update({ nome: jogador.nome, conectado: true, vistoEm: AGORA() });
      }
      conectado.on('value', aoConectado);

      const conexao = {
        aoConexaoCb: null,
        aoConexao: function (cb) { conexao.aoConexaoCb = cb; },
        horaServidor: horaServidor,

        // ---- contrato do Anfitrião ----
        publicar: function (publico) { sala.child('publico').set(JSON.stringify(publico)); },
        salvarEstado: function (estado) { sala.child('estadoAnfitriao').set(JSON.stringify(estado)); },
        lerEstado: async function () { const s = await sala.child('estadoAnfitriao').once('value'); return s.val() ? JSON.parse(s.val()) : null; },
        lerNavios: async function () { const s = await sala.child('navios').once('value'); return s.val() || {}; },
        aoJogadores: function (cb) { return ouvir(sala.child('jogadores'), 'value', function (s) { if (!fechada) cb(s.val() || {}); }); },
        aoRespostas: function (rodada, cb) { return ouvir(sala.child('respostas/' + rodada), 'value', function (s) { if (!fechada) cb(s.val() || {}); }); },
        aoAtaques: function (rodada, cb) { return ouvir(sala.child('ataques/' + rodada), 'value', function (s) { if (!fechada) cb(s.val() || {}); }); },

        // ---- alunos ----
        aoPublico: function (cb) {
          return ouvir(sala.child('publico'), 'value', function (s) { if (!fechada && s.val()) cb(JSON.parse(s.val())); });
        },
        aoNavios: function (cb) { return ouvir(sala.child('navios'), 'value', function (s) { if (!fechada) cb(s.val() || {}); }); },
        gravarNavios: function (timeId, navios, pronto) { return sala.child('navios/' + timeId).set({ navios: navios, pronto: !!pronto }); },
        escolherTime: function (uid, timeId) { return sala.child('jogadores/' + uid + '/time').set(timeId); },
        moverJogador: function (uid, timeId) { return sala.child('jogadores/' + uid + '/time').set(timeId); },
        enviarResposta: function (rodada, texto) { return sala.child('respostas/' + rodada + '/' + jogador.id).set({ texto: String(texto), em: AGORA() }); },
        enviarAtaque: function (rodada, timeId, ataque) {
          return sala.child('ataques/' + rodada + '/' + timeId).set(Object.assign({}, ataque, { por: jogador.id }));
        },
        fechar: function () {
          fechada = true;
          conectado.off('value', aoConectado);
          ouvintes.forEach(function (o) { o[0].off(o[1], o[2]); });
          eu.onDisconnect().cancel();
          eu.update({ conectado: false, vistoEm: AGORA() });
        }
      };
      return conexao;
    }

    return { verificarSenha, criarSala, entrarNaSala, abrir, horaServidor };
  }

  raiz.SalaTimes = { criar: criar, MAX_ALUNOS: MAX_ALUNOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.SalaTimes;
})(typeof window !== 'undefined' ? window : globalThis);

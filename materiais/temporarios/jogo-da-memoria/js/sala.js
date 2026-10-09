// Sala: o "carteiro" do Firebase. Senha da turma, criar/entrar em sala (até 8 lugares), times,
// recados em ordem, presença e hora do servidor. Adaptado do sala.js da Batalha Naval.
// Usa o SDK "compat" do Firebase (scripts clássicos carregados no index.html).
(function (raiz) {
  'use strict';

  const MS_24H = 24 * 60 * 60 * 1000;
  const LUGARES = 8;
  const AGORA = function () { return firebase.database.ServerValue.TIMESTAMP; };

  function negado(erro) {
    return /permission/i.test(String((erro && (erro.code || erro.message)) || erro));
  }

  // Deixa a senha no formato aceito: só letras e números, minúsculas, 4 a 30 caracteres. Inválida → null.
  function normalizarSenha(texto) {
    const s = String(texto || '').trim().toLowerCase();
    return /^[a-z0-9]{4,30}$/.test(s) ? s : null;
  }

  // Outro Chromebook conectado na sala já usa este nome? (o mesmo aluno voltando não conta)
  function nomeOcupado(jogadores, nome, id) {
    const n = String(nome || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return Object.values(jogadores || {}).some(function (j) {
      return j && j.conectado && j.id !== id && String(j.nome || '').trim().toLowerCase().replace(/\s+/g, ' ') === n;
    });
  }

  // A partida já começou se algum recado 'comecar' foi gravado.
  function jaComecou(sala) {
    const recados = sala && sala.recados ? Object.values(sala.recados) : [];
    return recados.some(function (r) { return r && r.tipo === 'comecar'; });
  }

  function criar(firebaseConfig) {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const db = app.database();
    let desvio = 0;
    db.ref('.info/serverTimeOffset').on('value', function (s) { desvio = s.val() || 0; });

    function horaServidor() { return Date.now() + desvio; }
    function refSala(senha, codigo) { return db.ref('memoria/' + senha + '/salas/' + codigo); }

    // true se a senha vale; false se o Firebase recusou. Outros erros (sem internet) são repassados.
    async function verificarSenha(senha) {
      try {
        await refSala(senha, '0000').child('criadaEm').once('value');
        return true;
      } catch (e) {
        if (negado(e)) return false;
        throw e;
      }
    }

    // Cria a sala com um código de 4 números livre (ou com mais de 24 h). Quem cria fica no lugar 0.
    async function criarSala(senha, config, jogador) {
      for (let tentativa = 0; tentativa < 25; tentativa++) {
        const codigo = String(1000 + Math.floor(Math.random() * 9000));
        try {
          await refSala(senha, codigo).set({
            criadaEm: AGORA(),
            config: config,
            jogadores: { 0: { nome: jogador.nome, id: jogador.id, conectado: true, vistoEm: AGORA() } }
          });
          return codigo;
        } catch (e) {
          if (!negado(e)) throw e;   // código ocupado: tenta outro
        }
      }
      throw new Error('Não foi possível criar a sala. Tente de novo.');
    }

    // Entra no primeiro lugar livre (ou volta para o próprio lugar). Devolve { eu, config }.
    // Erros com mensagem para o aluno.
    async function entrarNaSala(senha, codigo, jogador) {
      if (!/^[0-9]{4}$/.test(codigo)) throw new Error('O código tem 4 números.');
      const snap = await refSala(senha, codigo).once('value');
      const sala = snap.val();
      if (!sala || !sala.criadaEm || sala.criadaEm < horaServidor() - MS_24H) throw new Error('Sala não encontrada.');
      const jog = sala.jogadores || {};
      for (let l = 0; l < LUGARES; l++) if (jog[l] && jog[l].id === jogador.id) return { eu: l, config: sala.config };
      if (jaComecou(sala)) throw new Error('A partida dessa sala já começou.');
      if (nomeOcupado(jog, jogador.nome, jogador.id)) throw new Error('Já tem um(a) ' + jogador.nome + ' nesta sala — confira se clicou no seu nome.');
      for (let l = 0; l < LUGARES; l++) {
        if (jog[l]) continue;
        const r = await refSala(senha, codigo).child('jogadores/' + l).transaction(function (atual) {
          if (atual && atual.id !== jogador.id) return;   // alguém pegou antes: desiste deste lugar
          return { nome: jogador.nome, id: jogador.id, conectado: true, vistoEm: horaServidor() };
        });
        if (r.committed) return { eu: l, config: sala.config };
      }
      throw new Error('Essa sala já tem ' + LUGARES + ' jogadores.');
    }

    // Sala de espera: o próprio aluno (ou o anfitrião) põe alguém num time.
    function mudarTime(senha, codigo, lugar, time) {
      return refSala(senha, codigo).child('jogadores/' + lugar + '/time').set(time);
    }

    // Abre a sala para jogar. eventos = { aoRecado(recado), aoSincronizado(), aoJogadores(jogadores), aoConexao(ligado) }
    // Devolve { enviar(recado), horaServidor(), sair(), fechar() }.
    function abrir(senha, codigo, eu, jogador, eventos) {
      const sala = refSala(senha, codigo);
      const cadeira = sala.child('jogadores/' + eu);
      const recados = sala.child('recados');
      const conectado = db.ref('.info/connected');

      function aoConectado(s) {
        const ligado = s.val() === true;
        if (eventos.aoConexao) eventos.aoConexao(ligado);
        if (!ligado) return;
        cadeira.onDisconnect().update({ conectado: false, vistoEm: AGORA() });
        cadeira.update({ nome: jogador.nome, id: jogador.id, conectado: true, vistoEm: AGORA() });
      }
      let fechada = false;
      const ordenador = criarOrdenador({
        // Grava no índice pedido (negado pelas regras se já existir) e devolve o recado com a hora do servidor.
        gravar: function (indice, recado) {
          const ref = recados.child(String(indice));
          return ref.set(Object.assign({}, recado, { em: AGORA() }))
            .then(function () { return ref.once('value'); })
            .then(function (s) { return s.val(); });
        },
        entregar: function (recado) { if (!fechada) eventos.aoRecado(recado); },
        novoId: function () { return jogador.id + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
      });

      function aoJogadores(s) { if (!fechada && eventos.aoJogadores) eventos.aoJogadores(s.val() || {}); }
      function aoRecado(s) { if (!fechada) ordenador.chegou(Number(s.key), s.val()); }

      conectado.on('value', aoConectado);
      sala.child('jogadores').on('value', aoJogadores);
      // child_added entrega os recados antigos e depois os novos; o 'value' abaixo chega depois dos antigos.
      // child_changed: quando meu recado perde a disputa por um índice, o Firebase desfaz o meu e mostra o do
      // colega naquele índice como "mudança" (não como "novo") — ele também precisa entrar na ordem.
      recados.on('child_added', aoRecado);
      recados.on('child_changed', aoRecado);
      recados.once('value', function () { if (!fechada && eventos.aoSincronizado) eventos.aoSincronizado(); });

      return {
        enviar: function (recado) { ordenador.enviar(recado); },
        horaServidor: horaServidor,
        // A página está sendo escondida/fechada: marca "saiu" SEM cancelar o aviso automático de desconexão e
        // desliga a conexão (o servidor também dispara o aviso). Serve para o Chrome que congela a página.
        sair: function () {
          if (fechada) return;
          cadeira.update({ conectado: false, vistoEm: AGORA() });
          db.goOffline();
        },
        fechar: function () {
          fechada = true;
          conectado.off('value', aoConectado);
          sala.child('jogadores').off('value', aoJogadores);
          recados.off('child_added', aoRecado);
          recados.off('child_changed', aoRecado);
          cadeira.onDisconnect().cancel();
          cadeira.update({ conectado: false, vistoEm: AGORA() });
        }
      };
    }

    // Lê como a sala está agora (para a tela inicial decidir se dá para voltar). Sala vencida → null.
    async function lerSala(senha, codigo) {
      const snap = await refSala(senha, codigo).once('value');
      const sala = snap.val();
      if (!sala || !sala.criadaEm || sala.criadaEm < horaServidor() - MS_24H) return null;
      return sala;
    }

    // Lista de nomes da turma (nomes/<senha>), ou null se não houver (ou se o Firebase recusar).
    async function lerNomes(senha) {
      try {
        const snap = await db.ref('nomes/' + senha).once('value');
        return snap.val();
      } catch (e) {
        if (negado(e)) return null;
        throw e;
      }
    }

    return { verificarSenha, criarSala, entrarNaSala, mudarTime, abrir, lerSala, lerNomes, horaServidor };
  }

  // Ordenador: garante que todos os computadores apliquem os recados na MESMA ordem.
  // Cada recado ocupa um índice (0, 1, 2, ...) na sala; gravar num índice já ocupado é negado pelas regras,
  // e aí o recado tenta o próximo. Os recados só são entregues em ordem de índice, e os MEUS só depois de
  // confirmados pelo Firebase (o eco local antes da confirmação é ignorado).
  // opcoes = { gravar(indice, recado) → Promise<recado salvo>, entregar(recado), novoId() → texto único }
  function criarOrdenador(opcoes) {
    let proximo = 0;               // próximo índice a entregar
    let maiorVisto = -1;           // maior índice que já sei que existe
    const chegados = new Map();    // índice → recado, esperando os anteriores
    const meusPendentes = new Set();
    const fila = [];               // meus recados esperando a vez de gravar (um de cada vez, na ordem)
    let gravando = false;

    function registrar(indice, recado) {
      if (indice < proximo || chegados.has(indice)) return;
      if (indice > maiorVisto) maiorVisto = indice;
      chegados.set(indice, recado);
      while (chegados.has(proximo)) {
        const r = chegados.get(proximo);
        chegados.delete(proximo);
        proximo += 1;
        opcoes.entregar(r);
      }
    }

    function chegou(indice, recado) {
      if (!Number.isInteger(indice) || !recado) return;
      if (recado.uid && meusPendentes.has(recado.uid)) return;   // eco local do meu recado ainda não confirmado
      registrar(indice, recado);
    }

    async function gravarProximo() {
      if (gravando || fila.length === 0) return;
      gravando = true;
      const recado = fila[0];
      meusPendentes.add(recado.uid);
      let indice = Math.max(proximo, maiorVisto + 1);
      let salvo = null;
      while (salvo === null) {
        try {
          salvo = await opcoes.gravar(indice, recado);
        } catch (e) {
          if (!negado(e)) { console.warn('recado não enviado', e); await new Promise(function (r) { setTimeout(r, 1000); }); continue; }
          indice = Math.max(indice + 1, maiorVisto + 1);   // alguém gravou antes neste índice
        }
      }
      meusPendentes.delete(recado.uid);
      fila.shift();
      registrar(indice, salvo);
      gravando = false;
      gravarProximo();
    }

    function enviar(recado) {
      fila.push(Object.assign({ uid: opcoes.novoId() }, recado));
      gravarProximo();
    }

    return { chegou: chegou, enviar: enviar };
  }

  const Sala = { criar: criar, criarOrdenador: criarOrdenador, normalizarSenha: normalizarSenha, jaComecou: jaComecou, nomeOcupado: nomeOcupado, MS_24H: MS_24H, LUGARES: LUGARES };
  raiz.Sala = Sala;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sala;
})(typeof window !== 'undefined' ? window : globalThis);

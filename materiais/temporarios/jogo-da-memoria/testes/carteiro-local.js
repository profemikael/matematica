// Carteiro LOCAL (só para testes, com ?local=1 no endereço): imita o Sala.criar() do Firebase
// usando o armazenamento do navegador. Abas do MESMO navegador jogam juntas, sem internet.
// Senha aceita: "teste". Fechar a aba marca o jogador como desconectado (como o onDisconnect do Firebase).
// Cada pedaço fica numa chave própria (cada aba grava só o que é seu), porque o armazenamento demora um
// pouco para chegar às outras abas: regravar tudo de uma vez apagaria o que outra aba acabou de gravar.
//   mem-local:<código>:sala   → { criadaEm, config }
//   mem-local:<código>:j:<l>  → jogador do lugar l (nome, id, conectado, vistoEm)
//   mem-local:<código>:t:<l>  → time do lugar l
//   mem-local:<código>:r:<n>  → recado n
(function (raiz) {
  'use strict';

  function ler(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  const ouvintes = new Set();
  function gravar(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
    ouvintes.forEach(function (f) { setTimeout(f, 0); });   // nesta aba; nas outras, o evento 'storage'
  }
  raiz.addEventListener('storage', function () { ouvintes.forEach(function (f) { f(); }); });

  function chave(codigo, resto) { return 'mem-local:' + codigo + ':' + resto; }
  function jogadoresDe(codigo) {
    const jog = {};
    for (let l = 0; l < 8; l++) {
      const j = ler(chave(codigo, 'j:' + l));
      if (!j) continue;
      const t = ler(chave(codigo, 't:' + l));
      if (t !== null) j.time = t;
      jog[l] = j;
    }
    return jog;
  }
  function recadosDe(codigo) {
    const lista = [];
    for (let n = 0; ; n++) { const r = ler(chave(codigo, 'r:' + n)); if (!r) return lista; lista.push(r); }
  }
  function salaDe(codigo) {
    const s = ler(chave(codigo, 'sala'));
    if (!s) return null;
    return { criadaEm: s.criadaEm, config: s.config, jogadores: jogadoresDe(codigo), recados: recadosDe(codigo) };
  }

  function criar() {
    function horaServidor() { return Date.now(); }

    async function verificarSenha(senha) { return senha === 'teste'; }

    async function criarSala(senha, config, jogador) {
      let codigo;
      do { codigo = String(1000 + Math.floor(Math.random() * 9000)); } while (ler(chave(codigo, 'sala')));
      gravar(chave(codigo, 'sala'), { criadaEm: Date.now(), config: config });
      gravar(chave(codigo, 'j:0'), { nome: jogador.nome, id: jogador.id, conectado: true, vistoEm: Date.now() });
      return codigo;
    }

    async function entrarNaSala(senha, codigo, jogador) {
      if (!/^[0-9]{4}$/.test(codigo)) throw new Error('O código tem 4 números.');
      const sala = salaDe(codigo);
      if (!sala) throw new Error('Sala não encontrada.');
      for (let l = 0; l < 8; l++) if (sala.jogadores[l] && sala.jogadores[l].id === jogador.id) return { eu: l, config: sala.config };
      if (Sala.jaComecou(sala)) throw new Error('A partida dessa sala já começou.');
      if (Sala.nomeOcupado(sala.jogadores, jogador.nome, jogador.id)) throw new Error('Já tem um(a) ' + jogador.nome + ' nesta sala — confira se clicou no seu nome.');
      for (let l = 0; l < 8; l++) {
        if (sala.jogadores[l]) continue;
        gravar(chave(codigo, 'j:' + l), { nome: jogador.nome, id: jogador.id, conectado: true, vistoEm: Date.now() });
        return { eu: l, config: sala.config };
      }
      throw new Error('Essa sala já tem 8 jogadores.');
    }

    async function mudarTime(senha, codigo, lugar, time) { gravar(chave(codigo, 't:' + lugar), time); }

    function abrir(senha, codigo, eu, jogador, eventos) {
      let entregues = 0;
      let jogadoresAntes = '';
      let fechada = false;
      function marcar(ligado) {
        gravar(chave(codigo, 'j:' + eu), { nome: jogador.nome, id: jogador.id, conectado: ligado, vistoEm: Date.now() });
      }
      function olhar() {
        if (fechada) return;
        const j = JSON.stringify(jogadoresDe(codigo));
        if (j !== jogadoresAntes) { jogadoresAntes = j; eventos.aoJogadores(JSON.parse(j)); }
        for (;;) {
          const r = ler(chave(codigo, 'r:' + entregues));
          if (!r) break;
          entregues += 1;
          eventos.aoRecado(r);
        }
      }
      function aoSair() { marcar(false); }
      raiz.CarteiroLocal.abertas += 1;
      ouvintes.add(olhar);
      raiz.addEventListener('pagehide', aoSair);
      marcar(true);
      if (eventos.aoConexao) eventos.aoConexao(true);
      setTimeout(function () { olhar(); if (eventos.aoSincronizado) eventos.aoSincronizado(); }, 0);
      return {
        enviar: function (recado) {
          let n = entregues;
          while (localStorage.getItem(chave(codigo, 'r:' + n))) n += 1;
          gravar(chave(codigo, 'r:' + n), Object.assign({}, recado, { em: Date.now() }));
        },
        horaServidor: horaServidor,
        sair: function () { if (!fechada) marcar(false); },
        fechar: function () { fechada = true; raiz.CarteiroLocal.abertas -= 1; ouvintes.delete(olhar); raiz.removeEventListener('pagehide', aoSair); marcar(false); }
      };
    }

    async function lerSala(senha, codigo) { return salaDe(codigo); }

    // Com &nomes=1 no endereço, a senha "teste" tem uma turma de mentira (para testar a lista de nomes).
    async function lerNomes(senha) {
      if (!/[?&]nomes=1/.test(location.search) || senha !== 'teste') return null;
      return { turma: 'Teste', alunos: [
        { numero: 1, nome: 'Ana Maria Souza' }, { numero: 2, nome: 'BETO CARLOS DE LIMA' }, { numero: 3, nome: 'Caio Silva' },
        { numero: 4, nome: 'Maria Eduarda Benites dos Santos' }] };
    }

    return { verificarSenha, criarSala, entrarNaSala, mudarTime, abrir, lerSala, lerNomes, horaServidor };
  }

  // abertas: quantas conexões desta aba estão abertas agora (o teste confere que um clique duplo não abre duas).
  raiz.CarteiroLocal = { criar: criar, abertas: 0 };
})(window);

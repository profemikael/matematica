// Bancos de cartas: cada arquivo em bancos/ chama registrarBancoMemoria({ titulo, pares: [...] }).
// Par = { igual: lado }  (duas cartas iguais)  ou  { a: lado, b: lado }  (duas cartas diferentes que combinam).
// Ou, no lugar de "pares", "itens": [{ imagem, nome, pergunta }] — serve para os dois jeitos de jogar.
// Lado = { imagem: "nome-do-desenho" ou "pasta/arquivo.png", texto: "..." } — pelo menos um dos dois.
(function (raiz) {
  'use strict';

  const MINIMO_PARES = 10;
  const TAMANHOS = [10, 20, 30, 40];
  const registrados = [];

  function registrarBancoMemoria(banco) { registrados.push(banco); }

  function validarLado(lado) {
    if (!lado || typeof lado !== 'object') return null;
    const imagem = typeof lado.imagem === 'string' ? lado.imagem.trim() : '';
    const texto = typeof lado.texto === 'string' ? lado.texto.trim() : '';
    if (!imagem && !texto) return null;
    return { imagem: imagem, texto: texto };
  }

  // Formato "itens" (um item = desenho + nome + pergunta) vira as duas listas de pares:
  //   cartas iguais: desenho + nome ↔ desenho + nome;  perguntas: pergunta ↔ desenho + nome.
  function paresDeItens(itens) {
    const iguais = itens.map(function (it) { it = it || {}; return { igual: { imagem: it.imagem, texto: it.nome } }; });
    const todasComPergunta = itens.every(function (it) { return it && typeof it.pergunta === 'string' && it.pergunta.trim(); });
    const perguntas = todasComPergunta ? itens.map(function (it) {
      return { a: { texto: it.pergunta }, b: { imagem: it.imagem, texto: it.nome } };
    }) : null;
    return { iguais: iguais, perguntas: perguntas };
  }

  function validarLista(lista) {
    const pares = [];
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i] || {};
      const a = validarLado(p.igual || p.a);
      const b = validarLado(p.igual || p.b);
      if (!a || !b) return { erro: 'o par ' + (i + 1) + ' está sem imagem e sem texto' };
      pares.push({ a: a, b: b });
    }
    return { pares: pares };
  }

  // → { arquivo, titulo, pares: [{ a, b }], perguntas: [{ a, b }] | null, tamanhos: [10, 20, ...], erro }
  // pares = jeito "cartas iguais" (ou os pares do banco); perguntas = jeito "perguntas e respostas" (ou null).
  function validarBanco(banco, arquivo) {
    const titulo = banco && typeof banco.titulo === 'string' && banco.titulo.trim() ? banco.titulo.trim() : arquivo;
    const falha = function (erro) { return { arquivo: arquivo, titulo: titulo, pares: [], perguntas: null, tamanhos: [], erro: erro }; };
    let lista = banco && Array.isArray(banco.pares) ? banco.pares : [];
    let listaPerguntas = null;
    if (banco && Array.isArray(banco.itens)) {
      const d = paresDeItens(banco.itens);
      lista = d.iguais;
      listaPerguntas = d.perguntas;
    }
    const v = validarLista(lista);
    if (v.erro) return falha(v.erro);
    if (v.pares.length < MINIMO_PARES) return falha('tem ' + v.pares.length + ' pares (precisa de pelo menos ' + MINIMO_PARES + ')');
    const vp = listaPerguntas ? validarLista(listaPerguntas) : null;
    return {
      arquivo: arquivo, titulo: titulo, pares: v.pares, perguntas: vp && !vp.erro ? vp.pares : null,
      tamanhos: TAMANHOS.filter(function (n) { return n <= v.pares.length; }), erro: null
    };
  }

  // O banco visto pelo jogo no jeito escolhido: a mesma coisa, com "pares" = a lista daquele jeito.
  function doJeito(banco, jeito) {
    if (jeito === 'perguntas' && banco.perguntas) return Object.assign({}, banco, { pares: banco.perguntas });
    return banco;
  }

  function carregarScript(src) {
    return new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  // Carrega os arquivos de banco (um de cada vez, para saber qual registrou o quê).
  async function carregarBancos(arquivos, pasta) {
    const bancos = [];
    for (const arquivo of arquivos) {
      const antes = registrados.length;
      const carregou = await carregarScript(pasta + arquivo);
      if (!carregou) {
        bancos.push({ arquivo: arquivo, titulo: arquivo, pares: [], perguntas: null, tamanhos: [], erro: 'arquivo não encontrado' });
      } else if (registrados.length === antes) {
        bancos.push({ arquivo: arquivo, titulo: arquivo, pares: [], perguntas: null, tamanhos: [], erro: 'erro de digitação no arquivo (vírgula, aspas ou chaves)' });
      } else {
        bancos.push(validarBanco(registrados[registrados.length - 1], arquivo));
      }
    }
    return bancos;
  }

  // Carta (número do recado 'comecar') → o lado do banco que ela mostra.
  function ladoDaCarta(banco, carta) {
    const par = banco.pares[Math.floor(carta / 2)];
    return par ? (carta % 2 === 0 ? par.a : par.b) : null;
  }

  const Bancos = { MINIMO_PARES, registrarBancoMemoria, validarBanco, doJeito, carregarScript, carregarBancos, ladoDaCarta, registrados };
  raiz.Bancos = Bancos;
  raiz.registrarBancoMemoria = registrarBancoMemoria;
  if (typeof module !== 'undefined' && module.exports) module.exports = Bancos;
})(typeof window !== 'undefined' ? window : globalThis);

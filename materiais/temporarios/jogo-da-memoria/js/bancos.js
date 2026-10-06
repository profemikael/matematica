// Bancos de cartas: cada arquivo em bancos/ chama registrarBancoMemoria({ titulo, pares: [...] }).
// Par = { igual: lado }  (duas cartas iguais)  ou  { a: lado, b: lado }  (duas cartas diferentes que combinam).
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

  // → { arquivo, titulo, pares: [{ a, b }], tamanhos: [10, 20, ...], erro }
  function validarBanco(banco, arquivo) {
    const titulo = banco && typeof banco.titulo === 'string' && banco.titulo.trim() ? banco.titulo.trim() : arquivo;
    const lista = banco && Array.isArray(banco.pares) ? banco.pares : [];
    const pares = [];
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i] || {};
      const a = validarLado(p.igual || p.a);
      const b = validarLado(p.igual || p.b);
      if (!a || !b) {
        return { arquivo: arquivo, titulo: titulo, pares: [], tamanhos: [], erro: 'o par ' + (i + 1) + ' está sem imagem e sem texto' };
      }
      pares.push({ a: a, b: b });
    }
    if (pares.length < MINIMO_PARES) {
      return { arquivo: arquivo, titulo: titulo, pares: [], tamanhos: [], erro: 'tem ' + pares.length + ' pares (precisa de pelo menos ' + MINIMO_PARES + ')' };
    }
    return { arquivo: arquivo, titulo: titulo, pares: pares, tamanhos: TAMANHOS.filter(function (n) { return n <= pares.length; }), erro: null };
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
        bancos.push({ arquivo: arquivo, titulo: arquivo, pares: [], tamanhos: [], erro: 'arquivo não encontrado' });
      } else if (registrados.length === antes) {
        bancos.push({ arquivo: arquivo, titulo: arquivo, pares: [], tamanhos: [], erro: 'erro de digitação no arquivo (vírgula, aspas ou chaves)' });
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

  const Bancos = { MINIMO_PARES, registrarBancoMemoria, validarBanco, carregarScript, carregarBancos, ladoDaCarta, registrados };
  raiz.Bancos = Bancos;
  raiz.registrarBancoMemoria = registrarBancoMemoria;
  if (typeof module !== 'undefined' && module.exports) module.exports = Bancos;
})(typeof window !== 'undefined' ? window : globalThis);

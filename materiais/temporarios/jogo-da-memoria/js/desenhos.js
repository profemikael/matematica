// Desenhos das cartas: cada arquivo em desenhos/ chama registrarDesenho("nome", '<svg ...>...</svg>').
// Desenhos.carta(lado) monta o conteúdo da face de uma carta: imagem (desenho ou arquivo) + texto embaixo.
(function (raiz) {
  'use strict';

  const desenhos = {};

  function registrarDesenho(nome, svg) { desenhos[nome] = svg; }
  function existe(nome) { return Object.prototype.hasOwnProperty.call(desenhos, nome); }
  function ehArquivo(imagem) { return /\.(png|jpe?g|gif|webp|svg)$/i.test(imagem); }

  function escapar(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // HTML da face da carta. pasta = de onde vêm as imagens de arquivo (ex.: "bancos/").
  function carta(lado, pasta) {
    let html = '';
    if (lado.imagem) {
      if (ehArquivo(lado.imagem)) html += '<img class="carta-img" src="' + escapar((pasta || '') + lado.imagem) + '" alt="">';
      else if (existe(lado.imagem)) html += '<div class="carta-img">' + desenhos[lado.imagem] + '</div>';
      else html += '<div class="carta-img carta-sem-desenho">?</div>';
    }
    if (lado.texto) html += '<div class="carta-texto">' + escapar(lado.texto) + '</div>';
    return html;
  }

  const Desenhos = { registrarDesenho, existe, ehArquivo, carta, escapar, todos: desenhos };
  raiz.Desenhos = Desenhos;
  raiz.registrarDesenho = registrarDesenho;
  if (typeof module !== 'undefined' && module.exports) module.exports = Desenhos;
})(typeof window !== 'undefined' ? window : globalThis);

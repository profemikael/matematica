// Desenhos de Astronomia e a Terra (estilo da folha do professor: contorno verde-escuro, cores chapadas).
// Todos em uma caixa de 100 × 100. As fases da Lua estão como se vê do BRASIL (hemisfério sul):
// crescente iluminada à ESQUERDA (parece um "C"), minguante à direita.
(function () {
  'use strict';

  const C = '#12524a';        // contorno
  const AMARELO = '#fbbf24';
  const AZUL = '#60a5fa';
  const VERDE = '#3fae5a';
  const CINZA = '#e3e8e6';
  const ESCURO = '#22302f';
  const LARANJA = '#c4541f';
  const CREME = '#fdf3dc';

  function svg(corpo) {
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round">' + corpo + '</svg>';
  }
  function circulo(cx, cy, r, fill, extra) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" stroke="' + C + '" stroke-width="3.5"' + (extra || '') + '/>';
  }
  function raios(cx, cy, r1, r2, n, cor, largura, giro) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI + (giro || 0);
      s += '<line x1="' + (cx + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (cy + r1 * Math.sin(a)).toFixed(1) +
        '" x2="' + (cx + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (cy + r2 * Math.sin(a)).toFixed(1) +
        '" stroke="' + cor + '" stroke-width="' + largura + '"/>';
    }
    return s;
  }
  function estrela(cx, cy, r, fill) {
    let p = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      p += (cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1) + ' ';
    }
    return '<polygon points="' + p.trim() + '" fill="' + (fill || AMARELO) + '" stroke="' + C + '" stroke-width="' + (r > 15 ? 3.5 : 2) + '"/>';
  }
  function crateras() {
    return '<circle cx="40" cy="40" r="5" fill="#c9d0cd"/><circle cx="60" cy="58" r="7" fill="#c9d0cd"/><circle cx="58" cy="35" r="3.5" fill="#c9d0cd"/><circle cx="38" cy="63" r="3" fill="#c9d0cd"/>';
  }

  // Fase da Lua: parte iluminada como vista do hemisfério sul.
  // lado = 'esq' | 'dir' (de que lado está a luz); forma = 'fina' | 'metade' | 'gibosa'
  function fase(lado, forma) {
    const r = 34;
    // Luz à esquerda: arco de fora pela esquerda; o terminador volta como meia-elipse.
    let luz;
    if (forma === 'metade') luz = 'M50,16 A' + r + ',' + r + ' 0 0 0 50,84 Z';
    else if (forma === 'fina') luz = 'M50,16 A' + r + ',' + r + ' 0 0 0 50,84 A22,' + r + ' 0 0 1 50,16 Z';
    else luz = 'M50,16 A' + r + ',' + r + ' 0 0 0 50,84 A22,' + r + ' 0 0 0 50,16 Z';
    const espelho = lado === 'dir' ? ' transform="translate(100,0) scale(-1,1)"' : '';
    return svg('<circle cx="50" cy="50" r="' + r + '" fill="' + ESCURO + '"/>' +
      '<path d="' + luz + '" fill="' + CINZA + '"' + espelho + '/>' +
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + C + '" stroke-width="3.5"/>');
  }

  const D = {
    'sol': svg(raios(50, 50, 30, 44, 8, C, 4.5) + circulo(50, 50, 22, AMARELO)),
    'lua-cheia': svg(circulo(50, 50, 34, CINZA) + crateras()),
    'lua-nova': svg(circulo(50, 50, 34, ESCURO)),
    'lua-crescente': fase('esq', 'fina'),
    'lua-minguante': fase('dir', 'fina'),
    'quarto-crescente': fase('esq', 'metade'),
    'quarto-minguante': fase('dir', 'metade'),
    'gibosa-crescente': fase('esq', 'gibosa'),
    'gibosa-minguante': fase('dir', 'gibosa'),
    'eclipse-solar': svg(raios(50, 50, 33, 45, 8, AMARELO, 4.5, Math.PI / 8) +
      '<circle cx="50" cy="50" r="31" fill="#fde68a"/>' + circulo(50, 50, 26, ESCURO)),
    'eclipse-lunar': svg(circulo(50, 50, 34, '#b8461d') +
      '<path d="M26,30 A34,34 0 0 1 70,22 A30,30 0 0 0 26,30 Z" fill="#7a2c12" opacity=".5"/>' +
      '<circle cx="38" cy="40" r="10" fill="#8f3415" opacity=".75"/><circle cx="60" cy="62" r="6" fill="#8f3415" opacity=".6"/>' +
      '<circle cx="50" cy="50" r="34" fill="none" stroke="' + C + '" stroke-width="3.5"/>'),
    'terra': svg(circulo(50, 50, 34, AZUL) +
      '<path d="M28,38 C32,30 44,30 46,36 C48,42 40,46 34,46 C28,46 25,42 28,38 Z" fill="' + VERDE + '"/>' +
      '<path d="M54,52 C60,46 72,48 74,56 C76,64 66,70 58,66 C52,63 50,56 54,52 Z" fill="' + VERDE + '"/>' +
      '<path d="M34,62 C38,60 42,64 40,68 C38,71 33,69 34,62 Z" fill="' + VERDE + '"/>' +
      '<circle cx="50" cy="50" r="34" fill="none" stroke="' + C + '" stroke-width="3.5"/>'),
    'terra-inclinada': svg(circulo(48, 56, 28, AZUL) +
      '<path d="M34,48 C38,42 48,43 48,49 C48,54 40,56 36,54 C32,52 32,50 34,48 Z" fill="' + VERDE + '"/>' +
      '<path d="M52,62 C58,58 68,61 66,68 C64,74 56,74 52,70 Z" fill="' + VERDE + '"/>' +
      '<circle cx="48" cy="56" r="28" fill="none" stroke="' + C + '" stroke-width="3.5"/>' +
      '<line x1="34" y1="20" x2="62" y2="92" stroke="' + C + '" stroke-width="3" stroke-dasharray="4 4"/>' +
      '<line x1="48" y1="14" x2="48" y2="26" stroke="' + C + '" stroke-width="2" opacity=".5"/>' +
      '<text x="68" y="20" font-family="Arial, sans-serif" font-weight="bold" font-size="13" fill="' + C + '">23,5°</text>'),
    'orbita-terra-sol': svg('<ellipse cx="50" cy="50" rx="44" ry="24" fill="none" stroke="' + C + '" stroke-width="3" stroke-dasharray="5 5"/>' +
      circulo(50, 50, 13, AMARELO) + circulo(92, 50, 7, AZUL, ' stroke-width="3"')),
    'sol-terra-lua': svg('<line x1="20" y1="50" x2="88" y2="50" stroke="' + C + '" stroke-width="2.5" stroke-dasharray="3 5"/>' +
      circulo(20, 50, 15, AMARELO) + circulo(58, 50, 10, AZUL) + circulo(86, 50, 5.5, CINZA, ' stroke-width="3"')),
    'estrela': svg(estrela(50, 53, 38)),
    'cruzeiro-do-sul': svg('<line x1="50" y1="14" x2="50" y2="86" stroke="' + C + '" stroke-width="2.5" stroke-dasharray="3 4"/>' +
      '<line x1="22" y1="54" x2="78" y2="42" stroke="' + C + '" stroke-width="2.5" stroke-dasharray="3 4"/>' +
      estrela(50, 14, 9) + estrela(50, 86, 10) + estrela(22, 54, 8) + estrela(78, 42, 9) + estrela(62, 60, 6)),
    'via-lactea': svg('<ellipse cx="50" cy="50" rx="42" ry="20" fill="#e9e4ff" opacity=".6"/>' +
      '<path d="M50,50 C58,40 74,44 76,54 C78,66 60,74 44,70 C24,64 20,44 32,34" fill="none" stroke="' + C + '" stroke-width="3.5"/>' +
      '<path d="M50,50 C42,60 26,56 24,46 C22,34 40,26 56,30 C76,36 80,56 68,66" fill="none" stroke="' + C + '" stroke-width="3.5"/>' +
      '<circle cx="50" cy="50" r="7" fill="' + AMARELO + '" stroke="' + C + '" stroke-width="2.5"/>' +
      '<circle cx="18" cy="30" r="2" fill="' + AMARELO + '"/><circle cx="84" cy="72" r="2.5" fill="' + AMARELO + '"/><circle cx="82" cy="28" r="2" fill="' + AMARELO + '"/><circle cx="20" cy="74" r="2" fill="' + AMARELO + '"/>'),
    'telescopio': svg('<g transform="rotate(-28 50 40)"><rect x="26" y="30" width="46" height="18" rx="4" fill="' + CINZA + '" stroke="' + C + '" stroke-width="3.5"/>' +
      '<rect x="72" y="27" width="8" height="24" rx="2" fill="' + AZUL + '" stroke="' + C + '" stroke-width="3"/>' +
      '<circle cx="22" cy="39" r="6" fill="' + C + '"/></g>' +
      '<line x1="52" y1="52" x2="36" y2="88" stroke="' + C + '" stroke-width="4"/><line x1="52" y1="52" x2="68" y2="88" stroke="' + C + '" stroke-width="4"/><line x1="52" y1="52" x2="52" y2="90" stroke="' + C + '" stroke-width="4"/>'),
    'satelite': svg('<line x1="50" y1="38" x2="50" y2="22" stroke="' + C + '" stroke-width="3"/><circle cx="50" cy="20" r="4" fill="' + AMARELO + '" stroke="' + C + '" stroke-width="2.5"/>' +
      '<line x1="30" y1="50" x2="70" y2="50" stroke="' + C + '" stroke-width="3"/>' +
      '<rect x="6" y="38" width="24" height="24" fill="' + AZUL + '" stroke="' + C + '" stroke-width="3.5"/><line x1="18" y1="38" x2="18" y2="62" stroke="' + C + '" stroke-width="1.5"/><line x1="6" y1="50" x2="30" y2="50" stroke="' + C + '" stroke-width="1.5"/>' +
      '<rect x="70" y="38" width="24" height="24" fill="' + AZUL + '" stroke="' + C + '" stroke-width="3.5"/><line x1="82" y1="38" x2="82" y2="62" stroke="' + C + '" stroke-width="1.5"/><line x1="70" y1="50" x2="94" y2="50" stroke="' + C + '" stroke-width="1.5"/>' +
      '<rect x="38" y="40" width="24" height="20" rx="3" fill="' + CINZA + '" stroke="' + C + '" stroke-width="3.5"/>'),
    'foguete': svg('<path d="M42,72 L50,92 L58,72 Z" fill="' + AMARELO + '" stroke="' + C + '" stroke-width="3"/>' +
      '<path d="M38,58 L24,74 L40,72 Z" fill="' + VERDE + '" stroke="' + C + '" stroke-width="3"/><path d="M62,58 L76,74 L60,72 Z" fill="' + VERDE + '" stroke="' + C + '" stroke-width="3"/>' +
      '<path d="M50,8 C64,22 64,52 60,72 L40,72 C36,52 36,22 50,8 Z" fill="' + CINZA + '" stroke="' + C + '" stroke-width="3.5"/>' +
      circulo(50, 38, 7, AZUL, ' stroke-width="3"')),
    'astronauta': svg('<path d="M24,90 C24,72 34,64 50,64 C66,64 76,72 76,90 Z" fill="' + CINZA + '" stroke="' + C + '" stroke-width="3.5"/>' +
      '<rect x="42" y="72" width="16" height="10" rx="2" fill="' + AZUL + '" stroke="' + C + '" stroke-width="2.5"/>' +
      circulo(50, 36, 24, CINZA) + '<ellipse cx="50" cy="37" rx="15" ry="16" fill="' + AZUL + '" stroke="' + C + '" stroke-width="3"/>' +
      '<path d="M42,28 C44,24 48,23 51,24" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>'),
    'saturno': svg('<path d="M14,58 C6,48 30,36 50,38" fill="none" stroke="' + C + '" stroke-width="4"/>' +
      circulo(50, 50, 22, '#f0c97a') + '<path d="M30,46 C40,44 60,44 70,46" fill="none" stroke="#d9a650" stroke-width="3"/>' +
      '<path d="M14,58 C22,70 70,64 86,50 C94,42 78,36 70,38" fill="none" stroke="' + C + '" stroke-width="4"/>'),
    'marte': svg(circulo(50, 50, 32, LARANJA) + '<circle cx="38" cy="42" r="5" fill="#8f3415"/><circle cx="60" cy="60" r="7" fill="#8f3415"/><circle cx="62" cy="36" r="3" fill="#8f3415"/><path d="M30,60 C36,62 40,58 46,62" fill="none" stroke="#8f3415" stroke-width="3"/>'),
    'venus': svg(circulo(50, 50, 32, '#f5d98b') + '<path d="M26,40 C36,34 50,46 64,38 C70,35 74,36 76,38" fill="none" stroke="#ecc878" stroke-width="2.5" opacity=".8"/>' +
      '<path d="M22,56 C34,50 46,62 60,54 C68,50 74,52 78,55" fill="none" stroke="#ecc878" stroke-width="2.5" opacity=".8"/>' +
      '<path d="M32,70 C42,66 52,72 66,68" fill="none" stroke="#ecc878" stroke-width="2.5" opacity=".8"/>' +
      '<circle cx="50" cy="50" r="32" fill="none" stroke="' + C + '" stroke-width="3.5"/>'),
    'cometa': svg('<path d="M64,26 L16,78 C12,84 18,90 24,86 L74,38 Z" fill="#cfe6e0" opacity=".85"/>' +
      '<path d="M66,30 L30,74" stroke="#fff" stroke-width="4" opacity=".7"/>' + circulo(70, 30, 11, CINZA)),
    'estrela-cadente': svg('<line x1="66" y1="34" x2="18" y2="82" stroke="' + AMARELO + '" stroke-width="5"/>' +
      '<line x1="60" y1="28" x2="24" y2="64" stroke="' + AMARELO + '" stroke-width="3" opacity=".55"/>' +
      '<line x1="74" y1="40" x2="44" y2="70" stroke="' + AMARELO + '" stroke-width="3" opacity=".55"/>' + estrela(72, 28, 16)),
    'relogio': svg(circulo(50, 50, 36, CREME) +
      '<line x1="50" y1="18" x2="50" y2="24" stroke="' + C + '" stroke-width="3"/><line x1="50" y1="76" x2="50" y2="82" stroke="' + C + '" stroke-width="3"/>' +
      '<line x1="18" y1="50" x2="24" y2="50" stroke="' + C + '" stroke-width="3"/><line x1="76" y1="50" x2="82" y2="50" stroke="' + C + '" stroke-width="3"/>' +
      '<line x1="50" y1="50" x2="50" y2="28" stroke="' + C + '" stroke-width="4"/><line x1="50" y1="50" x2="66" y2="58" stroke="' + C + '" stroke-width="4"/>' +
      '<circle cx="50" cy="50" r="3.5" fill="' + C + '"/>'),
    'bussola': svg(circulo(50, 50, 36, CREME) +
      '<path d="M50,20 L58,50 L50,80 L42,50 Z" fill="#fff" stroke="' + C + '" stroke-width="2.5"/>' +
      '<path d="M50,20 L58,50 L42,50 Z" fill="#e04848" stroke="' + C + '" stroke-width="2.5"/>' +
      '<text x="50" y="12" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="11" fill="' + C + '">N</text>' +
      '<text x="50" y="97" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="11" fill="' + C + '">S</text>' +
      '<circle cx="50" cy="50" r="3" fill="' + C + '"/>'),
    'globo-meridianos': svg(circulo(50, 50, 36, '#e6f4f1') +
      '<ellipse cx="50" cy="50" rx="16" ry="36" fill="none" stroke="' + C + '" stroke-width="2.5"/>' +
      '<line x1="50" y1="14" x2="50" y2="86" stroke="' + C + '" stroke-width="2.5"/>' +
      '<line x1="14" y1="50" x2="86" y2="50" stroke="' + C + '" stroke-width="2.5"/>' +
      '<path d="M20,32 C36,38 64,38 80,32" fill="none" stroke="' + C + '" stroke-width="2.5"/><path d="M20,68 C36,62 64,62 80,68" fill="none" stroke="' + C + '" stroke-width="2.5"/>' +
      '<circle cx="50" cy="50" r="36" fill="none" stroke="' + C + '" stroke-width="3.5"/>'),
    'hemisferios': svg('<path d="M14,50 A36,36 0 0 1 86,50 Z" fill="' + AZUL + '"/><path d="M14,50 A36,36 0 0 0 86,50 Z" fill="' + CINZA + '"/>' +
      '<line x1="14" y1="50" x2="86" y2="50" stroke="' + C + '" stroke-width="3"/>' +
      '<circle cx="50" cy="50" r="36" fill="none" stroke="' + C + '" stroke-width="3.5"/>' +
      '<text x="50" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="15" fill="#fff">N</text>' +
      '<text x="50" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="15" fill="' + C + '">S</text>'),
    'navio-horizonte': svg('<line x1="50" y1="22" x2="50" y2="60" stroke="' + C + '" stroke-width="3"/>' +
      '<path d="M52,24 L70,54 L52,54 Z" fill="' + VERDE + '" stroke="' + C + '" stroke-width="3"/>' +
      '<path d="M32,58 L68,58 L63,70 L37,70 Z" fill="' + CINZA + '" stroke="' + C + '" stroke-width="3"/>' +
      '<path d="M4,74 Q50,50 96,74 L96,96 L4,96 Z" fill="#cfe7f7"/>' +
      '<path d="M4,74 Q50,50 96,74" fill="none" stroke="' + C + '" stroke-width="3.5"/>'),
    'vareta-sombra': svg(circulo(78, 22, 10, AMARELO) +
      '<line x1="10" y1="80" x2="92" y2="80" stroke="' + C + '" stroke-width="3.5"/>' +
      '<line x1="34" y1="80" x2="12" y2="80" stroke="#7a8b88" stroke-width="7"/>' +
      '<line x1="34" y1="34" x2="34" y2="80" stroke="' + C + '" stroke-width="5"/>' +
      '<line x1="70" y1="30" x2="40" y2="72" stroke="' + AMARELO + '" stroke-width="2" stroke-dasharray="3 4"/>'),
    'mapa-mundi': svg('<rect x="10" y="24" width="80" height="54" rx="4" fill="#e6f4f1" stroke="' + C + '" stroke-width="3.5"/>' +
      '<path d="M18,36 C22,30 32,32 34,38 C36,44 30,46 28,50 C26,54 22,52 20,46 C18,42 16,40 18,36 Z" fill="' + VERDE + '"/>' +
      '<path d="M28,56 C32,54 36,58 34,64 C33,70 29,72 28,66 Z" fill="' + VERDE + '"/>' +
      '<path d="M46,34 C52,30 60,32 60,38 C60,44 54,44 52,52 C50,58 46,56 46,50 C46,44 42,38 46,34 Z" fill="' + VERDE + '"/>' +
      '<path d="M62,34 C70,30 82,34 82,40 C82,46 72,48 66,46 C62,44 60,38 62,34 Z" fill="' + VERDE + '"/>' +
      '<path d="M72,58 C76,56 82,58 80,64 C78,68 72,66 72,58 Z" fill="' + VERDE + '"/>'),
    'nuvem': svg('<path d="M24,72 C12,72 10,56 22,54 C20,42 34,36 42,44 C46,30 66,30 68,46 C80,42 90,54 82,64 C88,70 82,74 76,72 Z" fill="' + CINZA + '" stroke="' + C + '" stroke-width="3.5"/>'),
    'raios-de-sol': svg(circulo(24, 26, 11, AMARELO) +
      '<line x1="36" y1="36" x2="56" y2="56" stroke="' + AMARELO + '" stroke-width="5"/><line x1="40" y1="28" x2="80" y2="36" stroke="' + AMARELO + '" stroke-width="5"/>' +
      '<line x1="30" y1="40" x2="38" y2="80" stroke="' + AMARELO + '" stroke-width="5"/><line x1="44" y1="42" x2="88" y2="62" stroke="' + AMARELO + '" stroke-width="5"/>' +
      '<line x1="22" y1="42" x2="16" y2="82" stroke="' + AMARELO + '" stroke-width="5"/><line x1="40" y1="16" x2="76" y2="12" stroke="' + AMARELO + '" stroke-width="5"/>'),
    'dia-e-noite': svg('<path d="M50,16 A34,34 0 0 1 50,84 Z" fill="' + AMARELO + '"/><path d="M50,16 A34,34 0 0 0 50,84 Z" fill="' + ESCURO + '"/>' +
      '<circle cx="36" cy="38" r="2" fill="' + AMARELO + '"/><circle cx="30" cy="56" r="1.8" fill="' + AMARELO + '"/><circle cx="42" cy="66" r="2" fill="' + AMARELO + '"/>' +
      '<circle cx="50" cy="50" r="34" fill="none" stroke="' + C + '" stroke-width="3.5"/>'),
    'calendario': svg('<rect x="16" y="22" width="68" height="64" rx="5" fill="' + CREME + '" stroke="' + C + '" stroke-width="3.5"/>' +
      '<line x1="16" y1="36" x2="84" y2="36" stroke="' + C + '" stroke-width="3"/>' +
      '<line x1="32" y1="14" x2="32" y2="28" stroke="' + C + '" stroke-width="4"/><line x1="68" y1="14" x2="68" y2="28" stroke="' + C + '" stroke-width="4"/>' +
      '<text x="50" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="22" fill="#d24a4a">365</text>' +
      '<circle cx="26" cy="46" r="2" fill="#7a8b88"/><circle cx="38" cy="46" r="2" fill="#7a8b88"/><circle cx="50" cy="46" r="2" fill="#7a8b88"/><circle cx="62" cy="46" r="2" fill="#7a8b88"/><circle cx="74" cy="46" r="2" fill="#7a8b88"/>'),
    'ampulheta': svg('<line x1="26" y1="14" x2="74" y2="14" stroke="' + C + '" stroke-width="5"/><line x1="26" y1="86" x2="74" y2="86" stroke="' + C + '" stroke-width="5"/>' +
      '<path d="M32,14 C32,36 46,42 50,50 C54,42 68,36 68,14 Z" fill="' + CREME + '"/>' +
      '<path d="M40,30 L60,30 C58,38 52,42 50,48 C48,42 42,38 40,30 Z" fill="#e7b864"/>' +
      '<path d="M32,86 C32,64 46,58 50,50 C54,58 68,64 68,86 Z" fill="' + CREME + '"/>' +
      '<path d="M36,86 C38,74 46,70 50,68 C54,70 62,74 64,86 Z" fill="#e7b864"/>' +
      '<path d="M32,14 C32,36 46,42 50,50 C46,58 32,64 32,86 M68,14 C68,36 54,42 50,50 C54,58 68,64 68,86" fill="none" stroke="' + C + '" stroke-width="3.5"/>'),
    'constelacao': svg('<polyline points="14,78 30,42 48,60 66,24 86,40" fill="none" stroke="' + C + '" stroke-width="2.5" stroke-dasharray="3 4"/>' +
      estrela(14, 78, 8) + estrela(30, 42, 9) + estrela(48, 60, 8) + estrela(66, 24, 11) + estrela(86, 40, 8))
  };

  Object.keys(D).forEach(function (nome) { registrarDesenho(nome, D[nome]); });
})();

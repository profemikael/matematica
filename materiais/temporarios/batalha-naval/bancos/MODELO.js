// ================================================================
//  MODELO DE BANCO DE PERGUNTAS — copie este arquivo para criar um banco novo
// ================================================================
//  1. Copie este arquivo e dê um nome novo, sem espaços nem acentos.
//     Exemplo: 7ano-inteiros.js
//  2. Troque o título e as perguntas.
//  3. Abra o arquivo lista.js e acrescente o nome do arquivo novo.
//
//  Dicas:
//  - Cada pergunta fica entre { e }, e termina com vírgula.
//  - Os textos ficam entre aspas "assim".
//  - Perguntas curtas: o aluno tem só 10 segundos!
//  - Pode colar símbolos direto no texto: × ÷ − ² √ ° ½
//  - Se alguma pergunta tiver defeito, o jogo pula ela e avisa na tela inicial.
// ================================================================

registrarBanco({
  titulo: "7º ano – Exemplo",   // nome que aparece na lista do jogo

  perguntas: [
    // PERGUNTA PARA DIGITAR: o aluno digita a resposta.
    // Vírgula ou ponto tanto faz ("2,5" = "2.5"). Espaços são ignorados.
    { tipo: "digitar", pergunta: "(−7) + 12", resposta: "5" },

    // Mais de uma resposta aceita: coloque a lista entre [ ].
    { tipo: "digitar", pergunta: "Metade de 1", resposta: ["0,5", "1/2"] },

    // MÚLTIPLA ESCOLHA: 1 alternativa certa e EXATAMENTE 3 erradas.
    // O jogo embaralha a ordem das alternativas.
    { tipo: "escolha", pergunta: "(−4) × (−6) = ?", certa: "24", erradas: ["−24", "10", "−10"] },

    { tipo: "escolha", pergunta: "Triângulo com lados 5, 5 e 8 é:",
      certa: "Isósceles", erradas: ["Escaleno", "Equilátero", "Retângulo"] },
  ]
});

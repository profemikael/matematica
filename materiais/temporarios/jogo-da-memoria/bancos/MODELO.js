// MODELO de banco do Jogo da Memória — copie este arquivo, mude o nome e escreva o nome novo em lista.js.
// Precisa ter PELO MENOS 10 pares. O jogo oferece 10, 20, 30 ou 40 pares, conforme o que o banco tiver.
// Se o banco tiver mais pares que o escolhido, cada partida sorteia quais entram.
//
// Cada carta (lado) tem uma imagem, um texto, ou os dois:
//   imagem: "nome-do-desenho"   → um desenho de desenhos/*.js (ex.: "sol", "lua-cheia")
//   imagem: "fotos/vulcao.jpg"  → um arquivo de imagem dentro da pasta bancos/
//   texto:  "Sol"               → aparece embaixo da imagem (ou sozinho, se não houver imagem)
//
// Três jeitos de montar um par (pode misturar no mesmo banco):
registrarBancoMemoria({
  titulo: "Nome do banco que aparece na lista",
  pares: [
    // 1) Cartas iguais (memória clássica):
    { igual: { imagem: "sol", texto: "Sol" } },
    // 2) Imagem ↔ nome (o aluno precisa saber o nome):
    { a: { imagem: "lua-cheia" }, b: { texto: "Lua Cheia" } },
    // 3) Conceito ↔ explicação (ou conta ↔ resposta):
    { a: { texto: "7 × 8" }, b: { texto: "56" } },
    { a: { imagem: "eclipse-solar", texto: "Eclipse Solar" }, b: { texto: "A Lua passa na frente do Sol" } },
  ]
});

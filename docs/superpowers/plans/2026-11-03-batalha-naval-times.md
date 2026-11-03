# Batalha Naval em Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um jogo novo, separado do Batalha Naval atual, em que 2 a 4 times (até 8 alunos no total) jogam rodadas simultâneas: pergunta para todos, depois ataque de todos os times que acertaram.

**Architecture:** O navegador do professor (anfitrião, que também joga) é o "juiz": guarda todos os tabuleiros, controla o relógio e as fases, e publica o estado público no Firebase Realtime Database. Os alunos só enviam respostas, ataques e a posição dos navios do próprio time. A lógica de regras fica num módulo puro (`juiz-times.js`) testado com `node --test`; o controlador do anfitrião é testado com uma conexão falsa; a tela é verificada manualmente. O jogo atual não é alterado: o novo carrega por caminho relativo (`../batalha-naval/...`) `regras.js`, `perguntas.js`, `tela.js`, `navios-svg.js`, `sons.js`, `sala.js` (só `normalizarSenha`), os bancos e o CSS.

**Tech Stack:** HTML + JavaScript puro (scripts clássicos, sem build), Firebase Realtime Database SDK "compat" 10.12.2 (já usado), `node --test` (Node 24) para os testes.

**Spec:** `docs/superpowers/specs/2026-11-03-batalha-naval-times-design.md`

## Global Constraints

- Pasta nova: `materiais/temporarios/batalha-naval-times/` (abreviada `B/` abaixo). **Nenhum arquivo de `materiais/temporarios/batalha-naval/` pode ser alterado.**
- Máximo **8 alunos no total** na sala; **2 a 4 times**; mínimo **2 times** com pelo menos 1 aluno cada para iniciar. A sala fecha no 8º aluno.
- Modo dos navios: `classico` | `rapido` (mesmos de `Regras.resolverTiroMultiplo`). Tipo de tiro: `normal` | `turbo`. Modo de resposta: `todos` (padrão) | `primeiro`.
- O **mesmo tempo** (`config.segundos`, 1 a 15) vale para responder e para marcar o ataque. Quem não responde conta como errado. Quem não marca o ataque perde o ataque.
- Turbo: sequência e arsenal **do time**. Sequência sobe 1 quando o time acerta a pergunta e **zera** quando erra. Trocas (a sequência é zerada ao trocar): sequência ≥ `limiarDuplo` (padrão **3**) → `duplo`; sequência ≥ `limiarCruz` (padrão **6**) → `cruz` ou `x`. Ambos ajustáveis ao criar a sala. **Fora da primeira versão:** mover navio, radar e torpedos.
- Cada time faz **1 ataque por rodada**; quem escolhe alvo e casa **muda a cada rodada** (rodízio pelos alunos do time, na ordem de entrada), pulando alunos desconectados. Não existe líder.
- Dois tiros na mesma casa do mesmo adversário na mesma rodada: **os dois valem**.
- Fim: um time sai ao perder todos os navios; vence o **último time com navios**; se os últimos caem na mesma rodada, **empate** entre eles. Banco de perguntas **embaralha e repete** quando acaba; sem limite de rodadas.
- "Todos acertam": aluno desconectado é excluído da exigência; time com 0 alunos conectados não acerta nem ataca.
- O relógio e as fases são do anfitrião; se ele sair, a partida pausa e retoma ao voltar (estado salvo no Firebase).
- Textos de alunos (nomes) entram na página só com `textContent`, nunca `innerHTML`. A resposta certa nunca é publicada no Firebase.
- Interface em português do Brasil, estilo do jogo atual. Firebase: caminho `turmas/<senha>/salas-times/<código>`; a senha da turma é a mesma do jogo atual (`Sala.normalizarSenha`: 4 a 30 letras minúsculas/números).
- Constante do assistente (a conferir): pausa de resultado entre rodadas `RESULTADO_MS = 5000`.

## Review Focus

1. Aluno desconectado ou sem resposta no modo "todos": não trava a rodada; time sem ninguém conectado não acerta (Task 1).
2. Dois times atirando na mesma casa do mesmo adversário: os dois valem, e um navio afundado pela soma dos dois tiros é contado (Task 3).
3. Ataque inválido (alvo eliminado, o próprio time, casa fora do mar, casa já atingida, poder que o time não tem): não quebra a rodada; o tiro vira normal ou é ignorado conforme a Task 3.
4. Anfitrião recarrega a página no meio de uma rodada: o jogo retoma sem perder navios nem sequência (Task 4).
5. Banco com menos perguntas que rodadas: repete sem erro (Task 4).

---

## File Structure

| Arquivo (em `B/`) | Responsabilidade |
|---|---|
| `js/juiz-times.js` | Regras puras: partida, rodízio, avaliar respostas, trocas e ataques simultâneos, fim. Sem DOM, sem Firebase. |
| `js/anfitriao.js` | Máquina de fases com relógio; lê respostas/ataques da conexão; publica o estado; salva/retoma. |
| `js/sala-times.js` | Firebase: criar/entrar, escolher time (limite 8), presença, entrega das mensagens. Implementa a "conexão". |
| `js/app-times.js` | Cola das telas (início, sala, posicionar, batalha, fim). Só DOM. |
| `index.html`, `css/times.css` | Telas e ajustes de estilo sobre `../batalha-naval/css/estilo.css`. |
| `tests/juiz-times.test.js`, `tests/anfitriao.test.js`, `tests/conexao-falsa.js` | Testes `node --test`. |
| `REGRAS-FIREBASE-TIMES.md` | Trecho de regras para o professor colar no console. |

**Conexão** (contrato entre `anfitriao.js`, `sala-times.js` e a conexão falsa dos testes):
`horaServidor(): number` · `publicar(publico): void` · `salvarEstado(estado): void` · `lerEstado(): Promise<estado|null>` · `lerNavios(): Promise<{[timeId]: navios}>` · `aoJogadores(cb({[uid]: {nome, time, ordem, conectado}})): () => void` · `aoRespostas(rodada, cb({[uid]: {texto, em}})): () => void` · `aoAtaques(rodada, cb({[timeId]: ataque})): () => void`.

**Estado público** (`publico`, escrito só pelo anfitrião): `{ fase: 'espera'|'pergunta'|'ataque'|'resultado'|'fim', rodada, ate, pausada, pergunta: {texto, tipo, opcoes?}|null, times: {[id]: {nome, alunos, vivo, sequencia, arsenal:{duplo,cruz,x}, naviosRestantes, acertou, vezDe, tiros, afundadas}}, eventos: [...], fim: {vencedores:[ids], empate:boolean}|null }`. `ate` = hora do servidor em que a fase acaba.

**Ataque** (escrito por aluno em `ataques/<rodada>/<timeId>`): `{ alvo: timeId, l, c, poder: 'normal'|'duplo'|'cruz'|'x', vertical?: boolean, trocar?: 'duplo'|'cruz'|'x', por: uid }`.

---

### Task 1: Juiz — partida, rodízio e avaliação das respostas

**Files:**
- Create: `B/js/juiz-times.js`, `B/tests/juiz-times.test.js`

**Interfaces:**
- Consumes: `Regras` (`../../batalha-naval/js/regras.js`, via `require`), `Perguntas.conferir(pergunta, texto)`.
- Produces (todas em `JuizTimes`, exportado por `module.exports` e `window.JuizTimes`):
  - `criarPartida(config, times): estado` — `times: [{id, nome, alunos: [uid], navios}]`; cada time vira `{id, nome, alunos, navios, tiros:{}, afundadas:[], vivo:true, sequencia:0, arsenal:{duplo:0,cruz:0,x:0}}`; `estado.rodada = 0`. Lança erro se houver menos de 2 times com alunos.
  - `quemEscolhe(estado, timeId, conectados): uid|null` — `conectados: {[uid]: boolean}`; rodízio `(rodada-1) mod alunos.length`, pulando desconectados; `null` se ninguém conectado.
  - `avaliarRespostas(estado, pergunta, respostas, conectados): {[timeId]: boolean}` — só times vivos.
  - `registrarAcertos(estado, acertos): void` — sequência +1 ou zera, só times vivos.

- [ ] **Step 1: Pull e preparar** — `git pull` na raiz do repositório (a pasta local pode estar atrás). Criar as pastas `B/js` e `B/tests`. Esperado: sem conflito nos arquivos novos.
- [ ] **Step 2: Escrever testes que falham** em `juiz-times.test.js` (`node:test` + `assert/strict`), com um helper `partidaComTimes(tamanhos)` que monta times com `Regras.gerarFrotaAleatoria(Math.random)`:
  - `criarPartida lança erro com menos de 2 times com alunos`
  - `quemEscolhe alterna entre os alunos do time a cada rodada` (time de 2: rodada 1 → alunos[0], rodada 2 → alunos[1], rodada 3 → alunos[0]; time de 1 sempre o mesmo)
  - `quemEscolhe pula aluno desconectado` e `devolve null se ninguém do time está conectado`
  - `avaliarRespostas modo todos: só acerta se todos os conectados acertam` (um errado → false)
  - `avaliarRespostas modo todos: sem resposta conta como errado, mas aluno desconectado é ignorado`
  - `avaliarRespostas time sem ninguém conectado nunca acerta` (**Review Focus 1**)
  - `avaliarRespostas modo primeiro: vale a resposta com menor em entre os do time` (certa mais lenta não salva a errada mais rápida, e vice-versa)
  - `avaliarRespostas ignora times eliminados`
  - `registrarAcertos soma 1 ao acertar e zera ao errar`
- [ ] **Step 3: Rodar e ver falhar** — `node --test materiais/temporarios/batalha-naval-times/tests/` → FAIL (módulo não existe).
- [ ] **Step 4: Implementar** `juiz-times.js` com as assinaturas acima, no estilo IIFE de `regras.js` (`raiz.JuizTimes`, `module.exports`). Para `require` no Node usar `require('../../batalha-naval/js/regras.js')` e `perguntas.js`; no navegador usar `window.Regras`/`window.Perguntas`.
- [ ] **Step 5: Rodar e ver passar** — mesmo comando → todos PASS.
- [ ] **Step 6: Commit** — `git add docs/superpowers materiais/temporarios/batalha-naval-times` e `git commit -m "feat(times): juiz — partida, rodízio e respostas"` (commitar só estes caminhos; há arquivos soltos não relacionados no repositório).

### Task 2: Juiz — trocas do Turbo e casas de cada poder

**Files:**
- Modify: `B/js/juiz-times.js`, `B/tests/juiz-times.test.js`

**Interfaces:**
- Produces:
  - `trocasPossiveis(estado, timeId): string[]` — `[]` se `config.tiro !== 'turbo'`; sequência ≥ `limiarCruz` → `['cruz','x']`; ≥ `limiarDuplo` → `['duplo']`; senão `[]`.
  - `trocar(estado, timeId, poder): boolean` — se permitido: `arsenal[poder] += 1`, `sequencia = 0`, `true`; senão `false`.
  - `casasDoPoder(poder, l, c, vertical): string[]` — chaves `"l,c"` dentro do mar 10×10, casa escolhida primeiro. Normal = `[[0,0]]`; duplo = `[[0,0],[0,1]]` (vertical: `[[0,0],[1,0]]`); cruz = centro + 4 vizinhos; x = centro + 4 diagonais (mesmos deslocamentos de `regras.js`).

- [ ] **Step 1: Testes que falham:**
  - `trocasPossiveis com limiar padrão 3 e 6` (sequência 2 → `[]`, 3 → `['duplo']`, 6 → `['cruz','x']`; modo `normal` → `[]` mesmo com sequência 9)
  - `trocasPossiveis respeita limiares da configuração` (limiarDuplo 2, limiarCruz 4)
  - `trocar duplo consome a sequência e põe 1 no arsenal`; `trocar não permitido devolve false e não muda nada`
  - `casasDoPoder cruz no canto A1 só devolve as casas dentro do mar` (3 casas)
  - `casasDoPoder duplo vertical usa a casa de baixo`; `x no centro devolve 5 casas`
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar** as três funções. `config.limiarDuplo`/`limiarCruz` ausentes valem 3 e 6.
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit** — `feat(times): trocas do turbo e casas dos poderes`.

### Task 3: Juiz — ataques simultâneos, eliminação e fim

**Files:**
- Modify: `B/js/juiz-times.js`, `B/tests/juiz-times.test.js`

**Interfaces:**
- Produces: `resolverRodada(estado, ataques, acertos): { eventos, eliminados, fim }`
  - `ataques: {[timeId]: ataque}`; só vale para time vivo com `acertos[timeId] === true`.
  - Para cada ataque: aplica `trocar` (se houver) com `trocar()`; poder pedido que o time não tem (`arsenal[poder] < 1`) ou modo `normal` vira `'normal'`; poder usado gasta 1 do arsenal. Alvo inválido (eliminado, o próprio time, inexistente), ou `l`/`c` fora de 0–9, ou casa escolhida já atingida → o ataque é **ignorado** (evento com `ignorado: true`, nada é gasto). Casas do tiro já atingidas são descartadas.
  - Todos os tiros são resolvidos contra o tabuleiro **como estava no começo da rodada**, com `Regras.resolverTiroMultiplo(navios, tirosAntes, config.modo, casas, false)`, e depois mesclados em `tiros` do alvo (`'agua'`/`'acerto'`). Depois da mescla, navios com todas as casas atingidas e ainda fora de `afundadas` entram em `afundadas` (inclui os afundados pela soma de dois tiros).
  - `eventos`: `[{atacante, alvo, casas, agua:[], acertos:[], afundou: boolean, ignorado?: boolean, poder}]`.
  - `eliminados`: ids dos times que ficaram sem navios nesta rodada (`vivo = false`).
  - `fim`: `null`, ou `{vencedores:[ids], empate:boolean}`; com 1 time vivo → vencedor único; com 0 vivos → `empate: true` entre os que estavam vivos no começo da rodada.

- [ ] **Step 1: Testes que falham** (navios montados à mão, não aleatórios):
  - `um ataque na água marca agua e nenhum navio afunda`
  - `acerto no classico marca só a casa; no rapido afunda o navio inteiro`
  - `dois times na mesma casa do mesmo adversário: os dois eventos registram o acerto` (**Review Focus 2**) e `dois tiros que completam um navio juntos o marcam afundado`
  - `time que errou a pergunta não ataca mesmo enviando ataque`
  - `ataque inválido é ignorado sem lançar erro`: alvo eliminado, alvo = o próprio time, `l = 10`, casa já atingida (**Review Focus 3**)
  - `poder que o time não tem vira tiro normal e não gasta arsenal`; `poder do arsenal gasta 1`; `trocar + poder no mesmo ataque funciona com sequência suficiente`
  - `time sem navios é eliminado e some da lista de alvos válidos`
  - `fim: último time vivo vence`; `fim: dois últimos caem na mesma rodada dá empate entre eles`
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar** `resolverRodada`. Ordem fixa: aplicar trocas e poderes por `timeId` crescente, resolver todos contra o snapshot, mesclar, atualizar `afundadas`, calcular eliminados e fim.
- [ ] **Step 4: Rodar → PASS** (suíte completa).
- [ ] **Step 5: Commit** — `feat(times): ataques simultâneos, eliminação e fim`.

### Task 4: Anfitrião — fases, relógio e retomada

**Files:**
- Create: `B/js/anfitriao.js`, `B/tests/anfitriao.test.js`, `B/tests/conexao-falsa.js`

**Interfaces:**
- Consumes: `JuizTimes` (Tasks 1–3), contrato de **Conexão** acima, `Perguntas.criarMonte/sortear/conferir/embaralhar`.
- Produces: `Anfitriao.criar(opcoes): { iniciar(), retomar(), pausar(), encerrar(), estado() }` com `opcoes = { conexao, config, times, perguntas, relogio: { agora(): number, agendar(fn, ms): () => void }, aleatorio, aoMudar?(publico) }`.
  - `conexao-falsa.js` exporta `criarConexaoFalsa(relogio)`: guarda `publico`, `estado`, jogadores, respostas, ataques em memória e expõe `simularResposta(uid, texto)`, `simularAtaque(timeId, ataque)`, `desconectar(uid)` e `ultimoPublico()`.
  - Fases: `pergunta` (dura `config.segundos`) → avalia → se algum time acertou, `ataque` (mesma duração), senão pula → `resultado` (`RESULTADO_MS = 5000`) → próxima rodada ou `fim`. Cada transição chama `publicar` e `salvarEstado`. Pergunta `escolha` é publicada com `opcoes` embaralhadas (correta + 3 erradas) e **sem** a resposta certa; pergunta `digitar` só com o texto.
  - `retomar()`: lê `lerEstado()` e reinicia a fase gravada com tempo cheio. `pausar()` publica `pausada: true` e cancela o relógio.
  - Fase `pergunta` fecha antes do prazo se todos os alunos conectados dos times vivos já responderam.

- [ ] **Step 1: Testes que falham** com relógio manual (`agora` e `agendar` controlados pelo teste; nada de `setTimeout` real):
  - `a rodada 1 publica fase pergunta com ate = agora + segundos`
  - `a pergunta publicada não contém a resposta certa` (percorre o JSON do publico)
  - `após o prazo, times que acertaram vão para a fase ataque; se ninguém acertou, pula para resultado`
  - `ataques enviados são aplicados e publicados em resultado com eventos e tiros`
  - `fase pergunta fecha antes quando todos os conectados já responderam`
  - `a vez do time (vezDe) alterna a cada rodada`
  - `fim publica vencedores e para de agendar`
  - `banco com 3 perguntas aguenta 8 rodadas sem repetir erro` (**Review Focus 5**)
  - `retomar depois de recarregar mantém navios, sequência e rodada` (cria o anfitrião, joga 2 rodadas, cria outro com a mesma conexão falsa, chama `retomar()`, compara) (**Review Focus 4**)
  - `pausar impede a troca de fase; retomar volta com tempo cheio`
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar** `anfitriao.js` (IIFE, `raiz.Anfitriao`, `module.exports`). O `estado` salvo é o do Juiz mais `{fase, rodada, perguntaIdx, monte}`.
- [ ] **Step 4: Rodar → PASS** (suíte completa).
- [ ] **Step 5: Commit** — `feat(times): anfitrião com fases, relógio e retomada`.

### Task 5: Conexão com o Firebase e regras de segurança

**Files:**
- Create: `B/js/sala-times.js`, `B/REGRAS-FIREBASE-TIMES.md`

**Interfaces:**
- Consumes: SDK `firebase` (compat), `Sala.normalizarSenha`, `FIREBASE_CONFIG`.
- Produces: `SalaTimes.criar(firebaseConfig)` devolvendo:
  - `verificarSenha(senha): Promise<boolean>`
  - `criarSala(senha, config, jogador{nome,id}): Promise<codigo>` — código de 4 números livre; `anfitriao: jogador.id`.
  - `entrarNaSala(senha, codigo, jogador): Promise<{config, anfitriao}>` — erros em português: "O código tem 4 números.", "Sala não encontrada.", "A sala já tem 8 jogadores." (limite por transação em `jogadores`).
  - `abrir(senha, codigo, jogador): conexao` — a **Conexão** do contrato, mais: `aoPublico(cb)`, `aoNavios(cb({[timeId]: {navios, pronto}}))`, `gravarNavios(timeId, navios, pronto)`, `escolherTime(uid, timeId)`, `moverJogador(uid, timeId)` (só o anfitrião usa na tela), `enviarResposta(rodada, texto)`, `enviarAtaque(rodada, timeId, ataque)`, `aoConexao(cb(boolean))`, `fechar()`. Presença com `onDisconnect().update({conectado:false})`. A hora vem de `.info/serverTimeOffset`.
- `REGRAS-FIREBASE-TIMES.md`: passo a passo em português para o professor, com o trecho JSON do nó `turmas/$senha/salas-times/$codigo` (leitura/escrita só se a senha existir em `config/senhas`, `jogadores` com no máximo 8 filhos via `.validate: newData.parent().numChildren() <= 8`, respostas e ataques com formato validado, `publico`/`anfitriaoEstado` graváveis por quem quiser — confiança de sala de aula). Dizer **explicitamente** que o arquivo de regras atual não está no repositório: ele deve **juntar** o trecho às regras existentes no console, sem apagar o que há lá, e que a condição da senha deve copiar o padrão que o jogo atual já usa.

- [ ] **Step 1: Implementar `sala-times.js`** seguindo o estilo de `../batalha-naval/js/sala.js` (IIFE, `raiz.SalaTimes`, `module.exports` só para `normalizar` se necessário).
- [ ] **Step 2: Escrever `REGRAS-FIREBASE-TIMES.md`.**
- [ ] **Step 3: Verificação manual** (precisa das regras coladas no console pelo professor): numa página temporária ou no console do navegador, criar uma sala, entrar com outra aba, escolher times e conferir no console do Firebase que o 9º jogador é recusado. Esperado: erro "A sala já tem 8 jogadores.". Se as regras ainda não foram coladas, registrar isso e seguir; a Task 8 repete a verificação.
- [ ] **Step 4: Commit** — `feat(times): conexão com o Firebase e regras`.

### Task 6: Telas — início e sala de espera

**Files:**
- Create: `B/index.html`, `B/css/times.css`, `B/js/app-times.js`

**Interfaces:**
- Consumes: `SalaTimes` (Task 5), `Perguntas.carregarBancos(BANCOS, '../batalha-naval/bancos/')`, `Tela.mostrar`, `JuizTimes` não é usado aqui.
- Produces: `index.html` com os scripts nesta ordem: SDK Firebase (os mesmos dois do jogo atual), `../batalha-naval/js/firebase-config.js`, `../batalha-naval/bancos/lista.js`, `regras.js`, `perguntas.js`, `sala.js`, `navios-svg.js`, `sons.js`, `tela.js` (todos de `../batalha-naval/js/`), depois `js/juiz-times.js`, `js/anfitriao.js`, `js/sala-times.js`, `js/app-times.js`. CSS: `../batalha-naval/css/estilo.css` e `css/times.css`. Telas (`<section class="tela">`): `tela-inicio`, `tela-sala`, `tela-posicionar`, `tela-batalha`, `tela-fim`.
- Comportamento:
  - **Início:** senha da turma, nome, e dois caminhos: **Criar sala** (escolhe banco da lista, segundos 1–15, modo dos navios, tipo de tiro, modo de resposta com "Todos acertam" marcado, limiares do Turbo 3 e 6 visíveis só no Turbo) e **Entrar** (código de 4 números).
  - **Sala de espera:** código grande, lista de alunos por time (até 4 colunas), cada aluno escolhe seu time; o anfitrião vê um botão para mover cada aluno; contador "X de 8 alunos"; botão **Iniciar** do anfitrião habilitado só com ≥2 times com alunos e todos os times prontos (Task 7). Nomes só com `textContent`.
  - Id do aluno guardado em `localStorage` (como o jogo atual) para voltar à mesma vaga após recarregar.

- [ ] **Step 1: Escrever** `index.html`, `times.css` e a parte de início/sala de `app-times.js`.
- [ ] **Step 2: Verificação manual** abrindo `B/index.html` por um servidor estático local (`python -m http.server` na pasta `materiais/temporarios`, endereço `http://localhost:8000/batalha-naval-times/`): criar sala numa aba, entrar com 2 outras, escolher times; a lista atualiza nas 3 abas; um nome como `<b>x</b>` aparece como texto; o 9º aluno recebe "A sala já tem 8 jogadores.". Esperado: tudo isso. Conferir também que `git status` não mostra nenhuma alteração em `batalha-naval/`.
- [ ] **Step 3: Commit** — `feat(times): telas de início e sala`.

### Task 7: Tela — posicionar os navios do time

**Files:**
- Modify: `B/index.html`, `B/js/app-times.js`, `B/css/times.css`

**Interfaces:**
- Consumes: `SalaTimes.aoNavios`, `gravarNavios(timeId, navios, pronto)`, `Regras.podePosicionar`, `Regras.gerarFrotaAleatoria`, `Tela.criarTabuleiro`.
- Comportamento (decisão do assistente, para conferir): o tabuleiro é **compartilhado**; qualquer aluno do time pode mover navios ou clicar em "Sortear" (grava na hora, todos do time veem); qualquer aluno pode marcar/desmarcar **Pronto**; o time está pronto quando `pronto === true`. A tela de sala (Task 6) usa isso para habilitar **Iniciar**. Navios só aparecem para o próprio time.

- [ ] **Step 1: Implementar** posicionamento reaproveitando o jeito de clicar/girar do jogo atual (`partida-online.js`, seção de posicionamento, só como referência de uso — não copiar o arquivo inteiro).
- [ ] **Step 2: Verificação manual** com 3 abas (2 times): mexer num navio numa aba aparece na outra do mesmo time e **não** aparece no outro time; "Sortear" respeita `podePosicionar`; **Iniciar** só habilita quando os dois times marcam Pronto.
- [ ] **Step 3: Commit** — `feat(times): posicionamento dos navios do time`.

### Task 8: Telas — batalha, resultado e fim

**Files:**
- Modify: `B/index.html`, `B/js/app-times.js`, `B/css/times.css`

**Interfaces:**
- Consumes: `publico` (estado público acima), `SalaTimes.enviarResposta/enviarAtaque/aoPublico`, `Anfitriao.criar` (só na aba do anfitrião; ela também joga), `Tela.criarTabuleiro`, `Sons`.
- Comportamento:
  - **Pergunta:** texto, campo (digitar) ou 4 botões (escolha), contagem regressiva a partir de `publico.ate` e da hora do servidor; depois de responder, "Resposta enviada".
  - **Ataque:** só quem é `vezDe` do time vê o seletor; os demais veem "Quem escolhe agora: <nome>". Seletor de adversário (só times vivos e outros que o próprio), tabuleiro do adversário mostrando `tiros`/`afundadas` públicos (sem navios), botões de poder (Turbo): trocar sequência por poder, escolher poder do arsenal, girar o duplo. Clicar na casa **marca** o alvo (pode mudar até o prazo); o envio é o último marcado. Time que errou vê "Seu time errou a pergunta".
  - **Resultado:** lista dos eventos da rodada ("Time Azul atacou Time Verde em C4: acertou!"), meu tabuleiro atualizado.
  - **Painel de todos (visível para todos, é o "painel do professor" desta versão):** os times, sequência, navios restantes, quem está online, rodada. Só o anfitrião vê **Pausar/Retomar** e **Encerrar partida**.
  - **Fim:** vencedor ou empate; botão de voltar ao início.
  - Aluno eliminado vê "Seu time foi eliminado" e continua vendo o placar.
  - Anfitrião recarregando a página chama `retomar()`.

- [ ] **Step 1: Implementar** as telas e ligar `Anfitriao.criar` na aba do anfitrião.
- [ ] **Step 2: Verificação manual completa** (3 abas: anfitrião em time 1, aluno B em time 1, aluno C em time 2; depois repetir com 4 times e 8 abas se possível): 
  1. modo "Todos acertam": B erra e o time 1 não ataca; C acerta e ataca;
  2. a vez de escolher alterna entre o anfitrião e B a cada rodada;
  3. quem não marca o alvo perde o ataque;
  4. modo "Primeiro a responder" funciona;
  5. no Turbo, sequência 3 libera duplo, sequência 6 libera cruz/x, errar zera;
  6. fechar a aba do anfitrião e reabrir: a partida retoma;
  7. fechar a aba de B: o time 1 segue jogando só com o anfitrião;
  8. eliminar um time: ele vira espectador; o último time vence; empate em queda simultânea (forçar com navios de 1 casa visíveis só em teste, ou conferir pelos testes da Task 3).
  Esperado: todos os itens. Registrar falhas e corrigir antes do commit.
- [ ] **Step 3: Commit** — `feat(times): batalha, resultado e fim`.

### Task 9: Fechamento

**Files:**
- Modify: `B/js/app-times.js` (só se a verificação achar algo)

- [ ] **Step 1:** Rodar `node --test materiais/temporarios/batalha-naval-times/tests/` → tudo PASS.
- [ ] **Step 2:** `git status` e `git diff --stat origin/main -- materiais/temporarios/batalha-naval` → nenhuma alteração no jogo atual.
- [ ] **Step 3:** Abrir o jogo **atual** (`batalha-naval/index.html`) num servidor local e criar uma sala de 2 jogadores até o primeiro tiro, para confirmar que continua funcionando.
- [ ] **Step 4:** Entregar ao professor: (a) `REGRAS-FIREBASE-TIMES.md` para colar no console; (b) a lista das decisões do assistente do design e deste plano (pausa de resultado de 5 s, tabuleiro compartilhado com Pronto por qualquer aluno, troca da sequência por poder dentro do ataque); (c) o endereço final `…/materiais/temporarios/batalha-naval-times/index.html`. **Não** fazer `git push` até o professor pedir.

---

## Self-review (feita ao escrever)

- **Cobertura da spec:** times 2–4 e 8 alunos (T1, T5, T6); rodada simultânea e modos de resposta (T1, T4); rodízio e perda de ataque (T1, T3, T8); Turbo do time com 3 e 6 (T2, T6 config); tiros na mesma casa (T3); eliminação, vitória e empate (T3); banco repete (T4); anfitrião joga junto, pausa e retoma (T4, T8); mover alunos de time e sala fecha em 8 (T5, T6); painel (T8); regras do Firebase (T5); jogo atual intocado (T9).
- **Consistência de nomes:** `JuizTimes.{criarPartida, quemEscolhe, avaliarRespostas, registrarAcertos, trocasPossiveis, trocar, casasDoPoder, resolverRodada}`, `Anfitriao.criar`, `SalaTimes.criar`, e o contrato de Conexão são usados com os mesmos nomes em todas as tarefas.
- **Lacuna aceita:** as telas (T6–T8) e o Firebase real (T5) só têm verificação manual, porque o projeto não tem DOM de teste nem emulador; a lógica que decide o jogo está toda coberta por testes automáticos.

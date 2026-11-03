# Batalha Naval em Times — design

Data: 2026-11-03. Autor da ideia: professor Mikael. Status: aguardando aprovação.

## Intenção e por quê

O jogo atual (`materiais/temporarios/batalha-naval/`) é de um contra um: cada sala tem 2 alunos. O professor quer uma versão para a turma jogar em **times**, em uma mesma sala, com a pergunta de matemática valendo como "licença para atacar". O objetivo é que todos os alunos do time pensem e respondam, e que o jogo funcione numa aula com poucos alunos conectados (até 8).

É um **jogo novo e separado**. O jogo atual não pode ser alterado nem quebrado.

## Objetivos

- Uma sala com **2 a 4 times**, cada um com seu próprio tabuleiro, jogando ao mesmo tempo.
- **No máximo 8 alunos no total** na sala. Não há limite por time: pode ser 2+2+2+2, 3+3+2, 6+1+1 etc. Cada time precisa de pelo menos 1 aluno; a partida precisa de pelo menos 2 times.
- Rodadas simultâneas (ver "Como a partida funciona").
- Aproveitar do jogo atual: os bancos de perguntas, as regras de navios e tiros, o Modo Turbo, o painel do professor e o Firebase já configurado.
- Quem cria a sala escolhe todas as opções da partida.

## Fora do escopo

- Alterar qualquer arquivo do jogo atual (inclusive os bancos de perguntas, que o jogo novo apenas lê).
- Mais de 8 alunos, mais de 4 times, ou partidas com um aluno só.
- Contas de usuário, ranking entre partidas, histórico permanente.
- Jogar sem internet.

## O que seria um fracasso mesmo funcionando

- Quebrar ou mudar o comportamento do jogo de 2 jogadores que já está publicado.
- Um aluno parado ou desconectado travar a rodada de todos.
- Os alunos verem os navios dos adversários (cada time só vê o próprio tabuleiro por inteiro).

## Como a partida funciona

### Antes de começar
1. Quem cria a sala (o professor) usa a senha da turma, como no jogo atual, e escolhe:
   - banco de perguntas (de `bancos/`);
   - tempo de resposta em segundos (o **mesmo tempo** vale para responder e para marcar o ataque);
   - **modo dos navios**: Clássico (acertar todas as casas) ou Rápido (um tiro afunda) — mesmos modos do jogo atual;
   - **tipo de tiro**: Normal (1 casa) ou Turbo;
   - **modo de resposta**: "Todos acertam" (padrão) ou "Primeiro a responder".
2. Os alunos entram com o código da sala e o nome, e **escolhem o próprio time** (1 a 4). Quem criou a sala pode mover alunos de time antes de começar.
3. A sala fecha ao chegar em 8 alunos.
4. Os alunos de cada time posicionam os navios no tabuleiro do time, **juntos** (a forma exata de dividir essa tarefa fica com o construtor; ver "Deixado ao construtor").
5. A partida começa quando o criador da sala manda iniciar.

### Rodada (todos os times ao mesmo tempo)
1. **Pergunta**: a mesma pergunta aparece para todos os alunos de todos os times. Todos têm o mesmo tempo para responder.
2. **Validade da resposta do time**:
   - *Todos acertam*: o time só "acerta" se **todos** os alunos do time acertarem. Quem não responde até o fim do tempo conta como errado.
   - *Primeiro a responder*: vale a resposta de quem respondeu primeiro dentro do time.
3. **Ataque**: os times que acertaram atacam **ao mesmo tempo**. Há o mesmo prazo para marcar o alvo: o time escolhe **qual adversário atacar** (entre os que ainda estão na partida) e **a casa**. Quem marca é o **aluno da vez** do time (ver revezamento). Se não marcar até o prazo acabar, o time **perde o ataque**.
4. **Resultado**: os tiros da rodada são resolvidos e todos veem o resultado ao mesmo tempo. Se dois times atirarem na mesma casa do mesmo adversário, os dois tiros valem.
5. Próxima rodada. Times que erraram a pergunta não atacam naquela rodada.

### Revezamento
Não existe líder. Cada time faz **1 ataque por rodada**, e o aluno que escolhe alvo e casa **muda a cada rodada**, passando por todos os alunos do time na ordem em que entraram. Time com 1 aluno: é sempre ele. (Se o aluno da vez estiver desconectado, o construtor decide a regra; sugestão: pula para o próximo.)

### Modo Turbo (tipo de tiro)
Reaproveita as regras do jogo atual (`js/regras.js`, seção "Modo Turbo"):
- A **sequência é do time**: sobe 1 a cada rodada em que o time acerta a pergunta e **zera quando erra**.
- O **arsenal é do time**; o aluno da vez usa os poderes.
- Sequência mínima para trocar por poderes: no jogo atual é **5** (duplo, mover navio, radar 3×3) e **10** (cruz, X, radar 4×4). Neste jogo o padrão proposto é **3 e 6**, porque cada time ataca uma vez por rodada. **Decisão do assistente, a confirmar.** Os dois valores devem ser ajustáveis pelo criador da sala.
- O poder armado é gasto mesmo se a pergunta estiver errada (como no jogo atual).
- Torpedos (só Turbo + Clássico): como no jogo atual, ou desligados na primeira versão (decisão do construtor, ver abaixo).

### Fim da partida
- Um time sai quando **perde todos os navios**; os alunos dele passam a assistir.
- Vence o **último time com navios**.
- Se os últimos times perderem o último navio na mesma rodada, é **empate** entre eles.

## Restrições

- Jogo novo numa pasta própria ao lado do atual, por exemplo `materiais/temporarios/batalha-naval-times/`. Os arquivos do jogo atual não são editados.
- Site estático no GitHub Pages (`profemikael/matematica`), sem servidor próprio. Comunicação pelo **Firebase Realtime Database** já configurado (`js/firebase-config.js`), com o SDK "compat" carregado no HTML, como no jogo atual.
- O jogo novo pode **ler** os bancos de perguntas em `bancos/` e reutilizar (copiando ou importando) as regras de navios e tiros. Importar sem alterar os originais é a opção preferida.
- **Regras de segurança do Firebase**: hoje permitem salas de 2 jogadores. O arquivo `firebase/regras.json` citado em `CONFIGURAR-FIREBASE.md` **não está no repositório**. As regras do jogo novo precisam ser escritas em um caminho próprio no banco (por exemplo `turmas/<senha>/salas-times/<código>`) e coladas manualmente pelo professor no console do Firebase, sem tirar o que o jogo atual precisa.
- Os navios de cada time ficam só no aparelho do time (como hoje, o defensor responde o tiro). Como o time tem mais de um aluno, é preciso decidir qual aparelho "guarda" o tabuleiro (ver abaixo).
- Interface e textos em português do Brasil, em linguagem de criança de 11 a 14 anos.

## Parte do professor

- O painel (`painel.html`) do jogo atual mostra a partida; o jogo novo precisa de um equivalente que mostre os times, a rodada, o placar de navios e quem está online. Pode ser uma tela dentro do próprio jogo novo, a critério do construtor.

## Decisões do assistente (a conferir)

- Padrão do modo de resposta: "Todos acertam".
- Quem não responde até o fim do tempo conta como errado.
- Dois tiros na mesma casa do mesmo adversário: os dois valem.
- Sequência do Turbo para trocar poderes: 3 e 6 (ajustável).
- Sala fecha em 8 alunos; mínimo de 2 times para iniciar.
- O criador da sala (professor) **joga junto**, como um dos 8 jogadores, e pode mover alunos de time antes de iniciar. (Confirmado pelo professor.)
- **Banco de perguntas**: quando as perguntas acabam, o banco é embaralhado e repete. Não há limite de rodadas. (Confirmado pelo professor.)
- Empate quando os últimos times caem na mesma rodada.
- **Confiança de sala de aula**: é um jogo de aula, não precisa resistir a quem abre as ferramentas do navegador. Guardar as posições dos navios no banco de dados é aceitável desde que a interface não as mostre. O construtor pode escolher o desenho mais simples: o aparelho do professor (anfitrião) guardando todos os tabuleiros e publicando o resultado de cada rodada, ou o aparelho de um aluno de cada time guardando o seu. Não é obrigatório manter o modelo do jogo atual.
- **Tempo e fases**: o aparelho do anfitrião controla o relógio e a troca de fase. "Primeiro a responder" usa a hora do servidor do Firebase. Se o anfitrião sair, a partida pausa e continua quando ele voltar.
- **Aluno desconectado**: não conta como errado no modo "Todos acertam" e é pulado no revezamento. O time precisa de pelo menos 1 aluno conectado para acertar. Se o time ficar com 0 conectados, não ataca naquela rodada.
- **Regras do Firebase**: o construtor escreve um trecho independente para o caminho do jogo novo e o professor cola e junta com o que já existe no console. Não é preciso ver as regras atuais.
- **Poderes do Turbo na primeira versão**: só os poderes de tiro, ou seja, tiro duplo, cruz e X. **Mover navio, radar e torpedos ficam de fora da primeira versão**, para não precisar decidir a ordem entre eles e os tiros dos outros times na mesma rodada. Podem entrar depois. Os custos 3 e 6 valem para os poderes de tiro: duplo com 3, cruz e X com 6.
- Resultado de cada tiro: todos veem quem atacou quem, a casa e se acertou, afundou ou errou, mas ninguém vê os navios inteiros do adversário.

## Deixado ao construtor

- Estrutura de arquivos, nomes e como reutilizar o código existente.
- Como o time de vários alunos mantém **um tabuleiro consistente** (qual aparelho guarda os navios, o que acontece se esse aluno cair).
- Como os alunos de um time posicionam os navios juntos (por exemplo, um posiciona e o outro confirma, ou todos veem e qualquer um mexe).
- Regra para aluno desconectado no meio da partida (pular na vez, e o que conta como resposta no modo "Todos acertam").
- Aparência, sons e animações, seguindo o estilo do jogo atual.
- Se torpedos entram na primeira versão.
- Como o time vê os tabuleiros dos adversários (sem mostrar navios) e o resultado dos tiros de todos.

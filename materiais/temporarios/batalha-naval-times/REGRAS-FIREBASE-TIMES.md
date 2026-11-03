# Regras do Firebase para o Batalha Naval em Times

O jogo em times grava num caminho **só dele**: `turmas/<senha>/salas-times/<código>`. O jogo atual usa `turmas/<senha>/salas/...` e não é afetado.

> **Atenção:** o arquivo de regras do jogo atual (`firebase/regras.json`) **não está no repositório**, então eu não consegui ver o que ele permite hoje. Por isso o trecho abaixo é para ser **juntado** às regras que já estão no console. **Não apague nada do que já existe.**

## Passo a passo

1. Abra **https://console.firebase.google.com** → seu projeto → **Realtime Database** → aba **Regras**.
2. Procure, dentro de `"turmas"` → `"$senha"`, o item `"salas"`.
3. Logo **depois** do bloco `"salas": { ... }` (no mesmo nível, separado por vírgula), cole o bloco `"salas-times"` abaixo.
4. A linha `".read"`/`".write"` do bloco usa a mesma verificação de senha que o seu `"salas"` já faz. **Se o seu `"salas"` usa uma condição diferente da que está abaixo, copie a condição dele** e use no lugar.
5. Clique em **Publicar**.

## Bloco para colar

```json
"salas-times": {
  "$codigo": {
    ".read": "root.child('config/senhas/' + $senha).exists()",
    ".write": "root.child('config/senhas/' + $senha).exists()",
    ".validate": "$codigo.matches(/^[0-9]{4}$/)",
    "jogadores": {
      "$uid": {
        ".validate": "newData.parent().numChildren() <= 8"
      }
    },
    "respostas": {
      "$rodada": {
        "$uid": {
          ".validate": "newData.hasChildren(['texto', 'em']) && newData.child('texto').isString() && newData.child('texto').val().length <= 200"
        }
      }
    },
    "publico": { ".validate": "newData.isString() && newData.val().length < 60000" },
    "estadoAnfitriao": { ".validate": "newData.isString() && newData.val().length < 100000" }
  }
}
```

## O que essas regras garantem

- Só entra quem sabe a senha da turma (a mesma do jogo atual).
- O código da sala tem 4 números.
- Cada sala aceita no máximo **8 jogadores**.
- Respostas têm formato e tamanho limitados.

## O que elas **não** garantem (de propósito)

É um jogo de sala de aula, então não há proteção contra um aluno curioso que abra as ferramentas do navegador: ele poderia ver as posições dos navios dos outros times no banco de dados. A tela do jogo nunca as mostra.

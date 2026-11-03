# Regras do Firebase para o Batalha Naval em Times

O jogo em times grava num caminho **só dele**: `times/<senha>/salas/<código>`, como o jogo da memória faz com `memoria/...`. Os jogos que já existem (`turmas`, `memoria`, `nomes`) **não são afetados**.

## Passo a passo

1. Abra **https://console.firebase.google.com** → seu projeto → **Realtime Database** → aba **Regras**.
2. Procure a linha que começa com `"nomes": {` (fica perto do final, logo depois do bloco `"memoria"`).
3. Coloque o cursor **no começo dessa linha** e cole o bloco abaixo **inteiro**. Ele já termina com vírgula, então o `"nomes"` continua certo logo depois.
4. Clique em **Publicar**.

## Bloco para colar

```
    "times": {
      "$senha": {
        "salas": {
          "$codigo": {
            ".read": "$codigo.matches(/^[0-9]{4}$/) && root.child('config/senhas').child($senha).val() === true",
            ".write": "$codigo.matches(/^[0-9]{4}$/) && root.child('config/senhas').child($senha).val() === true && (!data.exists() || data.child('criadaEm').val() < now - 86400000)",
            ".validate": "newData.hasChildren(['criadaEm', 'config', 'anfitriao'])",
            "criadaEm": {
              ".validate": "newData.isNumber() && newData.val() <= now"
            },
            "config": {
              ".validate": "newData.hasChildren(['banco', 'modo', 'segundos'])"
            },
            "jogadores": {
              ".write": "root.child('config/senhas').child($senha).val() === true && root.child('times').child($senha).child('salas').child($codigo).child('criadaEm').exists()",
              "$uid": {
                ".validate": "newData.hasChildren(['nome', 'conectado'])",
                "time": {
                  ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 4"
                }
              }
            },
            "navios": {
              ".write": "root.child('config/senhas').child($senha).val() === true && root.child('times').child($senha).child('salas').child($codigo).child('criadaEm').exists()"
            },
            "respostas": {
              ".write": "root.child('config/senhas').child($senha).val() === true && root.child('times').child($senha).child('salas').child($codigo).child('criadaEm').exists()",
              "$rodada": {
                "$uid": {
                  ".validate": "newData.hasChildren(['texto', 'em']) && newData.child('texto').isString() && newData.child('texto').val().length <= 200"
                }
              }
            },
            "ataques": {
              ".write": "root.child('config/senhas').child($senha).val() === true && root.child('times').child($senha).child('salas').child($codigo).child('criadaEm').exists()"
            },
            "publico": {
              ".write": "root.child('config/senhas').child($senha).val() === true && root.child('times').child($senha).child('salas').child($codigo).child('criadaEm').exists()",
              ".validate": "newData.isString() && newData.val().length < 60000"
            },
            "estadoAnfitriao": {
              ".write": "root.child('config/senhas').child($senha).val() === true && root.child('times').child($senha).child('salas').child($codigo).child('criadaEm').exists()",
              ".validate": "newData.isString() && newData.val().length < 100000"
            }
          }
        }
      }
    },
```

## O que essas regras garantem

- Só entra quem sabe a senha da turma (a mesma dos outros jogos).
- O código da sala tem 4 números, e uma sala só pode ser recriada com o mesmo código depois de 24 horas.
- O limite de **8 jogadores** por sala é aplicado pelo próprio jogo (as regras do Firebase não conseguem contar filhos).
- Respostas têm formato e tamanho limitados.

## O que elas **não** garantem (de propósito)

É um jogo de sala de aula, então não há proteção contra um aluno curioso que abra as ferramentas do navegador: ele poderia ver as posições dos navios dos outros times no banco de dados. A tela do jogo nunca as mostra.

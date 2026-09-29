# Configurar o Firebase — passo a passo

Leva uns 10 minutos, é feito **uma vez só**, e é gratuito (sem cartão de crédito).
As telas do Firebase às vezes mudam um pouco de nome ou de lugar; se algo estiver diferente, procure pelo nome em destaque.

> **Qual conta Google usar?** Recomendo a sua **conta pessoal (Gmail)**. Contas da escola (`@canoasedu.rs.gov.br`) podem ter o Firebase bloqueado pelo administrador.

---

## 1. Criar o projeto

1. Abra **https://console.firebase.google.com** e entre com a sua conta Google.
2. Clique em **Criar um projeto** (ou **Adicionar projeto**).
3. Nome do projeto: `batalha-naval-continhas` → **Continuar**.
4. Na tela do **Google Analytics**, **desative** a opção → **Criar projeto**.
5. Espere terminar → **Continuar**.

## 2. Criar o banco de dados

1. No menu da esquerda, abra **Bancos de dados e armazenamento** → **Realtime Database** (não é o "Firestore").
2. Clique em **Criar banco de dados**.
3. Local: **Estados Unidos (us-central1)** → **Próxima**. (Não existe opção Brasil para o Realtime Database; se aparecer "Brasil", você está no Firestore.)
4. Escolha **Iniciar no modo bloqueado** → **Ativar**.

## 3. Colar as regras de segurança

1. Ainda no Realtime Database, abra a aba **Regras**.
2. Apague tudo o que estiver na caixa de texto.
3. Abra o arquivo `firebase/regras.json` (desta pasta) no Bloco de Notas, copie **tudo** e cole na caixa.
4. Clique em **Publicar**.

## 4. Cadastrar as senhas

1. Abra a aba **Dados**.
2. Passe o mouse sobre a primeira linha (o endereço do banco) e clique no **+**.
3. Em **Chave** escreva `config` e clique no **+** ao lado dela para criar um item dentro.
4. Em **Chave** escreva `senhas` e clique no **+** ao lado dela.
5. Em **Chave** escreva a senha da turma (ex.: `tubarao7a`) e em **Valor** escreva `true`.
6. Clique no **+** ao lado de `senhas` de novo e crie mais uma: **Chave** `teste`, **Valor** `true` (é a senha dos testes automáticos).
7. Clique em **Adicionar**.

O resultado deve ficar assim:
```
config
  └─ senhas
       ├─ tubarao7a: true
       └─ teste: true
```

**Regras da senha:** só letras e números, sem espaço, acento ou símbolo; de 4 a 30 caracteres; use minúsculas.
Pode cadastrar **uma senha por turma** (ex.: `tubarao7a`, `baleia7b`) — cada turma joga separada.

## 5. Colocar o endereço do banco no jogo

No topo da aba **Dados** aparece o endereço do banco, algo como `https://batalha-naval-continhas-default-rtdb.firebaseio.com`.
Ele fica no arquivo `js/firebase-config.js` do jogo (o do projeto do professor já está lá). Só precisa mexer se um dia criar outro projeto.
Esse endereço **não é segredo**: quem protege o jogo são as regras e a senha da turma.

---

## Trocar a senha (a cada trimestre)

1. Abra **https://console.firebase.google.com** → seu projeto → **Realtime Database** → aba **Dados**.
2. Abra `config` → `senhas`.
3. Na senha antiga, clique na **lixeira 🗑** para apagar.
4. Clique no **+** ao lado de `senhas` e crie a nova: **Chave** = nova senha, **Valor** = `true` → **Adicionar**.
5. Passe a nova senha para os alunos. Na próxima vez que abrirem o jogo, ele vai pedir a senha nova.

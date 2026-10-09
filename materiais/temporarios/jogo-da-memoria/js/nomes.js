// Nomes da turma: a lista que o aluno clica (nome completo) e o nome curto que aparece no jogo
// ("primeiro nome + último sobrenome", para caber na faixa e no placar).
(function (raiz) {
  'use strict';

  const MINUSCULAS = ['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'la', 'las', 'los', 'di', 'du', 'van', 'von'];
  const SUFIXOS = ['filho', 'filha', 'junior', 'júnior', 'jr', 'jr.', 'neto', 'neta', 'sobrinho', 'sobrinha'];
  const PROFESSOR = 'PROFESSOR';

  function palavras(nome) { return String(nome || '').trim().split(/\s+/).filter(Boolean); }

  // Nome todo em MAIÚSCULAS vira "Nome Próprio" (com "de", "da", "dos"… minúsculos). Escrito normal fica igual.
  function formatar(nome) {
    const p = palavras(nome);
    const s = p.join(' ');
    if (s !== s.toUpperCase()) return s;
    return p.map(function (w, i) {
      const m = w.toLowerCase();
      if (i > 0 && MINUSCULAS.indexOf(m) >= 0) return m;
      return m.charAt(0).toUpperCase() + m.slice(1);
    }).join(' ');
  }

  // Sobrenomes que servem para o nome curto: sem "de/da/dos" e sem abreviações ("C.", "O.").
  function sobrenomes(p) {
    return p.slice(1).filter(function (w) { return MINUSCULAS.indexOf(w.toLowerCase()) < 0 && !/\.$/.test(w); });
  }

  function ultimoSobrenome(p) {
    const s = sobrenomes(p);
    if (!s.length) return '';
    const ultimo = s[s.length - 1];
    if (s.length >= 2 && SUFIXOS.indexOf(ultimo.toLowerCase()) >= 0) return s[s.length - 2] + ' ' + ultimo;
    return ultimo;
  }

  function curto(nome) {
    const p = palavras(formatar(nome));
    if (!p.length) return '';
    const fim = ultimoSobrenome(p);
    // "Maria" quase sempre é nome composto (Maria Eduarda, Maria Luiza): leva o segundo nome junto.
    const composto = p.length > 2 && p[0].toLowerCase() === 'maria' && MINUSCULAS.indexOf(p[1].toLowerCase()) < 0;
    const primeiro = composto ? p[0] + ' ' + p[1] : p[0];
    return fim ? primeiro + ' ' + fim : primeiro;
  }

  // Dois nomes curtos iguais na turma: põe a inicial do segundo nome ("Ana B. Silva"); se ainda empatar, o nome completo.
  function desempatar(itens) {
    const conta = {};
    itens.forEach(function (it) { conta[it.curto] = (conta[it.curto] || 0) + 1; });
    itens.forEach(function (it) {
      if (conta[it.curto] < 2) return;
      const p = palavras(formatar(it.completo));
      it.curto = p.length > 2 ? p[0] + ' ' + p[1].charAt(0).toUpperCase() + '. ' + ultimoSobrenome(p) : formatar(it.completo);
    });
    const deNovo = {};
    itens.forEach(function (it) { deNovo[it.curto] = (deNovo[it.curto] || 0) + 1; });
    itens.forEach(function (it) { if (deNovo[it.curto] > 1) it.curto = formatar(it.completo); });
    return itens;
  }

  // dados = { turma, alunos: [{ numero, nome }] } (como está no Firebase) → [{ numero, completo, curto }] em ordem
  // de chamada, sem nomes repetidos, com PROFESSOR no fim. Sem alunos → null.
  function lista(dados) {
    const brutos = dados && dados.alunos && typeof dados.alunos === 'object' ? Object.values(dados.alunos) : [];
    const vistos = new Set();
    const itens = [];
    brutos.filter(function (a) { return a && typeof a.nome === 'string' && a.nome.trim(); })
      .sort(function (a, b) { return (Number(a.numero) || 0) - (Number(b.numero) || 0); })
      .forEach(function (a) {
        const chave = formatar(a.nome).toLowerCase();
        if (vistos.has(chave) || chave === PROFESSOR.toLowerCase()) return;
        vistos.add(chave);
        itens.push({ numero: Number(a.numero) || null, completo: a.nome.trim(), curto: curto(a.nome) });
      });
    if (!itens.length) return null;
    desempatar(itens);
    itens.push({ numero: null, completo: PROFESSOR, curto: 'Professor' });
    return itens;
  }

  const Nomes = { formatar, curto, lista, PROFESSOR };
  raiz.Nomes = Nomes;
  if (typeof module !== 'undefined' && module.exports) module.exports = Nomes;
})(typeof window !== 'undefined' ? window : globalThis);

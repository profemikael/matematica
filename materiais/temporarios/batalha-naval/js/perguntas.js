// Perguntas: validação dos bancos, conferência das respostas e sorteio (monte de cada jogador).
(function (raiz) {
  'use strict';

  const ESPERA_APOS_ERRO = 5;
  const MINIMO_RECOMENDADO = 10;

  // Aceita texto não vazio ou número (o professor pode escrever resposta: 5 sem aspas).
  function textoValido(x) {
    return (typeof x === 'string' && x.trim() !== '') || (typeof x === 'number' && isFinite(x));
  }

  function normalizar(texto) {
    return String(texto)
      .replace(/\s+/g, '')
      .toLowerCase()
      .replace(/[−–]/g, '-')
      .replace(/,/g, '.');
  }

  function ehNumero(s) {
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s);
  }

  function respostasAceitas(pergunta) {
    return (pergunta.tipo === 'escolha' ? [pergunta.certa] : [].concat(pergunta.resposta)).map(String);
  }

  function conferir(pergunta, respostaAluno) {
    if (respostaAluno === null || respostaAluno === undefined) return false;
    const aluno = normalizar(respostaAluno);
    if (aluno === '') return false;
    return respostasAceitas(pergunta).some(function (r) {
      const certa = normalizar(r);
      if (certa === aluno) return true;
      return ehNumero(certa) && ehNumero(aluno) && Number(certa) === Number(aluno);
    });
  }

  function respostaParaMostrar(pergunta) {
    return respostasAceitas(pergunta)[0];
  }

  // Devolve null se a pergunta é válida, ou o motivo do problema.
  function validarPergunta(p) {
    if (!p || typeof p !== 'object') return 'não é uma pergunta';
    if (!textoValido(p.pergunta)) return 'texto da pergunta vazio';
    if (p.tipo === 'digitar') {
      const lista = [].concat(p.resposta);
      if (p.resposta === undefined || lista.length === 0 || !lista.every(textoValido)) return 'resposta vazia';
      return null;
    }
    if (p.tipo === 'escolha') {
      if (!textoValido(p.certa)) return 'falta a alternativa certa';
      if (!Array.isArray(p.erradas) || p.erradas.length !== 3) return 'precisa de exatamente 3 alternativas erradas';
      if (!p.erradas.every(textoValido)) return 'alternativa errada vazia';
      if (p.erradas.some(function (e) { return normalizar(e) === normalizar(p.certa); })) return 'alternativa errada igual à certa';
      return null;
    }
    return 'tipo desconhecido (use "digitar" ou "escolha")';
  }

  // Recebe o objeto passado para registrarBanco e devolve o banco pronto para uso.
  function validarBanco(dados, arquivo) {
    const banco = { arquivo: arquivo, titulo: arquivo, perguntas: [], avisos: [], erro: null };
    if (!dados || !textoValido(dados.titulo)) { banco.erro = 'falta o título'; return banco; }
    banco.titulo = dados.titulo.trim();
    if (!Array.isArray(dados.perguntas)) { banco.erro = 'falta a lista de perguntas'; return banco; }
    dados.perguntas.forEach(function (p, i) {
      const motivo = validarPergunta(p);
      if (motivo) banco.avisos.push(banco.titulo + ': pergunta ' + (i + 1) + ' ignorada — ' + motivo);
      else banco.perguntas.push(p);
    });
    if (banco.perguntas.length === 0) banco.erro = 'nenhuma pergunta válida';
    else if (banco.perguntas.length < MINIMO_RECOMENDADO) banco.avisos.push(banco.titulo + ': poucas perguntas, vão repetir bastante');
    return banco;
  }

  function embaralhar(lista, aleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      const t = copia[i]; copia[i] = copia[j]; copia[j] = t;
    }
    return copia;
  }

  function indices(n) {
    const lista = [];
    for (let i = 0; i < n; i++) lista.push(i);
    return lista;
  }

  // O monte guarda índices das perguntas do banco.
  function criarMonte(total, aleatorio) {
    return { total: total, monte: embaralhar(indices(total), aleatorio), espera: [] };
  }

  function sortear(m, aleatorio) {
    if (m.monte.length === 0 && m.espera.length === 0) m.monte = embaralhar(indices(m.total), aleatorio);
    const idx = m.monte.length > 0 ? m.monte.shift() : m.espera.shift().idx;
    const aindaEsperando = [];
    m.espera.forEach(function (e) {
      e.faltam -= 1;
      if (e.faltam <= 0) {
        const pos = Math.floor(aleatorio() * (m.monte.length + 1));
        m.monte.splice(pos, 0, e.idx);
      } else {
        aindaEsperando.push(e);
      }
    });
    m.espera = aindaEsperando;
    return idx;
  }

  function registrarResultado(m, idx, certa) {
    if (!certa) m.espera.push({ idx: idx, faltam: ESPERA_APOS_ERRO });
  }

  // ---- Carregamento dos arquivos de banco (só no navegador) ----
  const registrados = [];
  raiz.registrarBanco = function (dados) { registrados.push(dados); };

  function carregarScript(caminho) {
    return new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = caminho;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  async function carregarBancos(arquivos, pasta) {
    const bancos = [];
    for (const arquivo of arquivos) {
      const antes = registrados.length;
      const carregou = await carregarScript(pasta + arquivo);
      if (!carregou) {
        bancos.push({ arquivo: arquivo, titulo: arquivo, perguntas: [], avisos: [], erro: 'arquivo não encontrado' });
      } else if (registrados.length === antes) {
        bancos.push({ arquivo: arquivo, titulo: arquivo, perguntas: [], avisos: [], erro: 'erro de digitação no arquivo (vírgula, aspas ou chaves)' });
      } else {
        bancos.push(validarBanco(registrados[registrados.length - 1], arquivo));
      }
    }
    return bancos;
  }

  const Perguntas = {
    ESPERA_APOS_ERRO, normalizar, conferir, respostaParaMostrar, validarPergunta, validarBanco,
    embaralhar, criarMonte, sortear, registrarResultado, carregarBancos
  };
  raiz.Perguntas = Perguntas;
  if (typeof module !== 'undefined' && module.exports) module.exports = Perguntas;
})(typeof window !== 'undefined' ? window : globalThis);

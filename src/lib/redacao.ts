/**
 * Redacao de dado pessoal antes de ir para o log.
 *
 * Puro, sem I/O — mora em lib/ e e testado com fixtures. O logger
 * (`lib/logger.ts`) liga isto no pino. A regra de que log nao carrega PII esta
 * em `.claude/skills/lgpd-conciliador/references/auditoria.md` (invariante 1).
 *
 * Duas defesas:
 *  - por PADRAO: mascara CPF, CNPJ, e-mail, telefone e chave PIX aleatoria
 *    (UUID) em qualquer string. Pega PII que caiu onde nao devia — a mensagem,
 *    o campo `erro`, um parametro de chamada externa.
 *  - por NOME DE CAMPO: texto livre copiado verbatim do extrato ou do ERP
 *    (`descricao`, `historico`, `observacao`, `complemento`) e apagado inteiro,
 *    porque nome de pessoa nao casa com regex nenhuma.
 */

const MASCARA = '[REDIGIDO]';

/** Ordem importa: e-mail e UUID antes dos numericos; CNPJ (14) antes de CPF (11). */
const PADROES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDIGIDO:EMAIL]'],
  [
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    '[REDIGIDO:UUID]',
  ],
  [/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g, '[REDIGIDO:CNPJ]'],
  [/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g, '[REDIGIDO:CPF]'],
  [/(?<!\d)(?:\+?55\s?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?!\d)/g, '[REDIGIDO:TELEFONE]'],
];

/** Mascara CPF/CNPJ/e-mail/telefone/PIX numa string solta (ex.: a mensagem de log). */
export function redigirTexto(texto: string): string {
  let saida = texto;
  for (const [expressao, substituto] of PADROES) {
    saida = saida.replace(expressao, substituto);
  }
  return saida;
}

const normalizarChave = (chave: string): string => chave.toLowerCase().replace(/[^a-z]/g, '');

/** Campo cujo valor e texto livre do banco/ERP: apaga inteiro, nao adianta regex. */
const SUFIXOS_TEXTO_LIVRE = ['descricao', 'description', 'historico', 'observacao', 'complemento'];

/** Identificador tecnico conhecido: nao e PII, deixa passar mesmo com cara de UUID. */
const CAMPOS_IDENTIFICADOR = new Set(['accountid', 'itemid', 'pluggyaccountid']);

const PROFUNDIDADE_MAX = 8;

function ehTextoLivre(chave: string): boolean {
  const normal = normalizarChave(chave);
  return SUFIXOS_TEXTO_LIVRE.some((sufixo) => normal.endsWith(sufixo));
}

/**
 * Percorre valor de qualquer forma (objeto, array, primitivo) redigindo PII.
 * Devolve uma copia — nao muta a entrada. Corta ciclo e profundidade excessiva
 * para nao travar com um payload cru grande da Pluggy/Omie.
 */
export function redigirValor(valor: unknown): unknown {
  return percorrer(valor, 0, new WeakSet<object>());
}

function percorrer(valor: unknown, nivel: number, vistos: WeakSet<object>): unknown {
  if (typeof valor === 'string') return redigirTexto(valor);
  if (valor === null || typeof valor !== 'object') return valor;

  if (valor instanceof Date) return valor.toISOString();
  if (valor instanceof Error) {
    return { name: valor.name, message: redigirTexto(valor.message) };
  }

  if (nivel >= PROFUNDIDADE_MAX) return '[REDIGIDO:PROFUNDO]';
  if (vistos.has(valor)) return '[REDIGIDO:CICLO]';
  vistos.add(valor);

  if (Array.isArray(valor)) {
    return valor.map((item) => percorrer(item, nivel + 1, vistos));
  }

  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof item === 'string' && ehTextoLivre(chave)) {
      saida[chave] = MASCARA;
    } else if (typeof item === 'string' && CAMPOS_IDENTIFICADOR.has(normalizarChave(chave))) {
      saida[chave] = item;
    } else {
      saida[chave] = percorrer(item, nivel + 1, vistos);
    }
  }
  return saida;
}

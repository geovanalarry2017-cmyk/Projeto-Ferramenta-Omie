/**
 * Datas circulam internamente como string ISO "AAAA-MM-DD".
 * Sem objeto Date no meio do matcher: Date carrega fuso, e o extrato do banco
 * chega em UTC enquanto a Omie fala em horario de Brasilia — comparar Date
 * puro faz lancamento da meia-noite cair no dia errado.
 */

export type DataISO = string;

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** "DD/MM/AAAA" (formato da Omie) -> "AAAA-MM-DD". */
export function deFormatoOmie(data: string | null | undefined): DataISO | null {
  if (!data) return null;
  const m = RE_BR.exec(data.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "AAAA-MM-DD" -> "DD/MM/AAAA", que e o que a API da Omie aceita na entrada. */
export function paraFormatoOmie(data: DataISO): string {
  const m = RE_ISO.exec(data);
  if (!m) throw new Error(`Data fora do formato AAAA-MM-DD: ${data}`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Extrai "AAAA-MM-DD" de um timestamp ISO do Pluggy.
 * Corta a string em vez de usar Date para nao deslocar o dia por fuso.
 */
export function deTimestampISO(valor: string | Date | null | undefined): DataISO | null {
  if (!valor) return null;
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(texto.trim());
  return m ? (m[1] as DataISO) : null;
}

export function ehDataISO(valor: string): valor is DataISO {
  return RE_ISO.test(valor);
}

/** Diferenca absoluta em dias entre duas datas ISO. */
export function diferencaEmDias(a: DataISO, b: DataISO): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Math.round(ms / 86_400_000);
}

/** Soma (ou subtrai, com valor negativo) dias a uma data ISO. */
export function somarDias(data: DataISO, dias: number): DataISO {
  const base = Date.parse(`${data}T00:00:00Z`);
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Hoje em Sao Paulo — o cron roda de madrugada e nao pode virar o dia errado. */
export function hojeEmSaoPaulo(): DataISO {
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatador.format(new Date()) as DataISO;
}

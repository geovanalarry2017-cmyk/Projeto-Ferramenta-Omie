/**
 * Datas circulam internamente como string ISO "AAAA-MM-DD".
 * Sem objeto Date no meio do calculo do DRE: Date carrega fuso, e comparar
 * Date puro pode jogar lancamento da meia-noite no dia errado.
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

/** Soma (ou subtrai, com valor negativo) dias a uma data ISO. */
export function somarDias(data: DataISO, dias: number): DataISO {
  const base = Date.parse(`${data}T00:00:00Z`);
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

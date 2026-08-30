/**
 * Dinheiro nunca circula como float neste projeto.
 * 0.1 + 0.2 !== 0.3, e uma conciliacao que compara valores com float
 * marca divergencia onde nao existe. Tudo vira centavo inteiro na fronteira.
 */

/** Converte reais (number ou string vinda da API) para centavos inteiros. */
export function paraCentavos(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0;

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return 0;
    return Math.round(valor * 100);
  }

  // A Omie devolve decimal como number no JSON, mas string aparece em campos
  // legados e em CSV/export. Aceita "1.234,56" e "1234.56".
  const limpo = valor.trim().replace(/\s/g, '');
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

/** Centavos inteiros de volta para reais, para exibicao. */
export function paraReais(centavos: number): number {
  return centavos / 100;
}

/** Formata centavos como moeda brasileira, para log e relatorio. */
export function formatarBRL(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(paraReais(centavos));
}

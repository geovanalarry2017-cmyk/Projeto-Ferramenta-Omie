/**
 * A API da Omie devolve texto com entidades HTML escapadas: uma categoria
 * chamada "<Disponível>" chega como "&lt;Disponível&gt;". Jogar isso direto num
 * relatorio ou grafico mostra o lixo para o usuario final.
 */

const ENTIDADES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function decodificarEntidades(texto: string | null | undefined): string {
  if (!texto) return '';

  return texto
    .replace(/&(?:lt|gt|amp|quot|apos|nbsp|#39);/g, (e) => ENTIDADES[e] ?? e)
    // Entidades numericas, ex: &#233; -> e com acento.
    .replace(/&#(\d+);/g, (_, codigo: string) => String.fromCodePoint(Number(codigo)))
    .trim();
}

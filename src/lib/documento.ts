/**
 * CPF/CNPJ chegam formatados de um lado ("12.345.678/0001-90") e crus do outro
 * ("12345678000190"). Comparar sem normalizar perde match legitimo.
 */

/** Deixa so os digitos. Devolve null se nao sobrar um documento plausivel. */
export function normalizarDocumento(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length !== 11 && digitos.length !== 14) return null;
  // Documento zerado aparece como placeholder em cadastro incompleto.
  if (/^0+$/.test(digitos)) return null;
  return digitos;
}

const PALAVRAS_IGNORADAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'para',
  'ltda', 'me', 'epp', 'sa', 'eireli', 'cia',
  'pagamento', 'pag', 'recebimento', 'transferencia', 'transf', 'ted', 'doc',
  'pix', 'boleto', 'titulo', 'cobranca', 'deposito', 'saque', 'tarifa',
  'ref', 'nf', 'nfe', 'parcela', 'compra', 'venda',
]);

/**
 * Quebra uma descricao em tokens comparaveis: sem acento, sem pontuacao,
 * sem as palavras que aparecem em toda linha de extrato e nao distinguem nada.
 */
export function tokenizarDescricao(texto: string | null | undefined): Set<string> {
  if (!texto) return new Set();

  const tokens = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acento
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !PALAVRAS_IGNORADAS.has(t) && !/^\d+$/.test(t));

  return new Set(tokens);
}

/**
 * Similaridade de Jaccard entre dois conjuntos de tokens: 0 = nada em comum,
 * 1 = identicos. Serve so como desempate — o peso forte no matcher e valor,
 * data e documento.
 */
export function similaridadeTokens(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let intersecao = 0;
  for (const token of a) {
    if (b.has(token)) intersecao += 1;
  }
  if (intersecao === 0) return 0;

  const uniao = a.size + b.size - intersecao;
  return intersecao / uniao;
}

import { paraCentavos } from '../lib/money.js';
import { decodificarEntidades } from '../lib/texto.js';
import type { OrcamentoCategoria } from '../omie/types.js';
import type { LinhaOrcamento, ResultadoOrcamento } from './types.js';

/**
 * Monta o previsto x realizado do mês a partir do que a Omie devolveu.
 *
 * Puro: não busca nada, só calcula sobre o que já veio da Omie — mesma regra
 * de `dre/montar.ts`.
 *
 * De propósito **não** classifica desvio como bom/ruim (sem cor, sem "alerta"):
 * uma categoria de despesa estourar o previsto é preocupante, mas a mesma
 * coisa numa categoria de receita é ótima notícia, e o orçamento de caixa da
 * Omie não diz aqui qual é qual — diferente da categoria usada no DRE, que
 * tem o vínculo `codigo_dre` para isso. Mostrar cor sem saber o lado seria
 * inventar um julgamento que os dados não sustentam.
 */
export function montarOrcamento(
  ano: number,
  mes: number,
  categorias: OrcamentoCategoria[],
): ResultadoOrcamento {
  const linhas: LinhaOrcamento[] = categorias
    .filter((c): c is OrcamentoCategoria & { cCodCateg: string } => Boolean(c.cCodCateg))
    .map((c) => {
      const previstoCentavos = paraCentavos(c.nValorPrevisto);
      const realizadoCentavos = paraCentavos(c.nValorRealilzado ?? c.nValorRealizado);
      const desvioCentavos = realizadoCentavos - previstoCentavos;

      return {
        codigo: c.cCodCateg,
        descricao: decodificarEntidades(c.cDesCateg) || c.cCodCateg,
        previstoCentavos,
        realizadoCentavos,
        desvioCentavos,
        desvioPercentual:
          previstoCentavos === 0
            ? null
            : Math.round((desvioCentavos / previstoCentavos) * 1000) / 10,
      };
    })
    .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));

  const totalPrevistoCentavos = linhas.reduce((soma, l) => soma + l.previstoCentavos, 0);
  const totalRealizadoCentavos = linhas.reduce((soma, l) => soma + l.realizadoCentavos, 0);

  return {
    ano,
    mes,
    linhas,
    totalPrevistoCentavos,
    totalRealizadoCentavos,
    totalDesvioCentavos: totalRealizadoCentavos - totalPrevistoCentavos,
  };
}

import type { DataISO } from '../lib/dates.js';
import { paraCentavos } from '../lib/money.js';
import { decodificarEntidades } from '../lib/texto.js';
import type { LinhaOrcamento, MesOrcamento, OrcamentoDoMes, ResultadoOrcamento } from './types.js';

/**
 * Monta o previsto x realizado do período a partir do que a Omie devolveu,
 * mês por mês (`porMes` já vem um item por mês do período — ver
 * `dre/montar.ts#mesesNoPeriodo`, reaproveitado no service).
 *
 * Puro: não busca nada, só soma o que já veio da Omie — mesma regra de
 * `dre/montar.ts`.
 *
 * De propósito **não** classifica desvio como bom/ruim (sem cor, sem
 * "alerta"): uma categoria de despesa estourar o previsto é preocupante, mas
 * a mesma coisa numa categoria de receita é ótima notícia, e o orçamento de
 * caixa da Omie não diz aqui qual é qual — diferente da categoria usada no
 * DRE, que tem o vínculo `codigo_dre` para isso. Mostrar cor sem saber o lado
 * seria inventar um julgamento que os dados não sustentam.
 */
export function montarOrcamento(
  de: DataISO,
  ate: DataISO,
  porMes: OrcamentoDoMes[],
): ResultadoOrcamento {
  const acumuladoPorCategoria = new Map<
    string,
    { descricao: string; previstoCentavos: number; realizadoCentavos: number }
  >();
  const meses: MesOrcamento[] = [];

  for (const { chave, categorias } of porMes) {
    let previstoMesCentavos = 0;
    let realizadoMesCentavos = 0;

    for (const c of categorias) {
      if (!c.cCodCateg) continue;

      const previstoCentavos = paraCentavos(c.nValorPrevisto);
      const realizadoCentavos = paraCentavos(c.nValorRealilzado ?? c.nValorRealizado);
      previstoMesCentavos += previstoCentavos;
      realizadoMesCentavos += realizadoCentavos;

      const atual = acumuladoPorCategoria.get(c.cCodCateg) ?? {
        descricao: decodificarEntidades(c.cDesCateg) || c.cCodCateg,
        previstoCentavos: 0,
        realizadoCentavos: 0,
      };
      atual.previstoCentavos += previstoCentavos;
      atual.realizadoCentavos += realizadoCentavos;
      acumuladoPorCategoria.set(c.cCodCateg, atual);
    }

    meses.push({
      chave,
      previstoCentavos: previstoMesCentavos,
      realizadoCentavos: realizadoMesCentavos,
      desvioCentavos: realizadoMesCentavos - previstoMesCentavos,
      temOrcamento: categorias.length > 0,
    });
  }

  const linhas: LinhaOrcamento[] = [...acumuladoPorCategoria.entries()]
    .map(([codigo, v]) => {
      const desvioCentavos = v.realizadoCentavos - v.previstoCentavos;
      return {
        codigo,
        descricao: v.descricao,
        previstoCentavos: v.previstoCentavos,
        realizadoCentavos: v.realizadoCentavos,
        desvioCentavos,
        desvioPercentual:
          v.previstoCentavos === 0 ? null : Math.round((desvioCentavos / v.previstoCentavos) * 1000) / 10,
      };
    })
    .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));

  const totalPrevistoCentavos = linhas.reduce((soma, l) => soma + l.previstoCentavos, 0);
  const totalRealizadoCentavos = linhas.reduce((soma, l) => soma + l.realizadoCentavos, 0);

  return {
    periodo: { de, ate },
    meses,
    linhas,
    totalPrevistoCentavos,
    totalRealizadoCentavos,
    totalDesvioCentavos: totalRealizadoCentavos - totalPrevistoCentavos,
  };
}

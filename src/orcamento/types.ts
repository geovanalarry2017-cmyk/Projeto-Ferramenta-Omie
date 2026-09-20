import type { DataISO } from '../lib/dates.js';
import type { OrcamentoCategoria } from '../omie/types.js';

/** Orçamento cru de um mês, antes de somar entre meses. */
export interface OrcamentoDoMes {
  /** "AAAA-MM". */
  chave: string;
  categorias: OrcamentoCategoria[];
}

/** Uma categoria, somada pelo período inteiro (todos os meses juntos). */
export interface LinhaOrcamento {
  codigo: string;
  descricao: string;
  previstoCentavos: number;
  realizadoCentavos: number;
  /** realizado - previsto. Positivo = realizado passou do previsto. */
  desvioCentavos: number;
  /** desvio sobre o previsto, em pontos percentuais. null quando previsto = 0 (divisão sem sentido). */
  desvioPercentual: number | null;
}

/** Totais de um mês do período — a base do gráfico mês a mês. */
export interface MesOrcamento {
  /** "AAAA-MM". */
  chave: string;
  previstoCentavos: number;
  realizadoCentavos: number;
  desvioCentavos: number;
  /** false quando a Omie não tinha orçamento cadastrado nesse mês específico. */
  temOrcamento: boolean;
}

export interface ResultadoOrcamento {
  periodo: { de: DataISO; ate: DataISO };
  /** Um item por mês do período, na ordem — inclusive os que vieram vazios da Omie. */
  meses: MesOrcamento[];
  /** Por categoria, somado pelo período inteiro. Vazio quando nenhum mês tinha orçamento. */
  linhas: LinhaOrcamento[];
  totalPrevistoCentavos: number;
  totalRealizadoCentavos: number;
  totalDesvioCentavos: number;
}

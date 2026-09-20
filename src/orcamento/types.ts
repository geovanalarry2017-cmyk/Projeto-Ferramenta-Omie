/** Uma categoria no orçamento de caixa de um mês: previsto x realizado. */
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

export interface ResultadoOrcamento {
  ano: number;
  mes: number;
  /**
   * Uma linha por categoria com orçamento cadastrado na Omie. Vazio quando o
   * cliente nunca preencheu o orçamento de caixa naquele mês — não é erro.
   */
  linhas: LinhaOrcamento[];
  totalPrevistoCentavos: number;
  totalRealizadoCentavos: number;
  totalDesvioCentavos: number;
}

import type { DataISO } from '../lib/dates.js';

/** Regime de apuracao. Muda qual data e qual valor do titulo sao usados. */
export type Regime = 'caixa' | 'competencia';

export interface LinhaDRE {
  codigo: string;
  descricao: string;
  nivel: number;
  /** Linha calculada a partir dos filhos; nao recebe lancamento direto. */
  ehTotalizador: boolean;
  /** "+" soma, "-" subtrai, vazio nos totalizadores. */
  sinal: string;
  /** Valor ja com o sinal aplicado, em centavos. E o numero do relatorio. */
  valorCentavos: number;
  /** Soma crua lancada nesta linha, sem sinal. Util para conferencia. */
  valorBrutoCentavos: number;
  filhos: LinhaDRE[];
}

/**
 * Movimento cuja categoria nao aponta para nenhuma conta do DRE.
 *
 * Precisa aparecer no resultado, nunca ser descartado em silencio: se a Omie do
 * cliente tem categorias sem vinculo de DRE, o relatorio fica incompleto e o
 * usuario tem que saber disso — um DRE que "fecha" escondendo dinheiro e pior
 * do que um que avisa que esta faltando.
 */
export interface CategoriaNaoClassificada {
  codigo: string;
  descricao: string;
  valorCentavos: number;
  movimentos: number;
}

export interface ResultadoDRE {
  periodo: { de: DataISO; ate: DataISO };
  regime: Regime;
  /** Linhas raiz, cada uma com seus filhos aninhados. */
  linhas: LinhaDRE[];
  /** Soma das raizes: o resultado do periodo. Calculado por nos, nao pela Omie. */
  resultadoCentavos: number;
  naoClassificado: {
    totalCentavos: number;
    categorias: CategoriaNaoClassificada[];
  };
  diagnostico: {
    movimentosLidos: number;
    movimentosSemValor: number;
    movimentosSemCategoria: number;
    /**
     * Movimentos que a Omie devolveu mas cuja data cai fora do periodo pedido.
     * Deveria ser sempre zero: se subir, o filtro de data do servidor nao esta
     * fazendo o que se espera e o numero do DRE nao e confiavel.
     */
    movimentosForaDoPeriodo: number;
    categoriasComVinculoDRE: number;
    categoriasTotais: number;
  };
}

// ---------- Fluxo de caixa ----------

export interface DiaDeCaixa {
  data: DataISO;
  entradasCentavos: number;
  saidasCentavos: number;
  saldoDoDiaCentavos: number;
  saldoAcumuladoCentavos: number;
}

export interface ResultadoFluxoCaixa {
  periodo: { de: DataISO; ate: DataISO };
  dias: DiaDeCaixa[];
  totalEntradasCentavos: number;
  totalSaidasCentavos: number;
  saldoPeriodoCentavos: number;
}

import type { DataISO } from '../lib/dates.js';

/**
 * Formato comum dos dois lados da conciliacao.
 *
 * O matcher nunca ve payload de API: ele so conhece estas duas formas.
 * E o que permite testar a regra de match com fixtures, sem rede, e calibrar
 * os pesos sem depender de credencial.
 */

/** Uma linha do extrato bancario real (via Pluggy). */
export interface MovimentoBanco {
  id: string;
  data: DataISO;
  /** Centavos com sinal: positivo = entrou, negativo = saiu. */
  valorCentavos: number;
  descricao: string;
  /** CPF/CNPJ da contraparte, so digitos, quando a instituicao informa. */
  documento: string | null;
  /** Tokens da descricao, pre-calculados para nao repetir trabalho no loop. */
  tokens: Set<string>;
}

/** Um lancamento do extrato de conta corrente da Omie. */
export interface LancamentoOmie {
  id: string;
  data: DataISO;
  /** Centavos com sinal, mesma convencao do banco. */
  valorCentavos: number;
  descricao: string;
  documento: string | null;
  tokens: Set<string>;
  /** Se a Omie ja marcou como conciliado — nao mexer nesses. */
  jaConciliado: boolean;
  /** cSituacao cru da Omie, ex: "Previsto". Util para diagnosticar o relatorio. */
  situacao: string;
  /**
   * Movimento apenas previsto, que ainda nao aconteceu na conta.
   * Nao ter correspondente no banco e o comportamento esperado, nao divergencia.
   */
  ehPrevisao: boolean;
}

export type StatusItem =
  /** Casou com confianca e valor exato. */
  | 'CONCILIADO'
  /** Casou, mas com diferenca de valor ou confianca baixa — olho humano. */
  | 'REVISAR'
  /** Existe no banco e nao achamos na Omie. */
  | 'PENDENTE_OMIE'
  /** Existe na Omie e nao apareceu no extrato do banco. */
  | 'PENDENTE_BANCO';

export interface ItemConciliacao {
  status: StatusItem;
  /** Por que caiu nesse status, em portugues, para aparecer no relatorio. */
  motivo: string;
  /** 0..1 — so faz sentido quando houve par. */
  score: number | null;
  banco: MovimentoBanco | null;
  omie: LancamentoOmie | null;
  /** banco - omie, em centavos. Zero quando o valor bateu exato. */
  diferencaCentavos: number | null;
}

export interface ResumoConciliacao {
  totalBanco: number;
  totalOmie: number;
  conciliados: number;
  revisar: number;
  pendenteOmie: number;
  pendenteBanco: number;
}

export interface ResultadoConciliacao {
  itens: ItemConciliacao[];
  resumo: ResumoConciliacao;
}

/** Limiares de match. Vem do .env porque precisam de calibracao real. */
export interface RegrasConciliacao {
  toleranciaDias: number;
  toleranciaValorCentavos: number;
  scoreMinimo: number;
}

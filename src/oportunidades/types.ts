import type { DataISO } from '../lib/dates.js';

/**
 * Quanto o achado pesa. Não é enfeite: ordena a lista, e o que fica no topo é
 * o que o cliente vai olhar primeiro.
 *
 * `alta`        dinheiro saindo, sumindo ou faltando agora
 * `media`       tendência ruim que ainda dá para virar
 * `informativa` retrato do negócio que vale conhecer, sem urgência
 */
export type Severidade = 'alta' | 'media' | 'informativa';

export interface Oportunidade {
  /** Identificador estável do tipo de achado, para o painel e para os testes. */
  id: string;
  titulo: string;
  severidade: Severidade;
  /**
   * O dinheiro em jogo, quando existe um. Nem todo achado tem: "a margem caiu
   * 6 p.p." é um alerta legítimo sem um valor único que o represente.
   */
  valorCentavos?: number;
  /** O que os números dizem. */
  achado: string;
  /** O que fazer a respeito. Sem isso é diagnóstico, não oportunidade. */
  acao: string;
}

export interface ResultadoOportunidades {
  periodo: { de: DataISO; ate: DataISO };
  /**
   * A análise é sempre em regime de caixa: trata do dinheiro que de fato
   * entrou e saiu, que é sobre o que dá para agir.
   */
  itens: Oportunidade[];
  resumo: {
    alta: number;
    media: number;
    informativa: number;
    /** Soma do que está em jogo nos achados de severidade alta. */
    emJogoCentavos: number;
  };
  diagnostico: {
    mesesAnalisados: number;
    /** Análises que precisam de histórico e ficaram de fora por falta dele. */
    precisaMaisMeses: boolean;
  };
}

import { tokenizarDescricao } from '../src/lib/documento.js';
import type { LancamentoOmie, MovimentoBanco, RegrasConciliacao } from '../src/conciliacao/types.js';

/** Mesmos defaults do .env.example, para o teste refletir a producao. */
export const REGRAS_PADRAO: RegrasConciliacao = {
  toleranciaDias: 2,
  toleranciaValorCentavos: 500,
  scoreMinimo: 0.6,
};

export function movimentoBanco(
  parcial: Partial<MovimentoBanco> & Pick<MovimentoBanco, 'id' | 'data' | 'valorCentavos'>,
): MovimentoBanco {
  const descricao = parcial.descricao ?? '';
  return {
    descricao,
    documento: null,
    tokens: parcial.tokens ?? tokenizarDescricao(descricao),
    ...parcial,
  };
}

export function lancamentoOmie(
  parcial: Partial<LancamentoOmie> & Pick<LancamentoOmie, 'id' | 'data' | 'valorCentavos'>,
): LancamentoOmie {
  const descricao = parcial.descricao ?? '';
  return {
    descricao,
    documento: null,
    jaConciliado: false,
    situacao: 'Liquidado',
    ehPrevisao: false,
    tokens: parcial.tokens ?? tokenizarDescricao(descricao),
    ...parcial,
  };
}

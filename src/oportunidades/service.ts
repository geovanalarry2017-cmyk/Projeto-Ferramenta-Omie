import { buscarComCredenciais } from '../clientes/repository.js';
import { obterCadastrosDRE } from '../dre/service.js';
import { montarDRE, montarDREMensal, montarFluxoDeCaixa } from '../dre/montar.js';
import type { DataISO } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { listarMovimentos } from '../omie/financas.js';
import { analisarOportunidades } from './analisar.js';
import type { ResultadoOportunidades } from './types.js';

/**
 * Monta o mapa de oportunidades.
 *
 * Busca os movimentos **uma vez** e deriva os tres retratos em memoria — DRE do
 * periodo, DRE mes a mes e fluxo de caixa. Chamar os tres servicos existentes
 * seria tres varreduras da mesma janela na Omie para os mesmos dados.
 *
 * Sempre em regime de caixa: a analise fala do dinheiro que de fato entrou e
 * saiu, que e sobre o que da para agir. Um alerta de "caixa negativo" apurado
 * por competencia seria sobre dinheiro que ninguem viu.
 */
export async function apurarOportunidades(
  clienteId: number,
  de: DataISO,
  ate: DataISO,
): Promise<ResultadoOportunidades> {
  const cliente = await buscarComCredenciais(clienteId);
  if (!cliente) throw new Error(`Cliente ${clienteId} nao encontrado.`);

  const { contasDRE, categorias } = await obterCadastrosDRE(clienteId);

  if (contasDRE.length === 0) {
    throw new Error(
      'A Omie deste cliente nao tem plano de contas do DRE cadastrado. ' +
        'Configure em Financas > DRE antes de apurar.',
    );
  }

  const movimentos = await listarMovimentos(cliente.omie, de, ate, true);
  const opcoes = { de, ate, regime: 'caixa' as const };

  const resultado = analisarOportunidades({
    dre: montarDRE(contasDRE, categorias, movimentos, opcoes),
    mensal: montarDREMensal(contasDRE, categorias, movimentos, opcoes),
    fluxo: montarFluxoDeCaixa(movimentos, de, ate),
    de,
    ate,
  });

  logger.info(
    {
      cliente: cliente.slug,
      de,
      ate,
      achados: resultado.itens.length,
      alta: resultado.resumo.alta,
    },
    'mapa de oportunidades apurado',
  );

  return resultado;
}

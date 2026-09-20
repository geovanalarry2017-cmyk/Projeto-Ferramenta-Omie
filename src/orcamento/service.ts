import { buscarComCredenciais } from '../clientes/repository.js';
import { mesesNoPeriodo } from '../dre/montar.js';
import type { DataISO } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { listarOrcamento } from '../omie/financas.js';
import { montarOrcamento } from './montar.js';
import type { OrcamentoDoMes, ResultadoOrcamento } from './types.js';

/**
 * Orquestra a apuração: busca o orçamento de cada mês do período na Omie e
 * entrega para a montagem. Toda a soma vive em montar.ts.
 *
 * Diferente do DRE/fluxo (uma chamada à Omie, fatiada em memória por mês), o
 * orçamento de caixa só aceita mês fechado — um período de N meses é N
 * chamadas sequenciais à Omie. A fila por app key (`omie/client.ts`) já cuida
 * do intervalo mínimo entre elas; períodos longos só demoram mais por isso, é
 * limitação da própria Omie, não deste código.
 */
export async function apurarOrcamento(
  clienteId: number,
  de: DataISO,
  ate: DataISO,
): Promise<ResultadoOrcamento> {
  const cliente = await buscarComCredenciais(clienteId);
  if (!cliente) throw new Error(`Cliente ${clienteId} nao encontrado.`);

  const meses = mesesNoPeriodo(de, ate);
  const porMes: OrcamentoDoMes[] = [];

  for (const mes of meses) {
    const [ano, mesNum] = mes.chave.split('-').map(Number) as [number, number];
    const categorias = await listarOrcamento(cliente.omie, ano, mesNum);
    porMes.push({ chave: mes.chave, categorias });
  }

  const resultado = montarOrcamento(de, ate, porMes);

  logger.info(
    {
      cliente: cliente.slug,
      de,
      ate,
      meses: meses.length,
      comOrcamento: resultado.meses.filter((m) => m.temOrcamento).length,
    },
    'orcamento apurado',
  );

  return resultado;
}

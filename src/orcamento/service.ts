import { buscarComCredenciais } from '../clientes/repository.js';
import { listarOrcamento } from '../omie/financas.js';
import { montarOrcamento } from './montar.js';
import type { ResultadoOrcamento } from './types.js';

/** Busca o orçamento de caixa do mês na Omie e monta o previsto x realizado. */
export async function apurarOrcamento(
  clienteId: number,
  ano: number,
  mes: number,
): Promise<ResultadoOrcamento> {
  const cliente = await buscarComCredenciais(clienteId);
  if (!cliente) throw new Error(`Cliente ${clienteId} nao encontrado.`);

  const categorias = await listarOrcamento(cliente.omie, ano, mes);
  return montarOrcamento(ano, mes, categorias);
}

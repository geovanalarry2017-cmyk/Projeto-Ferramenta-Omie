import type { DataISO } from '../lib/dates.js';
import type { ItemConciliacao, ResumoConciliacao } from '../conciliacao/types.js';
import { pool } from './pool.js';

export type OrigemDisparo = 'MANUAL' | 'CRON' | 'HTTP';

export interface ExecucaoRegistrada {
  id: number;
  cliente_id: number | null;
  periodo_de: string;
  periodo_ate: string;
  status: string;
  iniciada_em: Date;
  finalizada_em: Date | null;
  erro: string | null;
  total_banco: number;
  total_omie: number;
  conciliados: number;
  revisar: number;
  pendente_omie: number;
  pendente_banco: number;
}

export async function abrirExecucao(
  clienteId: number,
  de: DataISO,
  ate: DataISO,
  disparo: OrigemDisparo,
): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO conciliacao_execucao (cliente_id, periodo_de, periodo_ate, disparo, status)
     VALUES ($1, $2, $3, $4, 'EXECUTANDO')
     RETURNING id`,
    [clienteId, de, ate, disparo],
  );
  return Number(rows[0]!.id);
}

export async function fecharExecucao(
  execucaoId: number,
  resumo: ResumoConciliacao,
): Promise<void> {
  await pool.query(
    `UPDATE conciliacao_execucao
        SET status = 'CONCLUIDA',
            finalizada_em = now(),
            total_banco = $2, total_omie = $3,
            conciliados = $4, revisar = $5,
            pendente_omie = $6, pendente_banco = $7
      WHERE id = $1`,
    [
      execucaoId,
      resumo.totalBanco,
      resumo.totalOmie,
      resumo.conciliados,
      resumo.revisar,
      resumo.pendenteOmie,
      resumo.pendenteBanco,
    ],
  );
}

export async function marcarExecucaoComErro(execucaoId: number, erro: string): Promise<void> {
  await pool.query(
    `UPDATE conciliacao_execucao
        SET status = 'ERRO', finalizada_em = now(), erro = $2
      WHERE id = $1`,
    [execucaoId, erro.slice(0, 4000)],
  );
}

/**
 * Grava os itens em lote.
 *
 * Um INSERT por item deixaria o job lento por causa da latencia ate o Postgres
 * na nuvem (centenas de idas e voltas). Aqui vai tudo em uma instrucao, em
 * blocos, para nao estourar o limite de parametros do protocolo.
 */
export async function gravarItens(
  execucaoId: number,
  itens: ItemConciliacao[],
  contaApelido: string,
): Promise<void> {
  if (itens.length === 0) return;

  const COLUNAS = 13;
  const ITENS_POR_LOTE = Math.floor(60_000 / COLUNAS);

  for (let inicio = 0; inicio < itens.length; inicio += ITENS_POR_LOTE) {
    const lote = itens.slice(inicio, inicio + ITENS_POR_LOTE);
    const valores: unknown[] = [];
    const marcadores: string[] = [];

    lote.forEach((item, indice) => {
      const base = indice * COLUNAS;
      marcadores.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, ` +
          `$${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, ` +
          `$${base + 12}, $${base + 13})`,
      );
      valores.push(
        execucaoId,
        contaApelido,
        item.status,
        item.motivo,
        item.score,
        item.banco?.id ?? null,
        item.banco?.data ?? null,
        item.banco?.valorCentavos ?? null,
        item.banco?.descricao ?? null,
        item.omie?.id ?? null,
        item.omie?.data ?? null,
        item.omie?.valorCentavos ?? null,
        item.omie?.descricao ?? null,
      );
    });

    await pool.query(
      `INSERT INTO conciliacao_item (
         execucao_id, conta_apelido, status, motivo, score,
         banco_tx_id, banco_data, banco_valor_centavos, banco_descricao,
         omie_lancamento_id, omie_data, omie_valor_centavos, omie_descricao
       ) VALUES ${marcadores.join(', ')}
       ON CONFLICT DO NOTHING`,
      valores,
    );
  }

  // diferenca_centavos e derivada — calcular no banco evita divergir do que
  // esta gravado nas duas colunas de valor.
  await pool.query(
    `UPDATE conciliacao_item
        SET diferenca_centavos = banco_valor_centavos - omie_valor_centavos
      WHERE execucao_id = $1
        AND banco_valor_centavos IS NOT NULL
        AND omie_valor_centavos IS NOT NULL`,
    [execucaoId],
  );
}

/**
 * Busca uma execucao SEMPRE dentro do escopo de um cliente.
 *
 * Nao existe versao "so pelo id": com varios clientes no mesmo banco, uma
 * consulta sem cliente_id e um vazamento de dados financeiros esperando
 * acontecer — bastaria alguem incrementar o id na URL.
 */
export async function buscarExecucao(
  clienteId: number,
  id: number,
): Promise<ExecucaoRegistrada | null> {
  const { rows } = await pool.query<ExecucaoRegistrada>(
    'SELECT * FROM conciliacao_execucao WHERE id = $1 AND cliente_id = $2',
    [id, clienteId],
  );
  return rows[0] ?? null;
}

export async function listarItens(
  execucaoId: number,
  status?: string,
): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    `SELECT * FROM conciliacao_item
      WHERE execucao_id = $1
        AND ($2::text IS NULL OR status = $2)
      ORDER BY
        CASE status
          WHEN 'REVISAR' THEN 1
          WHEN 'PENDENTE_OMIE' THEN 2
          WHEN 'PENDENTE_BANCO' THEN 3
          ELSE 4
        END,
        banco_data NULLS LAST`,
    [execucaoId, status ?? null],
  );
  return rows;
}

export async function listarExecucoes(
  clienteId: number,
  limite = 20,
): Promise<ExecucaoRegistrada[]> {
  const { rows } = await pool.query<ExecucaoRegistrada>(
    'SELECT * FROM conciliacao_execucao WHERE cliente_id = $1 ORDER BY id DESC LIMIT $2',
    [clienteId, limite],
  );
  return rows;
}

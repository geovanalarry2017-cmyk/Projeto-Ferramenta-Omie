import { parseArgs } from 'node:util';
import { ehDataISO } from '../lib/dates.js';
import { formatarBRL } from '../lib/money.js';
import { encerrarPool } from '../db/pool.js';
import { listarItens } from '../db/repository.js';
import { executarConciliacao, janelaPadrao } from '../conciliacao/service.js';

/**
 * Execucao manual, sem subir servidor:
 *   npm run conciliar -- --de 2026-08-01 --ate 2026-08-07
 *
 * E por aqui que se calibra o matcher antes de ligar o cron: roda um periodo
 * curto, le a tabela impressa e confere contra o extrato de verdade.
 */

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      de: { type: 'string' },
      ate: { type: 'string' },
      detalhes: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  const padrao = janelaPadrao();
  const de = values.de ?? padrao.de;
  const ate = values.ate ?? padrao.ate;

  if (!ehDataISO(de) || !ehDataISO(ate)) {
    console.error('Datas devem estar no formato AAAA-MM-DD. Ex: --de 2026-08-01 --ate 2026-08-07');
    process.exit(1);
  }
  if (de > ate) {
    console.error('A data inicial nao pode ser maior que a final.');
    process.exit(1);
  }

  const resultado = await executarConciliacao(de, ate, 'MANUAL');
  const { resumo } = resultado;

  console.log(`\n=== Conciliacao #${resultado.execucaoId} — ${de} a ${ate} ===\n`);
  console.table(
    resultado.porConta.map((c) => ({
      Conta: c.conta,
      'Tx banco': c.resumo.totalBanco,
      'Lanc. Omie': c.resumo.totalOmie,
      Conciliados: c.resumo.conciliados,
      Revisar: c.resumo.revisar,
      'Falta na Omie': c.resumo.pendenteOmie,
      'Falta no banco': c.resumo.pendenteBanco,
    })),
  );

  const analisados = resumo.conciliados + resumo.revisar + resumo.pendenteOmie;
  const taxa = analisados > 0 ? ((resumo.conciliados / analisados) * 100).toFixed(1) : '0.0';
  console.log(`\nTaxa de conciliacao automatica: ${taxa}%`);

  if (resumo.revisar > 0 || resumo.pendenteOmie > 0) {
    console.log(
      `Precisam de atencao: ${resumo.revisar} para revisar, ${resumo.pendenteOmie} sem lancamento na Omie.`,
    );
  }

  if (values.detalhes) {
    const itens = await listarItens(resultado.execucaoId);
    const paraOlhar = itens.filter((i) => i.status !== 'CONCILIADO');

    if (paraOlhar.length > 0) {
      console.log('\n--- Itens que nao fecharam ---');
      console.table(
        paraOlhar.slice(0, 50).map((i) => ({
          Status: i.status,
          Data: i.banco_data ?? i.omie_data,
          Banco: i.banco_valor_centavos != null ? formatarBRL(Number(i.banco_valor_centavos)) : '—',
          Omie: i.omie_valor_centavos != null ? formatarBRL(Number(i.omie_valor_centavos)) : '—',
          Descricao: String(i.banco_descricao ?? i.omie_descricao ?? '').slice(0, 45),
          Motivo: String(i.motivo ?? '').slice(0, 60),
        })),
      );
      if (paraOlhar.length > 50) {
        console.log(`... e mais ${paraOlhar.length - 50} itens. Consulte pela API.`);
      }
    }
  }

  console.log('');
}

principal()
  .then(() => encerrarPool())
  .then(() => process.exit(0))
  .catch(async (erro: Error) => {
    console.error(`\nFalhou: ${erro.message}\n`);
    await encerrarPool().catch(() => undefined);
    process.exit(1);
  });

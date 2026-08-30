import { writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { hojeEmSaoPaulo, somarDias } from '../src/lib/dates.js';
import { formatarBRL, paraCentavos } from '../src/lib/money.js';
import { listarContasCorrentes, listarExtrato } from '../src/omie/financas.js';

/**
 * Valida as credenciais da Omie e, principalmente, RESOLVE A DUVIDA DO SINAL.
 *
 * A documentacao da Omie descreve cNatureza so como "Natureza da operacao",
 * sem listar valores, e nao diz se nValorDocumento vem com sinal proprio.
 * Enquanto isso nao for confirmado com dado real, o conciliador pode inverter
 * entrada e saida sem que nada exploda.
 *
 *   npm run smoke:omie -- --dias 30
 */

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dias: { type: 'string', default: '30' },
      conta: { type: 'string' },
    },
  });

  console.log('\n=== Contas correntes na Omie ===\n');
  const contas = await listarContasCorrentes();

  if (contas.length === 0) {
    console.log('Nenhuma conta corrente ativa encontrada.');
    return;
  }

  console.table(
    contas.map((c) => ({
      nCodCC: c.nCodCC,
      Descricao: c.descricao,
      Banco: c.codigo_banco,
      Agencia: c.codigo_agencia,
      Conta: c.conta_corrente,
    })),
  );
  console.log('Use o nCodCC como "omieCodigoContaCorrente" em CONTAS_MAPEADAS.\n');

  const codigoConta = values.conta ? Number(values.conta) : contas[0]!.nCodCC;
  const ate = hojeEmSaoPaulo();
  const de = somarDias(ate, -Number(values.dias));

  console.log(`=== Extrato da conta ${codigoConta}: ${de} a ${ate} ===\n`);
  const { resposta, movimentos } = await listarExtrato(codigoConta, de, ate);

  console.log('Saldos:', {
    anterior: resposta.nSaldoAnterior,
    atual: resposta.nSaldoAtual,
    conciliado: resposta.nSaldoConciliado,
  });
  console.log(`Movimentos no periodo: ${movimentos.length}\n`);

  if (movimentos.length === 0) {
    console.log('Sem movimento no periodo. Aumente --dias e rode de novo.');
    return;
  }

  // ---- A pergunta que este script existe para responder ----
  const naturezas = new Map<string, { qtd: number; positivos: number; negativos: number }>();
  for (const m of movimentos) {
    const chave = m.cNatureza?.trim() || '(vazio)';
    const atual = naturezas.get(chave) ?? { qtd: 0, positivos: 0, negativos: 0 };
    const centavos = paraCentavos(m.nValorDocumento);
    atual.qtd += 1;
    if (centavos > 0) atual.positivos += 1;
    if (centavos < 0) atual.negativos += 1;
    naturezas.set(chave, atual);
  }

  console.log('=== cNatureza x sinal de nValorDocumento ===\n');
  console.table(
    [...naturezas.entries()].map(([natureza, dados]) => ({
      cNatureza: natureza,
      Ocorrencias: dados.qtd,
      'Valor positivo': dados.positivos,
      'Valor negativo': dados.negativos,
    })),
  );

  const todosPositivos = movimentos.every((m) => paraCentavos(m.nValorDocumento) >= 0);
  console.log(
    todosPositivos
      ? '\n-> Todos os valores vieram positivos: o sinal DEPENDE de cNatureza.\n' +
          '   Mantenha OMIE_EXTRATO_SINAL_POR_NATUREZA=true e confira, na tabela acima,\n' +
          '   se os valores de cNatureza estao cobertos em src/conciliacao/normalize.ts.'
      : '\n-> Ha valores negativos: nValorDocumento ja carrega o sinal.\n' +
          '   Troque para OMIE_EXTRATO_SINAL_POR_NATUREZA=false no .env.',
  );

  console.log('\n=== Amostra de 5 movimentos ===\n');
  console.table(
    movimentos.slice(0, 5).map((m) => ({
      Lancamento: m.nCodLancamento,
      Data: m.dDataLancamento,
      Natureza: m.cNatureza,
      Valor: formatarBRL(paraCentavos(m.nValorDocumento)),
      Situacao: m.cSituacao,
      Conciliado: m.dDataConciliacao || '—',
      Cliente: (m.cDesCliente ?? '').slice(0, 30),
      Documento: m.cDocCliente || '—',
    })),
  );

  // O dump completo fica fora do git (.gitignore) — sao dados financeiros reais.
  await mkdir('tmp', { recursive: true });
  const caminho = `tmp/extrato-${codigoConta}.dump.json`;
  await writeFile(caminho, JSON.stringify({ resposta, movimentos }, null, 2), 'utf8');
  console.log(`\nPayload bruto salvo em ${caminho} (ignorado pelo git).\n`);
}

principal()
  .then(() => process.exit(0))
  .catch((erro: Error) => {
    console.error(`\nFalhou: ${erro.message}\n`);
    process.exit(1);
  });

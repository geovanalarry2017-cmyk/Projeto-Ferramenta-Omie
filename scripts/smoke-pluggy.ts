import { parseArgs } from 'node:util';
import { buscarComCredenciais, buscarPorSlug } from '../src/clientes/repository.js';
import { encerrarPool } from '../src/db/pool.js';
import { hojeEmSaoPaulo, somarDias } from '../src/lib/dates.js';
import { formatarBRL } from '../src/lib/money.js';
import { normalizarTransacaoBanco } from '../src/conciliacao/normalize.js';
import { listarContas, listarTransacoes, obterItem } from '../src/pluggy/client.js';

/**
 * Confere o lado do banco de um cliente e, principalmente, mostra o dado JA
 * NORMALIZADO — que e como o matcher vai enxerga-lo. E onde se pega sinal
 * invertido antes de virar conciliacao errada.
 *
 *   npm run smoke:pluggy -- --cliente acme --item <itemId>
 *   npm run smoke:pluggy -- --cliente acme --conta <accountId> --dias 30
 */

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cliente: { type: 'string' },
      item: { type: 'string' },
      conta: { type: 'string' },
      dias: { type: 'string', default: '15' },
    },
  });

  if (!values.cliente) {
    console.error('\nInforme --cliente <slug>. Veja os slugs com: npm run clientes -- listar\n');
    process.exit(1);
  }

  const resumo = await buscarPorSlug(values.cliente);
  if (!resumo) {
    console.error(`\nCliente "${values.cliente}" nao encontrado.\n`);
    process.exit(1);
  }
  const cliente = (await buscarComCredenciais(resumo.id))!;

  let accountId = values.conta;

  // A API do Pluggy nao lista os items de uma aplicacao: um item pertence a um
  // usuario final e o ID e devolvido pelo Pluggy Connect no momento da conexao.
  if (!accountId && !values.item) {
    // Sem item nem conta, cai nas contas ja mapeadas para este cliente.
    if (cliente.contas.length === 0) {
      console.error(
        '\nInforme --item <itemId> ou --conta <accountId>.\n' +
          'O itemId aparece no dashboard do Pluggy (Applications > Items).\n',
      );
      process.exit(1);
    }
    accountId = cliente.contas[0]!.pluggyAccountId;
    console.log(`\nUsando a conta mapeada "${cliente.contas[0]!.apelido}".`);
  }

  if (values.item) {
    const item = await obterItem(cliente.pluggy, values.item);
    console.log(
      `\n=== Item ${item.id} — ${item.connector?.name ?? 'instituicao'} (${item.status}) ===\n`,
    );

    const contas = await listarContas(cliente.pluggy, values.item);
    console.table(
      contas.map((c) => ({
        accountId: c.id,
        Tipo: c.type,
        Nome: c.name,
        Numero: c.number,
        Saldo: formatarBRL(Math.round(c.balance * 100)),
      })),
    );

    // So conta corrente serve para conciliar extrato; cartao tem outra logica.
    accountId = accountId ?? contas.find((c) => c.type === 'BANK')?.id ?? contas[0]?.id;
  }

  if (!accountId) {
    console.log('Nenhuma conta para consultar transacoes.');
    return;
  }

  const ate = hojeEmSaoPaulo();
  const de = somarDias(ate, -Number(values.dias));

  console.log(`\n=== Transacoes da conta ${accountId}: ${de} a ${ate} ===\n`);
  const transacoes = await listarTransacoes(cliente.pluggy, accountId, de, ate);
  console.log(`Total: ${transacoes.length}\n`);

  if (transacoes.length === 0) {
    console.log('Sem transacoes no periodo. Aumente --dias e rode de novo.');
    return;
  }

  console.table(
    transacoes.slice(0, 10).map((t) => {
      const normalizado = normalizarTransacaoBanco(t);
      return {
        Data: normalizado?.data,
        Tipo: t.type,
        'Valor bruto': t.amount,
        Normalizado: normalizado ? formatarBRL(normalizado.valorCentavos) : '—',
        Descricao: (normalizado?.descricao ?? '').slice(0, 35),
        Documento: normalizado?.documento ?? '—',
      };
    }),
  );

  console.log('\nConfira "Normalizado": saida deve estar negativa e entrada positiva.\n');
}

principal()
  .then(() => encerrarPool())
  .then(() => process.exit(0))
  .catch(async (erro: Error) => {
    console.error(`\nFalhou: ${erro.message}\n`);
    await encerrarPool().catch(() => undefined);
    process.exit(1);
  });

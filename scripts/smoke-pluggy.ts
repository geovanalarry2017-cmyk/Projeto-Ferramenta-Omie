import { parseArgs } from 'node:util';
import { hojeEmSaoPaulo, somarDias } from '../src/lib/dates.js';
import { formatarBRL } from '../src/lib/money.js';
import { normalizarTransacaoBanco } from '../src/conciliacao/normalize.js';
import { listarContas, listarTransacoes, obterClientePluggy } from '../src/pluggy/client.js';

/**
 * Valida as credenciais do Pluggy e descobre os accountId que vao no .env.
 *
 * Sem --item, lista os items (conexoes com instituicoes) da aplicacao.
 * Com --item, lista as contas daquele item e as transacoes recentes.
 *
 *   npm run smoke:pluggy
 *   npm run smoke:pluggy -- --item <uuid-do-item> --dias 15
 */

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      item: { type: 'string' },
      conta: { type: 'string' },
      dias: { type: 'string', default: '15' },
    },
  });

  const cliente = obterClientePluggy();

  // A API do Pluggy nao lista os items de uma aplicacao: um item pertence a um
  // usuario final e o ID e devolvido pelo Pluggy Connect no momento da conexao.
  // Pegue o itemId em https://dashboard.pluggy.ai (Applications > Items).
  if (!values.item && !values.conta) {
    console.log(
      '\nInforme um item ou uma conta:\n' +
        '  npm run smoke:pluggy -- --item <itemId>\n' +
        '  npm run smoke:pluggy -- --conta <accountId>\n\n' +
        'O itemId aparece no dashboard do Pluggy (Applications > Items), ou e devolvido\n' +
        'pelo Pluggy Connect quando a conta bancaria e conectada.\n',
    );
    return;
  }

  let accountId = values.conta;

  if (values.item) {
    const item = await cliente.fetchItem(values.item);
    console.log(
      `\n=== Item ${item.id} — ${item.connector?.name ?? 'instituicao desconhecida'} ` +
        `(status: ${item.status}) ===\n`,
    );

    const contas = await listarContas(values.item);

    console.table(
      contas.map((c) => ({
        accountId: c.id,
        Tipo: c.type,
        Nome: c.name,
        Numero: c.number,
        Saldo: formatarBRL(Math.round(c.balance * 100)),
      })),
    );
    console.log('Use o accountId como "pluggyAccountId" em CONTAS_MAPEADAS.\n');

    // So conta corrente serve para conciliar extrato; cartao tem outra logica.
    const contaCorrente = contas.find((c) => c.type === 'BANK') ?? contas[0];
    accountId = accountId ?? contaCorrente?.id;
  }

  if (!accountId) {
    console.log('Nenhuma conta para consultar transacoes.');
    return;
  }

  const ate = hojeEmSaoPaulo();
  const de = somarDias(ate, -Number(values.dias));

  console.log(`=== Transacoes da conta ${accountId}: ${de} a ${ate} ===\n`);
  const transacoes = await listarTransacoes(accountId, de, ate);
  console.log(`Total: ${transacoes.length}\n`);

  if (transacoes.length === 0) {
    console.log('Sem transacoes no periodo. Aumente --dias e rode de novo.');
    return;
  }

  // Mostra o dado ja normalizado: e assim que o matcher vai enxergar.
  console.table(
    transacoes.slice(0, 10).map((t) => {
      const normalizado = normalizarTransacaoBanco(t);
      return {
        Data: normalizado?.data,
        Tipo: t.type,
        'Valor bruto': t.amount,
        'Normalizado': normalizado ? formatarBRL(normalizado.valorCentavos) : '—',
        Descricao: (normalizado?.descricao ?? '').slice(0, 35),
        Documento: normalizado?.documento ?? '—',
      };
    }),
  );

  console.log(
    '\nConfira a coluna "Normalizado": saida deve estar negativa e entrada positiva.\n',
  );
}

principal()
  .then(() => process.exit(0))
  .catch((erro: Error) => {
    console.error(`\nFalhou: ${erro.message}\n`);
    process.exit(1);
  });

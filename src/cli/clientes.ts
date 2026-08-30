import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import {
  buscarComCredenciais,
  buscarPorSlug,
  criarCliente,
  definirAtivo,
  listarClientes,
  listarContas,
  mapearConta,
} from '../clientes/repository.js';
import { encerrarPool } from '../db/pool.js';
import { listarContasCorrentes } from '../omie/financas.js';
import { listarContas as listarContasPluggy, obterItem } from '../pluggy/client.js';

/**
 * Gerencia os clientes do produto.
 *
 * As credenciais de Omie e Pluggy sao por cliente e vivem cifradas no banco,
 * entao precisam de um caminho para entrar la. Este CLI e esse caminho.
 *
 *   npm run clientes -- listar
 *   npm run clientes -- criar --slug acme --nome "Acme Ltda"
 *   npm run clientes -- contas --cliente acme --item <itemIdDoPluggy>
 *   npm run clientes -- mapear --cliente acme --conta <accountId> --omie <nCodCC> --apelido "Itau PJ"
 *   npm run clientes -- desativar --cliente acme
 */

/**
 * Uma unica interface de leitura para a sessao inteira.
 *
 * Abrir e fechar um readline por pergunta parece inofensivo, mas fechar o
 * primeiro encerra o proprio stdin: da segunda pergunta em diante o processo
 * trava esperando uma entrada que nunca chega.
 */
let leitor: ReturnType<typeof createInterface> | null = null;

function obterLeitor() {
  leitor ??= createInterface({ input: process.stdin, output: process.stdout });
  return leitor;
}

function fecharLeitor(): void {
  leitor?.close();
  leitor = null;
}

async function perguntar(rotulo: string, ocultar = false): Promise<string> {
  // Segredo digitado no terminal fica no historico do shell se vier por
  // argumento — por isso credencial e pedida aqui, nunca via --flag.
  const resposta = await obterLeitor().question(
    ocultar ? `${rotulo} (nao sera exibido): ` : `${rotulo}: `,
  );
  return resposta.trim();
}

async function exigirCliente(slug: string | undefined) {
  if (!slug) throw new Error('Informe --cliente <slug>.');
  const cliente = await buscarPorSlug(slug);
  if (!cliente) throw new Error(`Cliente "${slug}" nao encontrado.`);
  return cliente;
}

async function comandoListar(): Promise<void> {
  const clientes = await listarClientes();

  if (clientes.length === 0) {
    console.log('\nNenhum cliente cadastrado. Crie um com:');
    console.log('  npm run clientes -- criar --slug acme --nome "Acme Ltda"\n');
    return;
  }

  console.log('');
  console.table(
    await Promise.all(
      clientes.map(async (c) => ({
        Slug: c.slug,
        Nome: c.nome,
        Ativo: c.ativo ? 'sim' : 'nao',
        Contas: (await listarContas(c.id, false)).length,
        Desde: c.criadoEm.toISOString().slice(0, 10),
      })),
    ),
  );
  console.log('');
}

async function comandoCriar(slug?: string, nome?: string): Promise<void> {
  if (!slug || !nome) {
    throw new Error('Informe --slug e --nome. Ex: --slug acme --nome "Acme Ltda"');
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('O slug deve ter so letras minusculas, numeros e hifen.');
  }
  if (await buscarPorSlug(slug)) {
    throw new Error(`Ja existe um cliente com o slug "${slug}".`);
  }

  /**
   * Provisionamento automatizado (seed, script de deploy) le as credenciais do
   * ambiente. Nunca use isso num shell interativo: variavel de ambiente fica
   * no historico e e visivel na listagem de processos. No dia a dia, digite.
   */
  const doAmbiente = {
    appKey: process.env.NOVO_OMIE_APP_KEY,
    appSecret: process.env.NOVO_OMIE_APP_SECRET,
    clientId: process.env.NOVO_PLUGGY_CLIENT_ID,
    clientSecret: process.env.NOVO_PLUGGY_CLIENT_SECRET,
  };
  const naoInterativo = Object.values(doAmbiente).every(Boolean);

  let appKey: string;
  let appSecret: string;
  let clientId: string;
  let clientSecret: string;

  if (naoInterativo) {
    console.log(`\nCredenciais de "${nome}" lidas do ambiente.`);
    appKey = doAmbiente.appKey!;
    appSecret = doAmbiente.appSecret!;
    clientId = doAmbiente.clientId!;
    clientSecret = doAmbiente.clientSecret!;
  } else {
    console.log(`\nCredenciais de "${nome}". Elas serao cifradas antes de ir para o banco.\n`);
    console.log('--- Omie (app.omie.com.br > Configuracoes > APIs) ---');
    appKey = await perguntar('OMIE App Key');
    appSecret = await perguntar('OMIE App Secret', true);

    console.log('\n--- Pluggy (dashboard.pluggy.ai > Applications) ---');
    clientId = await perguntar('PLUGGY Client ID');
    clientSecret = await perguntar('PLUGGY Client Secret', true);
  }

  if (!appKey || !appSecret || !clientId || !clientSecret) {
    throw new Error('Todas as quatro credenciais sao obrigatorias.');
  }

  const cliente = await criarCliente({
    slug,
    nome,
    omie: { appKey, appSecret },
    pluggy: { clientId, clientSecret },
  });

  console.log(`\nCliente "${cliente.slug}" criado (id ${cliente.id}).`);
  console.log('Proximo passo — descobrir as contas:');
  console.log(`  npm run clientes -- contas --cliente ${cliente.slug} --item <itemIdDoPluggy>\n`);
}

/** Mostra os dois lados que precisam ser ligados: contas da Omie e do Pluggy. */
async function comandoContas(slug?: string, itemId?: string): Promise<void> {
  const resumo = await exigirCliente(slug);
  const cliente = (await buscarComCredenciais(resumo.id))!;

  console.log(`\n=== Contas correntes na Omie de "${cliente.nome}" ===\n`);
  const contasOmie = await listarContasCorrentes(cliente.omie);
  console.table(
    contasOmie.map((c) => ({
      'nCodCC (use em --omie)': c.nCodCC,
      Descricao: c.descricao,
      Banco: c.codigo_banco,
      Conta: c.conta_corrente,
    })),
  );

  if (!itemId) {
    console.log(
      'Para ver as contas do Pluggy, rode de novo com --item <itemId>.\n' +
        'O itemId vem do dashboard do Pluggy (Applications > Items) ou do Pluggy Connect.\n',
    );
    return;
  }

  const item = await obterItem(cliente.pluggy, itemId);
  console.log(
    `\n=== Contas no Pluggy — ${item.connector?.name ?? 'instituicao'} (${item.status}) ===\n`,
  );

  const contasPluggy = await listarContasPluggy(cliente.pluggy, itemId);
  console.table(
    contasPluggy.map((c) => ({
      'accountId (use em --conta)': c.id,
      Tipo: c.type,
      Nome: c.name,
      Numero: c.number,
    })),
  );

  console.log('Ligue as duas pontas com:');
  console.log(
    `  npm run clientes -- mapear --cliente ${cliente.slug} --conta <accountId> --omie <nCodCC> --apelido "Nome"\n`,
  );
}

async function comandoMapear(
  slug?: string,
  accountId?: string,
  nCodCC?: string,
  apelido?: string,
): Promise<void> {
  const cliente = await exigirCliente(slug);

  if (!accountId || !nCodCC) {
    throw new Error('Informe --conta <accountId do Pluggy> e --omie <nCodCC da Omie>.');
  }

  const codigo = Number(nCodCC);
  if (!Number.isInteger(codigo) || codigo <= 0) {
    throw new Error(`--omie deve ser o nCodCC numerico. Recebido: "${nCodCC}"`);
  }

  const conta = await mapearConta(cliente.id, {
    apelido: apelido ?? 'Conta principal',
    pluggyAccountId: accountId,
    omieCodigoContaCorrente: codigo,
  });

  console.log(
    `\nMapeado para "${cliente.slug}": ${conta.apelido} — Pluggy ${conta.pluggyAccountId} <-> Omie ${conta.omieCodigoContaCorrente}\n`,
  );
  console.log('Ja da para conciliar:');
  console.log(`  npm run conciliar -- --cliente ${cliente.slug} --de 2026-08-01 --ate 2026-08-30\n`);
}

async function principal(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      slug: { type: 'string' },
      nome: { type: 'string' },
      cliente: { type: 'string' },
      item: { type: 'string' },
      conta: { type: 'string' },
      omie: { type: 'string' },
      apelido: { type: 'string' },
    },
  });

  const comando = positionals[0];

  switch (comando) {
    case 'listar':
      return comandoListar();
    case 'criar':
      return comandoCriar(values.slug, values.nome);
    case 'contas':
      return comandoContas(values.cliente, values.item);
    case 'mapear':
      return comandoMapear(values.cliente, values.conta, values.omie, values.apelido);
    case 'desativar': {
      const cliente = await exigirCliente(values.cliente);
      await definirAtivo(cliente.id, false);
      console.log(`\nCliente "${cliente.slug}" desativado — sai do cron, historico preservado.\n`);
      return;
    }
    case 'ativar': {
      const cliente = await exigirCliente(values.cliente);
      await definirAtivo(cliente.id, true);
      console.log(`\nCliente "${cliente.slug}" reativado.\n`);
      return;
    }
    default:
      console.log(`
Comandos:
  listar                                        lista os clientes
  criar --slug <s> --nome "<n>"                 cria um cliente e pede as credenciais
  contas --cliente <s> [--item <itemId>]        mostra contas da Omie e do Pluggy
  mapear --cliente <s> --conta <accountId>
         --omie <nCodCC> [--apelido "<a>"]      liga uma conta do banco a uma da Omie
  ativar | desativar --cliente <s>              liga/desliga o cliente no cron
`);
  }
}

principal()
  .then(() => {
    fecharLeitor();
    return encerrarPool();
  })
  .then(() => process.exit(0))
  .catch(async (erro: Error) => {
    console.error(`\nFalhou: ${erro.message}\n`);
    fecharLeitor();
    await encerrarPool().catch(() => undefined);
    process.exit(1);
  });

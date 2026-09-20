import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import {
  buscarPorSlug,
  criarCliente,
  definirAtivo,
  listarClientes,
  registrarAceiteAdendo,
} from '../clientes/repository.js';
import { encerrarPool } from '../db/pool.js';

/**
 * Gerencia os clientes do produto.
 *
 * A credencial da Omie e por cliente e vive cifrada no banco, entao precisa de
 * um caminho para entrar la. Este CLI e esse caminho.
 *
 *   npm run clientes -- listar
 *   npm run clientes -- criar --slug acme --nome "Acme Ltda"
 *   npm run clientes -- aceite --cliente acme --versao v1
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
    clientes.map((c) => ({
      Slug: c.slug,
      Nome: c.nome,
      Ativo: c.ativo ? 'sim' : 'nao',
      Adendo: c.adendoLgpdAceitoEm ? c.adendoLgpdVersao : 'pendente',
      Desde: c.criadoEm.toISOString().slice(0, 10),
    })),
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
  };
  const naoInterativo = Object.values(doAmbiente).every(Boolean);

  let appKey: string;
  let appSecret: string;

  if (naoInterativo) {
    console.log(`\nCredenciais de "${nome}" lidas do ambiente.`);
    appKey = doAmbiente.appKey!;
    appSecret = doAmbiente.appSecret!;
  } else {
    console.log(`\nCredenciais de "${nome}". Elas serao cifradas antes de ir para o banco.\n`);
    console.log('--- Omie (app.omie.com.br > Configuracoes > APIs) ---');
    appKey = await perguntar('OMIE App Key');
    appSecret = await perguntar('OMIE App Secret', true);
  }

  if (!appKey || !appSecret) {
    throw new Error('App Key e App Secret da Omie sao obrigatorios.');
  }

  const cliente = await criarCliente({ slug, nome, omie: { appKey, appSecret } });

  console.log(`\nCliente "${cliente.slug}" criado (id ${cliente.id}) — INATIVO.`);
  console.log(
    'Nao processa dados enquanto o adendo LGPD de operador nao for registrado:',
  );
  console.log(`  npm run clientes -- aceite --cliente ${cliente.slug} --versao <versao assinada>\n`);
}

/** Registra o aceite do adendo LGPD e ativa o cliente para tratamento. */
async function comandoAceite(slug?: string, versao?: string): Promise<void> {
  const cliente = await exigirCliente(slug);

  if (!versao || !versao.trim()) {
    throw new Error(
      'Informe --versao <versao do adendo LGPD assinado>. Ex: --versao v1 ' +
        '(a data do aceite e gravada agora, automaticamente).',
    );
  }

  await registrarAceiteAdendo(cliente.id, versao);
  await definirAtivo(cliente.id, true);

  console.log(
    `\nAdendo LGPD "${versao.trim()}" registrado para "${cliente.slug}". ` +
      'Cliente ativado para tratamento.\n',
  );
}

async function principal(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      slug: { type: 'string' },
      nome: { type: 'string' },
      cliente: { type: 'string' },
      versao: { type: 'string' },
    },
  });

  const comando = positionals[0];

  switch (comando) {
    case 'listar':
      return comandoListar();
    case 'criar':
      return comandoCriar(values.slug, values.nome);
    case 'aceite':
      return comandoAceite(values.cliente, values.versao);
    case 'desativar': {
      const cliente = await exigirCliente(values.cliente);
      await definirAtivo(cliente.id, false);
      console.log(`\nCliente "${cliente.slug}" desativado — API para de servir os dados dele.\n`);
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
  criar --slug <s> --nome "<n>"                 cria um cliente (INATIVO) e pede a credencial Omie
  aceite --cliente <s> --versao <v>             registra o aceite do adendo LGPD e ativa o cliente
  ativar | desativar --cliente <s>              liga/desliga o cliente na API (ativar exige adendo)
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

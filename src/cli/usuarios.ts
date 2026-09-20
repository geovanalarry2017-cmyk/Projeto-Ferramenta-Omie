import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
  buscarPorId as buscarClientePorId,
  buscarPorSlug as buscarClientePorSlug,
  definirLimiteUsuarios,
} from '../clientes/repository.js';
import { encerrarPool } from '../db/pool.js';
import {
  buscarUsuarioPorEmail,
  contarUsuariosAtivos,
  criarUsuario,
  definirAtivoUsuario,
  listarUsuariosPorCliente,
} from '../usuarios/repository.js';

/**
 * Gerencia os usuarios (login do dashboard) de cada cliente.
 *
 * O limite de usuarios ativos e o que vira licenca por assento: um cliente
 * so pode ter tantos usuarios logando quanto o contrato prever.
 *
 *   npm run usuarios -- listar --cliente acme
 *   npm run usuarios -- criar --cliente acme --email ana@acme.com
 *   npm run usuarios -- limite --cliente acme --quantidade 5
 *   npm run usuarios -- ativar | desativar --email ana@acme.com
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
  const resposta = await obterLeitor().question(
    ocultar ? `${rotulo} (nao sera exibido): ` : `${rotulo}: `,
  );
  return resposta.trim();
}

async function exigirCliente(slug: string | undefined) {
  if (!slug) throw new Error('Informe --cliente <slug>.');
  const cliente = await buscarClientePorSlug(slug);
  if (!cliente) throw new Error(`Cliente "${slug}" nao encontrado.`);
  return cliente;
}

async function exigirUsuario(email: string | undefined) {
  if (!email) throw new Error('Informe --email <email>.');
  const usuario = await buscarUsuarioPorEmail(email);
  if (!usuario) throw new Error(`Usuario "${email}" nao encontrado.`);
  return usuario;
}

async function comandoListar(clienteSlug?: string): Promise<void> {
  const cliente = await exigirCliente(clienteSlug);
  const usuarios = await listarUsuariosPorCliente(cliente.id);

  console.log(`\nCliente "${cliente.slug}" — limite contratado: ${cliente.limiteUsuarios} usuario(s).`);
  if (usuarios.length === 0) {
    console.log('Nenhum usuario cadastrado. Crie um com:');
    console.log(`  npm run usuarios -- criar --cliente ${cliente.slug} --email pessoa@empresa.com\n`);
    return;
  }

  console.table(
    usuarios.map((u) => ({
      Email: u.email,
      Ativo: u.ativo ? 'sim' : 'nao',
      Desde: u.criadoEm.toISOString().slice(0, 10),
    })),
  );
  console.log('');
}

async function comandoCriar(clienteSlug?: string, email?: string): Promise<void> {
  const cliente = await exigirCliente(clienteSlug);
  if (!email) throw new Error('Informe --email <email>.');

  const ativos = await contarUsuariosAtivos(cliente.id);
  if (ativos >= cliente.limiteUsuarios) {
    throw new Error(
      `Cliente "${cliente.slug}" ja tem ${ativos} usuario(s) ativo(s), no limite contratado ` +
        `(${cliente.limiteUsuarios}). Aumente com: npm run usuarios -- limite --cliente ` +
        `${cliente.slug} --quantidade <n>`,
    );
  }

  if (await buscarUsuarioPorEmail(email)) {
    throw new Error(`Ja existe um usuario com o e-mail "${email}".`);
  }

  // Senha nunca por --flag: ficaria no historico do shell. Enter gera uma
  // aleatoria, impressa uma unica vez — igual ao fluxo de credencial da Omie.
  let senha = await perguntar('Senha inicial (Enter para gerar uma aleatoria)', true);
  const gerada = !senha;
  if (gerada) senha = randomBytes(9).toString('base64url');

  const usuario = await criarUsuario({ clienteId: cliente.id, email, senha });

  console.log(`\nUsuario "${usuario.email}" criado para "${cliente.slug}".`);
  if (gerada) {
    console.log(`Senha inicial gerada: ${senha}`);
    console.log('Anote agora — ela nao fica salva em texto puro e nao sera mostrada de novo.\n');
  } else {
    console.log('Senha definida pelo operador.\n');
  }
}

async function comandoLimite(clienteSlug?: string, quantidadeStr?: string): Promise<void> {
  const cliente = await exigirCliente(clienteSlug);
  const quantidade = Number(quantidadeStr);
  if (!quantidadeStr || !Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error('Informe --quantidade <n>, um inteiro maior ou igual a 1.');
  }

  await definirLimiteUsuarios(cliente.id, quantidade);
  console.log(`\nLimite de usuarios de "${cliente.slug}" definido para ${quantidade}.\n`);
}

async function principal(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      cliente: { type: 'string' },
      email: { type: 'string' },
      quantidade: { type: 'string' },
    },
  });

  const comando = positionals[0];

  switch (comando) {
    case 'listar':
      return comandoListar(values.cliente);
    case 'criar':
      return comandoCriar(values.cliente, values.email);
    case 'limite':
      return comandoLimite(values.cliente, values.quantidade);
    case 'desativar': {
      const usuario = await exigirUsuario(values.email);
      await definirAtivoUsuario(usuario.id, false);
      console.log(`\nUsuario "${usuario.email}" desativado — nao consegue mais logar.\n`);
      return;
    }
    case 'ativar': {
      const usuario = await exigirUsuario(values.email);
      const cliente = await buscarClientePorId(usuario.clienteId);
      const ativos = await contarUsuariosAtivos(usuario.clienteId);
      if (cliente && ativos >= cliente.limiteUsuarios) {
        throw new Error(
          `Cliente "${cliente.slug}" ja esta no limite de ${cliente.limiteUsuarios} usuario(s) ativo(s).`,
        );
      }
      await definirAtivoUsuario(usuario.id, true);
      console.log(`\nUsuario "${usuario.email}" reativado.\n`);
      return;
    }
    default:
      console.log(`
Comandos:
  listar --cliente <s>                          lista os usuarios do cliente
  criar --cliente <s> --email <e>                cria um usuario (pede a senha, ou gera uma)
  limite --cliente <s> --quantidade <n>          define quantos usuarios ativos o cliente pode ter
  ativar | desativar --email <e>                 liga/desliga o login desse usuario
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

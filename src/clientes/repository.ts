import { env } from '../config/env.js';
import { adendoLgpdPendente, motivoAdendoPendente } from '../lib/adendo.js';
import { cifrar, decifrar, derivarChave } from '../lib/cripto.js';
import { pool } from '../db/pool.js';
import type { ClienteComCredenciais, ClienteResumo, NovoCliente } from './types.js';

/**
 * Acesso aos clientes e suas credenciais.
 *
 * Regra da casa: nenhuma funcao daqui devolve credencial sem que quem chamou
 * peca explicitamente por ela (`buscarComCredenciais`). Listagem e consulta
 * comum devolvem `ClienteResumo`, que nao tem segredo dentro — assim credencial
 * nao vaza por acidente para log, resposta HTTP ou mensagem de erro.
 */

// Derivada uma vez: derivar por chamada seria desperdicio, e a chave nao muda
// durante a vida do processo.
const chave = derivarChave(env.CREDENCIAIS_CHAVE);

interface LinhaCliente {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  criado_em: Date;
  adendo_lgpd_versao: string | null;
  adendo_lgpd_aceito_em: Date | null;
  limite_usuarios: number;
  omie_app_key_cif: string;
  omie_app_secret_cif: string;
}

function paraResumo(linha: LinhaCliente): ClienteResumo {
  return {
    id: Number(linha.id),
    slug: linha.slug,
    nome: linha.nome,
    ativo: linha.ativo,
    criadoEm: linha.criado_em,
    adendoLgpdVersao: linha.adendo_lgpd_versao,
    adendoLgpdAceitoEm: linha.adendo_lgpd_aceito_em,
    limiteUsuarios: Number(linha.limite_usuarios),
  };
}

export async function criarCliente(novo: NovoCliente): Promise<ClienteResumo> {
  // Nasce inativo: so entra em tratamento depois que o aceite do adendo LGPD
  // for registrado (registrarAceiteAdendo -> definirAtivo).
  const { rows } = await pool.query<LinhaCliente>(
    `INSERT INTO cliente (slug, nome, ativo, omie_app_key_cif, omie_app_secret_cif)
     VALUES ($1, $2, false, $3, $4)
     RETURNING *`,
    [novo.slug, novo.nome, cifrar(novo.omie.appKey, chave), cifrar(novo.omie.appSecret, chave)],
  );

  return paraResumo(rows[0]!);
}

export async function listarClientes(apenasAtivos = false): Promise<ClienteResumo[]> {
  const { rows } = await pool.query<LinhaCliente>(
    `SELECT * FROM cliente
      WHERE ($1::boolean IS NOT TRUE OR ativo = true)
      ORDER BY nome`,
    [apenasAtivos],
  );
  return rows.map(paraResumo);
}

export async function buscarPorSlug(slug: string): Promise<ClienteResumo | null> {
  const { rows } = await pool.query<LinhaCliente>('SELECT * FROM cliente WHERE slug = $1', [slug]);
  return rows[0] ? paraResumo(rows[0]) : null;
}

export async function buscarPorId(clienteId: number): Promise<ClienteResumo | null> {
  const { rows } = await pool.query<LinhaCliente>('SELECT * FROM cliente WHERE id = $1', [
    clienteId,
  ]);
  return rows[0] ? paraResumo(rows[0]) : null;
}

/** Teto de usuarios (login) ativos que o contrato deste cliente permite. */
export async function definirLimiteUsuarios(clienteId: number, limite: number): Promise<void> {
  if (!Number.isInteger(limite) || limite < 1) {
    throw new Error('O limite de usuarios precisa ser um inteiro maior ou igual a 1.');
  }
  const { rowCount } = await pool.query(
    'UPDATE cliente SET limite_usuarios = $2, atualizado_em = now() WHERE id = $1',
    [clienteId, limite],
  );
  if (rowCount === 0) throw new Error(`Cliente ${clienteId} nao encontrado.`);
}

/**
 * Cliente com credenciais decifradas, pronto para chamar a Omie.
 * Use so no momento de chamar a API externa, e nao guarde o resultado.
 */
export async function buscarComCredenciais(
  clienteId: number,
): Promise<ClienteComCredenciais | null> {
  const { rows } = await pool.query<LinhaCliente>('SELECT * FROM cliente WHERE id = $1', [
    clienteId,
  ]);

  const linha = rows[0];
  if (!linha) return null;

  return {
    ...paraResumo(linha),
    omie: {
      appKey: decifrar(linha.omie_app_key_cif, chave),
      appSecret: decifrar(linha.omie_app_secret_cif, chave),
    },
  };
}

export async function atualizarCredenciais(
  clienteId: number,
  omie: { appKey: string; appSecret: string },
): Promise<void> {
  await pool.query(
    `UPDATE cliente
        SET omie_app_key_cif    = $2,
            omie_app_secret_cif = $3,
            atualizado_em       = now()
      WHERE id = $1`,
    [clienteId, cifrar(omie.appKey, chave), cifrar(omie.appSecret, chave)],
  );
}

/**
 * Registra o aceite do adendo LGPD de operador no cadastro do cliente.
 *
 * Nao e consentimento de titular: e o aceite contratual do controlador,
 * versionado. A data e gravada agora (`now()`), nunca vem de fora — o que o
 * chamador informa e so a versao do documento assinado.
 */
export async function registrarAceiteAdendo(clienteId: number, versao: string): Promise<void> {
  const limpa = versao.trim();
  if (!limpa) throw new Error('Informe a versao do adendo LGPD assinado (ex: v1).');

  const { rowCount } = await pool.query(
    `UPDATE cliente
        SET adendo_lgpd_versao    = $2,
            adendo_lgpd_aceito_em = now(),
            atualizado_em         = now()
      WHERE id = $1`,
    [clienteId, limpa],
  );
  if (rowCount === 0) throw new Error(`Cliente ${clienteId} nao encontrado.`);
}

export async function definirAtivo(clienteId: number, ativo: boolean): Promise<void> {
  // Ativar e o gatilho do tratamento: sem o adendo LGPD registrado, nao passa.
  if (ativo) {
    const { rows } = await pool.query<
      Pick<LinhaCliente, 'slug' | 'adendo_lgpd_versao' | 'adendo_lgpd_aceito_em'>
    >(
      'SELECT slug, adendo_lgpd_versao, adendo_lgpd_aceito_em FROM cliente WHERE id = $1',
      [clienteId],
    );
    const linha = rows[0];
    if (!linha) throw new Error(`Cliente ${clienteId} nao encontrado.`);
    if (
      adendoLgpdPendente({
        versao: linha.adendo_lgpd_versao,
        aceitoEm: linha.adendo_lgpd_aceito_em,
      })
    ) {
      throw new Error(motivoAdendoPendente(linha.slug));
    }
  }

  await pool.query('UPDATE cliente SET ativo = $2, atualizado_em = now() WHERE id = $1', [
    clienteId,
    ativo,
  ]);
}

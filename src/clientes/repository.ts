import { env } from '../config/env.js';
import { adendoLgpdPendente, motivoAdendoPendente } from '../lib/adendo.js';
import { cifrar, decifrar, derivarChave } from '../lib/cripto.js';
import { pool } from '../db/pool.js';
import type {
  ClienteComCredenciais,
  ClienteResumo,
  ContaDoCliente,
  NovoCliente,
} from './types.js';

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
  omie_app_key_cif: string;
  omie_app_secret_cif: string;
  pluggy_client_id_cif: string;
  pluggy_client_secret_cif: string;
}

interface LinhaConta {
  id: string;
  apelido: string;
  pluggy_account_id: string;
  omie_codigo_conta_corrente: string;
  ativo: boolean;
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
  };
}

function paraConta(linha: LinhaConta): ContaDoCliente {
  return {
    id: Number(linha.id),
    apelido: linha.apelido,
    pluggyAccountId: linha.pluggy_account_id,
    omieCodigoContaCorrente: Number(linha.omie_codigo_conta_corrente),
    ativo: linha.ativo,
  };
}

export async function criarCliente(novo: NovoCliente): Promise<ClienteResumo> {
  // Nasce inativo: so entra em tratamento depois que o aceite do adendo LGPD
  // for registrado (registrarAceiteAdendo -> definirAtivo).
  const { rows } = await pool.query<LinhaCliente>(
    `INSERT INTO cliente (slug, nome, ativo, omie_app_key_cif, omie_app_secret_cif,
                          pluggy_client_id_cif, pluggy_client_secret_cif)
     VALUES ($1, $2, false, $3, $4, $5, $6)
     RETURNING *`,
    [
      novo.slug,
      novo.nome,
      cifrar(novo.omie.appKey, chave),
      cifrar(novo.omie.appSecret, chave),
      cifrar(novo.pluggy.clientId, chave),
      cifrar(novo.pluggy.clientSecret, chave),
    ],
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

/**
 * Cliente com credenciais decifradas e contas mapeadas.
 * Use so no momento de chamar as APIs externas, e nao guarde o resultado.
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
    pluggy: {
      clientId: decifrar(linha.pluggy_client_id_cif, chave),
      clientSecret: decifrar(linha.pluggy_client_secret_cif, chave),
    },
    contas: await listarContas(clienteId),
  };
}

export async function listarContas(
  clienteId: number,
  apenasAtivas = true,
): Promise<ContaDoCliente[]> {
  const { rows } = await pool.query<LinhaConta>(
    `SELECT * FROM cliente_conta
      WHERE cliente_id = $1
        AND ($2::boolean IS NOT TRUE OR ativo = true)
      ORDER BY apelido`,
    [clienteId, apenasAtivas],
  );
  return rows.map(paraConta);
}

export async function mapearConta(
  clienteId: number,
  conta: Omit<ContaDoCliente, 'id' | 'ativo'>,
): Promise<ContaDoCliente> {
  const { rows } = await pool.query<LinhaConta>(
    `INSERT INTO cliente_conta (cliente_id, apelido, pluggy_account_id, omie_codigo_conta_corrente)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cliente_id, pluggy_account_id) DO UPDATE
       SET apelido = EXCLUDED.apelido,
           omie_codigo_conta_corrente = EXCLUDED.omie_codigo_conta_corrente,
           ativo = true
     RETURNING *`,
    [clienteId, conta.apelido, conta.pluggyAccountId, conta.omieCodigoContaCorrente],
  );

  return paraConta(rows[0]!);
}

export async function atualizarCredenciais(
  clienteId: number,
  omie?: { appKey: string; appSecret: string },
  pluggy?: { clientId: string; clientSecret: string },
): Promise<void> {
  await pool.query(
    `UPDATE cliente
        SET omie_app_key_cif         = COALESCE($2, omie_app_key_cif),
            omie_app_secret_cif      = COALESCE($3, omie_app_secret_cif),
            pluggy_client_id_cif     = COALESCE($4, pluggy_client_id_cif),
            pluggy_client_secret_cif = COALESCE($5, pluggy_client_secret_cif),
            atualizado_em            = now()
      WHERE id = $1`,
    [
      clienteId,
      omie ? cifrar(omie.appKey, chave) : null,
      omie ? cifrar(omie.appSecret, chave) : null,
      pluggy ? cifrar(pluggy.clientId, chave) : null,
      pluggy ? cifrar(pluggy.clientSecret, chave) : null,
    ],
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

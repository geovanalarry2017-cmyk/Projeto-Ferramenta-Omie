import { hashSenha } from '../lib/senha.js';
import { pool } from '../db/pool.js';
import type { NovoUsuario, UsuarioComHash, UsuarioResumo } from './types.js';

/**
 * Acesso aos usuarios (login do dashboard) e ao limite de assentos do
 * cliente. Mesma regra do `clientes/repository.ts`: funcao nenhuma devolve
 * hash de senha a quem nao pediu explicitamente (`buscarPorEmailComHash`).
 */

interface LinhaUsuario {
  id: string;
  cliente_id: string;
  email: string;
  senha_hash: string;
  ativo: boolean;
  criado_em: Date;
}

function paraResumo(linha: LinhaUsuario): UsuarioResumo {
  return {
    id: Number(linha.id),
    clienteId: Number(linha.cliente_id),
    email: linha.email,
    ativo: linha.ativo,
    criadoEm: linha.criado_em,
  };
}

/** Quantos usuarios ATIVOS o cliente ja tem — e contra isso que o limite de assentos e conferido. */
export async function contarUsuariosAtivos(clienteId: number): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM usuario WHERE cliente_id = $1 AND ativo = true',
    [clienteId],
  );
  return Number(rows[0]!.total);
}

export async function criarUsuario(novo: NovoUsuario): Promise<UsuarioResumo> {
  const email = novo.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`E-mail invalido: "${novo.email}".`);
  }

  const senhaHash = await hashSenha(novo.senha);

  const { rows } = await pool.query<LinhaUsuario>(
    `INSERT INTO usuario (cliente_id, email, senha_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [novo.clienteId, email, senhaHash],
  );

  return paraResumo(rows[0]!);
}

export async function listarUsuariosPorCliente(clienteId: number): Promise<UsuarioResumo[]> {
  const { rows } = await pool.query<LinhaUsuario>(
    'SELECT * FROM usuario WHERE cliente_id = $1 ORDER BY email',
    [clienteId],
  );
  return rows.map(paraResumo);
}

/**
 * Usuario com o hash da senha, para o login conferir.
 * Devolve so por e-mail (chave de login) — nunca por id, que nao e o que o
 * formulario de login tem em maos.
 */
export async function buscarPorEmailComHash(email: string): Promise<UsuarioComHash | null> {
  const { rows } = await pool.query<LinhaUsuario>(
    'SELECT * FROM usuario WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  const linha = rows[0];
  if (!linha) return null;
  return { ...paraResumo(linha), senhaHash: linha.senha_hash };
}

/** Igual a `buscarPorEmailComHash`, mas sem o hash — para uso fora do login (CLI, listagem). */
export async function buscarUsuarioPorEmail(email: string): Promise<UsuarioResumo | null> {
  const usuario = await buscarPorEmailComHash(email);
  if (!usuario) return null;
  const { senhaHash: _senhaHash, ...resumo } = usuario;
  return resumo;
}

export async function buscarUsuarioPorId(id: number): Promise<UsuarioResumo | null> {
  const { rows } = await pool.query<LinhaUsuario>('SELECT * FROM usuario WHERE id = $1', [id]);
  return rows[0] ? paraResumo(rows[0]) : null;
}

export async function definirAtivoUsuario(id: number, ativo: boolean): Promise<void> {
  const { rowCount } = await pool.query(
    'UPDATE usuario SET ativo = $2, atualizado_em = now() WHERE id = $1',
    [id, ativo],
  );
  if (rowCount === 0) throw new Error(`Usuario ${id} nao encontrado.`);
}

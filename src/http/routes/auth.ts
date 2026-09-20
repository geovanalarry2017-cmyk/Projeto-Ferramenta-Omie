import { Router, type Request, type Response } from 'express';
import { buscarPorId as buscarClientePorId } from '../../clientes/repository.js';
import { env } from '../../config/env.js';
import { verificarSenha } from '../../lib/senha.js';
import { criarTokenSessao } from '../../lib/sessao.js';
import { buscarPorEmailComHash } from '../../usuarios/repository.js';
import { definirCookieSessao, limparCookieSessao } from '../cookies.js';

export const rotasAuth = Router();

const DURACAO_SESSAO_SEGUNDOS = 7 * 24 * 60 * 60;

/**
 * Hash de formato valido que nunca bate com senha nenhuma. Comparar contra
 * ele quando o e-mail nao existe faz o login pagar o mesmo custo de scrypt
 * dos dois jeitos — senao, "e-mail nao existe" responde bem mais rapido que
 * "e-mail existe, senha errada", e da para descobrir e-mail cadastrado so
 * pelo tempo de resposta.
 */
const HASH_FANTASMA = `${Buffer.alloc(16).toString('base64')}.${Buffer.alloc(64).toString('base64')}`;

/**
 * Bloqueio simples de forca bruta: N tentativas erradas por e-mail bloqueiam
 * por um tempo. Fica em memoria do processo — reseta a cada deploy ou ao
 * acordar do sono do plano Free. Aceitavel para o volume deste produto; nao
 * ha estado compartilhado entre instancias hoje.
 */
const LIMITE_TENTATIVAS = 5;
const JANELA_BLOQUEIO_MS = 15 * 60 * 1000;
const tentativas = new Map<string, { falhas: number; bloqueadoAte: number }>();

function bloqueado(email: string): boolean {
  const registro = tentativas.get(email);
  return !!registro && registro.bloqueadoAte > Date.now();
}

function registrarFalha(email: string): void {
  const registro = tentativas.get(email) ?? { falhas: 0, bloqueadoAte: 0 };
  registro.falhas += 1;
  if (registro.falhas >= LIMITE_TENTATIVAS) {
    registro.bloqueadoAte = Date.now() + JANELA_BLOQUEIO_MS;
    registro.falhas = 0;
  }
  tentativas.set(email, registro);
}

function limparFalhas(email: string): void {
  tentativas.delete(email);
}

rotasAuth.post('/login', async (req: Request, res: Response): Promise<void> => {
  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';

  if (!email || !senha) {
    res.status(400).json({ erro: 'Informe e-mail e senha.' });
    return;
  }

  if (bloqueado(email)) {
    res.status(429).json({
      erro: 'Muitas tentativas com este e-mail. Aguarde alguns minutos e tente de novo.',
    });
    return;
  }

  const usuario = await buscarPorEmailComHash(email);
  const senhaCorreta = await verificarSenha(senha, usuario?.senhaHash ?? HASH_FANTASMA);

  if (!usuario || !usuario.ativo || !senhaCorreta) {
    registrarFalha(email);
    res.status(401).json({ erro: 'E-mail ou senha invalidos.' });
    return;
  }

  limparFalhas(email);

  const token = criarTokenSessao(
    { usuarioId: usuario.id, clienteId: usuario.clienteId },
    env.SESSAO_CHAVE,
    DURACAO_SESSAO_SEGUNDOS,
  );
  definirCookieSessao(res, token, DURACAO_SESSAO_SEGUNDOS);

  const cliente = await buscarClientePorId(usuario.clienteId);
  res.json({
    email: usuario.email,
    cliente: cliente ? { slug: cliente.slug, nome: cliente.nome } : null,
  });
});

rotasAuth.post('/logout', (_req: Request, res: Response): void => {
  limparCookieSessao(res);
  res.json({ mensagem: 'Sessao encerrada.' });
});

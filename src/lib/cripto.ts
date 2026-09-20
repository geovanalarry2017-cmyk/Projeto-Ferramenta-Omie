import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cifragem das credenciais de cliente guardadas no banco.
 *
 * Guardar App Secret da Omie em texto puro significaria que qualquer dump do
 * banco — backup, log de query, acesso de leitura ao Neon — entrega acesso
 * total ao ERP de TODOS os clientes de uma vez. A chave mora fora do banco, no
 * ambiente.
 *
 * AES-256-GCM: alem de cifrar, autentica. Se o texto cifrado for adulterado,
 * a decifragem falha em vez de devolver lixo silenciosamente.
 */

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12; // 96 bits, o recomendado para GCM
const TAMANHO_TAG = 16;

/**
 * Deriva a chave de 32 bytes a partir da variavel de ambiente.
 * Aceita hex (64 chars) ou base64, que e o que `openssl rand` costuma cuspir.
 */
export function derivarChave(valor: string): Buffer {
  const limpo = valor.trim();

  if (/^[0-9a-f]{64}$/i.test(limpo)) return Buffer.from(limpo, 'hex');

  const daBase64 = Buffer.from(limpo, 'base64');
  if (daBase64.length === 32) return daBase64;

  throw new Error(
    'CREDENCIAIS_CHAVE precisa ter 32 bytes (64 caracteres hex, ou base64 equivalente). ' +
      'Gere uma com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
}

/** Formato do resultado: base64(iv) . base64(tag) . base64(cifrado), separados por ponto. */
export function cifrar(textoPuro: string, chave: Buffer): string {
  const iv = randomBytes(TAMANHO_IV);
  const cifrador = createCipheriv(ALGORITMO, chave, iv);

  const cifrado = Buffer.concat([cifrador.update(textoPuro, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();

  return [iv.toString('base64'), tag.toString('base64'), cifrado.toString('base64')].join('.');
}

export function decifrar(empacotado: string, chave: Buffer): string {
  const partes = empacotado.split('.');
  if (partes.length !== 3) {
    throw new Error('Credencial cifrada em formato invalido.');
  }

  const [ivB64, tagB64, cifradoB64] = partes as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');

  if (iv.length !== TAMANHO_IV || tag.length !== TAMANHO_TAG) {
    throw new Error('Credencial cifrada em formato invalido.');
  }

  const decifrador = createDecipheriv(ALGORITMO, chave, iv);
  decifrador.setAuthTag(tag);

  try {
    return Buffer.concat([
      decifrador.update(Buffer.from(cifradoB64, 'base64')),
      decifrador.final(),
    ]).toString('utf8');
  } catch {
    // Chave errada ou dado adulterado — a mensagem original do OpenSSL nao
    // ajuda e pode vazar detalhe interno.
    throw new Error(
      'Nao foi possivel decifrar a credencial. A CREDENCIAIS_CHAVE mudou, ou o dado foi corrompido.',
    );
  }
}

/**
 * Comparacao de token em tempo constante.
 * `===` em string vaza, pelo tempo de resposta, quantos caracteres iniciais
 * bateram — o que permite descobrir um token byte a byte.
 */
export function compararSegredos(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

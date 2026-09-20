/**
 * Regra do adendo LGPD de operador.
 *
 * O produto trata dados pessoais em nome de cada cliente (o controlador). Sem o
 * adendo de tratamento assinado (art. 39), nao ha instrucao de tratamento
 * documentada, e o cliente nao pode ser ativado nem ter dados processados.
 *
 * Este modulo e a unica fonte dessa decisao — repositorio e middleware HTTP
 * chamam daqui. Puro: nao faz I/O, so decide a partir do que ja foi lido do
 * banco.
 */

export interface EstadoAdendoLgpd {
  /** Versao do adendo assinado, ou null se ainda nao registrado. */
  versao: string | null;
  /** Quando o aceite foi registrado, ou null se pendente. */
  aceitoEm: Date | null;
}

/** true quando falta registrar o aceite do adendo. */
export function adendoLgpdPendente(estado: EstadoAdendoLgpd): boolean {
  return (
    estado.aceitoEm === null ||
    estado.versao === null ||
    estado.versao.trim() === ''
  );
}

/** Mensagem unica para todo lugar que barra a operacao por adendo pendente. */
export function motivoAdendoPendente(slug: string): string {
  return (
    `Cliente "${slug}": adendo LGPD de operador nao registrado. ` +
    `Enquanto isso, o cliente nao e ativado nem tem dados processados. ` +
    `Registre o aceite com: npm run clientes -- aceite --cliente ${slug} ` +
    `--versao <versao do adendo assinado>`
  );
}

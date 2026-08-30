import { env } from '../config/env.js';
import { ErroHttp, requisitar } from '../lib/http.js';
import { logger } from '../lib/logger.js';

/**
 * Cliente da API da Omie.
 *
 * Toda a API e um unico formato: POST no endpoint do recurso, com o metodo
 * indo no corpo em `call`. Nao ha REST aqui — nao existe GET, e o "endpoint"
 * sozinho nao diz o que sera feito.
 *
 *   POST https://app.omie.com.br/api/v1/financas/extrato/
 *   { "call": "ListarExtrato", "app_key": "...", "app_secret": "...", "param": [ {...} ] }
 *
 * Erro nao vem com status 4xx semantico: vem 500 com { faultstring, faultcode }.
 */

export class ErroOmie extends Error {
  constructor(
    message: string,
    readonly faultcode: string | undefined,
    readonly recurso: string,
    readonly metodo: string,
  ) {
    super(message);
    this.name = 'ErroOmie';
  }
}

interface RespostaDeFalha {
  faultstring?: string;
  faultcode?: string;
}

/**
 * A Omie limita a taxa de chamadas por app. Estourar o limite devolve falha
 * com faultstring de consumo indevido, entao serializamos as chamadas e
 * deixamos um respiro entre elas em vez de disparar tudo em paralelo.
 */
const INTERVALO_MINIMO_MS = 250;
let filaDeChamadas: Promise<unknown> = Promise.resolve();
let ultimaChamadaEm = 0;

function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = filaDeChamadas.then(async () => {
    const desdeUltima = Date.now() - ultimaChamadaEm;
    if (desdeUltima < INTERVALO_MINIMO_MS) {
      await new Promise((r) => setTimeout(r, INTERVALO_MINIMO_MS - desdeUltima));
    }
    ultimaChamadaEm = Date.now();
    return tarefa();
  });

  // A fila nao pode quebrar quando uma chamada falha.
  filaDeChamadas = resultado.catch(() => undefined);
  return resultado;
}

function ehFalhaDeConsumo(corpo: string): boolean {
  return /consumo|excedid|limite|bloqueado temporariamente/i.test(corpo);
}

/**
 * Executa um metodo da Omie.
 *
 * @param recurso caminho depois de /api/v1, ex: "financas/extrato"
 * @param metodo  valor do campo `call`, ex: "ListarExtrato"
 * @param param   objeto de parametros (a Omie sempre espera dentro de um array)
 */
export async function chamarOmie<TResposta, TParam extends object = object>(
  recurso: string,
  metodo: string,
  param: TParam,
): Promise<TResposta> {
  const url = `${env.OMIE_BASE_URL}/${recurso}/`;

  const corpoRequisicao = JSON.stringify({
    call: metodo,
    app_key: env.OMIE_APP_KEY,
    app_secret: env.OMIE_APP_SECRET,
    param: [param],
  });

  return enfileirar(async () => {
    logger.debug({ recurso, metodo, param }, 'chamando Omie');

    let resposta: { status: number; corpo: string };
    try {
      resposta = await requisitar(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: corpoRequisicao,
        },
        {
          timeoutMs: 60_000,
          tentativas: 4,
          // Falha de limite de consumo vem como 5xx: vale esperar e repetir.
          ehRetentavel: (status, corpo) =>
            status === 429 || (status >= 500 && ehFalhaDeConsumo(corpo)) || status >= 502,
        },
      );
    } catch (erro) {
      if (erro instanceof ErroHttp) {
        const falha = interpretarFalha(erro.corpo);
        throw new ErroOmie(
          falha?.faultstring ?? `Omie respondeu HTTP ${erro.status} em ${metodo}`,
          falha?.faultcode,
          recurso,
          metodo,
        );
      }
      throw erro;
    }

    const dados = JSON.parse(resposta.corpo) as TResposta & RespostaDeFalha;

    // A Omie tambem devolve faultstring com HTTP 200 em alguns casos.
    if (dados && typeof dados === 'object' && 'faultstring' in dados && dados.faultstring) {
      throw new ErroOmie(dados.faultstring, dados.faultcode, recurso, metodo);
    }

    return dados as TResposta;
  });
}

function interpretarFalha(corpo: string): RespostaDeFalha | null {
  try {
    const json = JSON.parse(corpo) as RespostaDeFalha;
    return json?.faultstring ? json : null;
  } catch {
    return null;
  }
}

/**
 * "Nao existem registros" nao e erro: e uma resposta legitima para um dia sem
 * movimento. A Omie sinaliza isso via faultstring, entao precisa ser detectado
 * pelo texto e tratado como lista vazia.
 */
export function ehRespostaVazia(erro: unknown): boolean {
  if (!(erro instanceof ErroOmie)) return false;
  return /nao (existem|foram encontrados|ha) registros|nenhum registro/i.test(erro.message);
}

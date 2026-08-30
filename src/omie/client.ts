import { env } from '../config/env.js';
import { ErroHttp, requisitar } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import {
  ehFalhaDeConsumo,
  ehMensagemDeListaVazia,
  esperaPorConsumoRedundante,
} from './faults.js';

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

  const TENTATIVAS = 4;

  return enfileirar(async () => {
    logger.debug({ recurso, metodo, param }, 'chamando Omie');

    for (let tentativa = 1; ; tentativa += 1) {
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
            tentativas: 3,
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

      // A Omie devolve erro com HTTP 200 + faultstring, entao a retentativa
      // precisa acontecer aqui e nao no nivel do HTTP.
      if (dados && typeof dados === 'object' && 'faultstring' in dados && dados.faultstring) {
        const espera = esperaPorConsumoRedundante(dados.faultstring);

        if (espera !== null && tentativa < TENTATIVAS) {
          logger.warn(
            { recurso, metodo, tentativa, esperaSegundos: espera },
            'consumo redundante na Omie, aguardando a janela liberar',
          );
          await new Promise((r) => setTimeout(r, espera * 1000));
          continue;
        }

        throw new ErroOmie(dados.faultstring, dados.faultcode, recurso, metodo);
      }

      return dados as TResposta;
    }
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

/** Lista vazia chega como erro pela API; aqui vira "sem registros" de novo. */
export function ehRespostaVazia(erro: unknown): boolean {
  return erro instanceof ErroOmie && ehMensagemDeListaVazia(erro.message);
}

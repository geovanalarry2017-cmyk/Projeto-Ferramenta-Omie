import type { CredenciaisOmie } from '../clientes/types.js';
import { env } from '../config/env.js';
import { ErroHttp, requisitar } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import {
  ehFalhaDeConsumo,
  ehMensagemDeListaVazia,
  esperaPorBloqueioTemporario,
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
 * A Omie limita a taxa de chamadas POR APP KEY. Com varios clientes, cada um
 * tem a sua chave e o seu limite proprio — uma fila global faria o cliente A
 * esperar o cliente B sem necessidade, e o job diario percorre todos.
 *
 * Por isso a fila e por app key, e nao uma so para o processo inteiro.
 */
const INTERVALO_MINIMO_MS = 250;

interface FilaDaChave {
  fila: Promise<unknown>;
  ultimaChamadaEm: number;
}

const filasPorChave = new Map<string, FilaDaChave>();

function enfileirar<T>(appKey: string, tarefa: () => Promise<T>): Promise<T> {
  const estado = filasPorChave.get(appKey) ?? { fila: Promise.resolve(), ultimaChamadaEm: 0 };

  const resultado = estado.fila.then(async () => {
    const desdeUltima = Date.now() - estado.ultimaChamadaEm;
    if (desdeUltima < INTERVALO_MINIMO_MS) {
      await new Promise((r) => setTimeout(r, INTERVALO_MINIMO_MS - desdeUltima));
    }
    estado.ultimaChamadaEm = Date.now();
    return tarefa();
  });

  // A fila nao pode quebrar quando uma chamada falha.
  estado.fila = resultado.catch(() => undefined);
  filasPorChave.set(appKey, estado);

  return resultado;
}


/**
 * Executa um metodo da Omie em nome de um cliente.
 *
 * As credenciais vem por parametro, nunca do ambiente: cada cliente do produto
 * tem a sua conta Omie.
 *
 * @param credenciais App Key/Secret do cliente
 * @param recurso     caminho depois de /api/v1, ex: "financas/extrato"
 * @param metodo      valor do campo `call`, ex: "ListarExtrato"
 * @param param       objeto de parametros (a Omie sempre espera dentro de um array)
 */
export async function chamarOmie<TResposta, TParam extends object = object>(
  credenciais: CredenciaisOmie,
  recurso: string,
  metodo: string,
  param: TParam,
): Promise<TResposta> {
  const url = `${env.OMIE_BASE_URL}/${recurso}/`;

  const corpoRequisicao = JSON.stringify({
    call: metodo,
    app_key: credenciais.appKey,
    app_secret: credenciais.appSecret,
    param: [param],
  });

  const TENTATIVAS = 4;

  return enfileirar(credenciais.appKey, async () => {
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
            // Bloqueio temporario fica de FORA da retentativa do nivel HTTP: o
            // backoff generico dela (1s, 2s, 4s) e curto demais para a janela
            // que a Omie pede (dezenas de segundos), e so gastaria as
            // tentativas antes de o tratamento correto entrar em acao.
            ehRetentavel: (status, corpo) =>
              esperaPorBloqueioTemporario(corpo) === null &&
              (status === 429 || (status >= 500 && ehFalhaDeConsumo(corpo)) || status >= 502),
          },
        );
      } catch (erro) {
        if (erro instanceof ErroHttp) {
          const falha = interpretarFalha(erro.corpo);
          const mensagem =
            falha?.faultstring ?? `Omie respondeu HTTP ${erro.status} em ${metodo}`;

          // O mesmo bloqueio chega ora como HTTP 200 com faultstring, ora como
          // HTTP 500. Tratar so um dos caminhos deixa o outro passar direto —
          // foi o que aconteceu na primeira versao.
          const espera = esperaPorBloqueioTemporario(erro.corpo);
          if (espera !== null && tentativa < TENTATIVAS) {
            logger.warn(
              { recurso, metodo, tentativa, esperaSegundos: espera, status: erro.status, motivo: mensagem },
              'bloqueio temporario na Omie, aguardando liberar',
            );
            await new Promise((r) => setTimeout(r, espera * 1000));
            continue;
          }

          throw new ErroOmie(mensagem, falha?.faultcode, recurso, metodo);
        }
        throw erro;
      }

      const dados = JSON.parse(resposta.corpo) as TResposta & RespostaDeFalha;

      // A Omie devolve erro com HTTP 200 + faultstring, entao a retentativa
      // precisa acontecer aqui e nao no nivel do HTTP.
      if (dados && typeof dados === 'object' && 'faultstring' in dados && dados.faultstring) {
        const espera = esperaPorBloqueioTemporario(dados.faultstring);

        if (espera !== null && tentativa < TENTATIVAS) {
          logger.warn(
            { recurso, metodo, tentativa, esperaSegundos: espera, motivo: dados.faultstring },
            'bloqueio temporario na Omie, aguardando liberar',
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

import type { CredenciaisOmie } from '../clientes/types.js';
import { paraFormatoOmie, type DataISO } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { chamarOmie, ehRespostaVazia } from './client.js';
import type {
  ContaCorrente,
  ListarContasCorrentesRequest,
  ListarContasCorrentesResponse,
  ListarContasPagarResponse,
  ListarContasReceberResponse,
  ListarExtratoRequest,
  ListarExtratoResponse,
  ListarTitulosRequest,
  MovimentoExtrato,
  TituloCadastro,
} from './types.js';

const REGISTROS_POR_PAGINA = 100;

/** Lista todas as contas correntes cadastradas, seguindo a paginacao. */
export async function listarContasCorrentes(
  credenciais: CredenciaisOmie,
): Promise<ContaCorrente[]> {
  const contas: ContaCorrente[] = [];
  let pagina = 1;
  let totalDePaginas = 1;

  do {
    let resposta: ListarContasCorrentesResponse;
    try {
      resposta = await chamarOmie<ListarContasCorrentesResponse, ListarContasCorrentesRequest>(
        credenciais,
        'geral/contacorrente',
        'ListarContasCorrentes',
        {
          pagina,
          registros_por_pagina: REGISTROS_POR_PAGINA,
          filtrar_apenas_ativo: 'S',
        },
      );
    } catch (erro) {
      if (ehRespostaVazia(erro)) break;
      throw erro;
    }

    // A Omie nao e consistente no nome do array entre versoes do endpoint.
    const lote = resposta.conta_corrente_cadastro ?? resposta.ListarContasCorrentes ?? [];
    contas.push(...lote);

    totalDePaginas = resposta.total_de_paginas ?? 1;
    pagina += 1;
  } while (pagina <= totalDePaginas);

  return contas;
}

/**
 * Extrato de uma conta corrente num periodo.
 * Este endpoint nao e paginado — devolve o periodo inteiro de uma vez.
 */
export async function listarExtrato(
  credenciais: CredenciaisOmie,
  codigoContaCorrente: number,
  de: DataISO,
  ate: DataISO,
): Promise<{ resposta: ListarExtratoResponse; movimentos: MovimentoExtrato[] }> {
  try {
    const resposta = await chamarOmie<ListarExtratoResponse, ListarExtratoRequest>(
      credenciais,
      'financas/extrato',
      'ListarExtrato',
      {
        nCodCC: codigoContaCorrente,
        dPeriodoInicial: paraFormatoOmie(de),
        dPeriodoFinal: paraFormatoOmie(ate),
        cExibirApenasSaldo: 'N',
      },
    );

    return { resposta, movimentos: resposta.listaMovimentos ?? [] };
  } catch (erro) {
    if (ehRespostaVazia(erro)) {
      logger.info({ codigoContaCorrente, de, ate }, 'extrato sem movimento no periodo');
      return { resposta: {}, movimentos: [] };
    }
    throw erro;
  }
}

async function listarTitulosPaginado(
  credenciais: CredenciaisOmie,
  recurso: 'financas/contareceber' | 'financas/contapagar',
  metodo: 'ListarContasReceber' | 'ListarContasPagar',
  extrairLote: (r: ListarContasReceberResponse & ListarContasPagarResponse) => TituloCadastro[],
  de: DataISO,
  ate: DataISO,
  codigoContaCorrente?: number,
): Promise<TituloCadastro[]> {
  const titulos: TituloCadastro[] = [];
  let pagina = 1;
  let totalDePaginas = 1;

  do {
    let resposta: ListarContasReceberResponse & ListarContasPagarResponse;
    try {
      resposta = await chamarOmie<
        ListarContasReceberResponse & ListarContasPagarResponse,
        ListarTitulosRequest
      >(credenciais, recurso, metodo, {
        pagina,
        registros_por_pagina: REGISTROS_POR_PAGINA,
        filtrar_por_data_de: paraFormatoOmie(de),
        filtrar_por_data_ate: paraFormatoOmie(ate),
        ...(codigoContaCorrente ? { filtrar_conta_corrente: codigoContaCorrente } : {}),
        exibir_obs: 'S',
      });
    } catch (erro) {
      if (ehRespostaVazia(erro)) break;
      throw erro;
    }

    titulos.push(...extrairLote(resposta));
    totalDePaginas = resposta.total_de_paginas ?? 1;
    pagina += 1;
  } while (pagina <= totalDePaginas);

  return titulos;
}

/**
 * Titulos a receber do periodo.
 * Nao e usado no match da fase 1 (o extrato ja traz o movimento consolidado),
 * mas serve para investigar uma pendencia: se a transacao existe no banco e nao
 * no extrato, o titulo pode estar aqui, ainda em aberto.
 */
export function listarContasReceber(
  credenciais: CredenciaisOmie,
  de: DataISO,
  ate: DataISO,
  codigoContaCorrente?: number,
): Promise<TituloCadastro[]> {
  return listarTitulosPaginado(
    credenciais,
    'financas/contareceber',
    'ListarContasReceber',
    (r) => r.conta_receber_cadastro ?? [],
    de,
    ate,
    codigoContaCorrente,
  );
}

/** Titulos a pagar do periodo. Mesma finalidade de investigacao. */
export function listarContasPagar(
  credenciais: CredenciaisOmie,
  de: DataISO,
  ate: DataISO,
  codigoContaCorrente?: number,
): Promise<TituloCadastro[]> {
  return listarTitulosPaginado(
    credenciais,
    'financas/contapagar',
    'ListarContasPagar',
    (r) => r.conta_pagar_cadastro ?? [],
    de,
    ate,
    codigoContaCorrente,
  );
}

import type { CredenciaisOmie } from '../clientes/types.js';
import { paraFormatoOmie, type DataISO } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { chamarOmie, ehRespostaVazia } from './client.js';
import type {
  ListarContasPagarResponse,
  ListarContasReceberResponse,
  ListarMovimentosRequest,
  ListarMovimentosResponse,
  ListarTitulosRequest,
  MovimentoFinanceiro,
  TituloCadastro,
} from './types.js';

const REGISTROS_POR_PAGINA = 100;

/**
 * Movimentos financeiros do periodo (contas a pagar, a receber e conta corrente).
 *
 * E a fonte do DRE e do fluxo de caixa: cada movimento traz a categoria, o
 * valor pago e as datas, que e o necessario para classificar nas linhas do DRE.
 *
 * @param porPagamento true = filtra pela data de pagamento (regime de caixa);
 *                     false = pela data de emissao (competencia).
 */
export async function listarMovimentos(
  credenciais: CredenciaisOmie,
  de: DataISO,
  ate: DataISO,
  porPagamento = true,
): Promise<MovimentoFinanceiro[]> {
  const movimentos: MovimentoFinanceiro[] = [];
  let pagina = 1;
  let totalDePaginas = 1;

  const filtroDeData = porPagamento
    ? { dDtPagtoDe: paraFormatoOmie(de), dDtPagtoAte: paraFormatoOmie(ate) }
    : { dDtEmisDe: paraFormatoOmie(de), dDtEmisAte: paraFormatoOmie(ate) };

  do {
    let resposta: ListarMovimentosResponse;
    try {
      resposta = await chamarOmie<ListarMovimentosResponse, ListarMovimentosRequest>(
        credenciais,
        'financas/mf',
        'ListarMovimentos',
        {
          nPagina: pagina,
          nRegPorPagina: 200,
          // Titulo cancelado nao e receita nem despesa; deixa-lo entrar
          // inflaria o DRE com dinheiro que nunca existiu.
          cStatus: 'NAO_CANCELADO',
          ...filtroDeData,
        },
      );
    } catch (erro) {
      if (ehRespostaVazia(erro)) break;
      throw erro;
    }

    movimentos.push(...(resposta.movimentos ?? []));
    totalDePaginas = resposta.nTotPaginas ?? 1;
    pagina += 1;
  } while (pagina <= totalDePaginas);

  logger.debug({ de, ate, porPagamento, total: movimentos.length }, 'movimentos financeiros lidos');

  return movimentos;
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
 * Titulos a receber do periodo. Nao e chamado pelo DRE/fluxo (que usam
 * `listarMovimentos`); serve para investigar um titulo especifico ainda em
 * aberto.
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

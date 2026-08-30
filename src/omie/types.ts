/**
 * Tipos dos payloads da API da Omie.
 * Nomes de campo copiados literalmente da documentacao em
 * https://app.omie.com.br/api/v1/<caminho>/ — nao "arrumar" a grafia,
 * a API e case-sensitive e usa notacao hungara (n = numero, c = char, d = data).
 */

// ---------- /geral/contacorrente/ : ListarContasCorrentes ----------

export interface ListarContasCorrentesRequest {
  pagina: number;
  registros_por_pagina: number;
  apenas_importado_api?: 'S' | 'N';
  filtrar_apenas_ativo?: 'S' | 'N';
}

export interface ContaCorrente {
  nCodCC: number;
  cCodCCInt?: string;
  descricao?: string;
  codigo_banco?: string;
  codigo_agencia?: string;
  conta_corrente?: string;
  tipo?: string;
  saldo_inicial?: number;
  saldo_data?: string;
}

export interface ListarContasCorrentesResponse {
  pagina: number;
  total_de_paginas: number;
  registros: number;
  total_de_registros: number;
  ListarContasCorrentes?: ContaCorrente[];
  conta_corrente_cadastro?: ContaCorrente[];
}

// ---------- /financas/extrato/ : ListarExtrato ----------

export interface ListarExtratoRequest {
  nCodCC: number;
  /** Datas em DD/MM/AAAA. */
  dPeriodoInicial: string;
  dPeriodoFinal: string;
  cExibirApenasSaldo?: 'S' | 'N';
}

/** Uma linha do extrato de conta corrente da Omie. */
export interface MovimentoExtrato {
  nCodLancamento: number;
  nCodLancRelac?: number;
  cSituacao?: string;
  dDataLancamento?: string;
  cDesCliente?: string;
  cTipoDocumento?: string;
  cNumero?: string;
  nValorDocumento?: number;
  nSaldo?: number;
  nSaldoPrev?: number;
  cCodCategoria?: string;
  cDesCategoria?: string;
  cDocumentoFiscal?: string;
  cParcela?: string;
  cNossoNumero?: string;
  cOrigem?: string;
  cVendedor?: string;
  cProjeto?: string;
  nCodCliente?: number;
  cRazCliente?: string;
  /** CNPJ/CPF do cliente ou fornecedor. */
  cDocCliente?: string;
  cObservacoes?: string;
  cDataInclusao?: string;
  cHoraInclusao?: string;
  /** Natureza da operacao. Valores nao documentados — confirmar com smoke:omie. */
  cNatureza?: string;
  cBloqueado?: string;
  dDataConciliacao?: string;
}

export interface ListarExtratoResponse {
  nCodCC?: number;
  cCodIntCC?: string;
  nCodAgencia?: string;
  nCodBanco?: string;
  nNumConta?: string;
  cDescricao?: string;
  nSaldoAnterior?: number;
  nSaldoAtual?: number;
  nSaldoConciliado?: number;
  nSaldoDisponivel?: number;
  listaMovimentos?: MovimentoExtrato[];
}

// ---------- /financas/contareceber/ e /financas/contapagar/ ----------

export interface ListarTitulosRequest {
  pagina: number;
  registros_por_pagina: number;
  ordenar_por?: string;
  filtrar_por_data_de?: string;
  filtrar_por_data_ate?: string;
  filtrar_conta_corrente?: number;
  filtrar_apenas_titulos_em_aberto?: 'S' | 'N';
  exibir_obs?: 'S' | 'N';
}

export interface TituloCadastro {
  codigo_lancamento_omie: number;
  codigo_lancamento_integracao?: string;
  codigo_cliente_fornecedor?: number;
  data_vencimento?: string;
  data_emissao?: string;
  valor_documento?: number;
  numero_documento?: string;
  codigo_categoria?: string;
  observacao?: string;
  status_titulo?: string;
}

export interface ListarContasReceberResponse {
  pagina: number;
  total_de_paginas: number;
  registros: number;
  total_de_registros: number;
  conta_receber_cadastro?: TituloCadastro[];
}

export interface ListarContasPagarResponse {
  pagina: number;
  total_de_paginas: number;
  registros: number;
  total_de_registros: number;
  conta_pagar_cadastro?: TituloCadastro[];
}

// ---------- /geral/dre/ : ListarCadastroDRE ----------

export interface ContaDRE {
  codigoDRE: string;
  descricaoDRE: string;
  /** Profundidade na hierarquia; casa com a quantidade de segmentos do codigo. */
  nivelDRE: number;
  /** "+" soma, "-" subtrai, vazio nos totalizadores. */
  sinalDRE: string;
  /** "S" = linha calculada a partir dos filhos; "N" = linha que recebe valor. */
  totalizaDRE: string;
  naoExibirDRE: string;
}

export interface ListarCadastroDREResponse {
  totalRegistros?: number;
  dreLista?: ContaDRE[];
}

// ---------- /geral/categorias/ : ListarCategorias ----------

export interface Categoria {
  codigo: string;
  descricao?: string;
  descricao_padrao?: string;
  categoria_superior?: string;
  /**
   * Codigo da conta do DRE. E O UNICO vinculo valido entre categoria e DRE:
   * os dois usam numeracao parecida mas independente, e o mesmo codigo
   * significa coisas diferentes de cada lado.
   */
  codigo_dre?: string;
  dadosDRE?: Partial<ContaDRE>;
  conta_receita?: string;
  conta_despesa?: string;
  conta_inativa?: string;
  /** "S" = grupo que so agrega; nao recebe lancamento. */
  totalizadora?: string;
  nao_exibir?: string;
  transferencia?: string;
}

export interface ListarCategoriasResponse {
  pagina?: number;
  total_de_paginas?: number;
  registros?: number;
  total_de_registros?: number;
  categoria_cadastro?: Categoria[];
}

// ---------- /financas/mf/ : ListarMovimentos ----------

export interface MovimentoDetalhes {
  nCodTitulo?: number;
  cNumTitulo?: string;
  dDtEmissao?: string;
  dDtVenc?: string;
  dDtPagamento?: string;
  nCodCliente?: number;
  cCPFCNPJCliente?: string;
  nCodCC?: number;
  cStatus?: string;
  /** "P" = a pagar, "R" = a receber. */
  cNatureza?: string;
  cTipo?: string;
  cCodCateg?: string;
  nValorTitulo?: number;
  observacao?: string;
  cOrigem?: string;
}

export interface MovimentoResumo {
  nValPago?: number;
  nValAberto?: number;
  nValLiquido?: number;
  nDesconto?: number;
  nJuros?: number;
  nMulta?: number;
  /** "S" quando o titulo ja foi liquidado. */
  cLiquidado?: string;
}

/** Rateio do titulo entre categorias. Um titulo pode se dividir em varias. */
export interface MovimentoCategoria {
  cCodCateg?: string;
  nDistrValor?: number;
  nDistrPercentual?: number;
}

export interface MovimentoFinanceiro {
  detalhes?: MovimentoDetalhes;
  resumo?: MovimentoResumo;
  categorias?: MovimentoCategoria[];
}

export interface ListarMovimentosRequest {
  nPagina: number;
  nRegPorPagina: number;
  cNatureza?: 'P' | 'R';
  cStatus?: string;
  dDtPagtoDe?: string;
  dDtPagtoAte?: string;
  dDtEmisDe?: string;
  dDtEmisAte?: string;
  cTpLancamento?: string;
  lApenasResumo?: boolean;
}

export interface ListarMovimentosResponse {
  nPagina?: number;
  nTotPaginas?: number;
  nRegistros?: number;
  nTotRegistros?: number;
  movimentos?: MovimentoFinanceiro[];
}

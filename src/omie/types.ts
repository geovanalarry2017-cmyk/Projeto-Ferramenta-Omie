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

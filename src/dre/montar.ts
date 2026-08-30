import { deFormatoOmie, type DataISO } from '../lib/dates.js';
import { paraCentavos } from '../lib/money.js';
import { mapearCategoriaParaDRE } from '../omie/cadastros.js';
import type { Categoria, ContaDRE, MovimentoFinanceiro } from '../omie/types.js';
import type {
  CategoriaNaoClassificada,
  LinhaDRE,
  Regime,
  ResultadoDRE,
  ResultadoFluxoCaixa,
  DiaDeCaixa,
} from './types.js';

/**
 * Montagem do DRE. Funcao pura, sem I/O — mesma escolha do matcher: e o que
 * permite testar a apuracao com dados fabricados e conferir numero a numero.
 *
 * A regra de sinal vem da propria Omie:
 *   - folha  (totalizaDRE = "N") tem sinalDRE "+" ou "-"
 *   - totalizador (totalizaDRE = "S") nao tem sinal: vale a soma dos filhos,
 *     que ja chegam com o sinal deles aplicado
 *
 * Assim "Custos" (todos os filhos "-") vira um numero negativo, e
 * "Lucro Bruto" = Receita Liquida + Receita Indireta + Custos fecha certo
 * somando, sem regra especial em lugar nenhum.
 */

export interface OpcoesDRE {
  de: DataISO;
  ate: DataISO;
  regime: Regime;
}

export function montarDRE(
  contasDRE: ContaDRE[],
  categorias: Categoria[],
  movimentos: MovimentoFinanceiro[],
  opcoes: OpcoesDRE,
): ResultadoDRE {
  const mapaCategoriaDRE = mapearCategoriaParaDRE(categorias);
  const descricaoPorCategoria = new Map(
    categorias.map((c) => [c.codigo, c.descricao ?? c.codigo] as const),
  );
  const codigosDREValidos = new Set(contasDRE.map((c) => c.codigoDRE));

  const acumuladoPorConta = new Map<string, number>();
  const naoClassificado = new Map<string, CategoriaNaoClassificada>();

  let movimentosSemValor = 0;
  let movimentosSemCategoria = 0;
  let movimentosForaDoPeriodo = 0;

  for (const movimento of movimentos) {
    // Rede de seguranca: o filtro de data da Omie e aplicado no servidor, mas
    // se ele vier mais frouxo do que o pedido, um movimento de outro mes
    // entraria no DRE sem ninguem perceber. Aqui a data e conferida de novo.
    const data = dataDoMovimento(movimento, opcoes.regime);
    if (data && (data < opcoes.de || data > opcoes.ate)) {
      movimentosForaDoPeriodo += 1;
      continue;
    }

    const valorCentavos = valorDoMovimento(movimento, opcoes.regime);
    if (valorCentavos === 0) {
      movimentosSemValor += 1;
      continue;
    }

    const rateios = ratearPorCategoria(movimento, valorCentavos);
    if (rateios.length === 0) {
      movimentosSemCategoria += 1;
      continue;
    }

    for (const rateio of rateios) {
      const codigoDRE = mapaCategoriaDRE.get(rateio.categoria);

      // Categoria sem vinculo de DRE, ou apontando para conta inexistente.
      if (!codigoDRE || !codigosDREValidos.has(codigoDRE)) {
        const atual = naoClassificado.get(rateio.categoria) ?? {
          codigo: rateio.categoria,
          descricao: descricaoPorCategoria.get(rateio.categoria) ?? rateio.categoria,
          valorCentavos: 0,
          movimentos: 0,
        };
        atual.valorCentavos += rateio.centavos;
        atual.movimentos += 1;
        naoClassificado.set(rateio.categoria, atual);
        continue;
      }

      acumuladoPorConta.set(
        codigoDRE,
        (acumuladoPorConta.get(codigoDRE) ?? 0) + rateio.centavos,
      );
    }
  }

  const linhas = montarArvore(contasDRE, acumuladoPorConta);
  const resultadoCentavos = linhas.reduce((soma, l) => soma + l.valorCentavos, 0);

  const categoriasNaoClassificadas = [...naoClassificado.values()].sort(
    (a, b) => Math.abs(b.valorCentavos) - Math.abs(a.valorCentavos),
  );

  return {
    periodo: { de: opcoes.de, ate: opcoes.ate },
    regime: opcoes.regime,
    linhas,
    resultadoCentavos,
    naoClassificado: {
      totalCentavos: categoriasNaoClassificadas.reduce((s, c) => s + c.valorCentavos, 0),
      categorias: categoriasNaoClassificadas,
    },
    diagnostico: {
      movimentosLidos: movimentos.length,
      movimentosSemValor,
      movimentosSemCategoria,
      movimentosForaDoPeriodo,
      categoriasComVinculoDRE: mapaCategoriaDRE.size,
      categoriasTotais: categorias.length,
    },
  };
}

/** Data que define a competencia do movimento, conforme o regime. */
function dataDoMovimento(movimento: MovimentoFinanceiro, regime: Regime): DataISO | null {
  return deFormatoOmie(
    regime === 'caixa' ? movimento.detalhes?.dDtPagamento : movimento.detalhes?.dDtEmissao,
  );
}

/**
 * No regime de caixa vale o que efetivamente entrou ou saiu (nValPago).
 * Na competencia vale o valor do titulo, independente de ter sido pago.
 */
function valorDoMovimento(movimento: MovimentoFinanceiro, regime: Regime): number {
  const bruto =
    regime === 'caixa' ? movimento.resumo?.nValPago : movimento.detalhes?.nValorTitulo;

  return Math.abs(paraCentavos(bruto));
}

interface Rateio {
  categoria: string;
  centavos: number;
}

/**
 * Um titulo pode ser dividido entre varias categorias (rateio). Ignorar isso
 * jogaria o valor inteiro na primeira categoria e distorceria o DRE.
 */
function ratearPorCategoria(movimento: MovimentoFinanceiro, valorCentavos: number): Rateio[] {
  const rateios = (movimento.categorias ?? []).filter((c) => c.cCodCateg);

  if (rateios.length === 0) {
    const unica = movimento.detalhes?.cCodCateg;
    return unica ? [{ categoria: unica, centavos: valorCentavos }] : [];
  }

  if (rateios.length === 1) {
    // Rateio unico: usa o valor do movimento, nao o distribuido, para nao
    // perder centavos de arredondamento.
    return [{ categoria: rateios[0]!.cCodCateg!, centavos: valorCentavos }];
  }

  const distribuidos = rateios.map((r) => ({
    categoria: r.cCodCateg!,
    centavos: Math.abs(paraCentavos(r.nDistrValor)),
  }));

  // Se a Omie nao mandou os valores distribuidos, cai para o percentual.
  const soma = distribuidos.reduce((s, d) => s + d.centavos, 0);
  if (soma > 0) return distribuidos;

  return rateios.map((r) => ({
    categoria: r.cCodCateg!,
    centavos: Math.round((valorCentavos * (r.nDistrPercentual ?? 0)) / 100),
  }));
}

/** Codigo do pai: "1.01.01" -> "1.01"; "1" -> null. */
function codigoDoPai(codigo: string): string | null {
  const corte = codigo.lastIndexOf('.');
  return corte === -1 ? null : codigo.slice(0, corte);
}

function montarArvore(
  contasDRE: ContaDRE[],
  acumulado: Map<string, number>,
): LinhaDRE[] {
  const porCodigo = new Map<string, LinhaDRE>();

  for (const conta of contasDRE) {
    porCodigo.set(conta.codigoDRE, {
      codigo: conta.codigoDRE,
      descricao: conta.descricaoDRE,
      nivel: conta.nivelDRE,
      ehTotalizador: conta.totalizaDRE === 'S',
      sinal: conta.sinalDRE ?? '',
      valorCentavos: 0,
      valorBrutoCentavos: acumulado.get(conta.codigoDRE) ?? 0,
      filhos: [],
    });
  }

  const raizes: LinhaDRE[] = [];

  // Ordena por codigo para o pai sempre existir antes do filho e a saida sair
  // na ordem do relatorio.
  const ordenadas = [...porCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));

  for (const linha of ordenadas) {
    const pai = codigoDoPai(linha.codigo);
    const linhaPai = pai ? porCodigo.get(pai) : undefined;

    if (linhaPai) linhaPai.filhos.push(linha);
    else raizes.push(linha);
  }

  for (const raiz of raizes) calcularValor(raiz);

  return raizes;
}

/**
 * Negar zero em JavaScript produz -0, que sobrevive em comparacao e pode
 * aparecer como "-0,00" numa tabela de DRE. Aqui vira 0 e pronto.
 */
function semZeroNegativo(valor: number): number {
  return valor === 0 ? 0 : valor;
}

/** Aplica o sinal da conta ao valor lancado nela. */
function comSinal(linha: LinhaDRE): number {
  return semZeroNegativo(
    linha.sinal === '-' ? -linha.valorBrutoCentavos : linha.valorBrutoCentavos,
  );
}

/**
 * Valor de uma linha, de baixo para cima.
 * Folha: valor lancado com o sinal aplicado.
 * Totalizador: soma dos filhos, que ja vem assinados.
 */
function calcularValor(linha: LinhaDRE): number {
  if (linha.filhos.length === 0) {
    linha.valorCentavos = comSinal(linha);
    return linha.valorCentavos;
  }

  const somaFilhos = linha.filhos.reduce((soma, filho) => soma + calcularValor(filho), 0);

  // Uma linha pode ter filhos E lancamento proprio (raro, mas possivel se a
  // categoria apontar para um codigo intermediario).
  linha.valorCentavos = semZeroNegativo(somaFilhos + comSinal(linha));
  return linha.valorCentavos;
}

// ---------------------------------------------------------------------------
// Fluxo de caixa
// ---------------------------------------------------------------------------

/**
 * Fluxo de caixa diario a partir dos movimentos pagos.
 *
 * Usa sempre a data de pagamento: fluxo de caixa e, por definicao, o dinheiro
 * que entrou e saiu de fato.
 */
export function montarFluxoDeCaixa(
  movimentos: MovimentoFinanceiro[],
  de: DataISO,
  ate: DataISO,
  saldoInicialCentavos = 0,
): ResultadoFluxoCaixa {
  const porDia = new Map<string, { entradas: number; saidas: number }>();

  for (const movimento of movimentos) {
    const data = deFormatoOmie(movimento.detalhes?.dDtPagamento);
    if (!data || data < de || data > ate) continue;

    const centavos = Math.abs(paraCentavos(movimento.resumo?.nValPago));
    if (centavos === 0) continue;

    const dia = porDia.get(data) ?? { entradas: 0, saidas: 0 };

    // "R" = titulo a receber, entrou dinheiro. "P" = a pagar, saiu.
    if (movimento.detalhes?.cNatureza === 'R') dia.entradas += centavos;
    else dia.saidas += centavos;

    porDia.set(data, dia);
  }

  let acumulado = saldoInicialCentavos;
  const dias: DiaDeCaixa[] = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, { entradas, saidas }]) => {
      const saldoDoDia = entradas - saidas;
      acumulado += saldoDoDia;
      return {
        data,
        entradasCentavos: entradas,
        saidasCentavos: saidas,
        saldoDoDiaCentavos: saldoDoDia,
        saldoAcumuladoCentavos: acumulado,
      };
    });

  const totalEntradas = dias.reduce((s, d) => s + d.entradasCentavos, 0);
  const totalSaidas = dias.reduce((s, d) => s + d.saidasCentavos, 0);

  return {
    periodo: { de, ate },
    dias,
    totalEntradasCentavos: totalEntradas,
    totalSaidasCentavos: totalSaidas,
    saldoPeriodoCentavos: totalEntradas - totalSaidas,
  };
}

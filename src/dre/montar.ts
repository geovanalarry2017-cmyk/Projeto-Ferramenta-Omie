import { deFormatoOmie, type DataISO } from '../lib/dates.js';
import { paraCentavos } from '../lib/money.js';
import type { Categoria, ContaDRE, MovimentoFinanceiro } from '../omie/types.js';
import type {
  CategoriaNaoClassificada,
  LinhaDRE,
  LinhaDREMensal,
  MesDRE,
  Regime,
  ResultadoDRE,
  ResultadoDREMensal,
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

/**
 * Mapa categoria -> conta do DRE.
 *
 * ATENCAO: o vinculo e o campo `codigo_dre`, nunca o codigo da categoria.
 * As duas numeracoes se parecem mas sao independentes — na conta de teste,
 * a categoria "1.01.02" e uma receita de servicos, enquanto o DRE "1.01.02" e
 * a linha de Impostos, que subtrai. Usar o codigo da categoria como se fosse o
 * do DRE jogaria receita na linha de imposto, silenciosamente.
 */
export function mapearCategoriaParaDRE(categorias: Categoria[]): Map<string, string> {
  const mapa = new Map<string, string>();

  for (const categoria of categorias) {
    const codigoDRE = categoria.codigo_dre?.trim() || categoria.dadosDRE?.codigoDRE?.trim();
    if (categoria.codigo && codigoDRE) {
      mapa.set(categoria.codigo, codigoDRE);
    }
  }

  return mapa;
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

// ---------------------------------------------------------------------------
// DRE mes a mes
// ---------------------------------------------------------------------------

/**
 * Teto de meses por consulta. Um pedido de 2020 a 2030 montaria 120 colunas
 * que ninguem le, depois de varrer a lista de movimentos 120 vezes.
 */
const MAX_MESES = 36;

/** Ultimo dia do mes, em UTC para o fuso nao empurrar para o dia 30. */
function ultimoDiaDoMes(ano: number, mes: number): DataISO {
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

/**
 * Os meses cobertos pelo periodo, cada um recortado pelas pontas: um pedido de
 * 15/01 a 10/03 devolve janeiro comecando no 15 e marco terminando no 10, para
 * a soma das colunas bater com o DRE do periodo inteiro.
 */
export function mesesNoPeriodo(de: DataISO, ate: DataISO): MesDRE[] {
  const meses: MesDRE[] = [];
  let ano = Number(de.slice(0, 4));
  let mes = Number(de.slice(5, 7));

  while (meses.length < MAX_MESES) {
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    if (chave > ate.slice(0, 7)) break;

    const primeiro = `${chave}-01`;
    const ultimo = ultimoDiaDoMes(ano, mes);
    meses.push({
      chave,
      de: primeiro < de ? de : primeiro,
      ate: ultimo > ate ? ate : ultimo,
      resultadoCentavos: 0,
      naoClassificadoCentavos: 0,
    });

    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }

  return meses;
}

/**
 * DRE em matriz: uma coluna por mes, uma linha por conta.
 *
 * Reaproveita `montarDRE` mes a mes de proposito, em vez de reimplementar a
 * apuracao com um agrupamento por mes: duas versoes da mesma regra divergem
 * com o tempo, e a divergencia apareceria como numero errado, calada. O custo e
 * varrer a lista de movimentos uma vez por mes, o que e barato perto de buscar
 * os movimentos na Omie doze vezes.
 */
export function montarDREMensal(
  contasDRE: ContaDRE[],
  categorias: Categoria[],
  movimentos: MovimentoFinanceiro[],
  opcoes: OpcoesDRE,
): ResultadoDREMensal {
  const meses = mesesNoPeriodo(opcoes.de, opcoes.ate);

  const porMes = meses.map((mes) => {
    const apurado = montarDRE(contasDRE, categorias, movimentos, {
      de: mes.de,
      ate: mes.ate,
      regime: opcoes.regime,
    });
    mes.resultadoCentavos = apurado.resultadoCentavos;
    mes.naoClassificadoCentavos = apurado.naoClassificado.totalCentavos;
    return apurado;
  });

  return {
    periodo: { de: opcoes.de, ate: opcoes.ate },
    regime: opcoes.regime,
    meses,
    linhas: mesclarLinhas(porMes.map((m) => m.linhas)),
    resultadoCentavos: meses.reduce((s, m) => s + m.resultadoCentavos, 0),
    naoClassificadoCentavos: meses.reduce((s, m) => s + m.naoClassificadoCentavos, 0),
  };
}

/**
 * Junta as arvores mensais numa so, com um vetor de valores por linha.
 *
 * As arvores tem a mesma forma porque saem do mesmo plano de contas, mas a
 * posicao e conferida mesmo assim: se um dia deixarem de bater, um valor de
 * "Impostos" apareceria na linha de "Receita" sem nada quebrar.
 */
function mesclarLinhas(porMes: LinhaDRE[][]): LinhaDREMensal[] {
  const primeira = porMes[0] ?? [];

  return primeira.map((linha, i) => {
    const noMes = porMes.map((mes) => {
      const candidata = mes[i];
      if (!candidata || candidata.codigo !== linha.codigo) {
        throw new Error(
          `Plano de contas inconsistente entre os meses na posicao ${i}: ` +
            `esperado "${linha.codigo}", veio "${candidata?.codigo ?? 'nada'}".`,
        );
      }
      return candidata;
    });

    const valores = noMes.map((l) => l.valorCentavos);

    return {
      codigo: linha.codigo,
      descricao: linha.descricao,
      nivel: linha.nivel,
      ehTotalizador: linha.ehTotalizador,
      sinal: linha.sinal,
      valores,
      totalCentavos: valores.reduce((s, v) => s + v, 0),
      filhos: mesclarLinhas(noMes.map((l) => l.filhos)),
    };
  });
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
  if (soma > 0) return reescalar(distribuidos, soma, valorCentavos);

  return rateios.map((r) => ({
    categoria: r.cCodCateg!,
    centavos: Math.round((valorCentavos * (r.nDistrPercentual ?? 0)) / 100),
  }));
}

/**
 * Poe o rateio na escala do valor que de fato entra no DRE.
 *
 * Os valores distribuidos que a Omie manda sao os do titulo cheio. No regime de
 * caixa o que vale e o que foi pago, que pode ser menor: um titulo de 1.000
 * rateado 70/30 e pago pela metade tem que entrar como 350/150, nao 700/300.
 *
 * Sem isso o DRE de caixa conta dinheiro que nao entrou — e so em titulo
 * rateado, ou seja, um erro pequeno e disperso no meio de um relatorio que
 * parece certo. O caso sem rateio ja usava o valor pago, o que tornava a
 * divergencia ainda mais dificil de notar.
 */
function reescalar(rateios: Rateio[], soma: number, total: number): Rateio[] {
  if (soma === total) return rateios;

  const ajustados = rateios.map((r) => ({
    categoria: r.categoria,
    centavos: Math.round((r.centavos * total) / soma),
  }));

  // A sobra do arredondamento vai para a maior fatia: a soma tem que fechar
  // exata, senao o DRE perde centavos a cada titulo rateado.
  const diferenca = total - ajustados.reduce((s, r) => s + r.centavos, 0);
  if (diferenca !== 0) {
    let maior = 0;
    for (let i = 1; i < ajustados.length; i += 1) {
      if (ajustados[i]!.centavos > ajustados[maior]!.centavos) maior = i;
    }
    ajustados[maior]!.centavos += diferenca;
  }

  return ajustados;
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

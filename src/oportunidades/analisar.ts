import type { DataISO } from '../lib/dates.js';
import { formatarBRL } from '../lib/money.js';
import type {
  LinhaDRE,
  LinhaDREMensal,
  ResultadoDRE,
  ResultadoDREMensal,
  ResultadoFluxoCaixa,
} from '../dre/types.js';
import type { Oportunidade, ResultadoOportunidades, Severidade } from './types.js';

/**
 * Le o DRE, o DRE mes a mes e o fluxo de caixa e devolve o que merece atencao.
 *
 * Funcao pura, sem I/O, como o matcher e o DRE. Aqui isso importa mais ainda:
 * cada regra e um julgamento sobre o negocio do cliente ("marketing subiu
 * demais", "a margem esta caindo"), e julgamento sem teste vira palpite. Todo
 * limiar e uma constante nomeada logo abaixo, para dar para discutir e ajustar
 * sem caçar numero no meio do codigo.
 *
 * A regra que vale para todas: **nunca afirmar mais do que o dado sustenta**.
 * Com dois meses nao se fala em tendencia; sem receita nao se fala em margem.
 */

/** Abaixo disso o achado nao vale o espaco na tela. */
const VALOR_MINIMO_CENTAVOS = 50_00;

/** Alta relativa de uma despesa contra a media dos meses anteriores. */
const ALTA_RELEVANTE = 0.4;

/** Quantos meses de historico uma tendencia precisa para ser afirmada. */
const MESES_PARA_TENDENCIA = 3;

/** Concentracao a partir da qual vale avisar (fornecedor unico, cliente unico). */
const CONCENTRACAO_RECEITA = 0.5;

/** Queda de margem, em pontos percentuais, que vira alerta. */
const QUEDA_DE_MARGEM_PP = 5;

/** Quantas despesas em alta reportar. Mais que isso vira lista, nao alerta. */
const MAX_DESPESAS_EM_ALTA = 3;

export interface EntradaDaAnalise {
  dre: ResultadoDRE;
  mensal: ResultadoDREMensal;
  fluxo: ResultadoFluxoCaixa;
  de: DataISO;
  ate: DataISO;
}

function achatar<T extends { filhos: T[] }>(linhas: T[], saida: T[] = []): T[] {
  for (const linha of linhas) {
    saida.push(linha);
    achatar(linha.filhos, saida);
  }
  return saida;
}

const folhas = <T extends { filhos: T[] }>(linhas: T[]): T[] =>
  achatar(linhas).filter((l) => l.filhos.length === 0);

const percentual = (parte: number, todo: number): number => (todo === 0 ? 0 : (parte / todo) * 100);

const arredondar1 = (n: number): string =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function analisarOportunidades(entrada: EntradaDaAnalise): ResultadoOportunidades {
  const { dre, mensal, fluxo } = entrada;
  const itens: Oportunidade[] = [];

  const meses = mensal.meses.length;
  const temHistorico = meses >= MESES_PARA_TENDENCIA;

  dinheiroForaDoDRE(dre, itens);
  despesasEmAlta(mensal, itens, temHistorico);
  concentracaoDeSaidas(dre, itens);
  concentracaoDeReceita(dre, itens);
  mesesNoVermelho(mensal, itens);
  margemCaindo(mensal, itens, temHistorico);
  caixaNegativo(fluxo, itens);

  const peso: Record<Severidade, number> = { alta: 0, media: 1, informativa: 2 };
  itens.sort(
    (a, b) =>
      peso[a.severidade] - peso[b.severidade] ||
      (b.valorCentavos ?? 0) - (a.valorCentavos ?? 0),
  );

  return {
    periodo: { de: entrada.de, ate: entrada.ate },
    itens,
    resumo: {
      alta: itens.filter((i) => i.severidade === 'alta').length,
      media: itens.filter((i) => i.severidade === 'media').length,
      informativa: itens.filter((i) => i.severidade === 'informativa').length,
      emJogoCentavos: itens
        .filter((i) => i.severidade === 'alta')
        .reduce((s, i) => s + (i.valorCentavos ?? 0), 0),
    },
    diagnostico: { mesesAnalisados: meses, precisaMaisMeses: !temHistorico },
  };
}

// ---------------------------------------------------------------------------
// As analises
// ---------------------------------------------------------------------------

/** Categoria sem vinculo de DRE e dinheiro que sumiu do relatorio. */
function dinheiroForaDoDRE(dre: ResultadoDRE, itens: Oportunidade[]): void {
  const { totalCentavos, categorias } = dre.naoClassificado;
  if (totalCentavos < VALOR_MINIMO_CENTAVOS) return;

  const maiores = categorias.slice(0, 3).map((c) => c.descricao).join(', ');

  itens.push({
    id: 'fora-do-dre',
    titulo: 'Dinheiro fora do DRE',
    severidade: 'alta',
    valorCentavos: totalCentavos,
    achado:
      `${formatarBRL(totalCentavos)} em ${categorias.length} categoria(s) não entrou no relatório ` +
      `porque não estão vinculadas a uma conta do DRE na Omie. As maiores: ${maiores}.`,
    acao:
      'Vincule essas categorias a uma conta do DRE no cadastro da Omie. ' +
      'Enquanto isso não for feito, o resultado do período está incompleto.',
  });
}

/** Despesa que disparou contra a propria media dos meses anteriores. */
function despesasEmAlta(
  mensal: ResultadoDREMensal,
  itens: Oportunidade[],
  temHistorico: boolean,
): void {
  if (!temHistorico) return;

  const ultimo = mensal.meses.length - 1;
  const rotuloUltimo = mensal.meses[ultimo]!.chave;

  const altas = folhas(mensal.linhas)
    .filter((l: LinhaDREMensal) => l.totalCentavos < 0)
    .map((l) => {
      // Tudo em magnitude: a linha e negativa, e comparar negativos confunde.
      const valores = l.valores.map(Math.abs);
      const agora = valores[ultimo] ?? 0;
      const anteriores = valores.slice(0, ultimo);
      const media = anteriores.reduce((s, v) => s + v, 0) / anteriores.length;
      return { nome: l.descricao, agora, media, alta: media === 0 ? 0 : agora / media - 1 };
    })
    .filter(
      (d) =>
        d.media > 0 &&
        d.alta >= ALTA_RELEVANTE &&
        d.agora - d.media >= VALOR_MINIMO_CENTAVOS,
    )
    .sort((a, b) => b.agora - b.media - (a.agora - a.media))
    .slice(0, MAX_DESPESAS_EM_ALTA);

  for (const d of altas) {
    const excesso = Math.round(d.agora - d.media);
    itens.push({
      id: `despesa-em-alta:${d.nome}`,
      titulo: `${d.nome} subiu acima do normal`,
      severidade: 'media',
      valorCentavos: excesso,
      achado:
        `Em ${rotuloUltimo} saíram ${formatarBRL(d.agora)}, ${arredondar1(d.alta * 100)}% acima da ` +
        `média dos meses anteriores (${formatarBRL(Math.round(d.media))}). ` +
        `São ${formatarBRL(excesso)} a mais no mês.`,
      acao:
        'Confira o que entrou nessa categoria no mês. Se a alta for pontual, não há o que fazer; ' +
        'se repetir no mês seguinte, virou patamar novo e entra no orçamento.',
    });
  }
}

/** Poucas linhas concentrando a maior parte das saidas. */
function concentracaoDeSaidas(dre: ResultadoDRE, itens: Oportunidade[]): void {
  const saidas = folhas(dre.linhas)
    .filter((l: LinhaDRE) => l.valorCentavos < 0)
    .map((l) => ({ nome: l.descricao, valor: Math.abs(l.valorCentavos) }))
    .sort((a, b) => b.valor - a.valor);

  const total = saidas.reduce((s, l) => s + l.valor, 0);
  if (total < VALOR_MINIMO_CENTAVOS || saidas.length < 4) return;

  const topo = saidas.slice(0, 3);
  const soma = topo.reduce((s, l) => s + l.valor, 0);

  itens.push({
    id: 'concentracao-saidas',
    titulo: 'Onde a negociação rende mais',
    severidade: 'informativa',
    valorCentavos: soma,
    achado:
      `${topo.map((l) => l.nome).join(', ')} concentram ${arredondar1(percentual(soma, total))}% ` +
      `de tudo que saiu (${formatarBRL(soma)} de ${formatarBRL(total)}).`,
    acao:
      'É onde 1% de desconto vale mais que 10% em qualquer outra linha. ' +
      'Renegociar aqui tem o maior retorno por hora de trabalho.',
  });
}

/** Receita apoiada em uma linha so. */
function concentracaoDeReceita(dre: ResultadoDRE, itens: Oportunidade[]): void {
  const entradas = folhas(dre.linhas)
    .filter((l: LinhaDRE) => l.valorCentavos > 0)
    .sort((a, b) => b.valorCentavos - a.valorCentavos);

  const total = entradas.reduce((s, l) => s + l.valorCentavos, 0);
  if (total < VALOR_MINIMO_CENTAVOS || entradas.length < 2) return;

  const maior = entradas[0]!;
  const fatia = maior.valorCentavos / total;
  if (fatia < CONCENTRACAO_RECEITA) return;

  itens.push({
    id: 'concentracao-receita',
    titulo: 'Receita concentrada em uma linha',
    severidade: 'media',
    valorCentavos: maior.valorCentavos,
    achado:
      `${maior.descricao} responde por ${arredondar1(fatia * 100)}% de toda a receita ` +
      `(${formatarBRL(maior.valorCentavos)}).`,
    acao:
      'Uma queda nessa linha derruba o resultado inteiro. Vale saber se ela também está ' +
      'concentrada em poucos clientes e, se estiver, ter um plano para o dia em que um sair.',
  });
}

/** Meses em que o resultado fechou negativo. */
function mesesNoVermelho(mensal: ResultadoDREMensal, itens: Oportunidade[]): void {
  const vermelhos = mensal.meses.filter((m) => m.resultadoCentavos < 0);
  if (vermelhos.length === 0) return;

  const soma = vermelhos.reduce((s, m) => s + m.resultadoCentavos, 0);

  itens.push({
    id: 'meses-no-vermelho',
    titulo:
      vermelhos.length === 1 ? 'Um mês fechou no vermelho' : `${vermelhos.length} meses no vermelho`,
    severidade: 'alta',
    valorCentavos: Math.abs(soma),
    achado:
      `${vermelhos.map((m) => m.chave).join(', ')} fecharam negativo, somando ` +
      `${formatarBRL(Math.abs(soma))} de prejuízo.`,
    acao:
      'Olhe o DRE mês a mês nesses meses: normalmente é uma despesa pontual grande ou ' +
      'uma queda de receita concentrada, e as duas pedem respostas diferentes.',
  });
}

/** Margem liquida do ultimo mes contra a media dos anteriores. */
function margemCaindo(
  mensal: ResultadoDREMensal,
  itens: Oportunidade[],
  temHistorico: boolean,
): void {
  if (!temHistorico) return;

  const receita = achatar(mensal.linhas).find((l) => l.codigo === '1.01');
  if (!receita) return;

  const margens = mensal.meses
    .map((mes, i) => {
      const receitaDoMes = receita.valores[i] ?? 0;
      return receitaDoMes === 0 ? null : (mes.resultadoCentavos / receitaDoMes) * 100;
    })
    .filter((m): m is number => m !== null);

  if (margens.length < MESES_PARA_TENDENCIA) return;

  const atual = margens[margens.length - 1]!;
  const anteriores = margens.slice(0, -1);
  const media = anteriores.reduce((s, m) => s + m, 0) / anteriores.length;
  const queda = media - atual;

  if (queda < QUEDA_DE_MARGEM_PP) return;

  itens.push({
    id: 'margem-caindo',
    titulo: 'Margem caiu no último mês',
    severidade: 'media',
    achado:
      `A margem líquida foi de ${arredondar1(atual)}% no último mês, contra uma média de ` +
      `${arredondar1(media)}% nos anteriores — queda de ${arredondar1(queda)} pontos percentuais.`,
    acao:
      'Margem cai por três motivos: preço, custo ou mix. Compare a receita e os custos do mês ' +
      'com a média para descobrir qual dos três foi.',
  });
}

/** Dias em que o caixa acumulado ficou negativo no periodo. */
function caixaNegativo(fluxo: ResultadoFluxoCaixa, itens: Oportunidade[]): void {
  const negativos = fluxo.dias.filter((d) => d.saldoAcumuladoCentavos < 0);
  if (negativos.length === 0) return;

  const pior = negativos.reduce((p, d) =>
    d.saldoAcumuladoCentavos < p.saldoAcumuladoCentavos ? d : p,
  );

  itens.push({
    id: 'caixa-negativo',
    titulo: 'Caixa ficou negativo no período',
    severidade: 'alta',
    valorCentavos: Math.abs(pior.saldoAcumuladoCentavos),
    achado:
      `Em ${negativos.length} dia(s) o saldo acumulado ficou abaixo de zero. ` +
      `O pior foi ${pior.data}, com ${formatarBRL(pior.saldoAcumuladoCentavos)}.`,
    acao:
      'Compare as datas de pagamento com as de recebimento: normalmente é descasamento de prazo, ' +
      'não falta de resultado, e se resolve negociando vencimento em vez de tomando crédito.',
  });
}

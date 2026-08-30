import { diferencaEmDias, somarDias } from '../lib/dates.js';
import { similaridadeTokens } from '../lib/documento.js';
import { formatarBRL } from '../lib/money.js';
import type {
  ItemConciliacao,
  LancamentoOmie,
  MovimentoBanco,
  RegrasConciliacao,
  ResultadoConciliacao,
  ResumoConciliacao,
} from './types.js';

/**
 * Nucleo da conciliacao. Funcao pura: entra lista, sai lista.
 *
 * Sem I/O de proposito — a qualidade do match so melhora com calibracao, e
 * calibrar exige rodar centenas de variacoes rapido, com fixtures, sem tocar
 * em API nem em banco.
 */

/**
 * Peso de cada sinal na decisao. Somam 1.
 *
 * Valor e data pesam mais porque sao os unicos dois campos que sempre existem
 * dos dois lados. Documento e forte quando existe, mas boa parte das linhas de
 * extrato nao traz CPF/CNPJ. Texto e so desempate: descricao bancaria e ruidosa.
 */
const PESOS = {
  valor: 0.4,
  data: 0.25,
  documento: 0.2,
  texto: 0.15,
} as const;

/** Aplicado quando os dois lados informam documento e eles diferem. */
const PENALIDADE_DOCUMENTO_DIVERGENTE = 0.4;

interface ParCandidato {
  banco: MovimentoBanco;
  omie: LancamentoOmie;
  score: number;
  diferencaCentavos: number;
  distanciaDias: number;
}

export function conciliar(
  movimentosBanco: MovimentoBanco[],
  lancamentosOmie: LancamentoOmie[],
  regras: RegrasConciliacao,
): ResultadoConciliacao {
  const candidatos = gerarCandidatos(movimentosBanco, lancamentosOmie, regras);
  const pares = atribuirUmParaUm(candidatos);

  const itens: ItemConciliacao[] = [];
  const bancoUsado = new Set<string>();
  const omieUsado = new Set<string>();

  for (const par of pares) {
    bancoUsado.add(par.banco.id);
    omieUsado.add(par.omie.id);
    itens.push(classificarPar(par, regras));
  }

  for (const mov of movimentosBanco) {
    if (bancoUsado.has(mov.id)) continue;
    itens.push({
      status: 'PENDENTE_OMIE',
      motivo: 'Existe no extrato do banco e nao foi encontrado lancamento correspondente na Omie.',
      score: null,
      banco: mov,
      omie: null,
      diferencaCentavos: null,
    });
  }

  for (const lanc of lancamentosOmie) {
    if (omieUsado.has(lanc.id)) continue;
    itens.push({
      status: 'PENDENTE_BANCO',
      motivo: motivoPendenteBanco(lanc),
      score: null,
      banco: null,
      omie: lanc,
      diferencaCentavos: null,
    });
  }

  return { itens, resumo: resumir(itens, movimentosBanco.length, lancamentosOmie.length) };
}

/**
 * Pares plausiveis. Tres filtros duros antes de gastar calculo de score:
 * mesma direcao do dinheiro, valor dentro da tolerancia e data dentro da janela.
 */
function gerarCandidatos(
  movimentosBanco: MovimentoBanco[],
  lancamentosOmie: LancamentoOmie[],
  regras: RegrasConciliacao,
): ParCandidato[] {
  const porData = indexarPorData(lancamentosOmie);
  const candidatos: ParCandidato[] = [];

  for (const mov of movimentosBanco) {
    for (const data of datasNaJanela(mov.data, regras.toleranciaDias)) {
      for (const lanc of porData.get(data) ?? []) {
        // Entrada nunca concilia com saida, por mais que valor e data batam.
        if (Math.sign(mov.valorCentavos) !== Math.sign(lanc.valorCentavos)) continue;

        const diferenca = mov.valorCentavos - lanc.valorCentavos;
        if (Math.abs(diferenca) > regras.toleranciaValorCentavos) continue;

        const distanciaDias = diferencaEmDias(mov.data, lanc.data);
        candidatos.push({
          banco: mov,
          omie: lanc,
          diferencaCentavos: diferenca,
          distanciaDias,
          score: pontuar(mov, lanc, diferenca, distanciaDias, regras),
        });
      }
    }
  }

  return candidatos;
}

function indexarPorData(lancamentos: LancamentoOmie[]): Map<string, LancamentoOmie[]> {
  const indice = new Map<string, LancamentoOmie[]>();
  for (const lanc of lancamentos) {
    const lista = indice.get(lanc.data);
    if (lista) lista.push(lanc);
    else indice.set(lanc.data, [lanc]);
  }
  return indice;
}

function datasNaJanela(data: string, toleranciaDias: number): string[] {
  const datas: string[] = [];
  for (let deslocamento = -toleranciaDias; deslocamento <= toleranciaDias; deslocamento += 1) {
    datas.push(somarDias(data, deslocamento));
  }
  return datas;
}

function pontuar(
  mov: MovimentoBanco,
  lanc: LancamentoOmie,
  diferencaCentavos: number,
  distanciaDias: number,
  regras: RegrasConciliacao,
): number {
  const diferencaAbs = Math.abs(diferencaCentavos);

  const scoreValor =
    diferencaAbs === 0 ? 1 : 1 - diferencaAbs / (regras.toleranciaValorCentavos + 1);

  const scoreData =
    distanciaDias === 0 ? 1 : 1 - distanciaDias / (regras.toleranciaDias + 1);

  const scoreTexto = similaridadeTokens(mov.tokens, lanc.tokens);

  const temDocumentoNosDois = Boolean(mov.documento && lanc.documento);
  const documentoBate = temDocumentoNosDois && mov.documento === lanc.documento;

  // Sem documento em algum dos lados, o peso dele e redistribuido entre os
  // outros sinais. Senao um par perfeito sem CPF/CNPJ nunca passaria de 0,80.
  const componentes: Array<{ peso: number; valor: number }> = [
    { peso: PESOS.valor, valor: scoreValor },
    { peso: PESOS.data, valor: scoreData },
    { peso: PESOS.texto, valor: scoreTexto },
  ];
  if (temDocumentoNosDois) {
    componentes.push({ peso: PESOS.documento, valor: documentoBate ? 1 : 0 });
  }

  const pesoTotal = componentes.reduce((soma, c) => soma + c.peso, 0);
  const bruto = componentes.reduce((soma, c) => soma + c.peso * c.valor, 0) / pesoTotal;

  // Dois documentos conhecidos e diferentes e sinal forte de que nao e o mesmo
  // movimento, mesmo com valor e data batendo.
  const score = temDocumentoNosDois && !documentoBate
    ? bruto * PENALIDADE_DOCUMENTO_DIVERGENTE
    : bruto;

  return Math.max(0, Math.min(1, score));
}

/**
 * Atribuicao gulosa: melhor par primeiro, cada lado usado uma unica vez.
 *
 * Sem o "uma unica vez", dois lancamentos de mesmo valor no mesmo dia (parcela
 * duplicada, dois boletos iguais) casariam ambos com a mesma transacao do banco
 * e a conciliacao fecharia com um movimento fantasma.
 */
function atribuirUmParaUm(candidatos: ParCandidato[]): ParCandidato[] {
  const ordenados = [...candidatos].sort(
    (a, b) =>
      b.score - a.score ||
      a.distanciaDias - b.distanciaDias ||
      Math.abs(a.diferencaCentavos) - Math.abs(b.diferencaCentavos) ||
      // Desempate estavel: sem isso o resultado varia entre execucoes iguais.
      a.banco.id.localeCompare(b.banco.id) ||
      a.omie.id.localeCompare(b.omie.id),
  );

  const bancoUsado = new Set<string>();
  const omieUsado = new Set<string>();
  const escolhidos: ParCandidato[] = [];

  for (const par of ordenados) {
    if (bancoUsado.has(par.banco.id) || omieUsado.has(par.omie.id)) continue;
    bancoUsado.add(par.banco.id);
    omieUsado.add(par.omie.id);
    escolhidos.push(par);
  }

  return escolhidos;
}

function motivoPendenteBanco(lanc: LancamentoOmie): string {
  // Uma previsao sem correspondente no banco e o esperado, nao um problema:
  // e uma conta que ainda vai vencer. Reportar como divergencia encheria o
  // relatorio de ruido e esconderia as pendencias de verdade.
  if (lanc.ehPrevisao) {
    return `Lancamento apenas previsto na Omie (situacao "${lanc.situacao}"), ainda nao realizado. Sem correspondente no banco — comportamento esperado.`;
  }

  if (lanc.jaConciliado) {
    return 'Lancamento ja marcado como conciliado na Omie, mas sem transacao correspondente no extrato do periodo.';
  }

  return 'Existe na Omie e nao foi encontrada transacao correspondente no extrato do banco.';
}

function classificarPar(par: ParCandidato, regras: RegrasConciliacao): ItemConciliacao {
  const base = {
    score: par.score,
    banco: par.banco,
    omie: par.omie,
    diferencaCentavos: par.diferencaCentavos,
  };

  // O dinheiro entrou/saiu de fato, mas na Omie o lancamento continua como
  // previsao. Nao e "conciliado": alguem precisa dar baixa no titulo.
  if (par.omie.ehPrevisao) {
    return {
      ...base,
      status: 'REVISAR',
      motivo:
        `A transacao ocorreu no banco, mas na Omie o lancamento ainda esta como ` +
        `"${par.omie.situacao}". Precisa dar baixa no titulo.`,
    };
  }

  if (par.diferencaCentavos !== 0) {
    return {
      ...base,
      status: 'REVISAR',
      motivo:
        `Valores proximos, com diferenca de ${formatarBRL(Math.abs(par.diferencaCentavos))} ` +
        '(possivel tarifa bancaria, juro ou desconto).',
    };
  }

  if (par.score < regras.scoreMinimo) {
    return {
      ...base,
      status: 'REVISAR',
      motivo:
        `Valor exato, mas confianca baixa (${par.score.toFixed(2)}): ` +
        `${par.distanciaDias} dia(s) de diferenca e pouca semelhanca de descricao.`,
    };
  }

  return {
    ...base,
    status: 'CONCILIADO',
    motivo:
      par.distanciaDias === 0
        ? 'Valor e data identicos.'
        : `Valor identico, com ${par.distanciaDias} dia(s) de diferenca na data.`,
  };
}

function resumir(
  itens: ItemConciliacao[],
  totalBanco: number,
  totalOmie: number,
): ResumoConciliacao {
  const contar = (status: string) => itens.filter((i) => i.status === status).length;

  return {
    totalBanco,
    totalOmie,
    conciliados: contar('CONCILIADO'),
    revisar: contar('REVISAR'),
    pendenteOmie: contar('PENDENTE_OMIE'),
    pendenteBanco: contar('PENDENTE_BANCO'),
  };
}

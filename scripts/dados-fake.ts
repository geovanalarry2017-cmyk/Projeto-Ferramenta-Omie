import { paraFormatoOmie, somarDias, type DataISO } from '../src/lib/dates.js';
import type { Categoria, ContaDRE, MovimentoFinanceiro, OrcamentoCategoria } from '../src/omie/types.js';


/**
 * Dados fabricados no formato exato que a Omie devolve, para ver o DRE e o
 * fluxo de caixa funcionando sem depender da conta real — que hoje esta
 * praticamente vazia e nao produz relatorio nenhum.
 *
 * Nada aqui e importado por `src/`. Isto e material de demonstracao: mora em
 * `scripts/` justamente para nao existir caminho pelo qual numero fake chegue
 * ao relatorio de um cliente.
 *
 * Os numeros sao *deterministicos*: a semente sai da propria data, entao o
 * mesmo periodo devolve sempre os mesmos valores. Um demo que muda a cada F5
 * nao serve para conferir conta.
 */

// ---------------------------------------------------------------------------
// Aleatoriedade deterministica
// ---------------------------------------------------------------------------

/** Hash FNV-1a: transforma a data em semente estavel. */
function semente(texto: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

/** mulberry32: gerador pequeno e reproduzivel, suficiente para dado de vitrine. */
function gerador(sementeInicial: number): () => number {
  let estado = sementeInicial;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const inteiro = (rnd: () => number, min: number, max: number): number =>
  min + Math.floor(rnd() * (max - min + 1));

/** Valor em reais com 2 casas, como a Omie devolve. */
const dinheiro = (rnd: () => number, min: number, max: number): number =>
  Math.round((min + rnd() * (max - min)) * 100) / 100;

// ---------------------------------------------------------------------------
// Plano de contas do DRE
// ---------------------------------------------------------------------------

/**
 * Totalizador ("S") nao tem sinal: vale a soma dos filhos. Folha ("N") tem
 * "+" ou "-". E a mesma convencao do plano de contas real da Omie, que o
 * `montarDRE` depende para fechar somando.
 */
function conta(
  codigoDRE: string,
  descricaoDRE: string,
  totalizaDRE: 'S' | 'N',
  sinalDRE = '',
): ContaDRE {
  return {
    codigoDRE,
    descricaoDRE,
    nivelDRE: codigoDRE.split('.').length,
    sinalDRE,
    totalizaDRE,
    naoExibirDRE: 'N',
  };
}

export const CONTAS_DRE: ContaDRE[] = [
  conta('1', 'Lucro Bruto', 'S'),
  conta('1.01', 'Receita Líquida Operacional', 'S'),
  conta('1.01.01', 'Receita de Vendas e Serviços', 'N', '+'),
  conta('1.01.02', 'Impostos sobre Vendas', 'N', '-'),
  conta('1.01.03', 'Devoluções e Abatimentos', 'N', '-'),
  conta('1.02', 'Receita Indireta', 'S'),
  conta('1.02.01', 'Receitas Financeiras', 'N', '+'),
  conta('1.03', 'Custos', 'S'),
  conta('1.03.01', 'Custo dos Serviços Prestados', 'N', '-'),
  conta('1.03.02', 'Custo das Mercadorias Vendidas', 'N', '-'),

  conta('2', 'Despesas Operacionais', 'S'),
  conta('2.01', 'Despesas Fixas', 'S'),
  conta('2.01.01', 'Aluguel e Condomínio', 'N', '-'),
  conta('2.01.02', 'Folha de Pagamento', 'N', '-'),
  conta('2.01.03', 'Serviços de Terceiros', 'N', '-'),
  conta('2.02', 'Despesas Variáveis', 'S'),
  conta('2.02.01', 'Marketing e Publicidade', 'N', '-'),
  conta('2.02.02', 'Tarifas Bancárias', 'N', '-'),
  conta('2.02.03', 'Viagens e Deslocamento', 'N', '-'),
  conta('2.03', 'Despesas Financeiras', 'S'),
  conta('2.03.01', 'Juros e Multas', 'N', '-'),

  conta('3', 'Investimentos', 'S'),
  conta('3.01', 'Imobilizado', 'S'),
  conta('3.01.01', 'Máquinas e Equipamentos', 'N', '-'),
];

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

interface PerfilCategoria {
  codigo: string;
  descricao: string;
  /** Conta do DRE. Ausente = categoria sem vinculo, que cai fora do relatorio. */
  codigoDRE?: string;
  /** "R" = entra dinheiro, "P" = sai. */
  natureza: 'R' | 'P';
  valorMin: number;
  valorMax: number;
  /** Peso na sorteio do dia; 0 = so aparece como despesa mensal fixa. */
  peso: number;
  /** Dia do mes em que a despesa recorrente e lancada. */
  diaFixo?: number;
}

/**
 * ATENCAO ao ler esta tabela: os codigos das categorias sao *diferentes* dos
 * codigos do DRE de proposito, replicando a armadilha da conta real — a
 * categoria "1.01.02" e receita de servicos, e o DRE "1.01.02" e a linha de
 * Impostos, que subtrai. Se o dashboard mostrar receita caindo em imposto, o
 * vinculo esta sendo feito pelo codigo errado.
 *
 * As tres ultimas nao tem `codigoDRE`: sao o que alimenta o painel
 * "Movimentos fora do DRE". Toda conta real tem categorias assim.
 */
const PERFIS: PerfilCategoria[] = [
  { codigo: '1.01.01', descricao: 'Clientes - Venda de Produtos', codigoDRE: '1.01.01', natureza: 'R', valorMin: 800, valorMax: 24_000, peso: 10 },
  { codigo: '1.01.02', descricao: 'Clientes - Serviços Prestados', codigoDRE: '1.01.01', natureza: 'R', valorMin: 1_500, valorMax: 38_000, peso: 8 },
  { codigo: '1.01.05', descricao: 'Impostos sobre Faturamento', codigoDRE: '1.01.02', natureza: 'P', valorMin: 400, valorMax: 5_200, peso: 4 },
  { codigo: '1.01.07', descricao: 'Devolução de Venda', codigoDRE: '1.01.03', natureza: 'P', valorMin: 200, valorMax: 3_000, peso: 1 },
  { codigo: '1.04.01', descricao: 'Rendimento de Aplicação', codigoDRE: '1.02.01', natureza: 'R', valorMin: 120, valorMax: 2_600, peso: 2 },

  { codigo: '2.01.01', descricao: 'Mão de Obra Direta', codigoDRE: '1.03.01', natureza: 'P', valorMin: 900, valorMax: 11_000, peso: 5 },
  { codigo: '2.01.04', descricao: 'Compra de Mercadoria para Revenda', codigoDRE: '1.03.02', natureza: 'P', valorMin: 1_200, valorMax: 16_000, peso: 5 },

  { codigo: '3.02.01', descricao: 'Aluguel do Escritório', codigoDRE: '2.01.01', natureza: 'P', valorMin: 7_400, valorMax: 7_400, peso: 0, diaFixo: 5 },
  { codigo: '3.02.03', descricao: 'Salários e Encargos', codigoDRE: '2.01.02', natureza: 'P', valorMin: 41_000, valorMax: 46_000, peso: 0, diaFixo: 5 },
  { codigo: '3.02.06', descricao: 'Honorários Contábeis', codigoDRE: '2.01.03', natureza: 'P', valorMin: 2_300, valorMax: 2_300, peso: 0, diaFixo: 10 },
  { codigo: '3.03.02', descricao: 'Anúncios e Mídia Paga', codigoDRE: '2.02.01', natureza: 'P', valorMin: 300, valorMax: 6_800, peso: 4 },
  { codigo: '3.03.05', descricao: 'Tarifas Bancárias', codigoDRE: '2.02.02', natureza: 'P', valorMin: 12, valorMax: 190, peso: 6 },
  { codigo: '3.03.09', descricao: 'Passagens e Hospedagem', codigoDRE: '2.02.03', natureza: 'P', valorMin: 350, valorMax: 4_100, peso: 2 },
  { codigo: '3.05.01', descricao: 'Juros de Empréstimo', codigoDRE: '2.03.01', natureza: 'P', valorMin: 600, valorMax: 3_900, peso: 1 },
  { codigo: '4.01.02', descricao: 'Compra de Equipamento', codigoDRE: '3.01.01', natureza: 'P', valorMin: 1_800, valorMax: 22_000, peso: 1 },

  { codigo: '9.01.01', descricao: 'Transferência entre Contas', natureza: 'P', valorMin: 2_000, valorMax: 30_000, peso: 2 },
  { codigo: '9.02.01', descricao: 'Adiantamento a Fornecedor', natureza: 'P', valorMin: 500, valorMax: 7_000, peso: 1 },
  { codigo: '9.04.03', descricao: 'Reembolso de Despesa', natureza: 'P', valorMin: 80, valorMax: 1_400, peso: 1 },
];

export const CATEGORIAS: Categoria[] = PERFIS.map((p) => ({
  codigo: p.codigo,
  descricao: p.descricao,
  descricao_padrao: p.descricao,
  ...(p.codigoDRE ? { codigo_dre: p.codigoDRE } : {}),
  conta_inativa: 'N',
  totalizadora: 'N',
  nao_exibir: 'N',
}));

/** Roleta ponderada sobre as categorias do dia a dia. */
const SORTEAVEIS = PERFIS.filter((p) => p.peso > 0);

/**
 * `natureza` restringe o sorteio a categorias da mesma direcao. E o que se usa
 * no rateio: uma nota de venda pode se dividir entre duas receitas, nunca entre
 * uma receita e uma tarifa bancaria. Sem essa trava o fake produzia titulo que
 * entra no caixa como entrada e sai no DRE como despesa — divergencia que nao
 * existe na Omie e que so daria trabalho de investigar a toa.
 */
function sortearPerfil(rnd: () => number, natureza?: 'R' | 'P'): PerfilCategoria {
  const candidatos = natureza ? SORTEAVEIS.filter((p) => p.natureza === natureza) : SORTEAVEIS;
  const peso = candidatos.reduce((s, p) => s + p.peso, 0);

  let alvo = rnd() * peso;
  for (const perfil of candidatos) {
    alvo -= perfil.peso;
    if (alvo <= 0) return perfil;
  }
  return candidatos[candidatos.length - 1]!;
}

// ---------------------------------------------------------------------------
// Movimentos
// ---------------------------------------------------------------------------

/**
 * Quanto o universo se estende alem do periodo pedido. Um titulo emitido em
 * marco e pago em abril tem que aparecer no caixa de abril; sem a margem, ele
 * sumiria e o fluxo de caixa comecaria o mes vazio.
 */
const MARGEM_DIAS = 75;

function diaDaSemana(data: DataISO): number {
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}

function criarMovimento(
  rnd: () => number,
  emissao: DataISO,
  perfil: PerfilCategoria,
  codigo: number,
): MovimentoFinanceiro {
  const valorTitulo = dinheiro(rnd, perfil.valorMin, perfil.valorMax);

  // Folha e aluguel saem no proprio dia e por inteiro. E o que produz o degrau
  // no grafico de fluxo de caixa — sem isso a curva vira ruido uniforme e nao
  // da para ver se o grafico esta lendo as datas certas.
  const recorrente = perfil.diaFixo !== undefined;

  // 12% dos demais titulos ficam em aberto: aparecem na competencia e nao no
  // caixa. E a diferenca entre os dois regimes ficando visivel na tela.
  const pago = recorrente || rnd() > 0.12;
  const prazo = recorrente
    ? 0
    : perfil.natureza === 'R'
      ? inteiro(rnd, 0, 42)
      : inteiro(rnd, 0, 20);
  const pagamento = pago ? somarDias(emissao, prazo) : undefined;

  // 8% pagos parcialmente — o caso que o README usa de exemplo.
  const valorPago = pago
    ? !recorrente && rnd() < 0.08
      ? Math.round(valorTitulo * 0.4 * 100) / 100
      : valorTitulo
    : 0;

  // 12% dos titulos sao rateados entre duas categorias.
  const rateado = rnd() < 0.12;
  const segundo = rateado ? sortearPerfil(rnd, perfil.natureza) : undefined;
  const fatia = rateado ? Math.round(valorTitulo * 0.35 * 100) / 100 : 0;

  return {
    detalhes: {
      nCodTitulo: codigo,
      cNumTitulo: String(codigo),
      dDtEmissao: paraFormatoOmie(emissao),
      dDtVenc: paraFormatoOmie(somarDias(emissao, 30)),
      ...(pagamento ? { dDtPagamento: paraFormatoOmie(pagamento) } : {}),
      cNatureza: perfil.natureza,
      cStatus: pago ? 'LIQUIDADO' : 'A_VENCER',
      cCodCateg: perfil.codigo,
      nValorTitulo: valorTitulo,
      nCodCC: 1,
    },
    resumo: {
      nValPago: valorPago,
      nValAberto: Math.round((valorTitulo - valorPago) * 100) / 100,
      cLiquidado: pago ? 'S' : 'N',
    },
    ...(segundo
      ? {
          categorias: [
            { cCodCateg: perfil.codigo, nDistrValor: Math.round((valorTitulo - fatia) * 100) / 100 },
            { cCodCateg: segundo.codigo, nDistrValor: fatia },
          ],
        }
      : {}),
  };
}

/** Todos os titulos emitidos num dia. Estavel: mesma data, mesmo resultado. */
function movimentosDoDia(data: DataISO): MovimentoFinanceiro[] {
  const rnd = gerador(semente(`omie-demo:${data}`));
  const movimentos: MovimentoFinanceiro[] = [];
  const diaDoMes = Number(data.slice(8));
  const fimDeSemana = diaDaSemana(data) % 6 === 0;

  // Despesas recorrentes primeiro: sao elas que dao forma ao fluxo de caixa.
  for (const perfil of PERFIS) {
    if (perfil.diaFixo === diaDoMes) {
      movimentos.push(
        criarMovimento(rnd, data, perfil, semente(`${data}:${perfil.codigo}`) % 900_000),
      );
    }
  }

  const quantidade = fimDeSemana ? inteiro(rnd, 0, 1) : inteiro(rnd, 2, 7);
  for (let i = 0; i < quantidade; i += 1) {
    movimentos.push(
      criarMovimento(rnd, data, sortearPerfil(rnd), semente(`${data}:${i}`) % 900_000),
    );
  }

  return movimentos;
}

/**
 * Faz o papel de `listarMovimentos` da Omie, incluindo o filtro de data feito
 * no servidor: por data de pagamento no regime de caixa, por data de emissao
 * na competencia. Filtrar do mesmo jeito importa — se o fake devolvesse o
 * periodo inteiro, o `montarDRE` acusaria "movimentos fora do periodo" e o
 * diagnostico da tela mentiria.
 */
export function listarMovimentosFake(
  de: DataISO,
  ate: DataISO,
  porPagamento: boolean,
): MovimentoFinanceiro[] {
  const inicio = somarDias(de, -MARGEM_DIAS);
  const fim = somarDias(ate, MARGEM_DIAS);
  const encontrados: MovimentoFinanceiro[] = [];

  for (let dia = inicio; dia <= fim; dia = somarDias(dia, 1)) {
    for (const movimento of movimentosDoDia(dia)) {
      const bruta = porPagamento
        ? movimento.detalhes?.dDtPagamento
        : movimento.detalhes?.dDtEmissao;
      if (!bruta) continue;

      // dDt* vem em DD/MM/AAAA; compara na forma ISO.
      const data = `${bruta.slice(6)}-${bruta.slice(3, 5)}-${bruta.slice(0, 2)}`;
      if (data >= de && data <= ate) encontrados.push(movimento);
    }
  }

  return encontrados;
}

// ---------------------------------------------------------------------------
// Orcamento de caixa (Previsto x Realizado)
// ---------------------------------------------------------------------------

/**
 * Faz o papel de `listarOrcamento` da Omie: uma linha por categoria do dia a
 * dia (as mesmas que entram no sorteio de movimentos — categoria sem
 * movimento tambem nao costuma ter orcamento cadastrado). Deterministico por
 * mes: o mesmo ano/mes sempre devolve os mesmos numeros.
 */
export function listarOrcamentoFake(ano: number, mes: number): OrcamentoCategoria[] {
  const rnd = gerador(semente(`orcamento-demo:${ano}-${mes}`));

  return SORTEAVEIS.map((perfil) => {
    const previsto = dinheiro(rnd, perfil.valorMin, perfil.valorMax);
    // Realizado varia -35%/+35% do previsto: as vezes estoura, as vezes sobra.
    const fator = 0.65 + rnd() * 0.7;
    const realizado = Math.round(previsto * fator * 100) / 100;

    return {
      cCodCateg: perfil.codigo,
      cDesCateg: perfil.descricao,
      nValorPrevisto: previsto,
      nValorRealilzado: realizado,
    };
  });
}

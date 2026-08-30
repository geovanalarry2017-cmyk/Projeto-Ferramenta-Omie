import type { CredenciaisOmie } from '../clientes/types.js';
import { decodificarEntidades } from '../lib/texto.js';
import { chamarOmie, ehRespostaVazia } from './client.js';
import type {
  Categoria,
  ContaDRE,
  ListarCadastroDREResponse,
  ListarCategoriasResponse,
} from './types.js';

/**
 * Cadastros que dao estrutura ao DRE: o plano de contas do DRE e as categorias
 * que os lancamentos usam. Sao dados que mudam raramente, ao contrario dos
 * movimentos.
 */

/** Plano de contas do DRE, com hierarquia e sinal de cada linha. */
export async function listarContasDRE(credenciais: CredenciaisOmie): Promise<ContaDRE[]> {
  try {
    const resposta = await chamarOmie<ListarCadastroDREResponse>(
      credenciais,
      'geral/dre',
      'ListarCadastroDRE',
      { apenasContasAtivas: 'S' },
    );

    return (resposta.dreLista ?? []).map((c) => ({
      ...c,
      descricaoDRE: decodificarEntidades(c.descricaoDRE),
    }));
  } catch (erro) {
    if (ehRespostaVazia(erro)) return [];
    throw erro;
  }
}

/** Todas as categorias, seguindo a paginacao. */
export async function listarCategorias(credenciais: CredenciaisOmie): Promise<Categoria[]> {
  const categorias: Categoria[] = [];
  let pagina = 1;
  let totalDePaginas = 1;

  do {
    let resposta: ListarCategoriasResponse;
    try {
      resposta = await chamarOmie<ListarCategoriasResponse>(
        credenciais,
        'geral/categorias',
        'ListarCategorias',
        { pagina, registros_por_pagina: 100 },
      );
    } catch (erro) {
      if (ehRespostaVazia(erro)) break;
      throw erro;
    }

    for (const c of resposta.categoria_cadastro ?? []) {
      categorias.push({
        ...c,
        // "&lt;Disponivel&gt;" nao pode chegar assim num grafico.
        descricao: decodificarEntidades(c.descricao || c.descricao_padrao),
      });
    }

    totalDePaginas = resposta.total_de_paginas ?? 1;
    pagina += 1;
  } while (pagina <= totalDePaginas);

  return categorias;
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

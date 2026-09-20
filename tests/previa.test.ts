import { beforeAll, describe, expect, it } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import type { DataISO } from '../src/lib/dates.js';
import { montarPrevia } from '../scripts/gerar-previa.js';

/**
 * A previa e o arquivo que vai para a reuniao, aberto com clique duplo e sem
 * servidor. O modo dela de falhar nao e explodir: e montar a tela inteira —
 * cabecalho, cartoes, abas, paineis — com todos os numeros em branco. Conferir
 * o HTML como texto nao pega isso, porque o texto fica certo nos dois casos.
 *
 * Por isso o teste carrega a pagina num DOM e executa os scripts dela, do mesmo
 * jeito que o navegador faria, e depois olha o que ficou escrito na tela.
 */

const DE = '2026-01-01' as DataISO;
const ATE = '2026-08-31' as DataISO;

/**
 * O que falta no jsdom e a pagina usa. Nenhum tem a ver com o que esta sendo
 * testado, e sem eles o script da pagina morre na primeira linha:
 *
 * - `matchMedia`: a pagina pergunta o tema do sistema antes de qualquer outra
 *   coisa. Sem o stub, TypeError e nada mais roda.
 * - `ResizeObserver`: o Chart.js observa o canvas ao criar um grafico.
 *
 * Os graficos em si nao desenham (canvas do jsdom nao tem contexto 2D), e nao
 * e problema: o que se quer saber aqui e se os *dados* chegaram. Se nao
 * chegarem, os cartoes e as tabelas ficam vazios — que e exatamente a falha.
 */
function prepararJanela(janela: DOMWindow): void {
  janela.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;

  janela.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;

  // `Response` e `Headers` sao do Node, nao dublês: e com eles que a previa
  // devolve os dados no lugar do servidor. Um dublê de mentira aqui faria o
  // teste passar com um shim que o navegador rejeitaria.
  janela.Response = globalThis.Response;
  janela.Headers = globalThis.Headers;
}

type DOMWindow = JSDOM['window'];

/** Espera a tela parar de mostrar o marcador de "ainda sem valor". */
async function esperarCarga(doc: Document, id: string): Promise<string> {
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    const texto = doc.getElementById(id)?.textContent?.trim() ?? '';
    if (texto && texto !== '—') return texto;
    await new Promise((pronto) => setTimeout(pronto, 10));
  }
  return doc.getElementById(id)?.textContent?.trim() ?? '';
}

let html: string;
let dom: JSDOM;
let doc: Document;

beforeAll(async () => {
  html = await montarPrevia(DE, ATE);

  // O jsdom nao entende `color-mix()` nem `:has()` e reclama de cada regra; o
  // ruido esconderia um erro de verdade do script da pagina.
  const console = new VirtualConsole();

  dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://previa.local/',
    virtualConsole: console,
    beforeParse: prepararJanela,
  });

  doc = dom.window.document;
  await esperarCarga(doc, 'c-receita');
}, 60_000);

describe('previa estatica', () => {
  it('e um documento completo, com doctype', () => {
    // Sem doctype o Chrome cai em modo quirks e o layout em flex colapsa: a
    // pagina abre em branco no clique duplo.
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(doc.doctype?.name).toBe('html');
    expect(doc.characterSet).toBe('UTF-8');
  });

  it('nao depende de rede: nao sobra referencia a CDN', () => {
    // Wi-fi de sala e proxy corporativo derrubam o CDN justamente na hora da
    // reuniao, e o sintoma seria so os graficos sumirem.
    expect(html).not.toContain('cdnjs.cloudflare.com');
  });

  it('preenche os cartoes do financeiro sozinha, sem clicar em nada', async () => {
    // A falha que este teste existe para pegar: a pagina so busca os dados se
    // houver token preenchido, e o proprio script dela zera o campo. A tela
    // monta inteira e nenhum numero aparece.
    for (const id of ['c-receita', 'c-despesa', 'c-resultado', 'c-caixa', 'c-margem']) {
      const valor = await esperarCarga(doc, id);
      expect(valor, `cartao ${id} ficou vazio`).not.toBe('—');
      expect(valor, `cartao ${id} ficou vazio`).not.toBe('');
    }

    expect(await esperarCarga(doc, 'c-receita')).toMatch(/^R\$/);
  });

  it('monta a tabela do DRE com as linhas das contas', () => {
    const linhas = doc.querySelectorAll('#tabela-dre tbody tr');
    expect(linhas.length).toBeGreaterThan(5);
    expect(doc.getElementById('tabela-dre')?.textContent).toContain('Resultado do período');
  });

  it('nao mostra erro na tela', () => {
    const erro = doc.getElementById('erro');
    // Os graficos nao desenham no jsdom (canvas sem contexto 2D), e a pagina
    // avisa quando isso acontece — esse aviso e do ambiente de teste, nao um
    // defeito da previa.
    const texto = erro?.classList.contains('oculto') ? '' : (erro?.textContent ?? '');
    expect(texto).not.toMatch(/cliente|período|Rota fora da prévia/i);
  });

  it('fixa o periodo e esconde a tela de login', () => {
    const de = doc.getElementById('de') as HTMLInputElement;
    const ate = doc.getElementById('ate') as HTMLInputElement;
    expect(de.value).toBe(DE);
    expect(ate.value).toBe(ATE);
    expect(de.disabled).toBe(true);

    // Sem servidor nao ha sessao de verdade — a previa nunca pode ficar presa
    // atras da tela de login.
    expect(doc.getElementById('tela-login')?.classList.contains('oculto')).toBe(true);
  });

  it('carrega o mapa de oportunidades ao trocar de aba', async () => {
    const aba = doc.querySelector('.aba[data-aba="oportunidades"]') as HTMLButtonElement;
    aba.click();

    expect(doc.getElementById('sec-oportunidades')?.classList.contains('oculto')).toBe(false);

    const emJogo = await esperarCarga(doc, 'o-jogo');
    expect(emJogo, 'o mapa de oportunidades abriu vazio').toMatch(/^R\$/);
    expect(doc.getElementById('o-lista')?.textContent?.trim()).not.toBe('');
  });
});

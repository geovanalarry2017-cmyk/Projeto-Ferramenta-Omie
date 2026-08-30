/**
 * Interpretacao das mensagens de erro da Omie.
 *
 * Separado do client de proposito: sao funcoes puras de string, sem env nem
 * rede, entao podem ser testadas sem credencial nenhuma.
 */

export function ehFalhaDeConsumo(corpo: string): boolean {
  return /consumo|excedid|limite|bloqueado temporariamente/i.test(corpo);
}

/**
 * A Omie tem dois bloqueios temporarios que chegam como erro de aplicacao, e
 * nao como 429 — ora com HTTP 200 e faultstring, ora com HTTP 500:
 *
 * 1. "Consumo redundante detectado. Aguarde N segundos" — mesma chamada com os
 *    mesmos parametros repetida numa janela curta. Atinge o projeto em cheio:
 *    reprocessar o mesmo periodo e operacao normal aqui (o job diario reexecuta
 *    uma janela de dias, e a calibracao roda o mesmo intervalo varias vezes).
 *
 * 2. "Ja existe uma requisicao desse metodo sendo executada" — trava de
 *    concorrencia por metodo. Acontece tambem quando um processo morre no meio
 *    de uma chamada: a Omie segue considerando a requisicao em andamento por um
 *    tempo, e a proxima execucao esbarra nela.
 *
 * Os dois passam com o tempo, entao valem retentativa — desde que com a espera
 * certa, nao com o backoff generico de um segundo.
 *
 * @returns segundos a esperar, ou null se a falha for de outra natureza.
 */
export function esperaPorBloqueioTemporario(mensagem: string): number | null {
  if (/redundante|REDUNDANT/i.test(mensagem)) {
    // A propria mensagem diz quantos segundos faltam; usar o numero dela evita
    // tanto esperar demais quanto voltar cedo e levar o bloqueio de novo.
    const m = /aguarde\s+(\d+)\s*segundo/i.exec(mensagem);
    const segundos = m ? Number(m[1]) : 15;
    return (Number.isFinite(segundos) ? segundos : 15) + 1;
  }

  // Esta nao informa quanto esperar; alguns segundos costumam bastar.
  if (/j[aá] existe uma requisi[cç][aã]o desse m[eé]todo/i.test(mensagem)) return 8;

  return null;
}

/**
 * "Nao existem registros" nao e erro: e uma resposta legitima para um dia sem
 * movimento. A Omie sinaliza isso via faultstring, entao precisa ser detectado
 * pelo texto e tratado como lista vazia.
 */
export function ehMensagemDeListaVazia(mensagem: string): boolean {
  return /nao (existem|foram encontrados|ha) registros|nenhum registro/i.test(mensagem);
}

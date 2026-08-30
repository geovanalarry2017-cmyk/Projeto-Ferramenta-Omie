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
 * A Omie bloqueia a repeticao da MESMA chamada com os MESMOS parametros dentro
 * de uma janela curta ("Consumo redundante detectado. Aguarde N segundos"), e
 * manda isso com HTTP 200 + faultstring — nao com 429.
 *
 * Isso atinge o conciliador em cheio: reprocessar o mesmo periodo e operacao
 * normal aqui (o job diario reexecuta uma janela de dias, e a calibracao roda
 * o mesmo intervalo varias vezes seguidas).
 *
 * @returns segundos a esperar, ou null se a falha for de outra natureza.
 */
export function esperaPorConsumoRedundante(mensagem: string): number | null {
  if (!/redundante|REDUNDANT/i.test(mensagem)) return null;

  // A propria mensagem diz quantos segundos faltam; usar o numero dela evita
  // tanto esperar demais quanto voltar cedo e levar o bloqueio de novo.
  const m = /aguarde\s+(\d+)\s*segundo/i.exec(mensagem);
  const segundos = m ? Number(m[1]) : 15;
  return (Number.isFinite(segundos) ? segundos : 15) + 1;
}

/**
 * "Nao existem registros" nao e erro: e uma resposta legitima para um dia sem
 * movimento. A Omie sinaliza isso via faultstring, entao precisa ser detectado
 * pelo texto e tratado como lista vazia.
 */
export function ehMensagemDeListaVazia(mensagem: string): boolean {
  return /nao (existem|foram encontrados|ha) registros|nenhum registro/i.test(mensagem);
}

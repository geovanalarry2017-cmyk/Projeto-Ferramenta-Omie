import { beforeAll, describe, expect, it } from 'vitest';

type CriarLogger = (typeof import('../src/lib/logger.js'))['criarLogger'];

let criarLogger: CriarLogger;

beforeAll(async () => {
  // O logger importa `config/env.js`, que valida o ambiente no boot e mata o
  // processo se faltar algo. Preenche o minimo antes do import (sem sobrepor um
  // .env real, que tambem serve).
  process.env.DATABASE_URL ||= 'postgresql://u:p@localhost/db?sslmode=require';
  process.env.CREDENCIAIS_CHAVE ||= 'a'.repeat(64);
  process.env.API_TOKEN ||= 'token-de-teste';
  process.env.LOG_LEVEL = 'debug';
  ({ criarLogger } = await import('../src/lib/logger.js'));
});

/** Um logger que escreve num array de linhas JSON, para inspecionar a saida. */
function capturar() {
  const linhas: Array<Record<string, unknown>> = [];
  const destino = { write: (linha: string) => void linhas.push(JSON.parse(linha)) };
  return { log: criarLogger(destino), linhas };
}

describe('logger', () => {
  it('apaga descricao de transacao no objeto, mantendo o resto', () => {
    const { log, linhas } = capturar();
    log.info({ banco_descricao: 'PIX DE JOAO DA SILVA', execucaoId: 7 }, 'conciliacao');
    expect(linhas[0]).toMatchObject({
      banco_descricao: '[REDIGIDO]',
      execucaoId: 7,
      msg: 'conciliacao',
    });
  });

  it('mascara PII na mensagem', () => {
    const { log, linhas } = capturar();
    log.warn('titular 123.456.789-09 e-mail joao@x.com');
    expect(linhas[0]!.msg).toBe('titular [REDIGIDO:CPF] e-mail [REDIGIDO:EMAIL]');
  });

  it('mascara PII em parametro aninhado de chamada externa', () => {
    const { log, linhas } = capturar();
    log.debug({ recurso: 'clientes', param: { cnpj: '12.345.678/0001-90' } }, 'chamando Omie');
    expect(linhas[0]).toMatchObject({ param: { cnpj: '[REDIGIDO:CNPJ]' } });
  });

  it('mantem a censura de credencial por caminho conhecido', () => {
    const { log, linhas } = capturar();
    log.info({ clientSecret: 'super-secreto', app_key: 'abc' }, 'x');
    expect(linhas[0]).toMatchObject({ clientSecret: '[oculto]', app_key: '[oculto]' });
  });

  it('nao altera contadores e slug', () => {
    const { log, linhas } = capturar();
    log.info({ cliente: 'acme', conciliados: 12, revisar: 3 }, 'concluida');
    expect(linhas[0]).toMatchObject({ cliente: 'acme', conciliados: 12, revisar: 3 });
  });
});

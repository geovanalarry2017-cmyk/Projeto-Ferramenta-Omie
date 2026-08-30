import { cp, mkdir } from 'node:fs/promises';

/**
 * O tsc so compila .ts — os .sql das migrations ficariam de fora do dist/
 * e o `npm start` quebraria em producao ao nao achar a pasta migrations.
 */
await mkdir('dist/db/migrations', { recursive: true });
await cp('src/db/migrations', 'dist/db/migrations', { recursive: true });

console.log('assets copiados para dist/');

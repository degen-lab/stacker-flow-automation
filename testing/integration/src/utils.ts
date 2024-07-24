import { timeout } from '@hirosystems/api-toolkit';
import { exec } from 'child_process';
import { existsSync, renameSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { ENV } from './env';

const x = promisify(exec);

export function withRetry<T, A extends any[]>(
  maxRetries: number,
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  return async function retryWrapper(...args: A): Promise<T> {
    let attempts = 0;
    while (true) {
      try {
        return await fn(...args);
      } catch (err: any) {
        if (err.status !== 502 && attempts >= maxRetries) throw err; // ignore Bad Gateway errors
        await timeout(ENV.RETRY_INTERVAL);
        attempts++;
      }
    }
  };
}

export function withTimeout<T, A extends any[]>(
  timeoutMs: number,
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  return async function timeoutWrapper(...args: A): Promise<T> {
    let handle = undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      handle = setTimeout(() => reject('Timeout'), timeoutMs);
    });

    try {
      return await Promise.race([timeoutPromise, fn(...args)]);
    } finally {
      if (handle) clearTimeout(handle);
    }
  };
}

export async function storeEventsTsv(suffix: string = '') {
  let testname = expect.getState().currentTestName ?? '';
  testname = testname
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .replace(/\W+/g, '-');
  const filename = `${testname}${suffix ? `-${suffix}` : ''}.tsv`;
  const filepath = join(process.cwd(), filename);

  if (existsSync(filepath)) {
    // Backup if exists
    const datetime = new Date().toISOString().replace(/\D/g, '').slice(0, 15);
    const backupPath = join(process.cwd(), `${filename}.${datetime}.bak`);
    renameSync(filepath, backupPath);
  }

  const out = await x(
    `docker exec stacks-regtest-env-postgres-1 psql \
      -U postgres stacks_blockchain_api -c \
      "COPY (SELECT id, receive_timestamp, event_path, payload FROM event_observer_requests ORDER BY id ASC) TO STDOUT ENCODING 'UTF8'" > \
      ${filename}`
  );
  if (out.stderr) throw new Error(out.stderr);
  return out.stdout;
}

export async function startRegtestEnv() {
  console.log('starting regtest-env...');
  const out = await x(ENV.REGTEST_UP_CMD);
  // if (out.stderr) throw new Error(out.stderr);
  return out.stdout;
}

export async function stopRegtestEnv() {
  console.log('stopping regtest-env...');
  const out = await x(ENV.REGTEST_DOWN_CMD);
  // if (out.stderr) throw new Error(out.stderr);
  return out.stdout;
}

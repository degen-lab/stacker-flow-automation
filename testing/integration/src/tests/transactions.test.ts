import { makeContractDeploy, makeSTXTokenTransfer } from '@stacks/transactions';
import { ENV } from '../env';
import {
  broadcastAndWaitForTransaction,
  getNextNonce,
  stacksNetwork,
  waitForNextNonce,
} from '../helpers';
import { StacksNetwork } from '@stacks/network';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Stacks transactions', () => {
  let network: StacksNetwork;
  let nextNonce: number;

  beforeAll(() => {
    network = stacksNetwork();
  });

  beforeEach(async () => {
    nextNonce = await getNextNonce();
  });

  afterEach(async () => {
    await waitForNextNonce(nextNonce);
  });

  test('STX transfer', async () => {
    const tx = await makeSTXTokenTransfer({
      network,
      nonce: nextNonce,
      recipient: ENV.RECEIVER_STX_ADDRESS,
      amount: 10_000,
      anchorMode: 'any',
      senderKey: ENV.SENDER_KEY,
    });
    const result = await broadcastAndWaitForTransaction(tx, network);
    expect(result.tx_status).toBe('success');
  });

  test('Contract deploy', async () => {
    const codeBody = fs.readFileSync(path.join(__dirname, '../contracts/counter.clar'), 'utf-8');
    const tx = await makeContractDeploy({
      network,
      nonce: nextNonce,
      contractName: `counter-${crypto.randomBytes(3).toString('hex')}`,
      codeBody,
      anchorMode: 'any',
      senderKey: ENV.SENDER_KEY,
    });
    const result = await broadcastAndWaitForTransaction(tx, network);
    expect(result.tx_status).toBe('success');
  });

  test('FT contract deploy', async () => {
    const codeBody = fs.readFileSync(
      path.join(__dirname, '../contracts/fungible-token.clar'),
      'utf-8'
    );
    const tx = await makeContractDeploy({
      network,
      nonce: nextNonce,
      contractName: `test-ft-${crypto.randomBytes(3).toString('hex')}`,
      codeBody,
      anchorMode: 'any',
      senderKey: ENV.SENDER_KEY,
    });
    const result = await broadcastAndWaitForTransaction(tx, network);
    expect(result.tx_status).toBe('success');
  });
});

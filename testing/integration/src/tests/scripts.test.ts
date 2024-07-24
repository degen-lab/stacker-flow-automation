import { StacksDevnet } from '@stacks/network';
import { StackingClient } from '@stacks/stacking';
import { ENV } from '../env';
import { getAccount, getRewardSlots, getTransactions } from '../helpers';

test('get account status', async () => {
  const steph = getAccount(ENV.REGTEST_KEYS[0]);
  const client = new StackingClient(steph.address, new StacksDevnet());
  const status = await client.getStatus();
  console.log(status);
  console.log((await client.getPoxInfo()).current_burnchain_block_height);
});

test('get account', () => {
  const steph = getAccount(ENV.REGTEST_KEYS[0]);
  console.log(steph);
});

test('get signer', () => {
  const signer = getAccount(ENV.SIGNER_KEY);
  console.log(signer);
});

test('get reward slot', async () => {
  const steph = getAccount(ENV.REGTEST_KEYS[0]);
  const rewards = await getRewardSlots(steph.btcAddress);
  console.log(rewards[0]);
});

test('get transactions', async () => {
  const steph = getAccount(ENV.REGTEST_KEYS[0]);
  const txs = await getTransactions(steph.address);
  console.log(txs);
});

test('get env info', () => {
  console.log(typeof ENV.REGTEST_SKIP_UNLOCK);
});

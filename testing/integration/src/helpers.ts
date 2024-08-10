import { logger, timeout, waiter } from '@hirosystems/api-toolkit';
import { NETWORK, TEST_NETWORK, getAddress } from '@scure/btc-signer';
import {
  AccountsApi,
  Configuration,
  InfoApi,
  StackingRewardsApi,
  StacksApiSocketClient,
  TransactionsApi,
} from '@stacks/blockchain-api-client';
import { TransactionVersion, bytesToHex, hexToBytes } from '@stacks/common';
import { StacksMainnet, StacksNetwork, StacksTestnet } from '@stacks/network';
import { PoxInfo, StackingClient } from '@stacks/stacking';
import { Transaction } from '@stacks/stacks-blockchain-api-types';
import {
  StacksTransaction,
  broadcastTransaction,
  createStacksPrivateKey,
  getAddressFromPrivateKey,
  getPublicKey,
} from '@stacks/transactions';
import { ENV } from './env';
import { withRetry, withTimeout } from './utils';

export function newSocketClient(): StacksApiSocketClient {
  return new StacksApiSocketClient({
    url: ENV.STACKS_API,
    socketOpts: { reconnection: false },
  });
}

export function stacksNetwork(): StacksNetwork {
  const url = ENV.STACKS_NODE;
  switch (ENV.STACKS_CHAIN) {
    case 'mainnet':
      return new StacksMainnet({ url });
    case 'testnet':
      return new StacksTestnet({ url });
  }
}

export function stacksNetworkApi(): StacksNetwork {
  const url = ENV.STACKS_API;
  switch (ENV.STACKS_CHAIN) {
    case 'mainnet':
      return new StacksMainnet({ url });
    case 'testnet':
      return new StacksTestnet({ url });
  }
}

export function burnHeightToRewardCycle(burnHeight: number, poxInfo: PoxInfo): number {
  // BASED ON pox-4.clar
  // (/ (- height (var-get first-burnchain-block-height)) (var-get pox-reward-cycle-length)))
  return Math.floor(
    (burnHeight - poxInfo.first_burnchain_block_height) / poxInfo.reward_cycle_length
  );
}

export function rewardCycleToBurnHeight(cycle: number, poxInfo: PoxInfo): number {
  // BASED ON pox-4.clar
  // (+ (var-get first-burnchain-block-height) (* cycle (var-get pox-reward-cycle-length))))
  return poxInfo.first_burnchain_block_height + cycle * poxInfo.reward_cycle_length;
}

// There's two ways of determining if a block is in the prepare phase:
// - the "normal" prepare phase; based on phase lengths the last X(-1) blocks of the
//   cycle (preparing the next)
// - the "blockchain" way; instead shifts this to the right by one; X-1 blocks
//   of the cycle and the 0 index block of the next cycle are sort of part of
//   the prepare phase

export function isInPreparePhase(blockHeight: number, poxInfo: PoxInfo): boolean {
  // BASED ON regtest-env
  // const effectiveHeight = blockHeight - poxInfo.first_burnchain_block_height;
  // return (
  //   poxInfo.reward_cycle_length - (effectiveHeight % poxInfo.reward_cycle_length) <
  //   poxInfo.prepare_phase_block_length
  // );

  // BASED ON stacks-core
  if (blockHeight <= poxInfo.first_burnchain_block_height) return false;
  const effectiveHeight = blockHeight - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  return pos > poxInfo.reward_cycle_length - poxInfo.prepare_phase_block_length; //  equivalent to the regtest-env way
  // return pos === 0 || pos > poxInfo.reward_cycle_length - poxInfo.prepare_phase_block_length;
}

export async function getNextNonce(fromStacksNode: boolean = true): Promise<number> {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new AccountsApi(config);
  if (fromStacksNode) {
    const result = await api.getAccountInfo({ principal: ENV.SENDER_STX_ADDRESS });
    return result.nonce;
  } else {
    const result = await api.getAccountNonces({ principal: ENV.SENDER_STX_ADDRESS });
    return result.possible_next_nonce;
  }
}

export async function getRewards(btcAddress: string) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new StackingRewardsApi(config);
  return (await api.getBurnchainRewardListByAddress({ address: btcAddress })).results;
}

export async function getRewardSlots(btcAddress: string) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new StackingRewardsApi(config);
  return (await api.getBurnchainRewardSlotHoldersByAddress({ address: btcAddress })).results;
}

export const getBurnBlockHeight = withRetry(3, async () => {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new InfoApi(config);
  const result = await api.getCoreApiInfo();
  return result.burn_block_height;
});

export async function getTransaction(txid: string) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new TransactionsApi(config);
  try {
    return (await api.getTransactionById({ txId: txid })) as Transaction;
  } catch (error) {
    return null;
  }
}

export async function getTransactions(address: string) {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new AccountsApi(config);
  try {
    return await api.getAccountTransactions({ principal: address });
  } catch (error) {
    return null;
  }
}

export async function getPox4Events() {
  const basePath = ENV.STACKS_API;
  return fetch(`${basePath}/extended/v1/pox4/events`).then(
    res =>
      res.json() as Promise<{
        results: {
          block_height: number;
          tx_id: string;
          tx_index: number;
          event_index: number;
          stacker: string;
          locked: string;
          balance: string;
          burnchain_unlock_height: string;
          pox_addr: string;
          pox_addr_raw: string;
          name: string;
          data: {
            lock_amount: string;
            lock_period: string;
            start_burn_height: string;
            unlock_burn_height: string;
            signer_key: string;
            end_cycle_id: string;
            start_cycle_id: string;
          };
        }[];
      }>
  );
}

export function getAccount(key: string) {
  const network = stacksNetworkApi();
  const address = getAddressFromPrivateKey(
    key,
    network.isMainnet() ? TransactionVersion.Mainnet : TransactionVersion.Testnet
  );
  return {
    key,
    address,
    signerPrivateKey: createStacksPrivateKey(key), // don't do this in production
    signerPublicKey: bytesToHex(getPublicKey(createStacksPrivateKey(key)).data),
    btcAddress: getAddress(
      'pkh',
      hexToBytes(key).slice(0, 32),
      network.isMainnet() ? NETWORK : TEST_NETWORK
    ) as string,
    client: new StackingClient(address, network),
  };
}

async function getInfoStatus() {
  const config = new Configuration({
    basePath: ENV.STACKS_API,
  });
  const api = new InfoApi(config);
  return await Promise.race([
    api.getStatus(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ENV.RETRY_INTERVAL)),
  ]);
}

export async function waitForNode() {
  console.log('waiting for node...');
  await withRetry(1_000, getInfoStatus)();
}

export async function waitForNextCycle(poxInfo: PoxInfo) {
  return await waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + poxInfo.next_reward_cycle_in
  );
}

/** Wait until we're in the neglected part of the prepare phase */
export async function waitForPreparePhase(poxInfo: PoxInfo, diff: number = 0) {
  if (isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)) return;

  const effectiveHeight =
    (poxInfo.current_burnchain_block_height as number) - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  const blocksUntilPreparePhase = poxInfo.reward_phase_block_length - pos + 1;
  return waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + blocksUntilPreparePhase + diff
  );
}

export async function waitForRewardPhase(poxInfo: PoxInfo) {
  if (!isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)) return;

  const effectiveHeight =
    (poxInfo.current_burnchain_block_height as number) - poxInfo.first_burnchain_block_height;
  const pos = effectiveHeight % poxInfo.reward_cycle_length;
  const blocksUntilRewardPhase = poxInfo.reward_cycle_length - pos;
  return waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) + blocksUntilRewardPhase
  );
}

export async function waitForCycle(poxInfo: PoxInfo, cycle: number) {
  const currentCycle = poxInfo.current_cycle.id;
  const fullCycles = cycle - currentCycle - 1;
  if (fullCycles < 0) return;

  return await waitForBurnBlockHeight(
    (poxInfo.current_burnchain_block_height as number) +
      poxInfo.next_reward_cycle_in +
      fullCycles * poxInfo.reward_cycle_length
  );
}

/**
 * Waits until the Stacks node reports the next nonce for the sender STX address.
 * @param currentNonce - Current nonce
 * @param interval - How often to poll the node
 */
export async function waitForNextNonce(
  currentNonce: number,
  interval: number = ENV.POLL_INTERVAL
): Promise<void> {
  let next: number = currentNonce;
  while (next != currentNonce + 1) {
    await timeout(interval);
    next = await getNextNonce();
  }
}

/** Waits until the burn block height is reached */
export async function waitForBurnBlockHeight(
  burnBlockHeight: number,
  interval: number = ENV.POLL_INTERVAL
): Promise<void> {
  let height: number = -1;
  let lastHeight = -1;
  while (height < burnBlockHeight) {
    await timeout(interval);
    height = await getBurnBlockHeight();
    if (height != lastHeight) {
      lastHeight = height;
      console.log('waiting', height, '<', burnBlockHeight);
    }
  }
}

export async function broadcastAndWaitForTransaction(
  tx: StacksTransaction,
  network: StacksNetwork
): Promise<Transaction> {
  const socketClient = newSocketClient();
  const txWaiter = waiter<Transaction>();

  const broadcast = await broadcastTransaction(tx, network);
  logger.debug(`Broadcast: 0x${broadcast.txid}`);

  if (broadcast.error) {
    logger.error(broadcast.error);
    if (broadcast.reason) logger.error(broadcast.reason);
    if (broadcast.reason_data) logger.error(broadcast.reason_data);
    throw 'broadcast failed';
  }

  const subscription = socketClient.subscribeTransaction(`0x${broadcast.txid}`, tx => {
    if ('block_hash' in tx) {
      logger.debug(`Confirmed: 0x${broadcast.txid}`);
      txWaiter.finish(tx);
    } else if (tx.tx_status == 'pending') {
      logger.debug(`Mempool: 0x${broadcast.txid}`);
    }
  });
  const result = await txWaiter;

  subscription.unsubscribe();
  socketClient.socket.close();
  return result;
}

export const waitForTransaction = withTimeout(
  ENV.STACKS_TX_TIMEOUT,
  async (txid: string): Promise<Transaction> => {
    const socketClient = newSocketClient();
    const txWaiter = waiter<Transaction>();

    const subscription = socketClient.subscribeTransaction(`0x${txid}`, tx => {
      if ('block_hash' in tx) {
        logger.debug(`Confirmed: 0x${txid}`);
        txWaiter.finish(tx);
      } else if (tx.tx_status == 'pending') {
        logger.debug(`Mempool: 0x${txid}`);
      }
    });
    // const tx = await getTransaction(txid);
    // const result = tx?.tx_status === 'success' ? tx : await txWaiter;

    try {
      return await txWaiter;
    } finally {
      subscription.unsubscribe();
      socketClient.socket.close();
    }
  }
);

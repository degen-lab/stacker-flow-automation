import { timeout } from '@hirosystems/api-toolkit';
import { bytesToHex } from '@stacks/common';
import { StacksDevnet } from '@stacks/network';
import { PoxInfo, StackingClient, poxAddressToTuple } from '@stacks/stacking';
import {
  Cl,
  ClarityType,
  ResponseOkCV,
  SignedContractCallOptions,
  UIntCV,
  broadcastTransaction,
  callReadOnlyFunction,
  getNonce,
  makeContractCall,
} from '@stacks/transactions';
import * as crypto from 'crypto';
import { ENV } from '../env';
import {
  broadcastAndWaitForTransaction,
  burnHeightToRewardCycle,
  getAccount,
  getPox4Events,
  getRewards,
  isInPreparePhase,
  waitForBurnBlockHeight,
  waitForNextCycle,
  waitForNode,
  waitForPreparePhase,
  waitForRewardPhase,
  waitForTransaction,
} from '../helpers';
import { startRegtestEnv, stopRegtestEnv, storeEventsTsv, withRetry } from '../utils';

jest.setTimeout(1_000_000_000);

describe('regtest-env pox-4', () => {
  const network = new StacksDevnet({ fetchFn: withRetry(3, fetch) }); // this test only works on regtest-env
  let poxInfo: PoxInfo;

  beforeEach(async () => {
    await startRegtestEnv();
    await waitForNode();
  });

  afterEach(async () => {
    await stopRegtestEnv();
  });

  test('stack-stx (in reward-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    const currentCycle = poxInfo.reward_cycle_id;
    const nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
    const authId = crypto.randomBytes(1)[0];
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    await timeout(1000); // current-cycle: 5
    await storeEventsTsv('S1'); // snapshot 1 (stacking tx was successful)

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    const datas = results
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    let info = await client.getStatus();
    if (!info.stacked) throw 'not stacked';

    expect(info.details.unlock_height).toBeGreaterThan(0);
    expect(info.details.unlock_height).toBe(
      stackHeight -
        (stackHeight % poxInfo.reward_cycle_length) +
        poxInfo.reward_cycle_length * (lockPeriod + 1)
    );
    expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(
      nextCycle + lockPeriod
    ); // same as end_cycle_id

    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    // height: 116
    await storeEventsTsv('S2'); // snapshot 2 (in prepare phase, pox-anchor block was mined, pox-set has been sent for cycle 6)

    await waitForNextCycle(poxInfo);
    poxInfo = await client.getPoxInfo();

    // height: 120, current-cycle: 6
    await storeEventsTsv('S3'); // snapshot 3 (steph is stacked in the current cycle)

    if (ENV.REGTEST_SKIP_UNLOCK) return;
    await waitForBurnBlockHeight(info.details.unlock_height + 2);
    info = await client.getStatus();
    expect(info.stacked).toBeFalsy();

    // ENSURE REWARDS
    const reward = (await getRewards(steph.btcAddress))[0];
    expect(reward).toBeDefined();
    expect(reward.burn_block_height).toBeGreaterThan(stackHeight);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (before prepare-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks on a prepare-phase start (not deep in
    // the prepare phase)
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo); // ensure we are not already somewhere in the prepare phase
    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo, -1); // one before real prepare phase

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();
    expect(
      isInPreparePhase((poxInfo.current_burnchain_block_height as number) + 1, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    const currentCycle = poxInfo.reward_cycle_id;
    const nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
    const authId = crypto.randomBytes(1)[0];
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    const datas = results
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    // todo: this is incorrect on the stacks-node side currently, it shouldn't have the prepare offset included yet
    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    let info = await client.getStatus();
    if (!info.stacked) throw 'not stacked';

    expect(info.details.unlock_height).toBeGreaterThan(0);
    expect(info.details.unlock_height).toBe(
      stackHeight -
        (stackHeight % poxInfo.reward_cycle_length) +
        poxInfo.reward_cycle_length * (lockPeriod + 1)
    );
    expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(
      nextCycle + lockPeriod
    ); // same as end_cycle_id

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    if (ENV.REGTEST_SKIP_UNLOCK) return;
    await waitForBurnBlockHeight(info.details.unlock_height + 2);
    info = await client.getStatus();
    expect(info.stacked).toBeFalsy();

    // ENSURE REWARDS
    const reward = (await getRewards(steph.btcAddress))[0];
    expect(reward).toBeDefined();
    expect(reward.burn_block_height).toBeGreaterThan(stackHeight);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (in prepare-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and attempts to stack 1 block after the
    // prepare-phase has started, which is considered a neglected prepare-phase
    // for stacking -- this should result in no rewards being paid out.
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(
      isInPreparePhase((poxInfo.current_burnchain_block_height as number) - 1, poxInfo)
    ).toBeFalsy();
    expect(
      isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    const currentCycle = poxInfo.reward_cycle_id;
    const nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
    const authId = crypto.randomBytes(1)[0];
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    const datas = results
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    let info = await client.getStatus();
    if (!info.stacked) throw 'not stacked';

    expect(info.details.unlock_height).toBeGreaterThan(0);
    expect(info.details.unlock_height).toBe(
      stackHeight -
        (stackHeight % poxInfo.reward_cycle_length) +
        poxInfo.reward_cycle_length * (lockPeriod + 1)
    );
    expect(burnHeightToRewardCycle(info.details.unlock_height, poxInfo)).toBe(
      nextCycle + lockPeriod
    ); // same as end_cycle_id

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked, but didn't make it in time for rewards)

    if (ENV.REGTEST_SKIP_UNLOCK) return;
    await waitForBurnBlockHeight(info.details.unlock_height + 2);
    info = await client.getStatus();
    expect(info.stacked).toBeFalsy();

    // ENSURE NO REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.every(r => r.burn_block_height < stackHeight)).toBeTruthy(); // no new rewards

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (reward-phase), stack-extend (reward-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // steph then extends in a reward-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    let currentCycle = poxInfo.reward_cycle_id;
    let nextCycle = currentCycle + 1;
    const lockPeriod = 2;
    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
    let authId = crypto.randomBytes(1)[0];
    let signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    let datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK STATUS AND WAIT FOR NEXT CYCLE
    let status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';
    const stackUnlock = status.details.unlock_height;

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    poxInfo = await client.getPoxInfo();
    expect(poxInfo.reward_cycle_id).toBe(nextCycle);
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-extend)
    const extendHeight = poxInfo.current_burnchain_block_height as number;
    const extendCycles = 1;
    currentCycle = poxInfo.reward_cycle_id;
    nextCycle = currentCycle + 1;
    authId = crypto.randomBytes(1)[0];
    signature = client.signPoxSignature({
      topic: 'stack-extend',
      period: extendCycles,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid: txidExtend } = await client.stackExtend({
      extendCycles,
      poxAddress: steph.btcAddress,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txidExtend);

    const resultExtend = await waitForTransaction(txidExtend);
    expect(resultExtend.tx_result.repr).toContain('(ok');
    expect(resultExtend.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results: resultsExtend } = await getPox4Events();
    datas = resultsExtend
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (burnHeightToRewardCycle(stackUnlock, poxInfo) + extendCycles).toString(),
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';

    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(status.details.unlock_height).toBeGreaterThan(stackUnlock);
    expect(status.details.unlock_height).toBe(
      stackUnlock + poxInfo.reward_cycle_length * extendCycles
    );

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S2'); // snapshot 2 (steph is stacked and extended in the current cycle)

    if (ENV.REGTEST_SKIP_UNLOCK) return;
    await waitForBurnBlockHeight(status.details.unlock_height + 2); // +1 is more correct, but often fails (race-condition?)
    status = await client.getStatus();
    expect(status.stacked).toBeFalsy();

    // ENSURE CORRECT REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.filter(r => r.burn_block_height > stackHeight).length).toBeGreaterThan(0);
    expect(rewards.filter(r => r.burn_block_height > extendHeight).length).toBeGreaterThan(0);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (reward-phase), stack-extend (prepare-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // steph then attempts to extend in a prepare-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    let currentCycle = poxInfo.reward_cycle_id;
    let nextCycle = currentCycle + 1;
    const lockPeriod = 1;
    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
    let authId = crypto.randomBytes(1)[0];
    let signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    let datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK STATUS AND WAIT FOR NEXT CYCLE PREPARE PHASE
    let status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';
    const stackUnlock = status.details.unlock_height;

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(
      isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-extend)
    const extendHeight = poxInfo.current_burnchain_block_height as number;
    const extendCycles = 1;
    currentCycle = poxInfo.reward_cycle_id;
    nextCycle = currentCycle + 1;
    authId = crypto.randomBytes(1)[0];
    signature = client.signPoxSignature({
      topic: 'stack-extend',
      period: extendCycles,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid: txidExtend } = await client.stackExtend({
      extendCycles,
      poxAddress: steph.btcAddress,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid extend', txidExtend);

    const resultExtend = await waitForTransaction(txidExtend);
    expect(resultExtend.tx_result.repr).toContain('(ok');
    expect(resultExtend.tx_status).toBe('success');

    // CHECK POX-4 EVENTS AFTER EXTEND
    const { results: resultsExtend } = await getPox4Events();
    datas = resultsExtend
      .map(r => r.data)
      .filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: (burnHeightToRewardCycle(stackUnlock, poxInfo) + extendCycles).toString(), // extended period
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';

    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(status.details.unlock_height).toBeGreaterThan(stackUnlock);
    expect(status.details.unlock_height).toBe(
      stackUnlock + poxInfo.reward_cycle_length * extendCycles
    );

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S2'); // snapshot 2 (steph was stacked, but the extend didn't make it in time)

    if (ENV.REGTEST_SKIP_UNLOCK) return;
    await waitForBurnBlockHeight(status.details.unlock_height + 2); // +1 is more correct, but often fails (race-condition?)
    status = await client.getStatus();
    expect(status.stacked).toBeFalsy();

    // ENSURE CORRECT REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.filter(r => r.burn_block_height > stackHeight).length).toBeGreaterThan(0);
    expect(rewards.filter(r => r.burn_block_height > extendHeight).length).toBe(0); // extend didn't make it

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (reward-phase), stack-increase (reward-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // steph then increases in a reward-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    let currentCycle = poxInfo.reward_cycle_id;
    let nextCycle = currentCycle + 1;
    const lockPeriod = 2;
    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
    let authId = crypto.randomBytes(1)[0];
    let signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    let datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK STATUS AND WAIT FOR NEXT CYCLE
    let status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';
    const stackUnlock = status.details.unlock_height;

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    poxInfo = await client.getPoxInfo();
    expect(poxInfo.reward_cycle_id).toBe(nextCycle);
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-increase)
    const increaseHeight = poxInfo.current_burnchain_block_height as number;
    const increaseBy = amount;
    currentCycle = poxInfo.reward_cycle_id;
    nextCycle = currentCycle + 1;
    authId = crypto.randomBytes(1)[0];
    signature = client.signPoxSignature({
      topic: 'stack-increase',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount * 2n,
      authId,
    });
    const { txid: txidIncrease } = await client.stackIncrease({
      increaseBy,
      poxAddress: steph.btcAddress,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount * 2n,
      authId,
      privateKey: steph.key,
    });
    console.log('txid increase', txidIncrease);

    const resultIncrease = await waitForTransaction(txidIncrease);
    expect(resultIncrease.tx_result.repr).toContain('(ok');
    expect(resultIncrease.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results: resultsIncr } = await getPox4Events();
    datas = resultsIncr.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: burnHeightToRewardCycle(stackUnlock, poxInfo).toString(), // original unlock
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';

    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(status.details.unlock_height).toBe(stackUnlock);

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S2'); // snapshot 2 (steph was stacked and increased for the current cycle)

    if (ENV.REGTEST_SKIP_UNLOCK) return;
    await waitForBurnBlockHeight(status.details.unlock_height + 2); // +1 is more correct, but often fails (race-condition?)
    status = await client.getStatus();
    expect(status.stacked).toBeFalsy();

    // ENSURE CORRECT REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.filter(r => r.burn_block_height > stackHeight).length).toBeGreaterThan(0);
    expect(rewards.filter(r => r.burn_block_height > increaseHeight).length).toBeGreaterThan(0);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('stack-stx (reward-phase), stack-increase (prepare-phase)', async () => {
    // TEST CASE
    // steph is a solo stacker and stacks in a reward-phase
    // steph then increases in a prepare-phase
    // but steph doesn't run a signer, so we need to use a different signer key
    const steph = getAccount(ENV.REGTEST_KEYS[0]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient(steph.address, network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    // TRANSACTION (stack-stx)
    const stackHeight = poxInfo.current_burnchain_block_height as number;
    let currentCycle = poxInfo.reward_cycle_id;
    let nextCycle = currentCycle + 1;
    const lockPeriod = 2;
    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
    let authId = crypto.randomBytes(1)[0];
    let signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount,
      authId,
    });
    const { txid } = await client.stack({
      amountMicroStx: amount,
      poxAddress: steph.btcAddress,
      cycles: lockPeriod,
      burnBlockHeight: stackHeight,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId,
      privateKey: steph.key,
    });
    console.log('txid', txid);

    const result = await waitForTransaction(txid);
    expect(result.tx_result.repr).toContain('(ok');
    expect(result.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results } = await getPox4Events();
    let datas = results.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + lockPeriod).toString(),
      })
    );

    // CHECK STATUS AND WAIT FOR NEXT CYCLE PREPARE PHASE
    let status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';
    const stackUnlock = status.details.unlock_height;

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S1'); // snapshot 1 (steph is stacked in the current cycle)

    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(
      isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)
    ).toBeTruthy();

    // TRANSACTION (stack-increase)
    const increaseHeight = poxInfo.current_burnchain_block_height as number;
    const increaseBy = amount;
    currentCycle = poxInfo.reward_cycle_id;
    nextCycle = currentCycle + 1;
    authId = crypto.randomBytes(1)[0];
    signature = client.signPoxSignature({
      topic: 'stack-increase',
      period: lockPeriod,
      rewardCycle: currentCycle,
      poxAddress: steph.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount * 2n,
      authId,
    });
    const { txid: txidIncrease } = await client.stackIncrease({
      increaseBy,
      poxAddress: steph.btcAddress,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount * 2n,
      authId,
      privateKey: steph.key,
    });
    console.log('txid increase', txidIncrease);

    const resultIncrease = await waitForTransaction(txidIncrease);
    expect(resultIncrease.tx_result.repr).toContain('(ok');
    expect(resultIncrease.tx_status).toBe('success');

    // CHECK POX-4 EVENTS
    const { results: resultsIncr } = await getPox4Events();
    datas = resultsIncr.map(r => r.data).filter(d => d.signer_key.includes(signer.signerPublicKey));

    expect(datas).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: burnHeightToRewardCycle(stackUnlock, poxInfo).toString(), // original unlock
      })
    );

    // CHECK UNLOCK HEIGHT AND WAIT FOR UNLOCK
    status = await client.getStatus();
    if (!status.stacked) throw 'not stacked';

    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(status.details.unlock_height).toBe(stackUnlock);

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);
    await storeEventsTsv('S2'); // snapshot 2 (steph was stacked, but the increase didn't make it in time)

    if (ENV.REGTEST_SKIP_UNLOCK) return;
    await waitForBurnBlockHeight(status.details.unlock_height + 2); // +1 is more correct, but often fails (race-condition?)
    status = await client.getStatus();
    expect(status.stacked).toBeFalsy();

    // ENSURE CORRECT REWARDS
    const rewards = await getRewards(steph.btcAddress);
    expect(rewards.filter(r => r.burn_block_height > stackHeight).length).toBeGreaterThan(0);
    expect(rewards.filter(r => r.burn_block_height > increaseHeight).length).toBeGreaterThan(0);

    // todo: (functional) some how ensure the slots were not increased on the blockchain side

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('pool: delegate-stack, agg-increase (prepare-phase)', async () => {
    // TEST CASE
    // alice and bob delegate to a pool
    // the pool stacks for alice (in the reward-phase)
    // the pool commits (in the reward-phase)
    // the pool stacks for bob (in the prepare-phase)
    // the pool commit-increases (in the prepare-phase)
    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const bob = getAccount(ENV.REGTEST_KEYS[1]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const amount = BigInt(poxInfo.min_amount_ustx) * 3n;
    const nextCycle = poxInfo.reward_cycle_id + 1;
    const delegateStackCycles = 2;

    // TRANSACTION (alice delegate-stack)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceDelegate);

    // TRANSACTION (bob delegate-stack)
    const { txid: bobDelegate } = await bob.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: bob.key,
    });
    await waitForTransaction(bobDelegate);

    // TRANSACTION (pool alice stack-stx)
    let poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: delegateStackCycles,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    await waitForTransaction(poolAlice);

    const eventsAlice = (await getPox4Events()).results.filter(
      r => r.stacker === alice.address && r.pox_addr === pool.btcAddress
    );

    expect(eventsAlice.map(r => r.data)).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: (nextCycle + delegateStackCycles).toString(),
      })
    );

    // TRANSACTION (pool commit)
    const authId = crypto.randomBytes(1)[0];
    const signature = pool.client.signPoxSignature({
      topic: 'agg-commit',
      period: 1,
      rewardCycle: nextCycle,
      poxAddress: pool.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: amount * 2n,
      authId,
    });
    const { txid: poolCommit } = await pool.client.stackAggregationCommitIndexed({
      poxAddress: pool.btcAddress,
      rewardCycle: nextCycle,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount * 2n,
      authId,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const commit = await waitForTransaction(poolCommit);
    const commitIndex = Cl.deserialize<ResponseOkCV<UIntCV>>(commit.tx_result.hex).value.value;

    const eventsCommit = (await getPox4Events()).results.filter(
      r => r.pox_addr === pool.btcAddress
    );

    expect(eventsCommit.map(r => r.data)).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(),
        end_cycle_id: nextCycle.toString(), // todo: incorrect on core, should be +1
      })
    );

    // WAIT FOR PREPARE PHASE
    poxInfo = await client.getPoxInfo();
    await waitForPreparePhase(poxInfo);

    // TRANSACTION (pool bob stack-stx)
    const { txid: poolBob } = await pool.client.delegateStackStx({
      stacker: bob.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: delegateStackCycles,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    await waitForTransaction(poolBob);

    const eventsBob = (await getPox4Events()).results.filter(
      r => r.stacker === bob.address && r.pox_addr === pool.btcAddress
    );

    expect(eventsBob.map(r => r.data)).toContainEqual(
      expect.objectContaining({
        start_cycle_id: (nextCycle + 1).toString(), // + prepare offset
        end_cycle_id: (nextCycle + delegateStackCycles).toString(),
      })
    );

    // CHECK LOCKED
    expect(await alice.client.getAccountBalanceLocked()).toBe(amount);
    expect(await bob.client.getAccountBalanceLocked()).toBe(amount);

    // TRANSACTION (pool commit-increase)
    const { txid: poolIncrease } = await pool.client.stackAggregationIncrease({
      poxAddress: pool.btcAddress,
      rewardCycle: nextCycle,
      rewardIndex: commitIndex,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    await waitForTransaction(poolIncrease);

    const eventsIncrease = (await getPox4Events()).results.filter(
      r => r.pox_addr === pool.btcAddress
    );

    expect(eventsIncrease.map(r => r.data)).toContainEqual(
      expect.objectContaining({
        start_cycle_id: nextCycle.toString(), // todo: incorrect on core, should be // + prepare offset
        end_cycle_id: nextCycle.toString(), // todo: incorrect on core, should be +1
      })
    );

    const rewardSet = await pool.client.getRewardSet({
      contractId: poxInfo.contract_id,
      rewardCyleId: nextCycle,
      rewardSetIndex: Number(commitIndex),
    });
    expect(rewardSet).toBeDefined();
    expect(rewardSet?.total_ustx).toBe(amount * 2n);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test.skip('pool: agg increase over maxAmount', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate stacks for alice (a part of her delegated amount)
    // pool commits
    // pool delegate stack increases for alice (the remaining amount)
    // pool increases commit, but the signature was only for the initial amount

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);
    const signer = getAccount(ENV.SIGNER_KEY);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const fullAmount = BigInt(poxInfo.min_amount_ustx) * 6n;
    const nextCycle = poxInfo.reward_cycle_id + 1;
    const delegateStackCycles = 3;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: fullAmount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_status).toBe('success');
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');

    // TRANSACTION (pool delegate-stack-stx)
    let poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: fullAmount * (2n / 5n),
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: delegateStackCycles,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_status).toBe('success');
    expect(poolAliceTx.tx_result.repr).toContain('(ok');

    // TRANSACTION (pool commit)
    const authId = crypto.randomBytes(1)[0];
    const signature = pool.client.signPoxSignature({
      topic: 'agg-commit',
      period: 1,
      rewardCycle: nextCycle,
      poxAddress: pool.btcAddress,
      signerPrivateKey: signer.signerPrivateKey,
      maxAmount: fullAmount * (2n / 5n),
      authId,
    });
    const { txid: poolCommit } = await pool.client.stackAggregationCommitIndexed({
      poxAddress: pool.btcAddress,
      rewardCycle: nextCycle,
      signerKey: signer.signerPublicKey,
      signerSignature: signature,
      maxAmount: fullAmount * (2n / 5n),
      authId,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const commit = await waitForTransaction(poolCommit);
    const commitIndex = Cl.deserialize<ResponseOkCV<UIntCV>>(commit.tx_result.hex).value.value;

    expect(commit.tx_status).toBe('success');
    expect(commit.tx_result.repr).toContain('(ok');

    // TRANSACTION (pool delegate-stack-increase)
    const { txid: poolAliceInc } = await pool.client.delegateStackIncrease({
      stacker: alice.address,
      poxAddress: pool.btcAddress,
      increaseBy: fullAmount * (3n / 5n), // more than the initial amount
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const poolAliceIncTx = await waitForTransaction(poolAliceInc);
    expect(poolAliceIncTx.tx_status).toBe('success');
    expect(poolAliceIncTx.tx_result.repr).toContain('(ok');

    // TRANSACTION (pool commit-increase)
    const { txid: poolInc } = await pool.client.stackAggregationIncrease({
      poxAddress: pool.btcAddress,
      rewardCycle: nextCycle,
      rewardIndex: commitIndex,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const poolIncTx = await waitForTransaction(poolInc);
    expect(poolIncTx.tx_status).toBe('success');
    expect(poolIncTx.tx_result.repr).toContain('(ok');

    // CHECK LOCKED
    expect(await alice.client.getAccountBalanceLocked()).toBe(fullAmount);

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);

    const rewardSet = await pool.client.getRewardSet({
      contractId: poxInfo.contract_id,
      rewardCyleId: nextCycle,
      rewardSetIndex: Number(commitIndex),
    });
    expect(rewardSet).toBeDefined();
    expect(rewardSet?.total_ustx).toBe(fullAmount);

    // EXPORT EVENTS
    await storeEventsTsv();
  });

  test('pool: delegate with invalid hashbyte length', async () => {
    // TEST CASE
    // alice delegates to a pool with an invalid hashbyte length
    // the transaction should fail (but won't)
    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const contract = await client.getStackingContract();
    const [contractAddress, contractName] = client.parseContractId(contract);

    const address: any = Cl.some(poxAddressToTuple(pool.btcAddress));
    console.log(bytesToHex(address.value.data.hashbytes.buffer as Uint8Array));
    address.value.data.hashbytes.buffer = address.value.data.hashbytes.buffer.slice(2); // remove two first bytes
    console.log(bytesToHex(address.value.data.hashbytes.buffer as Uint8Array));

    const callOptions: SignedContractCallOptions = {
      contractAddress,
      contractName,

      functionName: 'delegate-stx',
      functionArgs: [Cl.uint(amount), Cl.address(pool.address), Cl.none(), address],

      validateWithAbi: true,
      anchorMode: 'onChainOnly',
      network,

      senderKey: alice.key,
    };
    const tx = await makeContractCall(callOptions);
    const { txid: aliceDelegate } = await broadcastTransaction(tx, network);

    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(err 23');
    expect(aliceDelegateTx.tx_status).toBe('aborted_by_response');

    // TRANSACTION (pool delegate-stack-stx)
    const poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress, // will be different to the one alice delegated to
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
      nonce: poolNonce,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(ok');
    expect(poolAliceTx.tx_status).toBe('success');

    // wait a bit to see what happens
    poxInfo = await client.getPoxInfo();
    await waitForBurnBlockHeight(
      (poxInfo.current_burnchain_block_height as number) + 3 * poxInfo.reward_cycle_length
    );

    expect((await client.getPoxInfo()).current_burnchain_block_height).toBe(
      (poxInfo.current_burnchain_block_height as number) + 3 * poxInfo.reward_cycle_length
    );
  });

  test('Pool delegate can only delegate-stack-stx for the next cycle', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate stacks for alice (in the reward-phase) for a cycle that is not the next cycle
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceDelegate);

    // TRANSACTION (pool delegate-stack-stx)
    const poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight:
        (poxInfo.current_burnchain_block_height as number) + poxInfo.reward_cycle_length,
      cycles: 2,
      privateKey: pool.key,
      nonce: poolNonce,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Cannot stack if delegating', async () => {
    // TEST CASE
    // alice delegates to a pool
    // alice stacks for herself
    // pool delegate stacks for alice (in the reward-phase)
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceDelegate);

    // TRANSACTION (alice stack-stx)
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: 2,
      rewardCycle: poxInfo.reward_cycle_id,
      poxAddress: alice.btcAddress,
      signerPrivateKey: alice.signerPrivateKey,
      maxAmount: amount,
      authId: 0,
    });
    const { txid: aliceStack } = await alice.client.stack({
      amountMicroStx: amount,
      poxAddress: alice.btcAddress,
      cycles: 2,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      signerKey: alice.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId: 0,
      privateKey: alice.key,
    });
    const aliceStackTx = await waitForTransaction(aliceStack);
    expect(aliceStackTx.tx_result.repr).toBe('(err 20)');
    expect(aliceStackTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx if already stacking', async () => {
    // TEST CASE
    // alice stacks for herself
    // alice delegates to a pool
    // pool delegate stacks for alice (in the reward-phase)
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice stack-stx)
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: 2,
      rewardCycle: poxInfo.reward_cycle_id,
      poxAddress: alice.btcAddress,
      signerPrivateKey: alice.signerPrivateKey,
      maxAmount: amount,
      authId: 0,
    });
    const { txid: aliceStack } = await alice.client.stack({
      amountMicroStx: amount,
      poxAddress: alice.btcAddress,
      cycles: 2,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      signerKey: alice.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId: 0,
      privateKey: alice.key,
    });
    const aliceStackTx = await waitForTransaction(aliceStack);
    expect(aliceStackTx.tx_result.repr).toContain('(ok');
    expect(aliceStackTx.tx_status).toBe('success');

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceDelegate);

    // TRANSACTION (pool delegate-stack-stx)
    const poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
      nonce: poolNonce,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx more STX than what delegator has explicitly allowed', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate stacks for alice (with a higher amount)
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceDelegate);

    // TRANSACTION (pool delegate-stack-stx)
    const poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount * 2n,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
      nonce: poolNonce,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx on behalf of a delegator that delegated to another pool', async () => {
    // TEST CASE
    // alice delegates to a pool A
    // pool B tries to delegate-stack-stx for alice
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const poolA = getAccount(ENV.REGTEST_KEYS[1]);
    const poolB = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: poolA.address,
      poxAddress: poolA.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceDelegate);

    // TRANSACTION (pool delegate-stack-stx)
    const poolNonce = await getNonce(poolB.address, network);
    const { txid: poolAlice } = await poolB.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: poolB.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: poolB.key,
      nonce: poolNonce,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx for the current cycle', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate stacks for alice (in the reward-phase) for the current cycle
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    expect(isInPreparePhase(poxInfo.current_burnchain_block_height as number, poxInfo)).toBeFalsy();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceDelegate);

    // TRANSACTION (pool delegate-stack-stx)
    const poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight:
        (poxInfo.current_burnchain_block_height as number) - poxInfo.reward_cycle_length,
      cycles: 2,
      privateKey: pool.key,
      nonce: poolNonce,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx to an un-delegated solo stacker', async () => {
    // TEST CASE
    // pool delegate stacks for alice (in the reward-phase)
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (pool delegate-stack-stx)
    const poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
      nonce: poolNonce,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool stacker, if actively stacked, cannot revoke delegate status for the current reward cycle', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate stacks for alice (in the reward-phase)
    // alice revokes the delegation
    // alice is still locked

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceDelegate);

    // TRANSACTION (pool delegate-stack-stx)
    const poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
      nonce: poolNonce,
    });
    await waitForTransaction(poolAlice);

    // TRANSACTION (alice revoke)
    const { txid: aliceRevoke } = await alice.client.revokeDelegateStx({
      delegatee: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    await waitForTransaction(aliceRevoke);

    // CHECK LOCKED
    expect(await alice.client.getAccountBalanceLocked()).toBe(amount);

    poxInfo = await client.getPoxInfo();
    await waitForNextCycle(poxInfo);

    expect(await alice.client.getAccountBalanceLocked()).toBe(amount);
  });

  test('Pool can pre-approve a signature for participants', async () => {
    // TEST CASE
    // pool can create a signature and push it to pox state
    // alice can't use the signature with an incorrect period
    // alice can use the signature while only knowing the signer-key, max-amount, auth-id
    // bob can't use the consumed signature

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const bob = getAccount(ENV.REGTEST_KEYS[1]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (pool pre-approve)
    const period = 1;
    const rewardCycle = poxInfo.reward_cycle_id;
    const maxAmount = amount * 2n;
    const authId = crypto.randomBytes(1)[0];
    const signature = pool.client.signPoxSignature({
      topic: 'stack-stx',
      period,
      rewardCycle,
      poxAddress: pool.btcAddress,
      signerPrivateKey: pool.signerPrivateKey,
      maxAmount,
      authId,
    });
    const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);
    const tx = await makeContractCall({
      contractAddress,
      contractName,
      functionName: 'set-signer-key-authorization',
      functionArgs: [
        poxAddressToTuple(pool.btcAddress), // pox-addr
        Cl.uint(period), // period
        Cl.uint(rewardCycle), // reward-cycle
        Cl.stringAscii('stack-stx'), // topic
        Cl.bufferFromHex(pool.signerPublicKey), // signer-key
        Cl.bool(true), // allowed
        Cl.uint(maxAmount), // max-amount
        Cl.uint(authId), // auth-id
      ],
      anchorMode: 'onChainOnly',
      network,
      senderKey: pool.key,
    });
    const poolPreApproveTx = await broadcastAndWaitForTransaction(tx, network);
    expect(poolPreApproveTx.tx_result.repr).toContain('(ok');
    expect(poolPreApproveTx.tx_status).toBe('success');

    // TRANSACTION (alice stack)
    const { txid: aliceStackLong } = await alice.client.stack({
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,

      signerKey: pool.signerPublicKey,
      signerSignature: signature,
      cycles: 10,
      maxAmount,
      authId,

      privateKey: alice.key,
    });
    const aliceStackLongTx = await waitForTransaction(aliceStackLong);
    expect(aliceStackLongTx.tx_result.repr).toContain('(err');
    expect(aliceStackLongTx.tx_status).toBe('abort_by_response');

    // TRANSACTION (alice stack)
    const { txid: aliceStack } = await alice.client.stack({
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,

      signerKey: pool.signerPublicKey,
      cycles: period,
      maxAmount,
      authId,

      privateKey: alice.key,
    });
    const aliceStackTx = await waitForTransaction(aliceStack);
    expect(aliceStackTx.tx_result.repr).toContain('(ok');
    expect(aliceStackTx.tx_status).toBe('success');

    // TRANSACTION (bob stack)
    const { txid: bobStack } = await bob.client.stack({
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,

      signerKey: pool.signerPublicKey,
      cycles: period,
      maxAmount,
      authId,

      privateKey: bob.key,
    });
    const bobStackTx = await waitForTransaction(bobStack);
    expect(bobStackTx.tx_result.repr).toContain('(err');
    expect(bobStackTx.tx_status).toBe('abort_by_response');
  });

  test('Stacker switches signers for stack-increase', async () => {
    // TEST CASE
    // alice solo stacks with signer A
    // alice increases stack with signer B
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const signerA = getAccount(ENV.REGTEST_KEYS[1]);
    const signerB = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx);

    // TRANSACTION (alice solo stack)
    const signatureA = client.signPoxSignature({
      topic: 'stack-stx',
      period: 1,
      rewardCycle: poxInfo.reward_cycle_id,
      poxAddress: alice.btcAddress,
      signerPrivateKey: signerA.signerPrivateKey,
      maxAmount: amount * 2n,
      authId: 0,
    });
    const { txid: aliceStack } = await alice.client.stack({
      amountMicroStx: amount,
      poxAddress: alice.btcAddress,
      cycles: 1,
      burnBlockHeight: poxInfo.current_burnchain_block_height,

      signerKey: signerA.signerPublicKey,
      signerSignature: signatureA,
      maxAmount: amount * 2n,
      authId: 0,

      privateKey: alice.key,
    });
    const aliceStackTx = await waitForTransaction(aliceStack);
    expect(aliceStackTx.tx_result.repr).toContain('(ok');
    expect(aliceStackTx.tx_status).toBe('success');

    // TRANSACTION (alice increase stack)
    const signatureB = client.signPoxSignature({
      topic: 'stack-increase',
      period: 1,
      rewardCycle: poxInfo.reward_cycle_id,
      poxAddress: alice.btcAddress,
      signerPrivateKey: signerB.signerPrivateKey,
      maxAmount: amount * 2n,
      authId: 0,
    });
    const { txid: aliceIncrease } = await alice.client.stackIncrease({
      increaseBy: amount,

      signerKey: signerB.signerPublicKey,
      signerSignature: signatureB,
      poxAddress: alice.btcAddress,
      rewardCycle: poxInfo.reward_cycle_id,
      maxAmount: amount * 2n,
      authId: 0,

      privateKey: alice.key,
    });
    const aliceIncreaseTx = await waitForTransaction(aliceIncrease);
    expect(aliceIncreaseTx.tx_result.repr).toContain('(err');
    expect(aliceIncreaseTx.tx_status).toBe('abort_by_response');
  });

  test('Stacker switches signers for stack-extend', async () => {
    // TEST CASE
    // alice solo stacks with signer A
    // alice extends stack with signer B
    // the transaction should work, because it's essentially like a new stack (separate from the first)

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const signerA = getAccount(ENV.REGTEST_KEYS[1]);
    const signerB = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx);

    // TRANSACTION (alice solo stack)
    const signatureA = client.signPoxSignature({
      topic: 'stack-stx',
      period: 1,
      rewardCycle: poxInfo.reward_cycle_id,
      poxAddress: alice.btcAddress,
      signerPrivateKey: signerA.signerPrivateKey,
      maxAmount: amount * 2n,
      authId: 0,
    });
    const { txid: aliceStack } = await alice.client.stack({
      amountMicroStx: amount,
      poxAddress: alice.btcAddress,
      cycles: 1,
      burnBlockHeight: poxInfo.current_burnchain_block_height,

      signerKey: signerA.signerPublicKey,
      signerSignature: signatureA,
      maxAmount: amount * 2n,
      authId: 0,

      privateKey: alice.key,
    });
    const aliceStackTx = await waitForTransaction(aliceStack);
    expect(aliceStackTx.tx_result.repr).toContain('(ok');
    console.log(aliceStackTx.tx_result.repr);
    expect(aliceStackTx.tx_status).toBe('success');

    // TRANSACTION (alice increase stack)
    const signatureB = client.signPoxSignature({
      topic: 'stack-extend',
      period: 1,
      rewardCycle: poxInfo.reward_cycle_id,
      poxAddress: alice.btcAddress,
      signerPrivateKey: signerB.signerPrivateKey,
      maxAmount: amount * 2n,
      authId: 0,
    });
    const { txid: aliceIncrease } = await alice.client.stackExtend({
      extendCycles: 1,

      signerKey: signerB.signerPublicKey,
      signerSignature: signatureB,
      poxAddress: alice.btcAddress,
      rewardCycle: poxInfo.reward_cycle_id,
      maxAmount: amount * 2n,
      authId: 0,

      privateKey: alice.key,
    });
    const aliceIncreaseTx = await waitForTransaction(aliceIncrease);
    expect(aliceIncreaseTx.tx_result.repr).toContain('(ok');
    expect(aliceIncreaseTx.tx_status).toBe('success');
  });

  test('Call readonly with weird string', async () => {
    // TEST CASE
    // call a read-only function with a weird string
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);

    const res = await callReadOnlyFunction({
      contractAddress,
      contractName,
      functionName: 'get-signer-key-message-hash',
      functionArgs: [
        Cl.tuple({
          version: Cl.buffer(Uint8Array.from([0])),
          hashbytes: Cl.buffer(Uint8Array.from([])),
        }),
        Cl.uint(0),
        Cl.stringAscii('r;NT="'), // taken from stateful testing: https://nakamotoslack.slack.com/archives/C067Q7M9L9J/p1709821822761499
        Cl.uint(0),
        Cl.uint(10),
        Cl.uint(0),
      ],
      network,
      senderAddress: alice.address,
    });

    if (res.type !== ClarityType.Buffer) throw 'wrong type';
    expect(res.buffer.length).toBeGreaterThan(0);

    await timeout(5000);

    poxInfo = await client.getPoxInfo();
    expect(poxInfo).toBeDefined();
  });

  test('Pool stacker can delegate-stx, Pool stacker cannot submit an invalid pox-addr-version', async () => {
    // TEST CASE
    // alice delegates to a pool with an invalid pox-addr-version
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const contract = await client.getStackingContract();
    const [contractAddress, contractName] = client.parseContractId(contract);

    const address: any = poxAddressToTuple(pool.btcAddress);
    address.data.version.buffer = Uint8Array.from([8]); // invalid pox-addr-version

    const tx = await makeContractCall({
      contractAddress,
      contractName,
      functionName: 'delegate-stx',
      functionArgs: [
        Cl.uint(amount),
        Cl.address(pool.address),
        Cl.none(),
        Cl.some(address), // invalid pox-addr-version
      ],
      anchorMode: 'onChainOnly',
      network,
      senderKey: alice.key,
    });
    const aliceDelegateTx = await broadcastAndWaitForTransaction(tx, network);
    expect(aliceDelegateTx.tx_result.repr).toContain('(err');
    expect(aliceDelegateTx.tx_status).toBe('abort_by_response');
  });

  test('Pool stacker cannot delegate to two pool operators at once', async () => {
    // TEST CASE
    // alice delegates to a pool
    // alice tries to delegate to another pool
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const poolA = getAccount(ENV.REGTEST_KEYS[1]);
    const poolB = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();
    const amount = BigInt(poxInfo.min_amount_ustx);

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: poolA.address,
      poxAddress: poolA.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate2 } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: poolB.address,
      poxAddress: poolB.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegate2Tx = await waitForTransaction(aliceDelegate2);
    expect(aliceDelegate2Tx.tx_result.repr).toContain('(err');
    expect(aliceDelegate2Tx.tx_status).toBe('abort_by_response');
  });

  test('Revoke fails if stacker is not currently delegated', async () => {
    // TEST CASE
    // alice revokes stx from a pool (without having delegated)
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    // TRANSACTION (alice revoke)
    const { txid: aliceRevoke } = await alice.client.revokeDelegateStx({
      delegatee: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceRevokeTx = await waitForTransaction(aliceRevoke);
    expect(aliceRevokeTx.tx_result.repr).toContain('(err');
    expect(aliceRevokeTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate can successfully provide a stacking lock for a pool stacker (delegate-stack-stx)', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate stacks for alice (in the reward-phase)
    // alice should be locked

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();
    await waitForRewardPhase(poxInfo);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    let poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 1,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(ok');
    expect(poolAliceTx.tx_status).toBe('success');

    // CHECK LOCKED
    expect(await alice.client.getAccountBalanceLocked()).toBe(amount);

    // TRANSACTION (pool commit)
    const signature = client.signPoxSignature({
      topic: 'agg-commit',
      period: 1,
      rewardCycle: poxInfo.reward_cycle_id + 1,
      poxAddress: pool.btcAddress,
      signerPrivateKey: pool.signerPrivateKey,
      maxAmount: amount,
      authId: 0,
    });
    const { txid: poolCommit } = await pool.client.stackAggregationCommitIndexed({
      poxAddress: pool.btcAddress,
      rewardCycle: poxInfo.reward_cycle_id + 1,
      signerKey: pool.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId: 0,
      nonce: poolNonce++,
      privateKey: pool.key,
    });
    const poolCommitTx = await waitForTransaction(poolCommit);
    expect(poolCommitTx.tx_result.repr).toContain('(ok');
    expect(poolCommitTx.tx_status).toBe('success');

    // CHECK LOCKED
    expect(await alice.client.getAccountBalanceLocked()).toBe(amount);

    // WAIT FOR UNLOCK
    const status = await alice.client.getStatus();
    if (!status.stacked) throw 'not stacked';

    poxInfo = await client.getPoxInfo();
    await waitForBurnBlockHeight(status.details.unlock_height + 1);

    // CHECK UNLOCKED
    expect(await alice.client.getAccountBalanceLocked()).toBe(0n);
  });

  test('Pool delegate cannot delegate-stack-stx to an un-delegated solo stacker', async () => {
    // TEST CASE
    // alice solo stacks
    // pool delegate tries to delegate-stack for alice
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice stack)
    const signature = client.signPoxSignature({
      topic: 'stack-stx',
      period: 2,
      rewardCycle: poxInfo.reward_cycle_id,
      poxAddress: alice.btcAddress,
      signerPrivateKey: alice.signerPrivateKey,
      maxAmount: amount,
      authId: 0,
    });
    const { txid: aliceStack } = await alice.client.stack({
      amountMicroStx: amount,
      poxAddress: alice.btcAddress,
      cycles: 2,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      signerKey: alice.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId: 0,
      privateKey: alice.key,
    });
    const aliceStackTx = await waitForTransaction(aliceStack);
    expect(aliceStackTx.tx_result.repr).toContain('(ok');
    expect(aliceStackTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx for the current cycle', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate-stack for alice
    // pool tries to commit the stack for the current cycle
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    let poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 1,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(ok');
    expect(poolAliceTx.tx_status).toBe('success');

    // TRANSACTION (pool commit)
    const signature = client.signPoxSignature({
      topic: 'agg-commit',
      period: 1,
      rewardCycle: poxInfo.reward_cycle_id,
      poxAddress: pool.btcAddress,
      signerPrivateKey: pool.signerPrivateKey,
      maxAmount: amount,
      authId: 0,
    });
    const { txid: poolCommit } = await pool.client.stackAggregationCommitIndexed({
      poxAddress: pool.btcAddress,
      rewardCycle: poxInfo.reward_cycle_id,
      signerKey: pool.signerPublicKey,
      signerSignature: signature,
      maxAmount: amount,
      authId: 0,
      nonce: poolNonce++,
      privateKey: pool.key,
    });
    const poolCommitTx = await waitForTransaction(poolCommit);
    expect(poolCommitTx.tx_result.repr).toContain('(err');
    expect(poolCommitTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx on behalf of a delegator that delegated to another pool', async () => {
    // TEST CASE
    // alice delegates to a pool A
    // pool B tries to delegate-stack for alice
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const poolA = getAccount(ENV.REGTEST_KEYS[1]);
    const poolB = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: poolA.address,
      poxAddress: poolA.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice } = await poolB.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: poolB.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: poolB.key,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx more STX than what delegator has explicitly allowed', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate-stack for alice
    // pool tries to delegate-stack for alice with more STX than what alice has explicitly allowed
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(ok');
    expect(poolAliceTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice2 } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount * 2n,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
    });
    const poolAlice2Tx = await waitForTransaction(poolAlice2);
    expect(poolAlice2Tx.tx_result.repr).toContain('(err');
    expect(poolAlice2Tx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot change the pox-addr provided by delegator', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool tries to delegate-stack for alice with a different pox-addr
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);
    const random = getAccount(ENV.REGTEST_KEYS[1]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: random.btcAddress, // different pox-addr
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack-stx if the delegation expires before the next cycle ends', async () => {
    // TEST CASE
    // alice delegates to a pool (until before the next cycle ends)
    // pool tries to delegate-stack for alice
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;
    const until =
      poxInfo.next_cycle.reward_phase_start_block_height + poxInfo.reward_cycle_length - 2; // a bit before the next cycle ends

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      untilBurnBlockHeight: until,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate-stack-stx fails if the delegator has insufficient balance', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool tries to delegate-stack for alice with more STX than what alice has
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const aliceBalance = await alice.client.getAccountBalance();

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: aliceBalance + 100n,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok'); // alice can delegate more than she has
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: aliceBalance + 50n, // more than alice has, but less than what was delegated
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot delegate-stack 0 stx, Pool delegate cannot delegate-stack-stx for 0 cycles, Pool delegate cannot delegate-stack-stx for > 12 cycles', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool tries to delegate-stack for alice with 0 STX
    // the transaction should fail
    // pool tries to delegate-stack for alice for 0 cycles
    // the transaction should fail
    // pool tries to delegate-stack for alice for more than 12 cycles
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: 100n,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: 0n,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice2 } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: 100n,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 0,
      privateKey: pool.key,
    });
    const poolAlice2Tx = await waitForTransaction(poolAlice2);
    expect(poolAlice2Tx.tx_result.repr).toContain('(err');
    expect(poolAlice2Tx.tx_status).toBe('abort_by_response');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice3 } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: 100n,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 13,
      privateKey: pool.key,
    });
    const poolAlice3Tx = await waitForTransaction(poolAlice3);
    expect(poolAlice3Tx.tx_result.repr).toContain('(err');
    expect(poolAlice3Tx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate cannot submit an invalid pox-addr-ver', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool tries to delegate-stack for alice with an invalid pox-addr-ver
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    const address = poxAddressToTuple(pool.btcAddress);
    (address.data.version as any).buffer = Uint8Array.from([8]); // invalid pox-addr-version

    // TRANSACTION (pool delegate-stack-stx)
    const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);
    const tx = await makeContractCall({
      contractAddress,
      contractName,
      functionName: 'delegate-stack-stx',
      functionArgs: [
        Cl.address(alice.address),
        Cl.uint(amount),
        address,
        Cl.uint(poxInfo.current_burnchain_block_height as number),
        Cl.uint(2),
      ],
      anchorMode: 'onChainOnly',
      network,
      senderKey: pool.key,
    });
    const poolAliceTx = await broadcastAndWaitForTransaction(tx, network);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool stacker can revoke delegate status (revoke-delegate-stx)', async () => {
    // TEST CASE
    // alice delegates to a pool
    // alice revokes the delegation
    // pool tries to delegate-stack for alice
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (alice revoke)
    const { txid: aliceRevoke } = await alice.client.revokeDelegateStx({
      privateKey: alice.key,
    });
    const aliceRevokeTx = await waitForTransaction(aliceRevoke);
    expect(aliceRevokeTx.tx_result.repr).toContain('(ok');
    expect(aliceRevokeTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 2,
      privateKey: pool.key,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(err');
    expect(poolAliceTx.tx_status).toBe('abort_by_response');
  });

  test('Pool delegate can successfully delegate-stack-extend', async () => {
    // TEST CASE
    // alice delegates to a pool
    // pool delegate-stack-stx for alice
    // pool delegate-stack-extend for alice
    // lock has been extended

    const alice = getAccount(ENV.REGTEST_KEYS[0]);
    const pool = getAccount(ENV.REGTEST_KEYS[2]);

    // PREP
    const client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;
    await waitForBurnBlockHeight(pox4Activation + 1);

    poxInfo = await client.getPoxInfo();

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (alice delegate)
    const { txid: aliceDelegate } = await alice.client.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const aliceDelegateTx = await waitForTransaction(aliceDelegate);
    expect(aliceDelegateTx.tx_result.repr).toContain('(ok');
    expect(aliceDelegateTx.tx_status).toBe('success');

    // TRANSACTION (pool delegate-stack-stx)
    let poolNonce = await getNonce(pool.address, network);
    const { txid: poolAlice } = await pool.client.delegateStackStx({
      stacker: alice.address,
      amountMicroStx: amount,
      poxAddress: pool.btcAddress,
      burnBlockHeight: poxInfo.current_burnchain_block_height,
      cycles: 1,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const poolAliceTx = await waitForTransaction(poolAlice);
    expect(poolAliceTx.tx_result.repr).toContain('(ok');
    expect(poolAliceTx.tx_status).toBe('success');

    // CHECK LOCKED
    const status = await alice.client.getStatus();
    if (!status.stacked) throw 'not stacked';
    expect(status.details.unlock_height).toBeGreaterThan(0);
    expect(await alice.client.getAccountBalanceLocked()).toBe(amount);

    // TRANSACTION (pool delegate-stack-extend)
    const { txid: poolAlice2 } = await pool.client.delegateStackExtend({
      stacker: alice.address,
      poxAddress: pool.btcAddress,
      extendCount: 1,
      privateKey: pool.key,
      nonce: poolNonce++,
    });
    const poolAlice2Tx = await waitForTransaction(poolAlice2);
    expect(poolAlice2Tx.tx_result.repr).toContain('(ok');
    expect(poolAlice2Tx.tx_status).toBe('success');

    // CHECK LOCKED
    const statusExtend = await alice.client.getStatus();
    if (!statusExtend.stacked) throw 'not stacked';
    expect(statusExtend.details.unlock_height).toBeGreaterThan(status.details.unlock_height);
    expect(await alice.client.getAccountBalanceLocked()).toBe(amount);
  });
});

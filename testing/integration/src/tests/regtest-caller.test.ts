import { ResponseContext } from '@stacks/blockchain-api-client';
import { StacksDevnet, createFetchFn } from '@stacks/network';
import { PoxInfo, StackingClient } from '@stacks/stacking';
import { Cl, makeContractCall, makeContractDeploy } from '@stacks/transactions';
import fs from 'fs';
import { ENV } from '../env';
import {
  broadcastAndWaitForTransaction,
  getAccount,
  waitForBurnBlockHeight,
  waitForNode,
  waitForTransaction,
} from '../helpers';
import { startRegtestEnv, stopRegtestEnv, withRetry } from '../utils';

jest.setTimeout(1_000_000_000);

describe('regtest-env pox-4 caller', () => {
  const network = new StacksDevnet({ fetchFn: withRetry(3, fetch) }); // this test only works on regtest-env

  let poxInfo: PoxInfo;
  let client: StackingClient;

  const pool = getAccount(ENV.REGTEST_KEYS[0]) as ReturnType<typeof getAccount> & {
    wrappedClient: StackingClient;
  };

  beforeEach(async () => {
    // SETUP
    await startRegtestEnv();
    await waitForNode();

    // POX-4 PREP
    client = new StackingClient('', network);

    poxInfo = await client.getPoxInfo();
    const pox4Activation = poxInfo.contract_versions[3].activation_burnchain_block_height;

    await waitForBurnBlockHeight(pox4Activation + 1);

    await deployWrapperContract();

    poxInfo = await client.getPoxInfo();

    // WRAPPER MIDDLEWARE
    const redirectContract = async (context: ResponseContext) => {
      if (!context.url.endsWith('v2/pox')) return; // Skip middleware if not pox endpoint

      let data = await context.response.text();
      data = data.replaceAll(poxInfo.contract_id, `${pool.address}.pox-4`);

      return new Response(data, {
        status: context.response.status,
        statusText: context.response.statusText,
        headers: context.response.headers,
      });
    };

    pool.wrappedClient = new StackingClient(
      pool.address,
      new StacksDevnet({ fetchFn: withRetry(3, createFetchFn(fetch, { post: redirectContract })) })
    );
  });

  afterEach(async () => {
    await stopRegtestEnv();
  });

  async function deployWrapperContract() {
    const tx = await makeContractDeploy({
      codeBody: fs.readFileSync('src/contracts/pox-4-wrapper.clar', 'utf8'),
      contractName: 'pox-4',
      anchorMode: 'onChainOnly',
      network,
      senderKey: pool.key,
    });

    const deployTx = await broadcastAndWaitForTransaction(tx, network);
    expect(deployTx.tx_result.repr).toContain('(ok');
    expect(deployTx.tx_status).toEqual('success');
  }

  test('Pool can deploy wrapper contract', async () => {
    // TEST CASE
    // pool deploys the wrapper contract
    await deployWrapperContract();
  });

  test('Pool stacker can set pool delegate permission (allow-contract-caller), Pool stacker can remove pool delegate permission (disallow-contract-caller)', async () => {
    // TEST CASE
    // alice tries to use the pool as a caller
    // the transaction should fail
    // alice allows the pool as a caller
    // alice tries to use the pool as a caller (delegate-stx)
    // the transaction should succeed
    // alice tries to use the pool as a caller (revoke-delegate-stx)
    // the transaction should succeed
    // alice disallows the pool as a caller
    // alice tries to use the pool as a caller
    // the transaction should fail

    const alice = getAccount(ENV.REGTEST_KEYS[1]);

    const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

    // TRANSACTION (wrapped delegate-stx)
    const { txid: delegateBeforeAllow } = await pool.wrappedClient.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const delegateBeforeAllowTx = await waitForTransaction(delegateBeforeAllow);
    expect(delegateBeforeAllowTx.tx_result.repr).toContain('(err');
    expect(delegateBeforeAllowTx.tx_status).toEqual('abort_by_response');

    const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);

    // TRANSACTION (alice allow-contract-caller)
    const tx1 = await makeContractCall({
      contractAddress,
      contractName,
      functionName: 'allow-contract-caller',
      functionArgs: [Cl.contractPrincipal(pool.address, 'pox-4'), Cl.none()],
      anchorMode: 'onChainOnly',
      network,
      senderKey: alice.key,
    });
    const allowTx = await broadcastAndWaitForTransaction(tx1, network);
    expect(allowTx.tx_result.repr).toContain('(ok');
    expect(allowTx.tx_status).toEqual('success');

    // TRANSACTION (wrapped delegate-stx)
    const { txid: delegateAfterAllow } = await pool.wrappedClient.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const delegateAfterAllowTx = await waitForTransaction(delegateAfterAllow);
    expect(delegateAfterAllowTx.tx_result.repr).toContain('(ok');
    expect(delegateAfterAllowTx.tx_status).toEqual('success');

    // TRANSACTION (wrapped revoke-delegate-stx)
    const { txid: revokeDelegate } = await pool.wrappedClient.revokeDelegateStx({
      privateKey: alice.key,
    });
    const revokeDelegateTx = await waitForTransaction(revokeDelegate);
    expect(revokeDelegateTx.tx_result.repr).toContain('(ok');
    expect(revokeDelegateTx.tx_status).toEqual('success');

    // TRANSACTION (alice disallow-contract-caller)
    const tx2 = await makeContractCall({
      contractAddress,
      contractName,
      functionName: 'disallow-contract-caller',
      functionArgs: [Cl.contractPrincipal(pool.address, 'pox-4')],
      anchorMode: 'onChainOnly',
      network,
      senderKey: alice.key,
    });
    const disallowTx = await broadcastAndWaitForTransaction(tx2, network);
    expect(disallowTx.tx_result.repr).toContain('(ok');
    expect(disallowTx.tx_status).toEqual('success');

    // TRANSACTION (wrapped delegate-stx)
    const { txid: delegateAfterDisallow } = await pool.wrappedClient.delegateStx({
      amountMicroStx: amount,
      delegateTo: pool.address,
      poxAddress: pool.btcAddress,
      privateKey: alice.key,
    });
    const delegateAfterDisallowTx = await waitForTransaction(delegateAfterDisallow);
    expect(delegateAfterDisallowTx.tx_result.repr).toContain('(err');
    expect(delegateAfterDisallowTx.tx_status).toEqual('abort_by_response');
  });

  describe('caller', () => {
    const alice = getAccount(ENV.REGTEST_KEYS[1]);

    test('Allowed contract cannot remove permission', async () => {
      // TEST CASE
      // alice allows the pool
      // alice tries to disallow pool via a caller (via wrapper contract)
      // the transaction should fail

      // TRANSACTION (alice allow-contract-caller)
      const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);
      const tx = await makeContractCall({
        contractAddress,
        contractName,
        functionName: 'allow-contract-caller',
        functionArgs: [Cl.contractPrincipal(pool.address, 'pox-4'), Cl.none()],
        anchorMode: 'onChainOnly',
        network,
        senderKey: alice.key,
      });
      const allowTx = await broadcastAndWaitForTransaction(tx, network);
      expect(allowTx.tx_result.repr).toContain('(ok');
      expect(allowTx.tx_status).toEqual('success');

      // TRANSACTION (wrapped disallow-contract-caller)
      const tx2 = await makeContractCall({
        contractAddress: pool.address,
        contractName: 'pox-4',
        functionName: 'disallow-contract-caller',
        functionArgs: [Cl.contractPrincipal(pool.address, 'pox-4')],
        anchorMode: 'onChainOnly',
        network,
        senderKey: alice.key,
      });
      const disallowTx = await broadcastAndWaitForTransaction(tx2, network);
      expect(disallowTx.tx_result.repr).toContain('(err');
      expect(disallowTx.tx_status).toEqual('abort_by_response');
    });

    test('Other contract cannot remove permission', async () => {
      // TEST CASE
      // alice allows bob random
      // alice tries to disallow pool via a caller (via wrapper contract)
      // the transaction should fail

      const bob = getAccount(ENV.REGTEST_KEYS[2]);

      // TRANSACTION (alice allow-contract-caller)
      const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);
      const tx = await makeContractCall({
        contractAddress,
        contractName,
        functionName: 'allow-contract-caller',
        functionArgs: [Cl.contractPrincipal(bob.address, 'random'), Cl.none()],
        anchorMode: 'onChainOnly',
        network,
        senderKey: alice.key,
      });
      const allowTx = await broadcastAndWaitForTransaction(tx, network);
      expect(allowTx.tx_result.repr).toContain('(ok');
      expect(allowTx.tx_status).toEqual('success');

      // TRANSACTION (wrapped disallow-contract-caller)
      const tx2 = await makeContractCall({
        contractAddress: pool.address,
        contractName: 'pox-4',
        functionName: 'disallow-contract-caller',
        functionArgs: [Cl.contractPrincipal(bob.address, 'random')],
        anchorMode: 'onChainOnly',
        network,
        senderKey: alice.key,
      });
      const disallowTx = await broadcastAndWaitForTransaction(tx2, network);
      expect(disallowTx.tx_result.repr).toContain('(err');
      expect(disallowTx.tx_status).toEqual('abort_by_response');
    });

    test('Allowed contract can delegate for the stacker', async () => {
      // TEST CASE
      // alice allows the pool
      // alice delegate-stx (via wrapper contract)
      // pool delegate-stack-stack
      // pool commits
      // alice is locked

      // TRANSACTION (alice allow-contract-caller)
      const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);
      const tx = await makeContractCall({
        contractAddress,
        contractName,
        functionName: 'allow-contract-caller',
        functionArgs: [Cl.contractPrincipal(pool.address, 'pox-4'), Cl.none()],
        anchorMode: 'onChainOnly',
        network,
        senderKey: alice.key,
      });
      const allowTx = await broadcastAndWaitForTransaction(tx, network);
      expect(allowTx.tx_result.repr).toContain('(ok');
      expect(allowTx.tx_status).toEqual('success');

      const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

      // TRANSACTION (wrapped delegate-stx)
      const { txid: delegate } = await pool.wrappedClient.delegateStx({
        amountMicroStx: amount,
        delegateTo: pool.address,
        poxAddress: pool.btcAddress,
        privateKey: alice.key,
      });
      const delegateTx = await waitForTransaction(delegate);
      expect(delegateTx.tx_result.repr).toContain('(ok');
      expect(delegateTx.tx_status).toEqual('success');

      // TRANSACTION (pool delegate-stack-stx)
      const { txid: delegateStack } = await pool.client.delegateStackStx({
        stacker: alice.address,
        amountMicroStx: amount,
        poxAddress: pool.btcAddress,
        burnBlockHeight: poxInfo.current_burnchain_block_height,
        cycles: 1,
        privateKey: pool.key,
      });
      const delegateStackTx = await waitForTransaction(delegateStack);
      expect(delegateStackTx.tx_result.repr).toContain('(ok');
      expect(delegateStackTx.tx_status).toEqual('success');

      // TRANSACTION (pool commit)
      const signature = pool.client.signPoxSignature({
        topic: 'agg-commit',
        period: 1,
        rewardCycle: poxInfo.reward_cycle_id + 1,
        authId: 0,
        maxAmount: amount,
        poxAddress: pool.btcAddress,
        signerPrivateKey: pool.signerPrivateKey,
      });
      const { txid: commit } = await pool.client.stackAggregationCommitIndexed({
        poxAddress: pool.btcAddress,
        rewardCycle: poxInfo.reward_cycle_id + 1,
        signerKey: pool.signerPublicKey,
        signerSignature: signature,
        maxAmount: amount,
        authId: 0,
        privateKey: pool.key,
      });
      const commitTx = await waitForTransaction(commit);
      expect(commitTx.tx_result.repr).toContain('(ok');
      expect(commitTx.tx_status).toEqual('success');

      // CHECK LOCKED
      expect(await alice.client.getAccountBalanceLocked()).toBe(amount);
    });

    test('Allowed contract can revoke delegate status for the stacker', async () => {
      // TEST CASE
      // alice allows the pool
      // alice delegate-stx
      // alice revoke-delegate-stx (via wrapper contract)
      // alice is not delegated

      // TRANSACTION (alice allow-contract-caller)
      const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);
      const tx = await makeContractCall({
        contractAddress,
        contractName,
        functionName: 'allow-contract-caller',
        functionArgs: [Cl.contractPrincipal(pool.address, 'pox-4'), Cl.none()],
        anchorMode: 'onChainOnly',
        network,
        senderKey: alice.key,
      });
      const allowTx = await broadcastAndWaitForTransaction(tx, network);
      expect(allowTx.tx_result.repr).toContain('(ok');
      expect(allowTx.tx_status).toEqual('success');

      // TRANSACTION (wrapped revoke-delegate-stx)
      const { txid: revokeDelegate } = await pool.wrappedClient.revokeDelegateStx({
        privateKey: alice.key,
      });
      const revokeDelegateTx = await waitForTransaction(revokeDelegate);
      expect(revokeDelegateTx.tx_result.repr).toContain('(ok');
      expect(revokeDelegateTx.tx_status).toEqual('success');

      // CHECK NOT DELEGATED
      const delegationInfo = await alice.client.getDelegationStatus();
      expect(delegationInfo.delegated).toBe(false);
    });

    test('Other contract cannot revoke delegate status for the stacker', async () => {
      // TEST CASE
      // alice allows bob random
      // alice delegate-stx
      // alice revoke-delegate-stx (via wrapper contract)
      // the transaction should fail

      const bob = getAccount(ENV.REGTEST_KEYS[2]);

      // TRANSACTION (alice allow-contract-caller)
      const [contractAddress, contractName] = client.parseContractId(poxInfo.contract_id);
      const tx = await makeContractCall({
        contractAddress,
        contractName,
        functionName: 'allow-contract-caller',
        functionArgs: [Cl.contractPrincipal(bob.address, 'random'), Cl.none()],
        anchorMode: 'onChainOnly',
        network,
        senderKey: alice.key,
      });
      const allowTx = await broadcastAndWaitForTransaction(tx, network);
      expect(allowTx.tx_result.repr).toContain('(ok');
      expect(allowTx.tx_status).toEqual('success');

      const amount = BigInt(poxInfo.min_amount_ustx) * 2n;

      // TRANSACTION (alice delegate-stx)
      const { txid: delegate } = await alice.client.delegateStx({
        amountMicroStx: amount,
        delegateTo: pool.address,
        poxAddress: pool.btcAddress,
        privateKey: alice.key,
      });
      const delegateTx = await waitForTransaction(delegate);
      expect(delegateTx.tx_result.repr).toContain('(ok');
      expect(delegateTx.tx_status).toEqual('success');

      // TRANSACTION (wrapped revoke-delegate-stx)
      const { txid: revokeDelegate } = await pool.wrappedClient.revokeDelegateStx({
        privateKey: alice.key,
      });
      const revokeDelegateTx = await waitForTransaction(revokeDelegate);
      expect(revokeDelegateTx.tx_result.repr).toContain('(err');
      expect(revokeDelegateTx.tx_status).toEqual('abort_by_response');
    });
  });
});

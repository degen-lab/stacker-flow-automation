import { Pox4SignatureTopic, StackingClient } from '@stacks/stacking';
import {
  POOL_BTC_ADDRESS,
  POOL_PRIVATE_KEY,
  SIGNER_PRIVATE_KEY,
} from './consts';
import { createStacksPrivateKey } from '@stacks/transactions';
import secp256k1 from 'secp256k1';

export const acceptDelegation = async (
  stacker: string,
  amount: number,
  currentBlock: number,
  poxAddress: string | null,
  cycles: number,
  nonce: bigint,
  poolClient: StackingClient
) => {
  return (
    await poolClient.delegateStackStx({
      stacker,
      amountMicroStx: amount,
      poxAddress: poxAddress || POOL_BTC_ADDRESS,
      burnBlockHeight: currentBlock,
      cycles,
      privateKey: POOL_PRIVATE_KEY,
      nonce,
    })
  ).txid;
};

export const extendDelegation = async (
  stacker: string,
  poxAddress: string | null,
  extendCount: number,
  nonce: bigint,
  poolClient: StackingClient
) => {
  return (
    await poolClient.delegateStackExtend({
      stacker,
      poxAddress: poxAddress || POOL_BTC_ADDRESS,
      extendCount,
      privateKey: POOL_PRIVATE_KEY,
      nonce,
    })
  ).txid;
};

export const increaseDelegation = async (
  stacker: string,
  poxAddress: string | null,
  increaseBy: number,
  nonce: bigint,
  poolClient: StackingClient
) => {
  return (
    await poolClient.delegateStackIncrease({
      stacker,
      poxAddress: poxAddress || POOL_BTC_ADDRESS,
      increaseBy,
      privateKey: POOL_PRIVATE_KEY,
      nonce,
    })
  ).txid;
};

export const commitDelegation = async (
  poxAddress: string,
  rewardCycle: number,
  nonce: bigint,
  poolClient: StackingClient
) => {
  const { signerKey, signerSignature, authId, maxAmount } =
    await generateSignature(
      poolClient,
      Pox4SignatureTopic.AggregateCommit,
      poxAddress,
      rewardCycle,
      1
    );

  return (
    await poolClient.stackAggregationCommitIndexed({
      rewardCycle,
      poxAddress,
      privateKey: POOL_PRIVATE_KEY,
      signerKey,
      signerSignature,
      authId,
      maxAmount,
      nonce,
    })
  ).txid;
};

export const increaseCommitment = async (
  poxAddress: string,
  rewardCycle: number,
  rewardIndex: number,
  nonce: bigint,
  poolClient: StackingClient
) => {
  const { signerKey, signerSignature, authId, maxAmount } =
    await generateSignature(
      poolClient,
      Pox4SignatureTopic.AggregateIncrease,
      poxAddress,
      rewardCycle,
      1
    );

  return (
    await poolClient.stackAggregationIncrease({
      rewardCycle,
      poxAddress,
      rewardIndex,
      privateKey: POOL_PRIVATE_KEY,
      signerKey,
      signerSignature,
      authId,
      maxAmount,
      nonce,
    })
  ).txid;
};

export const generateSignature = async (
  poolClient: StackingClient,
  topic: Pox4SignatureTopic,
  poxAddress: string,
  rewardCycle: number,
  period: number
) => {
  await sleep(10);

  const signerKey = convertPrivateKeyToPublicKey(SIGNER_PRIVATE_KEY as string);
  const maxAmount = Number.MAX_SAFE_INTEGER;
  const authId = Date.now();

  const signerSignature = poolClient.signPoxSignature({
    topic,
    poxAddress,
    rewardCycle,
    period,
    signerPrivateKey: createStacksPrivateKey(SIGNER_PRIVATE_KEY as string),
    maxAmount,
    authId,
  });

  return {
    signerKey,
    signerSignature,
    maxAmount,
    authId,
  };
};

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const convertPrivateKeyToPublicKey = (privateKeyHex: string) => {
  const privateKeyWithFlag = Buffer.from(privateKeyHex, 'hex');
  const privateKey = privateKeyWithFlag.subarray(0, 32);
  const publicKey = secp256k1.publicKeyCreate(privateKey);
  return Buffer.from(publicKey).toString('hex');
};

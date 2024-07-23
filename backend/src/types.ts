export interface AvailableDelegateStackStx {
  functionName: string;
  stacker: string;
  amountUstx: number;
  currentBlock: number;
  poxAddress: string;
  maxCycles: number;
}

export interface AvailableDelegateStackExtend {
  functionName: string;
  stacker: string;
  poxAddress: string;
  maxExtendCycles: number;
}

export interface AvailableDelegateStackIncrease {
  functionName: string;
  stacker: string;
  poxAddress: string;
  increaseAmount: number;
}

export interface AvailableStackAggregationCommitIndexed {
  functionName: string;
  poxAddress: string;
  rewardCycle: number;
}

export interface AvailableStackAggregationIncrease {
  functionName: string;
  poxAddress: string;
  rewardCycle: number;
  rewardIndex: number;
  amountUstx: number;
  finalAmount: number;
}

export type AvailableTransaction =
  | AvailableDelegateStackStx
  | AvailableDelegateStackExtend
  | AvailableDelegateStackIncrease
  | AvailableStackAggregationCommitIndexed
  | AvailableStackAggregationIncrease;

export interface DatabaseEntry {
  functionName: string;
  txid: string;
  stacker?: string;
  poxAddress?: string;
  startCycle?: number;
  endCycle?: number;
  rewardCycle?: number;
  rewardIndex?: number;
}

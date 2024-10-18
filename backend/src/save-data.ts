import { all, query } from './db';
import {
  insertDelegations,
  insertAcceptedDelegations,
  insertCommittedDelegations,
  insertPreviousDelegations,
  insertPendingTransactions,
  selectPendingTransactions,
  clearPendingTransactionsByTxid,
  insertEvents,
  selectEvents,
  clearEvents,
  insertRewardIndexes,
  selectRewardIndexes,
  clearRewardIndexes,
} from './models';
import { DatabaseEntry } from './types';

export const saveDelegations = async (data: Map<string, any>) => {
  for (const [stacker, value] of data) {
    await query(insertDelegations, [
      stacker,
      value.startCycle,
      value.endCycle,
      value.poxAddress,
      value.amountUstx,
    ]);
  }
};

export const savePreviousDelegations = async (data: Map<string, any>) => {
  for (const [stacker, value] of data) {
    for (const item of value) {
      await query(insertPreviousDelegations, [
        stacker,
        item.startCycle,
        item.endCycle,
        item.poxAddress,
        item.amountUstx,
      ]);
    }
  }
};

export const saveAcceptedDelegations = async (data: Map<string, any>) => {
  for (const [stacker, value] of data) {
    for (const item of value) {
      await query(insertAcceptedDelegations, [
        stacker,
        item.startCycle,
        item.endCycle,
        item.poxAddress,
        item.amountUstx,
      ]);
    }
  }
};

export const saveCommittedDelegations = async (data: Map<string, any>) => {
  for (const [poxAddress, value] of data) {
    for (const item of value) {
      await query(insertCommittedDelegations, [
        poxAddress,
        item.startCycle,
        item.endCycle,
        item.amountUstx,
        item.rewardIndex,
      ]);
    }
  }
};

export const savePendingTransaction = async (entry: DatabaseEntry) => {
  const {
    functionName,
    txid,
    stacker,
    poxAddress,
    startCycle,
    endCycle,
    rewardCycle,
    rewardIndex,
  } = entry;
  await query(insertPendingTransactions, [
    txid,
    functionName,
    stacker,
    poxAddress,
    startCycle,
    endCycle,
    rewardCycle,
    rewardIndex,
  ]);
};

export const saveEvents = async (events: any) => {
  for (const event of events) {
    const { event_index, event_type, tx_id, contract_log } = event;
    await query(insertEvents, [
      event_index,
      event_type,
      tx_id,
      contract_log?.contract_id || null,
      contract_log?.topic || null,
      contract_log?.value.hex || null,
      contract_log?.value.repr || null,
    ]);
  }
};

export const saveRewardIndexes = async (rewardIndexes: any) => {
  for (const [cycle, entries] of rewardIndexes) {
    for (const entry of entries) {
      await query(insertRewardIndexes, [
        cycle,
        entry.rewardIndex,
        entry.poxAddress,
        entry.signer,
        JSON.stringify(entry.stacker),
        entry.totalUstx,
      ]);
    }
  }
};

export const getPendingTransactions = async (): Promise<DatabaseEntry[]> => {
  return await all(selectPendingTransactions);
};

export const deletePendingTransaction = async (txid: string) => {
  await query(clearPendingTransactionsByTxid, [txid]);
};

export const getDatabaseEvents = async () => {
  const rows = await all(selectEvents);

  return rows.map((row) => ({
    event_index: row.event_index,
    event_type: row.event_type,
    tx_id: row.tx_id,
    contract_log: {
      contract_id: row.contract_id,
      topic: row.topic,
      value: {
        hex: row.hex,
        repr: row.repr,
      },
    },
  }));
};

export const deleteEvents = async () => {
  await query(clearEvents);
};

export const getRewardIndexes = async () => {
  const data = new Map();
  const rows = await all(selectRewardIndexes);

  rows.forEach((row) => {
    const entry = {
      rewardIndex: row.rewardIndex,
      poxAddress: row.poxAddress,
      signer: row.signer,
      stacker: JSON.parse(row.stacker),
      totalUstx: row.totalUstx,
    };

    if (!data.has(row.cycle)) {
      data.set(row.cycle, []);
    }

    data.get(row.cycle).push(entry);
  });

  return data;
};

export const deleteRewardIndexes = async () => {
  await query(clearRewardIndexes);
};

export const createDelegationsTable = `
  CREATE TABLE IF NOT EXISTS Delegations (
    stacker TEXT NOT NULL,
    startCycle INTEGER,
    endCycle INTEGER,
    poxAddress TEXT,
    amountUstx INTEGER NOT NULL
  );
`;

export const createPreviousDelegationsTable = `
  CREATE TABLE IF NOT EXISTS PreviousDelegations (
    stacker TEXT NOT NULL,
    startCycle INTEGER,
    endCycle INTEGER,
    poxAddress TEXT,
    amountUstx INTEGER NOT NULL
  );
`;

export const createAcceptedDelegationsTable = `
  CREATE TABLE IF NOT EXISTS AcceptedDelegations (
    stacker TEXT NOT NULL,
    startCycle INTEGER,
    endCycle INTEGER,
    poxAddress TEXT,
    amountUstx INTEGER NOT NULL
  );
`;

export const createCommittedDelegationsTable = `
  CREATE TABLE IF NOT EXISTS CommittedDelegations (
    poxAddress TEXT NOT NULL,
    startCycle INTEGER,
    endCycle INTEGER,
    amountUstx INTEGER NOT NULL,
    rewardIndex INTEGER
  );
`;

export const createPendingTransactionsTable = `
  CREATE TABLE IF NOT EXISTS PendingTransactions (
    txid TEXT NOT NULL,
    functionName TEXT NOT NULL,
    stacker TEXT,
    poxAddress TEXT,
    startCycle INTEGER,
    endCycle INTEGER,
    rewardCycle INTEGER,
    rewardIndex INTEGER
  );
`;

export const clearDelegations = `
  DELETE FROM Delegations;
`;

export const clearPreviousDelegations = `
  DELETE FROM PreviousDelegations;
`;

export const clearAcceptedDelegations = `
  DELETE FROM AcceptedDelegations;
`;

export const clearCommittedDelegations = `
  DELETE FROM CommittedDelegations;
`;

export const clearPendingTransactionsByTxid = `
  DELETE FROM PendingTransactions WHERE txid = ?
  `;

export const insertDelegations = `
  INSERT INTO Delegations (stacker, startCycle, endCycle, poxAddress, amountUstx)
  VALUES (?, ?, ?, ?, ?)
`;

export const insertPreviousDelegations = `
  INSERT INTO PreviousDelegations (stacker, startCycle, endCycle, poxAddress, amountUstx)
  VALUES (?, ?, ?, ?, ?)
`;

export const insertAcceptedDelegations = `
  INSERT INTO AcceptedDelegations (stacker, startCycle, endCycle, poxAddress, amountUstx)
  VALUES (?, ?, ?, ?, ?)
`;

export const insertCommittedDelegations = `
  INSERT INTO CommittedDelegations (poxAddress, startCycle, endCycle, amountUstx, rewardIndex)
  VALUES (?, ?, ?, ?, ?)
`;

export const insertPendingTransactions = `
  INSERT INTO PendingTransactions (txid, functionName, stacker, poxAddress, startCycle, endCycle, rewardCycle, rewardIndex)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

export const selectDelegations = `
  SELECT * FROM Delegations
`;

export const selectPreviousDelegations = `
  SELECT * FROM PreviousDelegations
`;

export const selectAcceptedDelegations = `
  SELECT * FROM AcceptedDelegations
`;

export const selectCommittedDelegations = `
  SELECT * FROM CommittedDelegations
`;

export const selectPendingTransactions = `
  SELECT * FROM PendingTransactions
`;

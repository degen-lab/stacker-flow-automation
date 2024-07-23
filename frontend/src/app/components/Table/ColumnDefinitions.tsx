import { CustomColumnDef, RowData } from "@/types/tableTypes";
import { formatNumber, shortenAddress } from "@/utils/formatters";
import {
  GET_BITCOIN_ADDRESS_EXPLORER_URL,
  GET_STACKS_ADDRESS_EXPLORER_URL,
  GET_TRANSACTION_EXPLORER_URL,
} from "@/constants/urls";

const createStackerColumn = (): CustomColumnDef<RowData> => ({
  header: "Stacker",
  accessorKey: "stacker",
  filterType: "text",
  cell: ({ getValue }) => {
    const stacker = getValue<string>();
    const shortStacker = shortenAddress(stacker);
    return (
      <a
        href={GET_STACKS_ADDRESS_EXPLORER_URL(stacker)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-purple-600 dark:text-purple-400 hover:underline"
      >
        {shortStacker}
      </a>
    );
  },
});

const createPoxAddressColumn = (): CustomColumnDef<RowData> => ({
  header: "POX Address",
  accessorKey: "poxAddress",
  filterType: "text",
  cell: ({ getValue }) => {
    const poxAddress = getValue<string>();
    const shortPoxAddress = shortenAddress(poxAddress);
    return (
      <a
        href={GET_BITCOIN_ADDRESS_EXPLORER_URL(poxAddress)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-orange-600 dark:text-orange-400 hover:underline"
      >
        {shortPoxAddress}
      </a>
    );
  },
});

const createTransactionColumn = (): CustomColumnDef<RowData> => ({
  header: "Transaction ID",
  accessorKey: "txid",
  filterType: "text",
  cell: ({ getValue }) => {
    const poxAddress = getValue<string>();
    const shortPoxAddress = shortenAddress(poxAddress);
    return (
      <a
        href={GET_TRANSACTION_EXPLORER_URL(poxAddress)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-purple-600 dark:text-purple-400 hover:underline"
      >
        {shortPoxAddress}
      </a>
    );
  },
});

const createAmountStxColumn = (): CustomColumnDef<RowData> => ({
  header: "Amount STX",
  accessorKey: "amountStx",
  filterType: "number",
  cell: ({ getValue }) => formatNumber(getValue<number>()),
});

const createStartCycleColumn = (): CustomColumnDef<RowData> => ({
  header: "Start Cycle",
  accessorKey: "startCycle",
  filterType: "number",
});

const createEndCycleColumn = (): CustomColumnDef<RowData> => ({
  header: "End Cycle",
  accessorKey: "endCycle",
  filterType: "number",
});

const createFunctionNameColumn = (): CustomColumnDef<RowData> => ({
  header: "Function Name",
  accessorKey: "functionName",
  filterType: "text",
});

const createRewardCycleColumn = (): CustomColumnDef<RowData> => ({
  header: "Reward Cycle",
  accessorKey: "rewardCycle",
  filterType: "number",
});

const createRewardIndexColumn = (): CustomColumnDef<RowData> => ({
  header: "Reward Index",
  accessorKey: "rewardIndex",
  filterType: "number",
});

export const columnsMap: Record<string, CustomColumnDef<RowData>[]> = {
  acceptedDelegations: [
    createStackerColumn(),
    createStartCycleColumn(),
    createEndCycleColumn(),
    createPoxAddressColumn(),
    createAmountStxColumn(),
  ],
  pendingTransactions: [
    createTransactionColumn(),
    createFunctionNameColumn(),
    createStackerColumn(),
    createPoxAddressColumn(),
    createStartCycleColumn(),
    createEndCycleColumn(),
    createRewardCycleColumn(),
    createRewardIndexColumn(),
  ],
  delegations: [
    createStackerColumn(),
    createStartCycleColumn(),
    createEndCycleColumn(),
    createPoxAddressColumn(),
    createAmountStxColumn(),
  ],
  previousDelegations: [
    createStackerColumn(),
    createStartCycleColumn(),
    createEndCycleColumn(),
    createPoxAddressColumn(),
    createAmountStxColumn(),
  ],
  committedDelegations: [
    createPoxAddressColumn(),
    createStartCycleColumn(),
    createEndCycleColumn(),
    createAmountStxColumn(),
    createRewardIndexColumn(),
  ],
};

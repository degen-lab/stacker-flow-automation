export enum NetworkUsed {
  Mainnet = "mainnet",
  Testnet = "testnet",
  NakamotoTestnet = "nakamotoTestnet",
  Devnet = "devnet",
}

const networkFromEnv = process.env.NEXT_PUBLIC_NETWORK;
const serverPath = process.env.NEXT_PUBLIC_SERVER_URL;

console.log("Current Network is: ", networkFromEnv);
console.log("Server is at: ", serverPath);

if (!Object.values(NetworkUsed).includes(networkFromEnv as NetworkUsed))
  throw new Error(`Invalid network: ${networkFromEnv}`);

if (!serverPath || serverPath.trim() === "") {
  throw new Error(`Invalid server path: ${serverPath}`);
}

export const NETWORK: NetworkUsed = networkFromEnv as NetworkUsed;
export const SERVER_URL = serverPath + "/data";

const API_CONFIG = {
  [NetworkUsed.Mainnet]: {
    GET_TRANSACTION_EXPLORER_URL(txid: string): string {
      return `https://explorer.hiro.so/txid/${txid}?chain=mainnet`;
    },
    GET_BITCOIN_ADDRESS_EXPLORER_URL(address: string): string {
      return `https://mempool.space/address/${address}`;
    },
    GET_STACKS_ADDRESS_EXPLORER_URL(address: string): string {
      return `https://explorer.hiro.so/address/${address}?chain=mainnet`;
    },
  },
  [NetworkUsed.Testnet]: {
    GET_TRANSACTION_EXPLORER_URL(txid: string): string {
      return `https://explorer.hiro.so/txid/${txid}?chain=testnet`;
    },
    GET_BITCOIN_ADDRESS_EXPLORER_URL(address: string): string {
      return `https://mempool.space/testnet/address/${address}`;
    },
    GET_STACKS_ADDRESS_EXPLORER_URL(address: string): string {
      return `https://explorer.hiro.so/address/${address}?chain=testnet`;
    },
  },
  [NetworkUsed.NakamotoTestnet]: {
    GET_TRANSACTION_EXPLORER_URL(txid: string): string {
      return `https://explorer.hiro.so/txid/${txid}?chain=testnet&api=https://api.nakamoto.testnet.hiro.so`;
    },
    GET_BITCOIN_ADDRESS_EXPLORER_URL(address: string): string {
      return `https://mempool.space/testnet/address/${address}`; // TODO: replace this
    },
    GET_STACKS_ADDRESS_EXPLORER_URL(address: string): string {
      return `https://explorer.hiro.so/address/${address}?chain=testnet&api=https://api.nakamoto.testnet.hiro.so`;
    },
  },
  [NetworkUsed.Devnet]: {
    GET_TRANSACTION_EXPLORER_URL(txid: string): string {
      return `http://localhost:8000/txid/${txid}?chain=mainnet`;
    },
    GET_BITCOIN_ADDRESS_EXPLORER_URL(address: string): string {
      return `http://localhost:8001/address/${address}`;
    },
    GET_STACKS_ADDRESS_EXPLORER_URL(address: string): string {
      return `http://localhost:8000/address/${address}?chain=mainnet`;
    },
  },
};

const currentConfig = API_CONFIG[NETWORK];

export const GET_TRANSACTION_EXPLORER_URL =
  currentConfig.GET_TRANSACTION_EXPLORER_URL;
export const GET_BITCOIN_ADDRESS_EXPLORER_URL =
  currentConfig.GET_BITCOIN_ADDRESS_EXPLORER_URL;
export const GET_STACKS_ADDRESS_EXPLORER_URL =
  currentConfig.GET_STACKS_ADDRESS_EXPLORER_URL;

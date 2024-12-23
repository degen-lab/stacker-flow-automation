import {
  StacksDevnet,
  StacksMainnet,
  StacksNetwork,
  StacksNetworkName,
  StacksTestnet,
} from '@stacks/network';
import { Network as BitcoinNetworkName } from 'bitcoin-address-validation';
import dotenv from 'dotenv';
dotenv.config();

export enum NetworkUsed {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
  NakamotoTestnet = 'nakamotoTestnet',
  Devnet = 'devnet',
}

export const NETWORK: NetworkUsed = process.env.NETWORK as NetworkUsed;

// Function to map NetworkUsed to StacksNetworkName
const getStacksNetworkName = (network: NetworkUsed): StacksNetworkName => {
  switch (network) {
    case NetworkUsed.Mainnet:
      return 'mainnet';
    case NetworkUsed.Devnet:
      return 'devnet';
    case NetworkUsed.NakamotoTestnet:
    case NetworkUsed.Testnet:
    default:
      return 'testnet';
  }
};

const getBitcoinNetworkName = (network: NetworkUsed): BitcoinNetworkName => {
  switch (network) {
    case NetworkUsed.Mainnet:
      return BitcoinNetworkName.mainnet;
    case NetworkUsed.Devnet:
    case NetworkUsed.NakamotoTestnet:
    case NetworkUsed.Testnet:
    default:
      return BitcoinNetworkName.testnet;
  }
};

export const STACKS_NETWORK_NAME: StacksNetworkName =
  getStacksNetworkName(NETWORK);

export const BITCOIN_NETWORK_NAME: BitcoinNetworkName =
  getBitcoinNetworkName(NETWORK);

const getStacksNetworkInstance = (network: NetworkUsed): StacksNetwork => {
  switch (network) {
    case NetworkUsed.Mainnet:
      return new StacksMainnet();
    case NetworkUsed.Devnet:
      return new StacksDevnet();
    case NetworkUsed.NakamotoTestnet:
      return new StacksTestnet({ url: 'https://api.nakamoto.testnet.hiro.so' });
    case NetworkUsed.Testnet:
    default:
      return new StacksTestnet();
  }
};

export const STACKS_NETWORK_INSTANCE: StacksNetwork =
  getStacksNetworkInstance(NETWORK);

const API_CONFIG = {
  [NetworkUsed.Mainnet]: {
    API_URL: 'https://api.mainnet.hiro.so/extended/v1/tx/events',
    POX_INFO_URL: 'https://api.mainnet.hiro.so/v2/pox',
    REWARD_INDEXES_API_URL:
      'https://api.mainnet.hiro.so/v2/map_entry/SP000000000000000000002Q6VF78/pox-4/reward-cycle-pox-address-list',
    GET_TRANSACTION_API_URL(txid: string): string {
      return `https://api.mainnet.hiro.so/extended/v1/tx/${txid}`;
    },
    POX_CONTRACT_ADDRESS: 'SP000000000000000000002Q6VF78.pox-4',
    POOL_OPERATOR: process.env.POOL_OPERATOR,
    // POOL_OPERATOR: 'SP2TXK60BBCSNDE1GNNMHM89KY6ZY4ZHTBTJP8X9V',
    POOL_BTC_ADDRESS: process.env.POOL_BTC_ADDRESS,
    POOL_PRIVATE_KEY: process.env.POOL_PRIVATE_KEY,
    SIGNER_PRIVATE_KEY: process.env.SIGNER_PRIVATE_KEY,
    DATABASE_FILE: 'mainnet-pox-events.sqlite',
    FIRST_POX_4_CYCLE: 84,
  },
  [NetworkUsed.Testnet]: {
    API_URL: 'https://api.testnet.hiro.so/extended/v1/tx/events',
    POX_INFO_URL: 'https://api.testnet.hiro.so/v2/pox',
    REWARD_INDEXES_API_URL:
      'https://api.testnet.hiro.so/v2/map_entry/ST000000000000000000002AMW42H/pox-4/reward-cycle-pox-address-list',
    GET_TRANSACTION_API_URL(txid: string): string {
      return `https://api.testnet.hiro.so/extended/v1/tx/${txid}`;
    },
    POX_CONTRACT_ADDRESS: 'ST000000000000000000002AMW42H.pox-4',
    POOL_OPERATOR: process.env.POOL_OPERATOR,
    POOL_BTC_ADDRESS: process.env.POOL_BTC_ADDRESS,
    POOL_PRIVATE_KEY: process.env.POOL_PRIVATE_KEY,
    SIGNER_PRIVATE_KEY: process.env.SIGNER_PRIVATE_KEY,
    DATABASE_FILE: 'testnet-pox-events.sqlite',
    FIRST_POX_4_CYCLE: 1,
  },
  [NetworkUsed.NakamotoTestnet]: {
    API_URL: 'https://api.nakamoto.testnet.hiro.so/extended/v1/tx/events',
    POX_INFO_URL: 'https://api.nakamoto.testnet.hiro.so/v2/pox',
    REWARD_INDEXES_API_URL:
      'https://api.nakamoto.testnet.hiro.so/v2/map_entry/ST000000000000000000002AMW42H/pox-4/reward-cycle-pox-address-list',
    GET_TRANSACTION_API_URL(txid: string): string {
      return `https://api.nakamoto.testnet.hiro.so/extended/v1/tx/${txid}`;
    },
    POX_CONTRACT_ADDRESS: 'ST000000000000000000002AMW42H.pox-4',
    POOL_OPERATOR: process.env.POOL_OPERATOR,
    POOL_BTC_ADDRESS: process.env.POOL_BTC_ADDRESS,
    POOL_PRIVATE_KEY: process.env.POOL_PRIVATE_KEY,
    SIGNER_PRIVATE_KEY: process.env.SIGNER_PRIVATE_KEY,
    DATABASE_FILE: 'nakamoto-testnet-pox-events.sqlite',
    FIRST_POX_4_CYCLE: 1,
  },
  [NetworkUsed.Devnet]: {
    API_URL: 'http://localhost:3999/extended/v1/tx/events',
    POX_INFO_URL: 'http://localhost:3999/v2/pox',
    REWARD_INDEXES_API_URL:
      'http://localhost:3999/v2/map_entry/ST000000000000000000002AMW42H/pox-4/reward-cycle-pox-address-list',
    GET_TRANSACTION_API_URL(txid: string): string {
      return `http://localhost:3999/extended/v1/tx/${txid}`;
    },
    POX_CONTRACT_ADDRESS: 'ST000000000000000000002AMW42H.pox-4',
    POOL_OPERATOR: process.env.POOL_OPERATOR,
    POOL_BTC_ADDRESS: process.env.POOL_BTC_ADDRESS,
    POOL_PRIVATE_KEY: process.env.POOL_PRIVATE_KEY,
    SIGNER_PRIVATE_KEY: process.env.SIGNER_PRIVATE_KEY,
    DATABASE_FILE: 'devnet-pox-events.sqlite',
    FIRST_POX_4_CYCLE: 1,
  },
};

const currentConfig = API_CONFIG[NETWORK];

export const API_URL = currentConfig.API_URL;
export const POX_INFO_URL = currentConfig.POX_INFO_URL;
export const REWARD_INDEXES_API_URL = currentConfig.REWARD_INDEXES_API_URL;
export const GET_TRANSACTION_API_URL = currentConfig.GET_TRANSACTION_API_URL;
export const POX_CONTRACT_ADDRESS = currentConfig.POX_CONTRACT_ADDRESS;
export const POOL_OPERATOR = currentConfig.POOL_OPERATOR;
export const DATABASE_PATH = process.env.DATABASE_PATH ? `${process.env.DATABASE_PATH}/${currentConfig.DATABASE_FILE}`: `src/database/${currentConfig.DATABASE_FILE}`;
export const POOL_BTC_ADDRESS = currentConfig.POOL_BTC_ADDRESS;
export const POOL_PRIVATE_KEY = currentConfig.POOL_PRIVATE_KEY;
export const SIGNER_PRIVATE_KEY = currentConfig.SIGNER_PRIVATE_KEY;
export const FIRST_POX_4_CYCLE = currentConfig.FIRST_POX_4_CYCLE;
export const LOOP_SLEEP_TIME = process.env.LOOP_SLEEP_TIME || 60000;

export const LIMIT = 100;
export const SERVER_PORT = 8080;
export const MAX_CYCLES_FOR_OPERATIONS = parseInt(
  process.env.MAX_CYCLES_FOR_OPERATIONS as string
);

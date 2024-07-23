import { validateStacksAddress } from '@stacks/transactions';
import {
  BITCOIN_NETWORK_NAME,
  MAX_CYCLES_FOR_OPERATIONS,
  NETWORK,
  POOL_BTC_ADDRESS,
  POOL_OPERATOR,
  POOL_PRIVATE_KEY,
  SIGNER_PRIVATE_KEY,
} from './consts';
import { validate } from 'bitcoin-address-validation';

const isValidStacksNetwork = (network: string) => {
  switch (network) {
    case 'mainnet':
    case 'testnet':
    case 'nakamotoTestnet':
    case 'devnet':
      return true;
    default:
      return false;
  }
};

const isNullOrEmpty = (value: string | undefined | null): boolean => {
  return value === undefined || value === null || value.trim() === '';
};

const isValidStxAddress = (stxAddress: string | undefined) => {
  if (isNullOrEmpty(stxAddress)) return false;
  return validateStacksAddress(stxAddress as string);
};

const isValidBtcAddress = (btcAddress: string | undefined) => {
  if (isNullOrEmpty(btcAddress)) return false;
  return validate(btcAddress as string, BITCOIN_NETWORK_NAME);
};

export const runConfigValidator = () => {
  if (!isValidStacksNetwork(NETWORK)) throw 'Config: invalid stacks network';

  if (!isValidStxAddress(POOL_OPERATOR))
    throw 'Config: invalid pool operator stx address';

  if (!isValidBtcAddress(POOL_BTC_ADDRESS))
    throw 'Config: invalid pool btc address';

  if (isNullOrEmpty(POOL_PRIVATE_KEY)) throw 'Config: invalid pool private key';

  if (isNullOrEmpty(SIGNER_PRIVATE_KEY))
    throw 'Config: invalid signer private key';

  if (MAX_CYCLES_FOR_OPERATIONS < 1 || MAX_CYCLES_FOR_OPERATIONS > 12)
    throw 'Config: max cycles for operations out of bounds (1 <= max cycles <= 12)';
};

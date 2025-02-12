import axios from 'axios';
import {
  POX_CONTRACT_ADDRESS,
  API_URL,
  LIMIT,
  POX_INFO_URL,
  REWARD_INDEXES_API_URL,
  GET_TRANSACTION_API_URL,
} from './consts';
import {
  hexToCV,
  cvToHex,
  cvToJSON,
  tupleCV,
  uintCV,
} from '@stacks/transactions';

export const fetchData = async (offset: number, retry = 0): Promise<any> => {
  try {
    if (retry > 6) {
      return null;
    };

    const response = await axios.get(API_URL, {
      params: {
        address: POX_CONTRACT_ADDRESS,
        limit: LIMIT,
        offset: offset,
      },
    });

    return response.data.events;
  } catch (error: any) {
    if (error.response) {
      if (error.response.status !== 404) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return fetchData(offset, retry + 1);
      } else {
        console.error(`Error: ${error}`);
      }
    } else {
      console.error(`Error: ${error}`);
    }
    return null;
  }
};

export const fetchPoxInfo = async (retry = 0): Promise<any> => {
  try {
    if (retry > 6) {
      return null;
    };

    const response = await axios.get(POX_INFO_URL);

    return response.data;
  } catch (error: any) {
    if (error.response) {
      if (error.response.status !== 404) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return fetchPoxInfo(retry + 1);
      } else {
        console.error(`Error fetching PoX info: ${error}`);
      }
    } else {
      console.error(`Error fetching PoX info: ${error}`);
    }
    return null;
  }
};

export const fetchRewardCycleIndex = async (
  rewardCycle: number,
  index: number,
  retry = 0,
): Promise<any> => {
  try {
    if (retry > 6) {
      return null;
    };

    const data = cvToHex(
      tupleCV({ 'reward-cycle': uintCV(rewardCycle), index: uintCV(index) })
    );

    const response = await axios.post(REWARD_INDEXES_API_URL, data, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return cvToJSON(hexToCV(response.data.data));
  } catch (error: any) {
    if (error.response) {
      if (error.response.status !== 404) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return fetchRewardCycleIndex(rewardCycle, index, retry + 1);
      } else {
        console.error(`Error fetching reward cycle index info: ${error}`);
      }
    } else {
      console.error(`Error fetching reward cycle index info: ${error}`);
    }
    return null;
  }
};

export const fetchTransactionInfo = async (txid: string, retry = 0): Promise<any> => {
  try {
    if (retry > 6) {
      return null;
    };

    const response = await axios.get(GET_TRANSACTION_API_URL(txid.startsWith('0x') ? txid : `0x${txid}`));

    return response.data;
  } catch (error: any) {
    if (error.response) {
      if (error.response.status !== 404) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return fetchTransactionInfo(txid, retry + 1);
      } else if (error.response.status === 404) {
        return null;
      } else {
        console.error(`Error fetching transaction info: ${error}`);
      }
    } else {
      console.error(`Error fetching transaction info: ${error}`);
    }
    return null;
  }
};

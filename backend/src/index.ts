import { fetchPoxInfo } from './api-calls';
import { runConfigValidator } from './checks';
import {
  checkAndBroadcastTransactions,
  createAndClearTables,
  getEvents,
  getRewardIndexesMap,
  parseEvents,
  removeAnchoredTransactionsFromDatabase,
} from './helpers';
import {
  saveAcceptedDelegations,
  saveCommittedDelegations,
  saveDelegations,
  savePreviousDelegations,
} from './save-data';
import { sleep } from './transactions';
import { LOOP_SLEEP_TIME } from './consts';

const main = async () => {
  runConfigValidator();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const poxInfo = await fetchPoxInfo();

      if (poxInfo === null) {
        continue;
      }

      const currentCycle = poxInfo.current_cycle.id;
      const currentBlock = poxInfo.current_burnchain_block_height;
      const blocksUntilPreparePhase = poxInfo.next_cycle.blocks_until_prepare_phase;

      console.log('Current cycle:', currentCycle);

      if (blocksUntilPreparePhase > 0) {
        console.log(
          "Next cycle's prepare phase starts in",
          blocksUntilPreparePhase,
          'blocks.'
        );

        await createAndClearTables();
  
        const dbEntries = await removeAnchoredTransactionsFromDatabase();
        const events = await getEvents();
  
        const rewardIndexesMap = await getRewardIndexesMap(currentCycle);
  
        const {
          delegations,
          acceptedDelegations,
          committedDelegations,
          previousDelegations,
        } = await parseEvents(events, rewardIndexesMap);
  
        console.log('Delegations:', delegations);
        console.log('Accepted Delegations:', acceptedDelegations);
        console.log('Committed Delegations:', committedDelegations);
        console.log('Previous Delegations:', previousDelegations);
  
        await saveDelegations(delegations);
        await saveAcceptedDelegations(acceptedDelegations);
        await saveCommittedDelegations(committedDelegations);
        await savePreviousDelegations(previousDelegations);
  
        await checkAndBroadcastTransactions(
          delegations,
          acceptedDelegations,
          committedDelegations,
          currentCycle,
          currentBlock,
          dbEntries
        );
  
        console.log('Data has been saved successfully.');
        await sleep(LOOP_SLEEP_TIME);
      } else {
        console.log(
          "We're in the prepare phase for cycle",
          currentCycle + 1 + ".",
          "Waiting for the next cycle to start in order to resume the operations."
        );

        await sleep(LOOP_SLEEP_TIME);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
};

main();

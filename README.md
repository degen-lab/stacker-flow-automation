# Stacker Flow Automation

This application is designed to automate stacking transactions for pool operators within a local environment, removing the need for an additional smart contract layer or manual intervention with the PoX-4 contract.

It functions by continuously monitoring PoX events through the Hiro API, identifying eligible stacking transactions, and automatically broadcasting them when available.

The application also includes a straightforward front-end interface, allowing for easily tracking and managing of the pool's stacking status.

In this repository, you can find 3 components:
- `backend` - the application that automates the stacking transactions
- `frontend` - a simplist fronend that shows useful information regarding the stacking status of the pool
- `testing` - integration testing that spins up a devnet node instance and simulates the flow that a pool is going through

### Prerequisites

In order to run this application, you'll need to first install `npm` and `git` packages, then clone this repository.
```bash
$ sudo apt install npm && \
  git clone https://github.com/degen-lab/stacker-flow-automation && \
  cd stacker-flow-automation
```

---

## Backend

### Description

This is the main application, and its purpose is to find and broadcast available stacking transactions for pools. It can be run as a standalone application, without the need of running the `frontend` or the `testing` packages.

The contract calls that are being automated by this application are:
- `delegate-stack-stx`
- `delegate-stack-extend`
- `delegate-stack-increase`
- `stack-aggregation-commit-indexed`
- `stack-aggregation-increase`

It will print information regarding the current status of PoX, the pool's stacking status, and logs about the broadcasted transactions.

### Setup & Running

The setup assumes you have gone through the prerequisites (installed `npm`, `git` and cloned the repository).

Firstly, you have to install the required packages through `npm`:
```bash
$ cd backend && \
  npm i
```

The `backend` folder contains an `.env.example` file that you have to modify with your pool data:
```bash
# The stacks network
# Possible options:
#   - mainnet
#   - testnet
#   - nakamotoTestnet
#   - devnet
NETWORK="devnet"

# Your pool operator address (the one that makes the stacking transactions)
POOL_OPERATOR="ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND"

# Your pool's BTC reward address
POOL_BTC_ADDRESS="mg1C76bNTutiCDV3t9nWhZs3Dc8LzUufj8"

# The private key matching the pool operator address (used for transaction signing)
POOL_PRIVATE_KEY="f9d7206a47f14d2870c163ebab4bf3e70d18f5d14ce1031f3902fbbc894fe4c701"

# The private key of the signer (used for generating signatures for `stack-aggregation-*` contract calls)
SIGNER_PRIVATE_KEY="530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101"

# How many cycles in the future to do the stacking transactions (between 1 and 12)
MAX_CYCLES_FOR_OPERATIONS="12"
```

After you have modified the `.env.example` file, you then have move it to `.env`:
```bash
$ mv .env.example .env
```

In the end, the application can be run using a `npm` script:
```bash
$ npm run start
```

Note: The application makes requests to Hiro's hosted API, so if you have other applications running/websites open that also use Hiro's API (e.g. Hiro Explorer, LockStacks etc.), the performance of the application will be reduced, as it waits until the rate limits are gone.

Note: First run is expected to take over 15 minutes on `mainnet` due to the amount of PoX events it has to fetch, but successive runs are quicker because the application saves the previously processed events into a database.
The application will run in a continuous loop, if you want to stop it, you'll have to send a `Ctrl+C` signal.

---

## Frontend

### Description

The frontend package was written as a wrapper above the database created by the backend, and is used to see the pending (broadcasted) transactions, active/previous delegations, along with the accepted and the committed delegations for the pool.

The frontend contains tables for each of these statuses:
- `Delegations`: Each row will symbolize the data of an active or non-revoked `delegate-stx` call that was made to this pool.
- `Previous Delegations`: Each row contains the data of revoked delegations (`revoke-delegate-stx`), in the same format as the `Delegations` table.
- `Accepted Delegations`: These rows represent the data of calls made by the pool operator to accept a stacker's delegation - `delegate-stack-stx`, `delegate-stack-extend` and `delegate-stack-increase`.
- `Committed Delegations`: These rows conist of the data of calls made by the pool operator to commit (stack) one or more delegations to a PoX address - `stack-aggregation-commit-indexed` and `stack-aggregation-increase`.
- `Pending Transactions`: The rows of this table are the transactions that this application has broadcasted and their status is still `pending` in the mempool. They will be removed from this table once they are anchored.

### Setup & Running

The setup assumes you have gone through the prerequisites (installed `npm`, `git` and cloned the repository).

Since the frontend is tied to the database into which the backend writes, you have to first run the backend. The frontend will print the data of the latest iteration through the events of the backend, so if the backend is not running, the data might become outdated.

To run the frontend, you'll need 2 terminal sessions. In the first one, you have to start the backend's server that reads the data from the database and listens to requests:
```bash
$ cd backend && \
  npm run server

# In the meantime, the backend can be run in another terminal session with the given `npm run start` command, as stated in the `Backend` section.
```

In the second terminal session, you have to navigate to the `frontend` folder and install the required packages through `npm`:
```bash
$ cd frontend && \
  npm i
```

The `frontend` folder contains an `.env.example` file that you have to modify with your network and server data:
```bash
# The stacks network
# Possible options:
#   - mainnet
#   - testnet
#   - nakamotoTestnet
#   - devnet
NEXT_PUBLIC_NETWORK="devnet"

# The URL of the backend's server (if you wish to change the port, you'll have to also change it in the [backend's server constant](https://github.com/degen-lab/stacker-flow-automation/blob/main/backend/src/consts.ts#L153), otherwise this can remain unchanged)
NEXT_PUBLIC_SERVER_URL="http://localhost:8080"
```

After you have modified the `.env.example` file, you then have move it to `.env`:
```bash
$ mv .env.example .env
```

In the end, the application can be run using a `npm` script:
```bash
$ npm run start
```

Note: Since the frontend is tied to the backend's database, the data might become outdated if you're not actively running the backend alongside.

---

## Testing

### Description

This package spins up a devnet instance, delegates to the pool address, starts the backend and then ensures the actual flow that the pool goes through is as expected.

Note: This testing environment is unstable when running multiple tests at once, and you might have to comment out tests in the `testing/integration/src/tests/automation.test.ts` file to only run 1 test at a time.

Note: Due to the way the devnet instance is running and the amount of operations in the tests, each of them will take approximately 2 hours to run.

### Setup & Running

In order to run the tests, you'll need to install docker engine (or desktop) and docker compose on your machine: https://docs.docker.com/compose/install/.

You'll also have to install `node` package for the CLI:
```bash
$ sudo apt install nodejs
```

First, you'll have to ensure that the `.env` in `backend` folder contains the provided `devnet` setup (from `.env.example`):
```bash
NETWORK="devnet"
POOL_OPERATOR="ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND"
POOL_BTC_ADDRESS="mg1C76bNTutiCDV3t9nWhZs3Dc8LzUufj8"
POOL_PRIVATE_KEY="f9d7206a47f14d2870c163ebab4bf3e70d18f5d14ce1031f3902fbbc894fe4c701"
SIGNER_PRIVATE_KEY="530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101"
MAX_CYCLES_FOR_OPERATIONS="12"
```

Navigate to the `stacker-flow-automation/testing/integration` folder and install the required `npm` packages:
```bash
$ cd stacker-flow-automation/testing/integration && \
  npm i
```

Afterwards, you have to modify the `.env.example` in the `testing/integration` folder:
```bash
# These should be left as they are
STACKS_CHAIN=testnet
STACKS_NODE=http://localhost:20443
STACKS_API=http://localhost:3999

SENDER_STX_ADDRESS=ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND
SENDER_KEY=f9d7206a47f14d2870c163ebab4bf3e70d18f5d14ce1031f3902fbbc894fe4c701

SIGNER_KEY=530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101

POLL_INTERVAL=750
RETRY_INTERVAL=500

STACKS_TX_TIMEOUT=1000000000

# Change `/path/to/stacker-flow-automation/testing/regtest` to your path to the `regtest` folder
REGTEST_UP_CMD=cd /path/to/stacker-flow-automation/testing/regtest && docker compose down --volumes --remove-orphans --timeout=1 --rmi=all && docker compose up --build -d
REGTEST_DOWN_CMD=cd /path/to/stacker-flow-automation/testing/regtest && docker compose down --volumes --remove-orphans --timeout=1 --rmi=all
```

Then, you have to rename the `.env.example` file to `.env`:
```bash
$ mv .env.example .env
```

To ensure that the tests are being run as expected, you should only run 1 test at once, as mentioned in the note of the `Description` section.

To run the tests:
```bash
# Change `/path/to/stacker-flow-automation/testing/regtest` to your path to the `regtest` folder in the 2 appearances in this command
$ node 'node_modules/.bin/jest' '/path/to/stacker-flow-automation/testing/integration/src/tests/automation.test.ts' -c '/path/to/stacker-flow-automation/testing/integration/jest.config.js' -t 'Stacks transactions'
```

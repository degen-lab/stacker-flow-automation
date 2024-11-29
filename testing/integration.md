---
description: A repo for running functional tests on Stacks.
---

# Integration Testing

> from [https://github.com/hirosystems/stacks-functional-tests](https://github.com/hirosystems/stacks-functional-tests)

`src/tests` consists of suites of tests that can be run independently against different network setups. For example, we might run a suite against a full regtest, while another suite runs against clarinet, or another runs against live testnet.

## Local Docker

It's possible to run a local dockerized environment for testing using the `docker-compose.yml` file in the root of this repo.

## Regtest

It's possible to use this repo side-by-side with the Stacks regtest environment.

1. Setup the `regtest-env` folder next to this repo.
2. Run the regtest environment OR configure the ENV to automatically start/stop the regtest environment.
   1. `REGTEST_DOWN_CMD` - The command to stop the regtest environment (e.g. `cd /regtest && docker compose down`).
   2. `REGTEST_UP_CMD` - The command to start the regtest environment (e.g. `cd /regtest && docker compose up -d`).
3. Run a test via Jest.

# Stacks Regtest Environment

Easily run a Stacks node in Kypton mode with a Bitcoind regtest instance

## Self-contained Stacks 3.0 image

This repo uses Docker Compose to orchestrate multiple images and run a fully working Nakamoto Stacks environment. This includes:

- A Bitcoin regtest node
- A Stacks miner node
- 3 Stacks signers
- Scripts for monitoring and auto-stacking

Make sure you have Docker and Docker Compose installed and running on your machine, then run:

```bash
./run.sh
```

This will output the logs from each service. You can view the logs for a single service with:

```
docker-compose logs $service_name
```

Add `-f` to automatically follow new logs. The service names can be found in [./docker-compose.yml](./docker-compose.yml), such as `stacks-node`, `signer-0`, and `monitor`.

## Self-contained Stacks 2.1 image

This repo publishes a Docker image that contains a Stacks 2.1 node running in Krypton mode (local testnet). It bundles a `bitcoind` regtest instance and an auto-mining script.

The image can be ran as a drop-in replacement for a Stacks node running in `mocknet` mode, but with the benefits of full burnchain and miner capabilities such as:

- PoX reward slot registration and payout events
- Mempool events
- Microblock events

#### Usage examples

Run a Stacks node, mining blocks on a 2.5 second interval, with the RPC port 20443 exposed (https://localhost:20443/v2/info):

```shell
docker run -p "20443:20443" -e "MINE_INTERVAL=2.5s" hirosystems/stacks-api-e2e

```

An event observer can be registered using the `STACKS_EVENT_OBSERVER` environnment variable. For example, assuming the observer is running on the host machine on port 3700:

```shell
docker run -p "20443:20443" -e "MINE_INTERVAL=2.5s" -e "STACKS_EVENT_OBSERVER=host.docker.internal:3700" hirosystems/stacks-api-e2e
```

A Stacks 2.1 `coinbase-alt-recipient` reward address can be configured using the `REWARD_RECIPIENT` environment variable.
This configures the Stacks node `[miner.block_reward_recipient]` toml config value.
If not specified, regular `coinbase` transactions will be mined.
Note that the address will receive STX rewards 100 blocks _after_ Epoch 2.1 is activated.
Usage example:

```shell
docker run -p "20443:20443" -e "REWARD_RECIPIENT=STQM73RQC4EX0A07KWG1J5ECZJYBZS4SJ4ERC6WN" hirosystems/stacks-api-e2e
```

In addition, the image has several tags providing different Stacks bootstrapping sequence configs:

- The default tag `latest` starts directly in epoche 2.1 with PoX-2 activated
- Tag `stacks2.1-transition` starts in epoche 2.0, then transitions to epoche 2.1 after ~15 blocks, then activates PoX-2 after another ~15 blocks

It's possible to build images with custom bootstrapping sequences by specifying the build args:

- `STACKS_21_HEIGHT` - the burnblock height at which epoch 2.1 is activated
- `STACKS_POX2_HEIGHT` - the burnblock height at which PoX-2 is activated

Note that the first Stacks block will be mined at burnblock height 104.
So, for example, if you want epoch 2.1 to activate at Stacks block 10, and PoX-2 at Stacks block 20, then specify `STACKS_21_HEIGHT=114` and `STACKS_POX2_HEIGHT=124`:

```shell
# clone repo
git clone https://github.com/hirosystems/stacks-regtest-env.git
cd stacks-regtest-env
# build
docker build -t my_image -f Dockerfile.e2e --build-arg "STACKS_21_HEIGHT=114" --build-arg "STACKS_POX2_HEIGHT=124" .
# run
docker run -p "20443:20443" -e "MINE_INTERVAL=5s" my_image
```

## Run with Docker Compose

Clone this repo and change to its directory:

```shell
git clone https://github.com/hirosystems/stacks-regtest-env.git
cd stacks-regtest-env
```

Run the command to start the network:

```shell
docker compose -f docker-compose-miner.yml -f docker-compose-follower.yml up --build -d
```

The initial [101 blocks on bitcoind](https://developer.bitcoin.org/examples/testing.html#regtest-mode) (required to have any spendable tBTC in regtest) are mined immediately, after which Stacks blocks will be mined for every new bitcoin block.

The block mining interval defaults to 500ms. This can be configured with the `MINE_INTERVAL` environment variable, for example:

```shell
MINE_INTERVAL=2.5s docker compose -f docker-compose-miner.yml -f docker-compose-follower.yml up --build -d
```

The Stacks 2.1 `coinbase-alt-recipient` reward address can be configured using the `REWARD_RECIPIENT` environment variable.
This configures the Stacks node `[miner.block_reward_recipient]` toml config value.
If not specified, regular `coinbase` transactions will be mined.
Note that the address will receive STX rewards 100 blocks _after_ Epoch 2.1 is activated.
Usage example:

```shell
REWARD_RECIPIENT=STQM73RQC4EX0A07KWG1J5ECZJYBZS4SJ4ERC6WN MINE_INTERVAL=2.5s docker compose -f docker-compose-miner.yml -f docker-compose-follower.yml up --build -d
```

#### The following services are created

###### Bitcoind node in regtest mode

- JSON-RPC interface available at http://localhost:18443
- RPC auth username and password are both `btc`
- tBTC is available from the miner account:
  - Address: `miEJtNKa3ASpA19v5ZhvbKTEieYjLpzCYT`
  - Private key: `9e446f6b0c6a96cf2190e54bcd5a8569c3e386f091605499464389b8d4e0bfc201`
  - Private key (WIF format): `cStMQXkK5yTFGP3KbNXYQ3sJf2qwQiKrZwR9QJnksp32eKzef1za`

###### Mining script that automatically triggers bitcoind to mine new Bitcoin blocks

- Block mining interval defaults to 500ms, configure using the `MINE_INTERVAL` environment variable

###### Stacks-node in kypton mode (i.e. a regtest-like local testnet)

- RPC available at http://localhost:20443/v2/info
- STX are preseeded to several accounts listed in [`stacks-krypton-miner.toml`](stacks-krypton-miner.toml), first account:
  - Address: `STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6`
  - Key: `cb3df38053d132895220b9ce471f6b676db5b9bf0b4adefb55f2118ece2478df01`

###### Stacks API instance

- API available at http://localhost:3999/extended/v1/block
- Playground/debug webpages listed at http://localhost:3999/extended/v1/debug/broadcast

###### PostgreSQL database required by the Stacks API

- PG port is available at 5490
- Both username and password are `postgres`
- Database name: `stacks_blockchain_api`

_Note:_ The chainstate is reset every time docker compose `up` is run.

### Shutdown

```shell
docker compose -f docker-compose-miner.yml -f docker-compose-follower.yml down --volumes --remove-orphans --timeout=1 --rmi=all
```

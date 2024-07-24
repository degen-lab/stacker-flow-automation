import { Static, Type } from '@sinclair/typebox';
import envSchema from 'env-schema';

const schema = Type.Object({
  STACKS_CHAIN: Type.Enum({ mainnet: 'mainnet', testnet: 'testnet' }),
  /** STX address of the issuer of all transactions we will be testing */
  SENDER_STX_ADDRESS: Type.String(),
  /** `SENDER_STX_ADDRESS`'s hex private key */
  SENDER_KEY: Type.String(),
  /** STX address of the receiver of any sent tokens */
  RECEIVER_STX_ADDRESS: Type.String(),

  /** Stacks Blockchain API host */
  STACKS_API: Type.String(),

  /** Stacks node host */
  STACKS_NODE: Type.String(),

  STACKS_TX_TIMEOUT: Type.Integer({ default: 15_000 }),

  POLL_INTERVAL: Type.Integer({ default: 1000 }),
  RETRY_INTERVAL: Type.Integer({ default: 500 }),

  /** List of pre-funded STX addresses on regtest-env */
  REGTEST_KEYS: Type.Array(Type.String(), {
    default: [
      // taken from regtest-env `stacks-kryton-miner.toml`
      'cb3df38053d132895220b9ce471f6b676db5b9bf0b4adefb55f2118ece2478df01',
      '21d43d2ae0da1d9d04cfcaac7d397a33733881081f0b2cd038062cf0ccbb752601',
      '5b8303150239eceaba43892af7cdd1fa7fc26eda5182ebaaa568e3341d54a4d001',
    ],
  }),
  /**
   * Signer private key for generating signatures.
   * On regtest-env, this should be the private key of a participating signer.
   */
  SIGNER_KEY: Type.String({
    default: '7036b29cb5e235e5fd9b09ae3e8eec4404e44906814d5d01cbca968a60ed4bfb01',
  }),

  /**
   * Command to run to start regtest-env.
   * e.g. this could `cd` into the regtest-env directory and run `docker compose up -d`
   */
  REGTEST_UP_CMD: Type.String({ default: "echo 'no-op'" }),
  /**
   * Command to run to stop regtest-env.
   * e.g. this could `cd` into the regtest-env directory and run `docker compose down`
   */
  REGTEST_DOWN_CMD: Type.String({ default: "echo 'no-op'" }),

  /**
   * If true, doesn't wait for unlock and verifying rewards in regtest tests.
   * Useful for speeding up tests when running many long-running regtest-env tests
   */
  REGTEST_SKIP_UNLOCK: Type.Boolean({ default: false }),
});
type Env = Static<typeof schema>;

export const ENV = envSchema<Env>({
  dotenv: true,
  schema,
});

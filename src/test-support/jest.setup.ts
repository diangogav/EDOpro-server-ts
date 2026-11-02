// Tests never read the local .env: it may point at production databases, and
// evolution-types loads it (dotenv.config()) as a side effect of being imported,
// so whether a suite saw it depended on module load order.
jest.mock("dotenv", () => ({ config: () => ({ parsed: {} }) }));

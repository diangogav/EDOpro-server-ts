import { CardEntity } from "./CardEntity";
import { CardTextEntity } from "./CardTextEntity";
import { DataSource, DataSourceOptions } from "typeorm";

// Read the base directly from the environment instead of importing `config`:
// this module evaluates its options at load time, and importing `config` would
// break any test that partially mocks `src/config` (kept in sync with config.resources.dir).
const resourcesDir = process.env.RESOURCES_DIR ?? "./resources/current";

const options: DataSourceOptions = {
	type: "better-sqlite3",
	database: "evolution_cards.db",
	synchronize: true,
	logging: false,
	entities: [CardEntity, CardTextEntity],
	subscribers: [],
	migrations: [],
};

const mercuryOptions: DataSourceOptions = {
	type: "better-sqlite3",
	database: `${resourcesDir}/ygopro/prereleases/tcg/cards.cdb`,
	synchronize: true,
	logging: false,
	entities: [CardEntity, CardTextEntity],
	subscribers: [],
	migrations: [],
};
export const mercuryDataSource = new DataSource(mercuryOptions);
export const dataSource = new DataSource(options);

import { CardEntity } from "./CardEntity";
import { CardTextEntity } from "./CardTextEntity";
import { DataSource, DataSourceOptions } from "typeorm";

export const CARD_DB_FILE = "evolution_cards.db";

const cardOptions = (database: string): DataSourceOptions => ({
	type: "better-sqlite3",
	database,
	synchronize: true,
	logging: false,
	entities: [CardEntity, CardTextEntity],
	subscribers: [],
	migrations: [],
});

// Build a fresh card DataSource for a given file. Used at boot and to rebuild a
// new one on hot reload before atomically swapping it in.
export function buildCardDataSource(database: string = CARD_DB_FILE): DataSource {
	return new DataSource(cardOptions(database));
}

// Holder: consumers must read getCardDataSource() per query (not capture it), so
// a hot-reload swap takes effect on their next call.
let current = buildCardDataSource(CARD_DB_FILE);

export function getCardDataSource(): DataSource {
	return current;
}

export function swapCardDataSource(next: DataSource): DataSource {
	const previous = current;
	current = next;

	return previous;
}

const mercuryOptions: DataSourceOptions = {
	type: "better-sqlite3",
	database: "./resources/ygopro/prereleases/tcg/cards.cdb",
	synchronize: true,
	logging: false,
	entities: [CardEntity, CardTextEntity],
	subscribers: [],
	migrations: [],
};
export const mercuryDataSource = new DataSource(mercuryOptions);

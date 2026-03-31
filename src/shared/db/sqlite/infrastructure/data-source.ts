import { CardEntity } from "@edopro/card/infrastructure/sqlite/CardEntity";
import { CardTextEntity } from "@edopro/card/infrastructure/sqlite/CardTextEntity";
import { DataSource, DataSourceOptions } from "typeorm";

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
	database: "./resources/ygopro/prereleases/tcg/cards.cdb",
	synchronize: true,
	logging: false,
	entities: [CardEntity, CardTextEntity],
	subscribers: [],
	migrations: [],
};
export const mercuryDataSource = new DataSource(mercuryOptions);
export const dataSource = new DataSource(options);

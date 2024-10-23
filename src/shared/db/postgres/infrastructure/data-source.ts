import { DataSource, DataSourceOptions } from "typeorm";

import { CardEntity } from "../../../../edopro/card/infrastructure/postgres/CardEntity";
import { CardTextEntity } from "../../../../edopro/card/infrastructure/postgres/CardTextEntity";

const createDataSourceOptions = (databasePath: string): DataSourceOptions => ({
	type: "sqlite",
	database: databasePath,
	synchronize: true,
	logging: false,
	entities: [CardEntity, CardTextEntity],
	subscribers: [],
	migrations: [],
});

const options = createDataSourceOptions("jtp_evolution_cards.db");
const mercuryOptions = createDataSourceOptions("./mercury/pre-releases/cards.cdb");

export const dataSource = new DataSource(options);
export const mercuryDataSource = new DataSource(mercuryOptions);

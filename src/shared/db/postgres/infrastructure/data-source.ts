import { DataSource, DataSourceOptions } from "typeorm";

import { CardEntity } from "../../../../edopro/card/infrastructure/postgres/CardEntity";
import { CardTextEntity } from "../../../../edopro/card/infrastructure/postgres/CardTextEntity";

const options: DataSourceOptions = {
	type: "sqlite",
	database: "jtp_evolution_cards.db",
	synchronize: true,
	logging: false,
	entities: [CardEntity, CardTextEntity],
	subscribers: [],
	migrations: [],
};
export const dataSource = new DataSource(options);

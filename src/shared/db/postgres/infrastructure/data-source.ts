import { config } from "src/config";
import { DataSource, DataSourceOptions } from "typeorm";

import { UserProfileEntity } from "../../../user-profile/infrastructure/postgres/UserProfileEntity";

const options: DataSourceOptions = {
	type: "postgres",
	host: config.postgres.host,
	port: config.postgres.port,
	username: config.postgres.username,
	password: config.postgres.password,
	database: config.postgres.database,
	synchronize: true,
	logging: true,
	entities: [UserProfileEntity],
	subscribers: [],
	migrations: [],
};
export const dataSource = new DataSource(options);

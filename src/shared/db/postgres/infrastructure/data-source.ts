import { config } from "src/config";
import { DataSource, DataSourceOptions } from "typeorm";

import { UserEntity } from "../../../user/infrastructure/postgres/UserEntity";

const options: DataSourceOptions = {
	type: "postgres",
	host: config.postgres.host,
	port: config.postgres.port,
	username: config.postgres.username,
	password: config.postgres.password,
	database: config.postgres.database,
	synchronize: true,
	logging: true,
	entities: [UserEntity],
	subscribers: [],
	migrations: [],
};
export const dataSource = new DataSource(options);

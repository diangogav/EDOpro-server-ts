import { config } from "src/config";
import { DuelResumeEntity } from "src/shared/stats/match-resume/duel-resume/infrastructure/DuelResumeEntity";
import { MatchResumeEntity } from "src/shared/stats/match-resume/infrastructure/MatchResumeEntity";
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
	entities: [UserProfileEntity, MatchResumeEntity, DuelResumeEntity],
	subscribers: [],
	migrations: [],
};
export const dataSource = new DataSource(options);

import { config } from "src/config";
import { DuelResumeEntity } from "src/shared/stats/match-resume/duel-resume/infrastructure/DuelResumeEntity";
import { MatchResumeEntity } from "src/shared/stats/match-resume/infrastructure/MatchResumeEntity";
import { DataSource, DataSourceOptions } from "typeorm";

import { PlayerStatsEntity } from "../../../stats/player-stats/infrastructure/PlayerStatsEntity";
import { UserProfileEntity } from "../../../user-profile/infrastructure/postgres/UserProfileEntity";

const options: DataSourceOptions = {
	type: "postgres",
	host: config.postgres.host,
	port: config.postgres.port,
	username: config.postgres.username,
	password: config.postgres.password,
	database: config.postgres.database,
	synchronize: false,
	logging: true,
	entities: [UserProfileEntity, MatchResumeEntity, DuelResumeEntity, PlayerStatsEntity],
	subscribers: [],
	migrations: ["src/shared/db/postgres/infrastructure/migrations/*.ts"],
};
export const dataSource = new DataSource(options);

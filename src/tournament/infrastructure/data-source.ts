import { isAbsolute } from "path";
import { DataSource } from "typeorm";

import { CreateCommunityTournamentBrackets1792330546826 } from "./migrations/1792330546826-CreateCommunityTournamentBrackets";

import { TournamentRowSchema } from "./TournamentRow";

export function buildTournamentDataSource(database: string): DataSource {
	if (!isAbsolute(database)) throw new Error("TOURNAMENT_DATABASE_PATH must be an absolute path");
	return new DataSource({
		type: "better-sqlite3",
		database,
		entities: [TournamentRowSchema],
		synchronize: false,
		migrations: [CreateCommunityTournamentBrackets1792330546826],
		migrationsTableName: "community_tournament_migrations",
		prepareDatabase: (connection) => {
			connection.pragma("journal_mode = WAL");
			connection.pragma("busy_timeout = 5000");
		},
	});
}

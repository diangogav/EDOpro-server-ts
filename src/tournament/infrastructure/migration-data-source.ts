import { buildTournamentDataSource } from "./data-source";

export default buildTournamentDataSource(process.env.TOURNAMENT_DATABASE_PATH ?? "");

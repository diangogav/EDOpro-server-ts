import { TournamentPrimitives } from "./Tournament";

export interface TournamentRepository {
	create(tournament: TournamentPrimitives): Promise<void>;
	find(id: string): Promise<TournamentPrimitives | null>;
	/** Atomically reject a stale writer; never overwrite a newer bracket. */
	save(tournament: TournamentPrimitives, expectedRevision: number): Promise<void>;
}

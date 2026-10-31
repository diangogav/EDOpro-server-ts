import { randomUUID } from "crypto";

import {
	CreateTournament,
	Tournament,
	TournamentEntrant,
	TournamentError,
	TournamentPrimitives,
} from "../domain/Tournament";
import { TournamentRepository } from "../domain/TournamentRepository";

export class TournamentService {
	public constructor(
		private readonly repository: TournamentRepository,
		private readonly now: () => string = () => new Date().toISOString(),
		private readonly newId: () => string = randomUUID,
	) {}

	public async create(
		actor: string,
		settings: Omit<CreateTournament, "id" | "organizerId" | "now">,
	): Promise<TournamentPrimitives> {
		const state = Tournament.create({
			...settings,
			id: this.newId(),
			organizerId: actor,
			now: this.now(),
		}).toPrimitives();
		await this.repository.create(state);
		return state;
	}

	public async get(id: string): Promise<TournamentPrimitives> {
		const state = await this.repository.find(id);
		if (!state) throw new TournamentError("not_found", "Tournament not found");
		return state;
	}

	public async join(
		id: string,
		actor: string,
		revision: number,
		displayName: string,
		characterId: number | null,
	): Promise<TournamentPrimitives> {
		const entrant: TournamentEntrant = {
			id: this.newId(),
			userId: actor,
			displayName,
			characterId,
		};
		return this.change(id, revision, (tournament) => tournament.join(entrant));
	}

	public async start(id: string, actor: string, revision: number): Promise<TournamentPrimitives> {
		return this.change(id, revision, (tournament) => tournament.start(actor));
	}

	public async report(
		id: string,
		actor: string,
		revision: number,
		matchId: string,
		winsA: number,
		winsB: number,
	): Promise<TournamentPrimitives> {
		return this.change(id, revision, (tournament) =>
			tournament.report(actor, matchId, winsA, winsB, this.now()),
		);
	}

	public async cancel(
		id: string,
		actor: string,
		revision: number,
		reason: string | null,
	): Promise<TournamentPrimitives> {
		return this.change(id, revision, (tournament) => tournament.cancel(actor, reason));
	}

	private async change(
		id: string,
		revision: number,
		command: (tournament: Tournament) => boolean,
	): Promise<TournamentPrimitives> {
		const current = await this.get(id);
		const tournament = Tournament.fromPrimitives(current);
		if (!command(tournament)) return current;
		if (revision !== current.revision)
			throw new TournamentError(
				"conflict",
				"Tournament changed; fetch it and retry with its latest revision",
			);
		tournament.advanceRevision(this.now());
		const changed = tournament.toPrimitives();
		await this.repository.save(changed, revision);
		return changed;
	}
}

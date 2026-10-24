export type TournamentFormat = "tcg" | "jtp" | "edison";
export type TournamentStatus = "registration" | "running" | "completed" | "cancelled";
export type TournamentErrorCode =
	| "invalid_input"
	| "forbidden"
	| "not_found"
	| "conflict"
	| "capacity";

export class TournamentError extends Error {
	public constructor(
		public readonly code: TournamentErrorCode,
		message: string,
	) {
		super(message);
	}
}

export interface TournamentEntrant {
	id: string;
	userId: string;
	displayName: string;
	characterId: number | null;
}

export interface TournamentResult {
	source: "organizer";
	reportedByUserId: string;
	reportedAt: string;
	winsA: number;
	winsB: number;
}

export interface TournamentMatch {
	id: string;
	round: number;
	index: number;
	entrantA: string | null;
	entrantB: string | null;
	status: "pending" | "ready" | "completed" | "bye";
	winnerId: string | null;
	result: TournamentResult | null;
}

export interface TournamentPrimitives {
	schemaVersion: 1;
	id: string;
	organizerId: string;
	name: string;
	format: TournamentFormat;
	bestOf: 1 | 3 | 5;
	capacity: number;
	status: TournamentStatus;
	revision: number;
	createdAt: string;
	updatedAt: string;
	entrants: TournamentEntrant[];
	matches: TournamentMatch[];
	winnerId: string | null;
	cancellationReason: string | null;
}

export interface CreateTournament {
	id: string;
	organizerId: string;
	name: string;
	format: TournamentFormat;
	bestOf: 1 | 3 | 5;
	capacity: number;
	now: string;
}

export class Tournament {
	private constructor(private readonly state: TournamentPrimitives) {}

	public static create(input: CreateTournament): Tournament {
		if (
			!input.name.trim() ||
			input.name.trim().length > 100 ||
			!["tcg", "jtp", "edison"].includes(input.format) ||
			![1, 3, 5].includes(input.bestOf) ||
			!Number.isInteger(input.capacity) ||
			input.capacity < 2 ||
			input.capacity > 64
		) {
			throw new TournamentError("invalid_input", "Invalid tournament settings");
		}
		return new Tournament({
			schemaVersion: 1,
			id: input.id,
			organizerId: input.organizerId,
			name: input.name.trim(),
			format: input.format,
			bestOf: input.bestOf,
			capacity: input.capacity,
			status: "registration",
			revision: 0,
			createdAt: input.now,
			updatedAt: input.now,
			entrants: [],
			matches: [],
			winnerId: null,
			cancellationReason: null,
		});
	}

	public static fromPrimitives(value: TournamentPrimitives): Tournament {
		if (value.schemaVersion !== 1) throw new Error("Unsupported tournament document version");
		return new Tournament(structuredClone(value));
	}

	public toPrimitives(): TournamentPrimitives {
		return structuredClone(this.state);
	}

	public join(entrant: TournamentEntrant): boolean {
		if (this.state.entrants.some((existing) => existing.userId === entrant.userId)) return false;
		if (this.state.status !== "registration")
			throw new TournamentError("conflict", "Registration has closed");
		if (this.state.entrants.length >= this.state.capacity)
			throw new TournamentError("capacity", "Tournament is full");
		if (
			!entrant.id ||
			!entrant.userId ||
			!entrant.displayName.trim() ||
			entrant.displayName.length > 100 ||
			(entrant.characterId !== null &&
				(!Number.isInteger(entrant.characterId) ||
					entrant.characterId < 0 ||
					entrant.characterId > 100000))
		) {
			throw new TournamentError("invalid_input", "Invalid entrant");
		}
		this.state.entrants.push(structuredClone(entrant));
		return true;
	}

	public start(actor: string): boolean {
		this.requireOrganizer(actor);
		if (this.state.status === "running" || this.state.status === "completed") return false;
		if (this.state.status !== "registration")
			throw new TournamentError("conflict", "Tournament cannot start");
		if (this.state.entrants.length < 2)
			throw new TournamentError("conflict", "At least two entrants are required");
		let size = 2;
		let seeds = [1, 2];
		while (size < this.state.entrants.length) {
			size *= 2;
			seeds = seeds.flatMap((seed) => [seed, size + 1 - seed]);
		}
		for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) {
			for (let index = 0; index < count; index++) {
				this.state.matches.push({
					id: `r${round}m${index + 1}`,
					round,
					index,
					entrantA: round === 1 ? (this.state.entrants[seeds[index * 2] - 1]?.id ?? null) : null,
					entrantB:
						round === 1 ? (this.state.entrants[seeds[index * 2 + 1] - 1]?.id ?? null) : null,
					status: "pending",
					winnerId: null,
					result: null,
				});
			}
		}
		this.state.status = "running";
		this.advanceBracket();
		return true;
	}

	public report(
		actor: string,
		matchId: string,
		winsA: number,
		winsB: number,
		now: string,
	): boolean {
		this.requireOrganizer(actor);
		const match = this.state.matches.find((candidate) => candidate.id === matchId);
		if (!match) throw new TournamentError("not_found", "Match not found");
		// Retries of a committed result are idempotent, including the final result.
		if (match.result?.winsA === winsA && match.result?.winsB === winsB) return false;
		if (this.state.status !== "running" || match.status !== "ready") {
			throw new TournamentError("conflict", "Match is not awaiting a result");
		}
		const target = (this.state.bestOf + 1) / 2;
		if (
			![winsA, winsB].every((score) => Number.isInteger(score) && score >= 0) ||
			!((winsA === target && winsB < target) || (winsB === target && winsA < target))
		) {
			throw new TournamentError("invalid_input", "Score must contain exactly one best-of winner");
		}
		match.result = { source: "organizer", reportedByUserId: actor, reportedAt: now, winsA, winsB };
		match.status = "completed";
		match.winnerId = winsA > winsB ? match.entrantA : match.entrantB;
		this.advanceBracket();
		return true;
	}

	public cancel(actor: string, reason: string | null): boolean {
		this.requireOrganizer(actor);
		if (this.state.status === "cancelled") return false;
		if (this.state.status === "completed")
			throw new TournamentError("conflict", "Completed tournaments cannot be cancelled");
		if (reason !== null && reason.length > 500)
			throw new TournamentError("invalid_input", "Cancellation reason is too long");
		this.state.status = "cancelled";
		this.state.cancellationReason = reason;
		return true;
	}

	public advanceRevision(now: string): void {
		this.state.revision++;
		this.state.updatedAt = now;
	}

	private requireOrganizer(actor: string): void {
		if (actor !== this.state.organizerId)
			throw new TournamentError("forbidden", "Only the organizer can perform this action");
	}

	private advanceBracket(): void {
		for (const match of this.state.matches) {
			if (match.status !== "pending") continue;
			if (match.round > 1) {
				const sources = this.state.matches.filter(
					(previous) =>
						previous.round === match.round - 1 &&
						(previous.index === match.index * 2 || previous.index === match.index * 2 + 1),
				);
				if (sources.some((source) => source.status !== "completed" && source.status !== "bye"))
					continue;
				match.entrantA = sources[0].winnerId;
				match.entrantB = sources[1].winnerId;
			}
			if (match.entrantA && match.entrantB) match.status = "ready";
			else {
				match.status = "bye";
				match.winnerId = match.entrantA ?? match.entrantB;
			}
		}
		const final = this.state.matches.at(-1);
		if (final?.status === "completed" && final.winnerId) {
			this.state.status = "completed";
			this.state.winnerId = final.winnerId;
		}
	}
}

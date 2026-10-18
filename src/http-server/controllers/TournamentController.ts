import { Request, Response } from "express";
import { z } from "zod";

import { Logger } from "@shared/logger/domain/Logger";
import { DisplayNameResolver } from "@ygopro/matchmaking/domain/DisplayNameResolver";

import { TournamentService } from "../../tournament/application/TournamentService";
import { TournamentError, TournamentPrimitives } from "../../tournament/domain/Tournament";

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const createSchema = z.strictObject({
	name: z.string().trim().min(1).max(100),
	format: z.enum(["tcg", "jtp", "edison"]),
	bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
	capacity: z.number().int().min(2).max(64),
});
const joinSchema = z.strictObject({
	revision,
	characterId: z.number().int().min(0).max(100000).nullable().optional(),
});
const changeSchema = z.strictObject({ revision });
const resultSchema = z.strictObject({
	revision,
	winsA: z.number().int().min(0).max(3),
	winsB: z.number().int().min(0).max(3),
});
const cancelSchema = z.strictObject({
	revision,
	reason: z.string().trim().min(1).max(500).optional(),
});

/** UUID invitation holders may read; account IDs and authentication data stay private. */
export function tournamentView(state: TournamentPrimitives, actor: string) {
	return {
		id: state.id,
		name: state.name,
		format: state.format,
		bestOf: state.bestOf,
		capacity: state.capacity,
		status: state.status,
		revision: state.revision,
		createdAt: state.createdAt,
		updatedAt: state.updatedAt,
		winnerId: state.winnerId,
		cancellationReason: state.cancellationReason,
		isOrganizer: state.organizerId === actor,
		myEntrantId: state.entrants.find((entrant) => entrant.userId === actor)?.id ?? null,
		entrants: state.entrants.map((entrant) => ({
			id: entrant.id,
			displayName: entrant.displayName,
			characterId: entrant.characterId,
		})),
		matches: state.matches.map((match) => ({
			...match,
			result: match.result
				? {
						source: match.result.source,
						reportedBy: "organizer",
						reportedAt: match.result.reportedAt,
						winsA: match.result.winsA,
						winsB: match.result.winsB,
					}
				: null,
		})),
	};
}

export class TournamentController {
	public constructor(
		private readonly service: TournamentService | null,
		private readonly displayNames: DisplayNameResolver,
		private readonly logger: Logger,
	) {}

	public async create(req: Request, res: Response): Promise<void> {
		await this.execute(
			res,
			async (service, actor) => service.create(actor, createSchema.parse(req.body)),
			201,
		);
	}

	public async get(req: Request, res: Response): Promise<void> {
		await this.execute(res, async (service) => service.get(z.uuid().parse(req.params.id)));
	}

	public async join(req: Request, res: Response): Promise<void> {
		await this.execute(res, async (service, actor) => {
			const id = z.uuid().parse(req.params.id);
			const body = joinSchema.parse(req.body);
			let displayName = "Duelist";
			try {
				displayName = (await this.displayNames.resolve(actor))?.trim().slice(0, 100) || displayName;
			} catch {
				this.logger.warn("Tournament profile lookup failed; using the default public name");
			}
			return service.join(id, actor, body.revision, displayName, body.characterId ?? null);
		});
	}

	public async start(req: Request, res: Response): Promise<void> {
		await this.execute(res, async (service, actor) =>
			service.start(z.uuid().parse(req.params.id), actor, changeSchema.parse(req.body).revision),
		);
	}

	public async report(req: Request, res: Response): Promise<void> {
		await this.execute(res, async (service, actor) => {
			const id = z.uuid().parse(req.params.id);
			const match = z
				.string()
				.regex(/^r[1-6]m[1-9][0-9]?$/)
				.parse(req.params.matchId);
			const body = resultSchema.parse(req.body);
			return service.report(id, actor, body.revision, match, body.winsA, body.winsB);
		});
	}

	public async cancel(req: Request, res: Response): Promise<void> {
		await this.execute(res, async (service, actor) => {
			const id = z.uuid().parse(req.params.id);
			const body = cancelSchema.parse(req.body);
			return service.cancel(id, actor, body.revision, body.reason ?? null);
		});
	}

	private async execute(
		res: Response,
		action: (service: TournamentService, actor: string) => Promise<TournamentPrimitives>,
		status = 200,
	): Promise<void> {
		const actor: unknown = res.locals.tournamentUserId;
		if (typeof actor !== "string" || !actor) {
			res.status(401).json({ success: false, error: "Authentication required" });
			return;
		}
		if (!this.service) {
			res.status(503).json({ success: false, error: "Tournament API is not configured" });
			return;
		}
		try {
			const state = await action(this.service, actor);
			res.status(status).json({ success: true, data: tournamentView(state, actor) });
		} catch (error) {
			if (error instanceof z.ZodError) {
				res.status(400).json({ success: false, error: "Invalid request", errors: error.issues });
				return;
			}
			if (error instanceof TournamentError) {
				const code =
					error.code === "forbidden"
						? 403
						: error.code === "not_found"
							? 404
							: error.code === "invalid_input"
								? 400
								: 409;
				res.status(code).json({ success: false, error: error.message, code: error.code });
				return;
			}
			this.logger.error("Tournament storage operation failed", {
				error: error instanceof Error ? error.message : String(error),
			});
			res
				.status(503)
				.json({ success: false, error: "Tournament storage is temporarily unavailable" });
		}
	}
}

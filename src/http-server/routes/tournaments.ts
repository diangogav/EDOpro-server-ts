import { Express } from "express";

import { Logger } from "@shared/logger/domain/Logger";
import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { DisplayNameResolver } from "@ygopro/matchmaking/domain/DisplayNameResolver";

import { TournamentService } from "../../tournament/application/TournamentService";
import { SqliteTournamentRepository } from "../../tournament/infrastructure/SqliteTournamentRepository";
import { buildTournamentDataSource } from "../../tournament/infrastructure/data-source";
import { TournamentController } from "../controllers/TournamentController";
import { createTournamentAuthMiddleware } from "../middlewares/TournamentAuthMiddleware";
import { createRateLimitMiddleware } from "../middlewares/RateLimitMiddleware";

export function loadTournamentRoutes(
	app: Express,
	logger: Logger,
	tickets: TicketRepository,
	displayNames: DisplayNameResolver,
	databasePath: string | undefined,
): () => Promise<void> {
	const repository = databasePath
		? new SqliteTournamentRepository(buildTournamentDataSource(databasePath))
		: null;
	const service = repository ? new TournamentService(repository) : null;
	const controller = new TournamentController(service, displayNames, logger);
	const authenticate = createTournamentAuthMiddleware(tickets, logger);
	const readLimit = createRateLimitMiddleware("tournament-read", 120);
	const writeLimit = createRateLimitMiddleware("tournament-write", 20);
	app.post("/api/tournaments", writeLimit, authenticate, (req, res) => controller.create(req, res));
	app.get("/api/tournaments/:id", readLimit, authenticate, (req, res) => controller.get(req, res));
	app.post("/api/tournaments/:id/join", writeLimit, authenticate, (req, res) =>
		controller.join(req, res),
	);
	app.post("/api/tournaments/:id/start", writeLimit, authenticate, (req, res) =>
		controller.start(req, res),
	);
	app.post("/api/tournaments/:id/matches/:matchId/result", writeLimit, authenticate, (req, res) =>
		controller.report(req, res),
	);
	app.post("/api/tournaments/:id/cancel", writeLimit, authenticate, (req, res) =>
		controller.cancel(req, res),
	);
	return async () => {
		await repository?.close();
	};
}

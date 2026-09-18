import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { Logger } from "@shared/logger/domain/Logger";
import { isRateLimited } from "@shared/rate-limit/application/isRateLimited";
import { TicketRepository } from "@shared/ticket/domain/TicketRepository";

import { config } from "../../../config";
import { BanChecker } from "../domain/BanChecker";
import { DisplayNameResolver } from "../domain/DisplayNameResolver";
import { ParticipantChannel } from "../domain/ParticipantChannel";
import { Session } from "../domain/Session";

export interface AuthenticateMatchmakingSessionInput {
	readonly ticket: string;
	readonly remoteAddress: string | undefined;
	readonly session: Session;
	readonly channel: ParticipantChannel;
}

/**
 * Handles CTOS `MATCHMAKING_AUTH`: consumes the single-use ticket, checks the
 * ban list, resolves a display name, and stamps the `Session` on success.
 *
 * Gate order mirrors the design's failure-path table: per-IP rate limit ->
 * already-authenticated -> ticket validity -> ban status -> display name.
 * Only the rate-limit, invalid-ticket, and banned rejections close the
 * connection; an already-authenticated re-AUTH is answered without closing.
 */
export class AuthenticateMatchmakingSession {
	public constructor(
		private readonly tickets: TicketRepository,
		private readonly bans: BanChecker,
		private readonly displayNames: DisplayNameResolver,
		private readonly logger: Logger,
	) {}

	public async execute(input: AuthenticateMatchmakingSessionInput): Promise<void> {
		const { ticket, remoteAddress, session, channel } = input;

		if (session.isAuthenticated) {
			channel.status({ state: "rejected", waitedMs: 0, reason: "already_authenticated" });

			return;
		}

		if (await this.isAuthRateLimited(remoteAddress)) {
			this.logger.info("Matchmaking AUTH rejected: per-IP rate limit exceeded", { remoteAddress });
			channel.close("rate_limited");

			return;
		}

		const userId = await this.tickets.consume(ticket);
		if (!userId) {
			channel.close("invalid_ticket");

			return;
		}

		if (await this.bans.isBanned(userId)) {
			this.logger.info("Matchmaking AUTH rejected: user is banned", { userId });
			channel.close("banned");

			return;
		}

		const displayName = await this.resolveDisplayName(userId);

		session.authenticate(userId, displayName);
		channel.status({ state: "authenticated", waitedMs: 0 });
	}

	/**
	 * Fixed-window per-IP counter over its own `ygopro-matchmaking-auth` bucket
	 * (D22), reusing the same limit/window as the ygopro JOIN path but never
	 * sharing its counter. Fails open on every degradation (limiter disabled,
	 * Redis unavailable, no remote address, store error): AUTH is the
	 * expensive, ticket-burning door, but a limiter outage must never block it.
	 */
	private async isAuthRateLimited(remoteAddress: string | undefined): Promise<boolean> {
		const redis = Redis.getInstance();
		if (!config.rateLimit.enabled || !redis || !remoteAddress) {
			return false;
		}

		try {
			return await isRateLimited(
				redis,
				`rate-limit:ygopro-matchmaking-auth:${remoteAddress}`,
				config.rateLimit.join.limit,
				config.rateLimit.join.window,
			);
		} catch {
			return false;
		}
	}

	/** Preserves the invariant that a failing lookup never blocks AUTH (D23). */
	private async resolveDisplayName(userId: string): Promise<string | null> {
		try {
			return await this.displayNames.resolve(userId);
		} catch (error) {
			this.logger.warn("Matchmaking display name resolution failed; continuing with null", {
				userId,
				error: error instanceof Error ? error.message : String(error),
			});

			return null;
		}
	}
}

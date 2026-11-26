import type RedisLibrary from "ioredis";

import { Logger } from "@shared/logger/domain/Logger";

import { RESERVATION_ID_PATTERN, RESERVATION_OPEN_CHANNEL } from "../../domain/Reservation";

/**
 * Listens for reservations no human will claim (two bots) and hands each id to
 * the opener. A subscribed ioredis client can run nothing else, so it is a
 * connection of its own. Pub/sub keeps no backlog: an announcement made while
 * this instance is down is lost, and the issuer finds the reservation unclaimed.
 */
export class RedisReservationOpenSubscriber {
	private readonly logger: Logger;

	public constructor(
		private readonly connection: RedisLibrary,
		private readonly open: (reservationId: string) => Promise<void>,
		logger: Logger,
	) {
		this.logger = logger.child({ file: "RedisReservationOpenSubscriber" });
	}

	public async start(): Promise<void> {
		this.connection.on("message", (channel: string, message: string) => {
			if (channel !== RESERVATION_OPEN_CHANNEL) {
				return;
			}
			void this.handle(message);
		});
		await this.connection.subscribe(RESERVATION_OPEN_CHANNEL);
		this.logger.info(`Listening for bot reserved duels on ${RESERVATION_OPEN_CHANNEL}`);
	}

	private async handle(message: string): Promise<void> {
		const reservationId = message.trim();
		if (!RESERVATION_ID_PATTERN.test(reservationId)) {
			this.logger.warn("Ignored a malformed bot reserved duel announcement", { message });
			return;
		}
		try {
			await this.open(reservationId);
		} catch (error) {
			this.logger.error("Bot reserved duel could not be opened", {
				reservationId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

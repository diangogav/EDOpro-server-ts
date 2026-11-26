import { Logger } from "@shared/logger/domain/Logger";
import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { ReservedDuelServices } from "@shared/reserved-duel/application/ReservedDuels";
import { RedisReservationOpenSubscriber } from "@shared/reserved-duel/infrastructure/redis/RedisReservationOpenSubscriber";
import { OpenBotReservedDuel } from "@ygopro/room/application/OpenBotReservedDuel";
import { WindbotModule } from "@ygopro/windbot/application/WindbotModule";

/**
 * Opens reserved duels between two bots when their issuer announces them. Needs
 * reserved duels (the store and the rows) and WindBot (the players); without
 * either, the announcements go unheard and the issuer finds them unclaimed.
 */
export async function bootstrapBotReservedDuels(
	services: ReservedDuelServices | null,
	windbot: WindbotModule | undefined,
	logger: Logger,
): Promise<RedisReservationOpenSubscriber | null> {
	const redis = Redis.getInstance();
	if (!services || !windbot?.isEnabled() || !redis) {
		logger.info("🤖 Bot reserved duels → off (needs reserved duels and WindBot)");
		return null;
	}

	const opener = new OpenBotReservedDuel(() => services, windbot, logger);
	const subscriber = new RedisReservationOpenSubscriber(
		redis.duplicate(),
		(reservationId) => opener.run(reservationId),
		logger,
	);
	try {
		await subscriber.start();
	} catch (error) {
		logger.error("Bot reserved duels could not subscribe", {
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
	logger.info("🤖 Bot reserved duels → on");

	return subscriber;
}

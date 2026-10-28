import { Logger } from "@shared/logger/domain/Logger";
import {
	ReservedDuels,
	ReservedDuelServices,
} from "@shared/reserved-duel/application/ReservedDuels";
import { ReservationStore } from "@shared/reserved-duel/domain/ReservationStore";
import { ReservedDuelRepository } from "@shared/reserved-duel/domain/ReservedDuelRepository";
import { ReservedDuelPostgresRepository } from "@shared/reserved-duel/infrastructure/postgres/ReservedDuelPostgresRepository";
import { RedisReservationStore } from "@shared/reserved-duel/infrastructure/redis/RedisReservationStore";

export type ReservedDuelsBootConfig = {
	readonly enabled: boolean;
	/** `SERVER_INSTANCE_ID`; unset falls back to "default" outside production only. */
	readonly instanceId?: string;
	readonly production: boolean;
};

export const DEFAULT_INSTANCE_ID = "default";

/**
 * Turns reserved duels on when both of their stores exist (Postgres comes up
 * with ranking, Redis when configured), then closes whatever this instance
 * left open before it restarted. Off, every "rv#" join is refused.
 */
export async function bootstrapReservedDuels(
	config: ReservedDuelsBootConfig,
	logger: Logger,
	deps: { store?: ReservationStore; repository?: ReservedDuelRepository } = {},
): Promise<ReservedDuelServices | null> {
	if (!config.enabled) {
		logger.info("🎟️  Reserved duels → off (needs Postgres and Redis)");
		return null;
	}

	// Every production slot must name itself: two slots sharing an id would
	// sweep each other's live rows at boot and play each other's claims.
	if (!config.instanceId && config.production) {
		throw new Error("SERVER_INSTANCE_ID is required when reserved duels are enabled in production");
	}
	const instanceId = config.instanceId || DEFAULT_INSTANCE_ID;

	const services = new ReservedDuelServices({
		store: deps.store ?? new RedisReservationStore(logger),
		repository: deps.repository ?? new ReservedDuelPostgresRepository(),
		instanceId,
		logger,
	});

	try {
		await services.closeLeftovers();
	} catch (error) {
		logger.error("Reserved duels boot sweep failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	ReservedDuels.configure(services);
	logger.info(`🎟️  Reserved duels → on · instance ${instanceId}`);

	return services;
}

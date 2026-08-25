import { ServerPlugin } from "@shared/plugin/ServerPlugin";

export const BIG_DAMAGE_THRESHOLD = 5000;

// Observe-only consumer of the duel-event surface: logs any single hit at or
// above the threshold. Stateless on purpose — GameOverDomainEvent carries no
// roomId, so per-duel aggregation has no end-of-room signal to key on yet.
const plugin: ServerPlugin = {
	name: "big-damage-log",
	enabled: () => true,
	duelEvents: ["duel.damage"],
	register: (_bus, deps) => {
		const logger = deps.logger.child({ file: "BigDamageLog" });
		deps.duelEvents?.subscribe("duel.damage", (event) => {
			if (event.amount >= BIG_DAMAGE_THRESHOLD) {
				logger.info(
					`Big damage: team ${event.team} took ${event.amount} LP in room ${event.roomId} (turn ${event.turn})`,
				);
			}
		});
	},
};

export default plugin;

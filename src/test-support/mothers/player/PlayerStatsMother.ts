import { faker } from "@faker-js/faker";
import { PlayerStats, PlayerStatsProperties } from "@shared/stats/player-stats/domain/PlayerStats";

export class PlayerStatsMother {
	static create(params?: Partial<PlayerStatsProperties>): PlayerStats {
		return PlayerStats.from({
			id: faker.string.uuid(),
			rankId: faker.string.uuid(),
			wins: faker.number.int(),
			losses: faker.number.int(),
			points: faker.number.int(),
			userId: faker.string.uuid(),
			season: faker.number.int({ min: 1, max: 10 }),
			...params,
		});
	}
}

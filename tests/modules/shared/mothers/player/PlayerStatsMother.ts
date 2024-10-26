import { faker } from "@faker-js/faker";
import {
	PlayerStats,
	PlayerStatsProperties,
} from "src/shared/stats/player-stats/domain/PlayerStats";

export class PlayerStatsMother {
	static create(params?: Partial<PlayerStatsProperties>): PlayerStats {
		return PlayerStats.from({
			id: faker.string.uuid(),
			banListName: faker.lorem.word(),
			wins: faker.number.int(),
			losses: faker.number.int(),
			points: faker.number.int(),
			userId: faker.string.uuid(),
			...params,
		});
	}
}

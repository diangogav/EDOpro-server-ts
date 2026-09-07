import { faker } from "@faker-js/faker";
import { PointsLedgerEntry } from "@shared/stats/player-stats/domain/PlayerStatsRepository";

export class PointsLedgerEntryMother {
	static applied(overrides?: Partial<PointsLedgerEntry>): PointsLedgerEntry {
		return {
			gameId: faker.string.uuid(),
			userId: faker.string.uuid(),
			rankId: faker.string.uuid(),
			season: faker.number.int({ min: 1, max: 10 }),
			kind: "applied",
			cycle: 0,
			pointsDelta: faker.number.int({ min: -5, max: 5 }),
			winsDelta: 1,
			lossesDelta: 0,
			...overrides,
		};
	}
}

import { faker } from "@faker-js/faker";
import { Rank } from "@shared/rank/domain/Rank";

export class RankMother {
	static create(params?: Partial<Rank>): Rank {
		return {
			id: faker.string.uuid(),
			name: faker.lorem.word(),
			type: "banlist",
			enabled: true,
			...params,
		};
	}
}

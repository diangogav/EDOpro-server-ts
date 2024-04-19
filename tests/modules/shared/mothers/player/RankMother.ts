import { faker } from "@faker-js/faker";

import { Rank, RankAttributes } from "../../../../../src/modules/shared/value-objects/Rank";

export class RankMother {
	static create(params?: Partial<RankAttributes>): Rank {
		return new Rank({
			name: faker.lorem.word(),
			position: faker.number.int({ min: 0, max: 1000 }),
			points: faker.number.int({ min: 0, max: 1000 }),
			...params,
		});
	}
}

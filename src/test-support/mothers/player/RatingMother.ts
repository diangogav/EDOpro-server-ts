import { faker } from "@faker-js/faker";
import { Rating, RatingProperties } from "@shared/stats/rating/domain/Rating";

export class RatingMother {
	static create(params?: Partial<RatingProperties>): Rating {
		return Rating.from({
			value: faker.number.int({ min: 800, max: 2400 }),
			gamesPlayed: faker.number.int({ min: 10, max: 100 }),
			peak: faker.number.int({ min: 800, max: 2400 }),
			...params,
		});
	}
}

import { faker } from "@faker-js/faker";
import { Game } from "../../../../../src/shared/player/domain/Player";

const GAME_RESULTS = ["winner", "losser", "deuce"];

export class GameMother {
	static create(params?: Partial<Game>): Game {
		return {
			result: faker.helpers.arrayElement(GAME_RESULTS) as "winner" | "loser" | "deuce",
			turns: faker.number.int({ min: 1, max: 100 }),
			ipAddress: faker.internet.ipv4(),
			...params,
		};
	}
}

import { faker } from "@faker-js/faker";

import { Player } from "../../../../../src/shared/player/domain/Player";
import { PlayerData } from "../../../../../src/shared/player/domain/PlayerData";
import { Team } from "../../../../../src/shared/room/Team";
import { GameMother } from "./GameMother";

export class PlayerMother {
	static create(params?: Partial<PlayerData>): Player {
		return new Player({
			id: faker.string.uuid(),
			name: faker.internet.userName(),
			team: faker.helpers.enumValue(Team),
			winner: faker.datatype.boolean(),
			games: [GameMother.create(), GameMother.create(), GameMother.create()],
			score: faker.number.int({ min: 0, max: 5 }),
			...params,
		});
	}
}

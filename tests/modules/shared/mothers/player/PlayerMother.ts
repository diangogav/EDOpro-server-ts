import { faker } from "@faker-js/faker";
import { Team } from "@modules/room/domain/Team";
import { Player } from "@modules/shared/player/domain/Player";
import { PlayerData } from "@modules/shared/player/domain/PlayerData";

import { GameMother } from "./GameMother";
import { RankMother } from "./RankMother";

export class PlayerMother {
	static create(params?: Partial<PlayerData>): Player {
		return new Player({
			ranks: [RankMother.create(), RankMother.create()],
			name: faker.internet.userName(),
			team: faker.helpers.enumValue(Team),
			winner: faker.datatype.boolean(),
			games: [GameMother.create(), GameMother.create(), GameMother.create()],
			score: faker.number.int({ min: 0, max: 5 }),
			...params,
		});
	}
}

import { faker } from "@faker-js/faker";
import {
	GameOverData,
	GameOverDomainEvent,
} from "src/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";

import { PlayerMother } from "./PlayerMother";

export class GameOverDomainEventMother {
	static create(params?: Partial<GameOverData>): GameOverDomainEvent {
		return new GameOverDomainEvent({
			bestOf: faker.number.int({ min: 1, max: 9 }),
			date: faker.date.past(),
			players: [PlayerMother.create().toPresentation(), PlayerMother.create().toPresentation()],
			ranked: faker.datatype.boolean(),
			banlistHash: faker.number.int(),
			...params,
		});
	}
}

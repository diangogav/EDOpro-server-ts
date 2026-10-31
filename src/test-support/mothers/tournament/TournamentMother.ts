import { faker } from "@faker-js/faker";

import { CreateTournament, Tournament } from "../../../tournament/domain/Tournament";

export class TournamentMother {
	public static create(overrides: Partial<CreateTournament> = {}): Tournament {
		return Tournament.create({
			id: faker.string.uuid(),
			organizerId: faker.string.uuid(),
			name: faker.word.words(3),
			format: "tcg",
			bestOf: 3,
			capacity: 64,
			now: "2026-10-18T12:00:00.000Z",
			...overrides,
		});
	}
}

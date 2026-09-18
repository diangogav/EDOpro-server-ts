import { faker } from "@faker-js/faker";

import { Participant } from "@ygopro/matchmaking/domain/Participant";
import { ParticipantChannel } from "@ygopro/matchmaking/domain/ParticipantChannel";

class NoopParticipantChannel implements ParticipantChannel {
	status(): void {
		/* no-op */
	}

	found(): void {
		/* no-op */
	}

	close(): void {
		/* no-op */
	}

	isAlive(): boolean {
		return true;
	}
}

export class ParticipantMother {
	static create(overrides?: Partial<Participant>): Participant {
		return {
			id: faker.string.uuid(),
			userId: faker.string.uuid(),
			format: "tcg",
			mode: "ranked",
			displayName: faker.internet.username(),
			enqueuedAt: Date.now(),
			presence: "socket",
			channel: new NoopParticipantChannel(),
			...overrides,
		};
	}
}

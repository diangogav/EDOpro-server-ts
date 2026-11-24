import { createYGOProRoomDeps } from "@ygopro/room/application/createYGOProRoomDeps";
import { faker } from "@faker-js/faker";
import EventEmitter from "events";
import { randomInt } from "crypto";

import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import { AccountVerifier } from "@shared/user-profile/domain/AccountVerifier";
import { PlayerInfoMessageMother } from "../PlayerInfoMessageMother";
import { MessageRepositoryMock } from "../../mocks/MessageRepositoryMock";
import { LoggerMock } from "../../mocks/logger/LoggerMock";

interface YGOProRoomMotherProps {
	id: number;
	command: string;
	createdBySocketId: string;
	accountVerifier: AccountVerifier;
}

// Rooms built here never look accounts up in the database: every client counts
// as unverified unless a test passes its own verifier.
const unverifiedAccounts: AccountVerifier = { verify: async () => false };

export class YGOProRoomMother {
	static create(overrides?: Partial<YGOProRoomMotherProps>): YGOProRoom {
		return YGOProRoom.create(
			overrides?.id ?? randomInt(0, 10000),
			overrides?.command ?? faker.string.alpha({ length: 6 }),
			new LoggerMock(),
			new EventEmitter(),
			PlayerInfoMessageMother.create(),
			overrides?.createdBySocketId ?? faker.string.uuid(),
			new MessageRepositoryMock(),
			{
				...createYGOProRoomDeps(),
				accountVerifier: overrides?.accountVerifier ?? unverifiedAccounts,
			},
		);
	}
}

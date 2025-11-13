import { faker } from "@faker-js/faker";
import EventEmitter from "events";

import { Room, RoomAttr } from "../../../../../src/edopro/room/domain/Room";
import { LoggerMock } from "../../mocks/logger/LoggerMock";

export class RoomMother {
	static create(params?: Partial<RoomAttr>): Room {
		const logger = new LoggerMock();

		const room = Room.create(
			{
				id: params?.id ?? faker.number.int({ min: 1, max: 9999 }),
				name: params?.name ?? faker.lorem.words(2),
				notes: params?.notes ?? faker.lorem.sentence(),
				mode: params?.mode ?? faker.number.int({ min: 0, max: 3 }),
				needPass: params?.needPass ?? false,
				team0: params?.team0 ?? faker.number.int({ min: 1, max: 3 }),
				team1: params?.team1 ?? faker.number.int({ min: 1, max: 3 }),
				bestOf: params?.bestOf ?? faker.number.int({ min: 1, max: 3 }),
				duelFlag: params?.duelFlag ?? 0n,
				duelFlagsLow: params?.duelFlagsLow ?? 0,
				duelFlagsHight: params?.duelFlagsHight ?? 0,
				forbiddenTypes: params?.forbiddenTypes ?? 0,
				extraRules: params?.extraRules ?? 0,
				startLp: params?.startLp ?? 8000,
				startHand: params?.startHand ?? faker.number.int({ min: 1, max: 5 }),
				drawCount: params?.drawCount ?? 1,
				timeLimit: params?.timeLimit ?? 180,
				rule: params?.rule ?? 0,
				noCheck: params?.noCheck ?? false,
				noShuffle: params?.noShuffle ?? false,
				banListHash: params?.banListHash ?? faker.number.int({ min: 0, max: 99999 }),
				mainMin: params?.mainMin ?? 40,
				mainMax: params?.mainMax ?? 60,
				extraMin: params?.extraMin ?? 0,
				extraMax: params?.extraMax ?? 15,
				sideMin: params?.sideMin ?? 0,
				sideMax: params?.sideMax ?? 15,
				duelRule: params?.duelRule ?? 0,
				handshake: params?.handshake ?? 0,
				password: params?.password ?? "",
				ranked: params?.ranked ?? false,
			},
			new EventEmitter(),
			logger
		);

		return room;
	}
}

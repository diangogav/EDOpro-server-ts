import { faker } from "@faker-js/faker";
import { EventEmitter } from "events";

import { YgoRoom } from "../../../../../src/shared/room/domain/YgoRoom";
import { RoomActionQueue } from "../../../../../src/shared/room/RoomActionQueue";

class SimpleRoom extends YgoRoom {
	public actionQueue = new RoomActionQueue();

	constructor(params: {
		team0: number;
		team1: number;
		ranked: boolean;
		bestOf: number;
		startLp: number;
		id: number;
		notes: string;
	}) {
		super(params);
		this.emitter = new EventEmitter();
	}
}

export class SimpleRoomMother {
	static create(params?: Partial<ConstructorParameters<typeof SimpleRoom>[0]>): SimpleRoom {
		return new SimpleRoom({
			team0: params?.team0 ?? faker.number.int({ min: 1, max: 3 }),
			team1: params?.team1 ?? faker.number.int({ min: 1, max: 3 }),
			ranked: params?.ranked ?? faker.datatype.boolean(),
			bestOf: params?.bestOf ?? faker.number.int({ min: 1, max: 3 }),
			startLp: params?.startLp ?? 8000,
			id: params?.id ?? faker.number.int({ min: 1, max: 9999 }),
			notes: params?.notes ?? faker.lorem.sentence(),
		});
	}
}

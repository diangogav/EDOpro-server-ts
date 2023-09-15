import { EventEmitter } from "stream";

import { CreateRoomRequest } from "../../../http-server/controllers/CreateRoomController";
import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { Logger } from "../../shared/logger/domain/Logger";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class RoomCreator {
	constructor(private readonly logger: Logger) {}

	create(payload: CreateRoomRequest): void {
		const banlist = BanListMemoryRepository.findByName(payload.banlist);

		if (!banlist) {
			return;
		}

		const emitter = new EventEmitter();

		const data = {
			id: this.generateUniqueId(),
			name: payload.name,
			notes: "\x00x\x02@�\x7F",
			mode: 0,
			needPass: false,
			team0: 1,
			team1: 1,
			bestOf: payload.bestOf,
			duelFlag: 853505,
			forbiddenTypes: 83886080,
			extraRules: 0,
			startLp: 8000,
			startHand: 5,
			drawCount: 1,
			timeLimit: 700,
			rule: payload.allowed,
			noCheck: false,
			noShuffle: false,
			banlistHash: banlist.hash,
			isStart: "waiting",
			mainMin: 40,
			mainMax: 60,
			extraMin: 0,
			extraMax: 15,
			sideMin: 0,
			sideMax: 15,
			duelRule: 0,
			handshake: 4043399681,
			password: "",
			duelFlagsHight: 1,
			duelFlagsLow: 853504,
			ranked: false,
		};

		const room = Room.create(data, emitter, this.logger);
		room.waiting();
		RoomList.addRoom(room);
	}

	private generateUniqueId(): number {
		const min = 1000;
		const max = 9999;

		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
}

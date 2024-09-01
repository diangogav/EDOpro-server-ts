import { EventEmitter } from "stream";

import { CreateRoomRequest } from "../../../http-server/controllers/CreateRoomController";
import { Logger } from "../../../shared/logger/domain/Logger";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { UTF8ToUTF16 } from "../../../utils/UTF8ToUTF16";
import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class RoomCreator {
	private readonly socket: ISocket;
	constructor(private readonly logger: Logger) {}

	create(payload: CreateRoomRequest): { password: string } {
		const banlist = BanListMemoryRepository.findByName(payload.banlist);

		if (!banlist) {
			throw new Error("Banlist not found");
		}

		const emitter = new EventEmitter();
		const utf8Password = this.generateUniqueId().toString();
		const password = UTF8ToUTF16(utf8Password, utf8Password.length * 2).toString("utf16le");

		const data = {
			id: this.generateUniqueId(),
			name: payload.name,
			notes: (payload.tournament ? `[${payload.tournament}] ` : "") + payload.name,
			mode: payload.mode || 0, // 0 = Single, 1 = Match, 2 = Tag
			needPass: true,
			team0: payload.teamQuantity || 1,
			team1: payload.teamQuantity || 1,
			bestOf: payload.bestOf || 1,
			duelFlag: BigInt(853505),
			forbiddenTypes: 83886080,
			extraRules: 0,
			startLp: 8000,
			startHand: 5,
			drawCount: 1,
			timeLimit: 700,
			rule: payload.rule || 4, // 0 = OCG, 1 = TCG, 2 = OCG/TCG, 3 = Prerelease, 4 = Anything Goes
			noCheck: false,
			noShuffle: false,
			banListHash: banlist.hash,
			isStart: "waiting",
			mainMin: 40,
			mainMax: 60,
			extraMin: 0,
			extraMax: 15,
			sideMin: 0,
			sideMax: 15,
			duelRule: 0,
			handshake: 4043399681,
			password,
			duelFlagsHight: 1,
			duelFlagsLow: 853504,
			ranked: payload.isRanked || false,
		};

		const room = Room.create(data, emitter, this.logger);
		room.waiting();
		RoomList.addRoom(room);

		return {
			password,
		};
	}

	private generateUniqueId(): number {
		const min = 1000;
		const max = 9999;

		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
}

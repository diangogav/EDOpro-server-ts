import { EventEmitter } from "stream";

import { ForeignRoomEntry } from "@shared/room/application/ForeignRoomEntry";
import {
	ForeignSpeedDuelEntryRequest,
	ForeignSpeedDuelEntryResult,
	ForeignSpeedDuelRooms,
} from "@shared/room/application/ForeignSpeedDuelRooms";
import { DuelState } from "@shared/room/domain/YgoRoom";

import { Logger } from "../../../shared/logger/domain/Logger";
import { findSpeedDuelBanList } from "../../ban-list/domain/SpeedDuelBanList";
import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { Room } from "../domain/Room";
import { speedDuelRoomAttributes } from "../domain/SpeedDuelRoomPreset";
import RoomList from "../infrastructure/RoomList";
import { createEdoproRoomDeps } from "./createEdoproRoomDeps";
import { EdoproRoomEntry } from "./EdoproRoomEntry";
import { generateUnusedRoomId } from "./generateUnusedRoomId";

/**
 * Speed Duel rooms the server opens for clients of the YGOPro server, which
 * have no CREATE_GAME to host one with.
 *
 * A request names a room and a password. It is seated in the waiting room the
 * server opened under that pair when one still has a free seat, and otherwise
 * a new room is opened for it: a full room or one already duelling is never a
 * candidate, and neither is a room an EDOPro client hosts, whatever its name.
 * So nobody is routed to a room it could only watch.
 *
 * The room has no host connection. Its first player enters like any other,
 * through `EdoproRoomEntry`, and is the host for as long as it stays.
 */
export class EdoproSpeedDuelRooms implements ForeignSpeedDuelRooms {
	private readonly logger: Logger;

	constructor(
		logger: Logger,
		private readonly entry: ForeignRoomEntry = new EdoproRoomEntry(),
	) {
		this.logger = logger.child({ file: "EdoproSpeedDuelRooms" });
	}

	public enter({
		name,
		password,
		bestOf,
		message,
		socket,
	}: ForeignSpeedDuelEntryRequest): ForeignSpeedDuelEntryResult {
		const room = this.findWaiting(name, password) ?? this.open(name, password, bestOf);
		if (!room) {
			return "unavailable";
		}

		return this.entry.enter({ roomId: room.id, password, message, socket });
	}

	/**
	 * The seat count is read without the room's mutex, so it is a routing hint:
	 * two joiners can be sent after the same last seat, and the room's waiting
	 * state turns the loser away.
	 */
	private findWaiting(name: string, password: string): Room | null {
		return (
			RoomList.getRooms().find(
				(room) =>
					room.createdByServer &&
					room.name === name &&
					room.password === password &&
					room.duelState === DuelState.WAITING &&
					room.players.length < room.team0 + room.team1,
			) ?? null
		);
	}

	private open(name: string, password: string, bestOf: 1 | 3): Room | null {
		const banList = findSpeedDuelBanList(BanListMemoryRepository.get());
		if (!banList) {
			this.logger.error("Speed Duel room not opened: no Speed Duel ban list is loaded");

			return null;
		}

		const room = Room.create(
			speedDuelRoomAttributes({
				id: generateUnusedRoomId(),
				name,
				password,
				bestOf,
				banListHash: banList.hash,
			}),
			new EventEmitter(),
			this.logger,
			createEdoproRoomDeps(),
		);
		room.waiting();
		RoomList.addRoom(room);
		this.logger.info(`Opened Speed Duel room ${room.id} "${name}" (best of ${bestOf})`);

		return room;
	}
}

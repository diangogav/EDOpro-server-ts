import { Request, Response } from "express";

import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import RoomList from "../../edopro/room/infrastructure/RoomList";
import { DuelState } from "../../shared/room/domain/YgoRoom";

const DEFAULT_ENGINES: ReadonlySet<string> = new Set(["ygopro"]);

export class RoomListController {
	run(req: Request, res: Response): void {
		const { status, open, mode, engines } = req.query;
		const wanted = RoomListController.engines(engines);

		// EDOPro rooms a client on the YGOPro socket can sit in: 1v1 with a free
		// seat. That client cannot watch an EDOPro duel, so a full or started
		// room would only be a row nobody can act on.
		let edoproRooms = wanted.has("edopro")
			? RoomList.getRooms().filter(
					(room) =>
						room.team0 === 1 &&
						room.team1 === 1 &&
						room.duelState === DuelState.WAITING &&
						room.players.length < 2,
				)
			: [];
		let rooms = wanted.has("ygopro") ? YGOProRoomList.getListedRooms() : [];

		if (typeof status === "string") {
			const allowed = new Set(status.split(",").map((s) => s.trim()));
			rooms = rooms.filter((room) => allowed.has(room.duelState));
			edoproRooms = edoproRooms.filter((room) => allowed.has(room.duelState));
		}

		if (typeof open === "string") {
			const isOpen = open === "true";
			rooms = rooms.filter((room) =>
				isOpen ? room.password.length === 0 : room.password.length > 0,
			);
			edoproRooms = edoproRooms.filter((room) => room.needPass !== isOpen);
		}

		if (typeof mode === "string") {
			const modeNum = Number(mode);
			if (!Number.isNaN(modeNum)) {
				rooms = rooms.filter((room) => room.hostInfo.mode === modeNum);
				edoproRooms = edoproRooms.filter((room) => room.mode === modeNum);
			}
		}

		res.status(200).json({
			rooms: [
				...rooms.map((room) => room.toRoomListDTO()),
				...edoproRooms.map((room) => room.toRoomListDTO()),
			],
		});
	}

	/**
	 * Which rooms the caller asked for. Rooms hosted from EDOPro are opt-in
	 * (`?engines=ygopro,edopro`): a client that never heard of them keeps the
	 * list it always got, with only rooms it knows how to present.
	 */
	private static engines(param: unknown): ReadonlySet<string> {
		if (typeof param !== "string") {
			return DEFAULT_ENGINES;
		}

		return new Set(param.split(",").map((engine) => engine.trim().toLowerCase()));
	}
}

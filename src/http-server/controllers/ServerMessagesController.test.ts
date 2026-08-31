import { Request, Response } from "express";

import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import RoomList from "../../edopro/room/infrastructure/RoomList";
import MercuryRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import { ServerMessagesController } from "./ServerMessagesController";

// The admin broadcast previously sent the edopro-only 0xF3 frame to EVERY
// client, including Mercury clients, which cannot decode it. It must go
// through the shared STOC_CHAT (0x19) SystemChat helper so both pipelines'
// clients receive it.

const makeResponse = (): jest.Mocked<Response> =>
	({
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	}) as unknown as jest.Mocked<Response>;

describe("ServerMessagesController", () => {
	afterEach(() => {
		while (RoomList.getRooms().length) {
			RoomList.getRooms().pop();
		}
		jest.restoreAllMocks();
	});

	it("sends a YELLOW STOC_CHAT frame (not the legacy 0xF3 frame) to every client in every room, edopro and Mercury alike", async () => {
		const edoproClientSocket = { send: jest.fn() };
		const mercuryClientSocket = { send: jest.fn() };

		const edoproRoom = {
			players: [{ socket: edoproClientSocket }],
			spectators: [],
		} as unknown as ReturnType<typeof RoomList.getRooms>[number];
		RoomList.addRoom(edoproRoom);

		const mercuryRoom = {
			players: [],
			spectators: [{ socket: mercuryClientSocket }],
		} as unknown as ReturnType<typeof MercuryRoomList.getRooms>[number];
		jest.spyOn(MercuryRoomList, "getRooms").mockReturnValueOnce([mercuryRoom]);

		const req = {
			body: { message: "Server restarting soon", reason: "maintenance" },
		} as unknown as Request;
		const res = makeResponse();

		await new ServerMessagesController().run(req, res);

		const expectedFrame = Buffer.from(
			new YGOProStocChat()
				.fromPartial({ player_type: ChatColor.YELLOW, msg: "[maintenance] Server restarting soon" })
				.toFullPayload(),
		);
		expect(edoproClientSocket.send).toHaveBeenCalledWith(expectedFrame);
		expect(mercuryClientSocket.send).toHaveBeenCalledWith(expectedFrame);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});

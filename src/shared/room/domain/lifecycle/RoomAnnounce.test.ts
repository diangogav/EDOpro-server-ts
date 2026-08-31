import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { YgoClient } from "@shared/client/domain/YgoClient";

import { createRoomAnnounce } from "./RoomAnnounce";

function makeClient(): jest.Mocked<YgoClient> {
	return {
		socket: { send: jest.fn() },
	} as unknown as jest.Mocked<YgoClient>;
}

describe("createRoomAnnounce", () => {
	it("sends a STOC_CHAT frame with ChatColor.GRAY to every room client", () => {
		const player = makeClient();
		const spectator = makeClient();
		const room = { clients: [player, spectator] } as unknown as YgoRoom;

		const announce = createRoomAnnounce(room);
		announce("[Rating v1 start] Diango 1000 | Rival 1000");

		const expectedFrame = Buffer.from(
			new YGOProStocChat()
				.fromPartial({
					player_type: ChatColor.GRAY,
					msg: "[Rating v1 start] Diango 1000 | Rival 1000",
				})
				.toFullPayload(),
		);

		expect(player.socket.send).toHaveBeenCalledWith(expectedFrame);
		expect(spectator.socket.send).toHaveBeenCalledWith(expectedFrame);
	});

	it("never touches sockets outside room.clients — an empty room sends nothing", () => {
		const room = { clients: [] } as unknown as YgoRoom;

		expect(() => createRoomAnnounce(room)("no clients")).not.toThrow();
	});
});

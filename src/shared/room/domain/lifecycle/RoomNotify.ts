import { YgoRoom } from "@shared/room/domain/YgoRoom";

/**
 * Builds the `MatchContext.notify` capability for one room: sends a raw STOC
 * frame to every current `room.clients` entry (players and spectators) whose
 * `id` equals the given user id. An unknown user id sends nothing.
 */
export function createRoomNotify(room: YgoRoom): (userId: string, frame: Buffer) => void {
	return (userId: string, frame: Buffer) => {
		room.clients.forEach((client) => {
			if (client.id === userId) {
				client.socket.send(frame);
			}
		});
	};
}

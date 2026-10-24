import { YgoRoom } from "./YgoRoom";

/** Finds the room a socket belongs to among one protocol's rooms. */
export interface RoomLocator {
	findBySocketId(socketId: string): YgoRoom | null;
}

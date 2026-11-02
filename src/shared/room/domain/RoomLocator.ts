import { YgoRoom } from "./YgoRoom";

/** Finds rooms among one protocol's rooms. */
export interface RoomLocator {
	/** The room a socket belongs to. */
	findBySocketId(socketId: string): YgoRoom | null;
	/** The room with this id. */
	findById(id: number): YgoRoom | null;
}

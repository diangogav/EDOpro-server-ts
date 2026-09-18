import { generateUnusedRoomId } from "../application/generateUnusedRoomId";
import { RoomIdGenerator } from "../domain/RoomIdGenerator";

/** Default `RoomIdGenerator`: wraps `generateUnusedRoomId` unchanged. */
export class UnusedRoomIdGenerator implements RoomIdGenerator {
	public next(): number {
		return generateUnusedRoomId();
	}
}

import { RoomLocator } from "../domain/RoomLocator";
import { YgoRoom } from "../domain/YgoRoom";

/** Asks each protocol's locator in order and returns the first room found. */
export class RoomFinder {
	constructor(private readonly locators: RoomLocator[]) {}

	run(socketId: string): YgoRoom | null {
		for (const locator of this.locators) {
			const room = locator.findBySocketId(socketId);
			if (room) {
				return room;
			}
		}

		return null;
	}
}

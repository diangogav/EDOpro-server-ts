import { generateUniqueId } from "src/utils/generateUniqueId";

import RoomList from "../infrastructure/RoomList";

/**
 * Bounded, not exhaustive: the id space (1000-9999) is far larger than any
 * realistic live-room count, so a run of collisions this long means the list
 * is effectively saturated.
 */
const MAX_ATTEMPTS = 100;

/**
 * An EDOPro room id that no live room in RoomList currently uses.
 *
 * Joins resolve rooms by id with a first-match lookup, so two live rooms
 * sharing an id would make the later one unreachable.
 */
export function generateUnusedRoomId(): number {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const id = generateUniqueId();
		if (!RoomList.getRooms().some((room) => room.id === id)) {
			return id;
		}
	}

	throw new Error(`No unused room id found after ${MAX_ATTEMPTS} attempts`);
}

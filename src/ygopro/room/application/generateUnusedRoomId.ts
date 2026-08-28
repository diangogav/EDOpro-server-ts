import { generateUniqueId } from "src/utils/generateUniqueId";

import YGOProRoomList from "../infrastructure/YGOProRoomList";

/**
 * Bounded, not exhaustive: the id space (1000-9999) is far larger than any
 * realistic live-room count, so a run of collisions this long means the list
 * is effectively saturated — failing loudly beats scanning the whole space.
 */
const MAX_ATTEMPTS = 100;

/**
 * A ygopro room id that no live room in YGOProRoomList currently uses.
 *
 * YGOProRoomList.findById is first-match, so two live rooms sharing an id
 * would make every id-addressed path (watch joins, the windbot AIJOIN return
 * trip, reconnection) resolve to whichever room was added first. Every ygopro
 * room creation site must draw its id from here instead of calling
 * generateUniqueId directly.
 */
export function generateUnusedRoomId(): number {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const id = generateUniqueId();
		if (!YGOProRoomList.findById(id)) {
			return id;
		}
	}

	throw new Error(`No unused room id found after ${MAX_ATTEMPTS} attempts`);
}

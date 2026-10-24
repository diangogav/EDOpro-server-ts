import { EdoproRoomLocator } from "@edopro/room/infrastructure/EdoproRoomLocator";
import { RoomFinder } from "@shared/room/application/RoomFinder";
import { YGOProRoomLocator } from "@ygopro/room/infrastructure/YGOProRoomLocator";

/**
 * Searches both protocols' rooms whatever server the socket came from:
 * EDOPro clients, then YGOPro clients, then the YGOPro room the socket created.
 */
export function createRoomFinder(): RoomFinder {
	return new RoomFinder([new EdoproRoomLocator(), new YGOProRoomLocator()]);
}

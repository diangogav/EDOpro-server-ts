import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { CardSQLiteTYpeORMRepository } from "../../card/infrastructure/sqlite/CardSQLiteTYpeORMRepository";
import { DeckCreator } from "../../deck/application/DeckCreator";
import { EdoproRoomDeps } from "../domain/RoomStatePorts";
import RoomList from "../infrastructure/RoomList";
import { AuthenticatePlayer } from "./AuthenticatePlayer";
import { CheckIfUseCanJoin } from "./CheckIfUserCanJoin";
import { FinishDuelHandler } from "./FinishDuelHandler";
import { JoinToDuelAsSpectator } from "./JoinToDuelAsSpectator";
import { Reconnect } from "./Reconnect";

/** The production collaborators of one EDOPro room. Call it once per room. */
export function createEdoproRoomDeps(): EdoproRoomDeps {
	const checkIfUserCanReconnect = new CheckIfUseCanJoin(
		new UserAuth(new UserProfilePostgresRepository()),
	);

	return {
		finishDuel: (params) => new FinishDuelHandler(params).run(),
		removeRoom: (room) => RoomList.deleteRoom(room),
		createReconnector: () => new Reconnect(checkIfUserCanReconnect),
		createSpectatorJoiner: () => new JoinToDuelAsSpectator(),
		createPlayerAuthenticator: () =>
			new AuthenticatePlayer(new UserAuth(new UserProfilePostgresRepository())),
		createDeckBuilder: (deckRules, duelFlag) =>
			new DeckCreator(new CardSQLiteTYpeORMRepository(), deckRules, duelFlag),
	};
}

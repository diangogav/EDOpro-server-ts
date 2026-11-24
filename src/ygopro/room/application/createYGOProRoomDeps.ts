import { config } from "src/config";
import { Logger } from "@shared/logger/domain/Logger";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { VerifyAccount } from "@shared/user-profile/application/VerifyAccount";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { RoomAdmission } from "@shared/room/admission/domain/RoomAdmission";

import { CardYGOProRepository } from "../../card/infrastructure/CardYGOProRepository";
import { YGOProDeckCreator } from "../../deck/application/YGOProDeckCreator";
import { AdmitToRoom } from "../admission/application/AdmitToRoom";
import { CredentialResolver } from "../admission/application/CredentialResolver";
import { YGOProRoomDeps } from "../domain/RoomStatePorts";
import { AbandonBetweenDuels } from "./AbandonBetweenDuels";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";

/** The production collaborators of one YGOPro room. */
export function createYGOProRoomDeps(): YGOProRoomDeps {
	const createCredentialResolver = (logger: Logger): CredentialResolver => {
		const userProfileRepo = new UserProfilePostgresRepository();

		return new CredentialResolver(
			userProfileRepo,
			new UserAuth(userProfileRepo),
			logger,
			config.verifiedAccount.cutoff,
		);
	};

	return {
		createCardRepository: (cardPool) => new CardYGOProRepository(cardPool),
		createDeckBuilder: (cardRepository, deckRules, logger) =>
			new YGOProDeckCreator(cardRepository, deckRules, logger),
		createPlayerAdmission: (logger) =>
			new AdmitToRoom(
				createCredentialResolver(logger),
				new RoomAdmission(),
				logger,
				config.verifiedAccount.rankedRequired,
			),
		createCredentialResolver,
		abandonment: AbandonBetweenDuels,
		finalizer: FinalizeYGOProRoom,
		accountVerifier: new VerifyAccount(
			new UserAuth(new UserProfilePostgresRepository()),
			config.verifiedAccount.cutoff,
		),
	};
}

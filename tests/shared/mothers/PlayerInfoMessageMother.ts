import { PlayerInfoMessage } from "../../../src/modules/messages/client-to-server/PlayerInfoMessage";

export class PlayerInfoMessageMother {
	static create(): PlayerInfoMessage {
		return new PlayerInfoMessage(
			Buffer.from(
				"4a006100640065006e00000000000000000000000000000000000000000000000000000000000000",
				"hex"
			),
			40
		);
	}
}

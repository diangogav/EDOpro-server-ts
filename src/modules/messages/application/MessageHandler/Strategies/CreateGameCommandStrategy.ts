/* eslint-disable @typescript-eslint/no-floating-promises */
import { GameCreator } from "../../../../room/application/GameCreator";
import { UserFinder } from "../../../../user/application/UserFinder";
import { User } from "../../../../user/domain/User";
import { CreateGameMessage } from "../../../client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../../../client-to-server/PlayerInfoMessage";
import { ErrorMessages } from "../../../server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../server-to-client/ErrorClientMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class CreateGameCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(
		private readonly context: MessageHandlerContext,
		private readonly afterExecuteCallback: () => void,
		private readonly userFinder: UserFinder
	) {}

	execute(): void {
		const body = this.context.readBody(this.context.messageLength());
		const createGameMessage = new CreateGameMessage(body);
		const gameCreator = new GameCreator(this.context.socket);
		const playerInfoMessage = this.context.getPreviousMessages() as PlayerInfoMessage;

		if (!playerInfoMessage.password) {
			gameCreator.run(createGameMessage, playerInfoMessage);
			this.afterExecuteCallback();

			return;
		}

		this.userFinder.run(playerInfoMessage).then((user) => {
			if (!(user instanceof User)) {
				this.context.socket.write(user as Buffer);
				this.context.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));

				return;
			}
			gameCreator.run(createGameMessage, playerInfoMessage);
			this.afterExecuteCallback();
		});
	}
}

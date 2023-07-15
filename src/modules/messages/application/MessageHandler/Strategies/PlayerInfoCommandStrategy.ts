import { PlayerInfoMessage } from "../../../client-to-server/PlayerInfoMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class PlayerInfoCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(
		private readonly context: MessageHandlerContext,
		private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const length = this.context.messageLength();
		const body = this.context.readBody(length);
		const playerInfo = new PlayerInfoMessage(body, length);
		this.context.updatePreviousMessage(playerInfo);
		this.afterExecuteCallback();

		return;
	}
}

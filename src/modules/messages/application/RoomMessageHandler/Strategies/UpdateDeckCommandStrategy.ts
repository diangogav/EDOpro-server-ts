import { UpdateDeckMessageSizeCalculator } from "../../UpdateDeckMessageSizeCalculator";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class UpdateDeckCommandStrategy implements RoomMessageHandlerCommandStrategy {
	constructor(
		private readonly context: RoomMessageHandlerContext,
		private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const messageSize = new UpdateDeckMessageSizeCalculator(this.context.data).calculate();
		this.context.readBody(messageSize);
		this.afterExecuteCallback();
	}
}

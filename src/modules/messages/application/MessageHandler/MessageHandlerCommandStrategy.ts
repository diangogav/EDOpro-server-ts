export interface MessageHandlerCommandStrategy {
	execute(): void | Promise<void>;
}

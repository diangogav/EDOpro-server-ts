export interface ISocket {
	id?: string;
	roomId?: number;
	resolvedUserId?: string;
	send(message: Buffer): void;
	onMessage(callback: (message: Buffer) => void): void;
	onClose(callback: () => void): void;
	close(): void;
	destroy(): void;
	remoteAddress: string | undefined;
	closed: boolean;
	removeAllListeners(): void;
}

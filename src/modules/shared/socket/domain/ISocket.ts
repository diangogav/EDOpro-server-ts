interface ISocket {
	send(message: string): void;
	onMessage(callback: (message: string) => void): void;
	onClose(callback: () => void): void;
	close(): void;
}

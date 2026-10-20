import { faker } from "@faker-js/faker";

import { ISocket } from "@shared/socket/domain/ISocket";

export class SocketMock implements ISocket {
	readonly transport = "tcp" as const;
	id = faker.string.uuid();
	roomId = 0;
	resolvedUserId?: string;
	remoteAddress = faker.internet.ip();
	closed = false;
	lastInboundAt = Date.now();

	send(_message: Buffer): void {
		/* no-op */
	}

	onMessage(_callback: (message: Buffer) => void): void {
		/* no-op */
	}

	onClose(_callback: () => void): void {
		/* no-op */
	}

	close(): void {
		/* no-op */
	}

	destroy(): void {
		/* no-op */
	}

	closeGracefully(_timeoutMs: number): void {
		/* no-op */
	}

	closeSuperseded(): void {
		/* no-op */
	}

	removeAllListeners(): void {
		/* no-op */
	}
}

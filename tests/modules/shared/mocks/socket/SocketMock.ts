import { faker } from "@faker-js/faker";

import { ISocket } from "../../../../../src/shared/socket/domain/ISocket";

export class SocketMock implements ISocket {
	id = faker.string.uuid();
	roomId = 0;
	remoteAddress = faker.internet.ip();
	closed = false;

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

	removeAllListeners(): void {
		/* no-op */
	}
}

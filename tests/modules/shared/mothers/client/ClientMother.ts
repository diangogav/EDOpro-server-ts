import { faker } from "@faker-js/faker";

import { Client } from "../../../../../src/edopro/client/domain/Client";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { ISocket } from "../../../../../src/shared/socket/domain/ISocket";
import { LoggerMock } from "../../mocks/logger/LoggerMock";
import { SocketMock } from "../../mocks/socket/SocketMock";

interface ClientMotherProps {
	socket: ISocket;
	host: boolean;
	name: string;
	position: number;
	roomId: number;
	isReady?: boolean;
	team: number;
	logger: Logger;
	id: string | null;
}

export class ClientMother {
	static create(params?: Partial<ClientMotherProps>): Client {
		const socket = params?.socket ?? new SocketMock();
		const logger = params?.logger ?? new LoggerMock();

		return new Client({
			socket,
			host: params?.host ?? faker.datatype.boolean(),
			name: params?.name ?? faker.person.firstName(),
			position: params?.position ?? faker.number.int({ min: 0, max: 10 }),
			roomId: params?.roomId ?? faker.number.int({ min: 1, max: 9999 }),
			isReady: params?.isReady ?? false,
			team: params?.team ?? faker.number.int({ min: 0, max: 1 }),
			logger,
			id: params?.id ?? faker.string.uuid(),
		});
	}
}

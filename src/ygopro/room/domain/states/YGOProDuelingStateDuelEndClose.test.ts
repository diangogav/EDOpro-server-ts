/**
 * The normal end-of-duel path must close each client gracefully so the queued
 * replay frames and STOC_DUEL_END flush before the socket goes away. A hard
 * destroy() discards unflushed buffers and the web client sees "connection lost".
 */

import { mock } from "jest-mock-extended";

import { Logger } from "@shared/logger/domain/Logger";

import { YGOProDuelingState } from "./YGOProDuelingState";

type TestableDuelingState = { sendDuelEndAndDisconnect(): void };

const makeClient = () => ({
	sendMessageToClient: jest.fn(),
	destroy: jest.fn(),
	disconnectGracefully: jest.fn(),
});

const buildState = (clients: unknown[]): TestableDuelingState => {
	const state = Object.create(YGOProDuelingState.prototype);
	Object.assign(state, { room: { clients }, logger: mock<Logger>() });
	return state as TestableDuelingState;
};

describe("YGOProDuelingState.sendDuelEndAndDisconnect()", () => {
	it("sends DUEL_END to every client", () => {
		const clients = [makeClient(), makeClient()];

		buildState(clients).sendDuelEndAndDisconnect();

		for (const client of clients) {
			expect(client.sendMessageToClient).toHaveBeenCalledTimes(1);
		}
	});

	it("closes every client gracefully after sending", () => {
		const client = makeClient();

		buildState([client]).sendDuelEndAndDisconnect();

		expect(client.disconnectGracefully).toHaveBeenCalledTimes(1);
		expect(client.sendMessageToClient.mock.invocationCallOrder[0]).toBeLessThan(
			client.disconnectGracefully.mock.invocationCallOrder[0],
		);
	});

	it("does not hard-destroy the clients", () => {
		const client = makeClient();

		buildState([client]).sendDuelEndAndDisconnect();

		expect(client.destroy).not.toHaveBeenCalled();
	});
});

import { EventEmitter } from "events";
import type RedisLibrary from "ioredis";

import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { RESERVATION_OPEN_CHANNEL } from "../../domain/Reservation";
import { RedisReservationOpenSubscriber } from "./RedisReservationOpenSubscriber";

const ID = "Ab3dEf6hIj9kLm2n";

const makeConnection = () => {
	const connection = new EventEmitter() as EventEmitter & { subscribe: jest.Mock };
	connection.subscribe = jest.fn().mockResolvedValue(1);
	return connection;
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("RedisReservationOpenSubscriber", () => {
	it("subscribes to the open channel and opens each announced reservation", async () => {
		const connection = makeConnection();
		const open = jest.fn().mockResolvedValue(undefined);
		await new RedisReservationOpenSubscriber(
			connection as unknown as RedisLibrary,
			open,
			new LoggerMock(),
		).start();

		connection.emit("message", RESERVATION_OPEN_CHANNEL, ID);
		await flush();

		expect(connection.subscribe).toHaveBeenCalledWith(RESERVATION_OPEN_CHANNEL);
		expect(open).toHaveBeenCalledWith(ID);
	});

	it("ignores malformed ids and other channels", async () => {
		const connection = makeConnection();
		const open = jest.fn().mockResolvedValue(undefined);
		await new RedisReservationOpenSubscriber(
			connection as unknown as RedisLibrary,
			open,
			new LoggerMock(),
		).start();

		connection.emit("message", RESERVATION_OPEN_CHANNEL, "../../etc");
		connection.emit("message", "other", ID);
		await flush();

		expect(open).not.toHaveBeenCalled();
	});

	it("keeps listening after an opening fails", async () => {
		const connection = makeConnection();
		const open = jest.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
		await new RedisReservationOpenSubscriber(
			connection as unknown as RedisLibrary,
			open,
			new LoggerMock(),
		).start();

		connection.emit("message", RESERVATION_OPEN_CHANNEL, ID);
		connection.emit("message", RESERVATION_OPEN_CHANNEL, ID);
		await flush();

		expect(open).toHaveBeenCalledTimes(2);
	});
});

jest.mock("../../application/AbandonBetweenDuels", () => ({
	AbandonBetweenDuels: { resolve: jest.fn().mockResolvedValue(undefined) },
}));

import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Team } from "@shared/room/Team";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";

import { AbandonBetweenDuels } from "../../application/AbandonBetweenDuels";
import { YGOProRoom } from "../YGOProRoom";
import { YGOProChoosingOrderState } from "./YGOProChoosingOrderState";
import { YGOProRockPaperScissorState } from "./YGOProRockPaperScissorState";
import { YGOProSideDeckingState } from "./YGOProSideDeckingState";

// A surrender between duels leaves the match at once; nobody waits on a grace window.
describe("Surrender between duels", () => {
	const logger = {
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	} as unknown as Logger;

	const makeClient = (overrides: Partial<Record<string, unknown>> = {}) =>
		({
			team: Team.OPPONENT,
			isSpectator: false,
			sendMessageToClient: jest.fn(),
			...overrides,
		}) as unknown as YGOProClient;

	const surrender = (eventEmitter: EventEmitter, room: YGOProRoom, client: YGOProClient) =>
		eventEmitter.emit(Commands.SURRENDER as unknown as string, {} as ClientMessage, room, client);

	const states: [string, (eventEmitter: EventEmitter, room: YGOProRoom) => unknown][] = [
		["RPS", (eventEmitter) => new YGOProRockPaperScissorState(eventEmitter, logger)],
		["choosing order", (eventEmitter) => new YGOProChoosingOrderState(eventEmitter, logger)],
		[
			"side decking",
			(eventEmitter, room) =>
				new YGOProSideDeckingState(
					eventEmitter,
					logger,
					{} as YGOProDeckCreator,
					{} as YGOProDeckValidator,
					room,
				),
		],
	];

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
	});

	afterEach(() => jest.useRealTimers());

	it.each(states)("settles the match for the surrendering team during %s", (_label, build) => {
		const eventEmitter = new EventEmitter();
		const client = makeClient();
		const room = { isTag: false, players: [client], clients: [client] } as unknown as YGOProRoom;
		build(eventEmitter, room);

		surrender(eventEmitter, room, client);

		expect(AbandonBetweenDuels.resolve).toHaveBeenCalledWith(
			room,
			Team.OPPONENT,
			expect.anything(),
		);
	});

	it.each(states)("ignores a spectator surrendering during %s", (_label, build) => {
		const eventEmitter = new EventEmitter();
		const spectator = makeClient({ isSpectator: true });
		const room = { isTag: false, players: [], clients: [spectator] } as unknown as YGOProRoom;
		build(eventEmitter, room);

		surrender(eventEmitter, room, spectator);

		expect(AbandonBetweenDuels.resolve).not.toHaveBeenCalled();
	});

	it.each(states)("leaves tag matches to the existing team rules during %s", (_label, build) => {
		const eventEmitter = new EventEmitter();
		const client = makeClient();
		const room = { isTag: true, players: [client], clients: [client] } as unknown as YGOProRoom;
		build(eventEmitter, room);

		surrender(eventEmitter, room, client);

		expect(AbandonBetweenDuels.resolve).not.toHaveBeenCalled();
	});
});

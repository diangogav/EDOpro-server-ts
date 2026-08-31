import { EventEmitter } from "stream";

import { ChatColor, ErrorMessageType, YGOProStocChat } from "ygopro-msg-encode";

import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";
import { AdmitToRoom } from "@ygopro/room/admission/application/AdmitToRoom";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { YGOProRoom } from "../YGOProRoom";

import { YGOProWaitingState } from "./YGOProWaitingState";

// Nickname-taken rejection tightened to one RED STOC_CHAT line (cause +
// action), same idiom as every other join rejection in this codebase.

const makeLogger = (): jest.Mocked<Logger> =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as unknown as jest.Mocked<Logger>;

const makeSocket = (): jest.Mocked<ISocket> =>
	({
		send: jest.fn(),
		close: jest.fn(),
	}) as unknown as jest.Mocked<ISocket>;

describe("YGOProWaitingState — nickname taken", () => {
	it("sends 'Nickname '<name>' is already in use — choose another.' then JOINERROR then close", () => {
		const socket = makeSocket();
		const room = {
			messageSender: { errorMessage: jest.fn().mockReturnValue(Buffer.from("joinerror")) },
		} as unknown as YGOProRoom;

		const state = new YGOProWaitingState(
			{} as unknown as AdmitToRoom,
			new EventEmitter(),
			makeLogger(),
			{} as unknown as YGOProDeckCreator,
			{} as unknown as YGOProDeckValidator,
		) as unknown as {
			sendNameTakenError: (room: YGOProRoom, name: string, socket: ISocket) => void;
		};

		state.sendNameTakenError(room, "Diango", socket);

		const expectedFrame = Buffer.from(
			new YGOProStocChat()
				.fromPartial({
					player_type: ChatColor.RED,
					msg: "Nickname 'Diango' is already in use — choose another.",
				})
				.toFullPayload(),
		);
		expect(socket.send).toHaveBeenCalledWith(expectedFrame);
		expect(room.messageSender.errorMessage).toHaveBeenCalledWith(ErrorMessageType.JOINERROR, 0);
		expect(socket.close).toHaveBeenCalled();
	});
});

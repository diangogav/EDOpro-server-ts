import {
	decimalToBytesBuffer,
	decimalToBytesBufferSigned,
} from "../../../utils/decimalToBytesBuffer";
import { Room } from "../../room/domain/Room";
import { CreateGameMessage } from "../client-to-server/CreateGameMessage";
import { JoinGameMessage } from "../client-to-server/JoinGameMessage";

export class JoinGameClientMessage {
	static createFromCreateGameMessage(message: CreateGameMessage): Buffer {
		const header = Buffer.from([0x45, 0x00, 0x12]);
		const banList = decimalToBytesBufferSigned(message.banList, 4);
		const allowed = decimalToBytesBuffer(message.allowed, 1);
		const mode = decimalToBytesBuffer(message.mode, 1);
		const duelRule = decimalToBytesBuffer(message.duelRule, 1);
		const dontCheckDeck = decimalToBytesBuffer(message.dontCheckDeckContent, 1);
		const dontShuffleDeck = decimalToBytesBuffer(message.dontShuffleDeck, 1);
		const padding = Buffer.from([0x1e, 0x3c, 0xb2]);
		const lp = decimalToBytesBuffer(message.lp, 4);
		const startingHandCount = decimalToBytesBuffer(message.startingHandCount, 1);
		const drawCount = decimalToBytesBuffer(message.drawCount, 1);
		const timeLimit = decimalToBytesBuffer(message.timeLimit, 2);
		const duelFlagsHight = decimalToBytesBuffer(message.duelFlagsHight, 4);
		const handshake = decimalToBytesBuffer(message.handshake, 4);
		const version = decimalToBytesBuffer(message.clientVersion, 4);
		const t0Count = decimalToBytesBuffer(message.t0Count, 4);
		const t1Count = decimalToBytesBuffer(message.t1Count, 4);
		const bestOf = decimalToBytesBuffer(message.bestOf, 4);
		const duelFlagsLow = decimalToBytesBuffer(message.duelFlagsLow, 4);
		const forbidden = decimalToBytesBuffer(message.forbidden, 4);
		const extraRules = decimalToBytesBuffer(message.extraRules, 2);
		const mainDeckMin = decimalToBytesBuffer(message.mainDeckMin, 2);
		const mainDeckMax = decimalToBytesBuffer(message.mainDeckMax, 2);
		const extraDeckMin = decimalToBytesBuffer(message.extraDeckMin, 2);
		const extraDeckMax = decimalToBytesBuffer(message.extraDeckMax, 2);
		const sideDeckMin = decimalToBytesBuffer(message.sideDeckMin, 2);
		const sideDeckMax = decimalToBytesBuffer(message.sideDeckMax, 2);
		const unknown = Buffer.from([0x09, 0x71]);

		return Buffer.concat([
			header,
			banList,
			allowed,
			mode,
			duelRule,
			dontCheckDeck,
			dontShuffleDeck,
			padding,
			lp,
			startingHandCount,
			drawCount,
			timeLimit,
			duelFlagsHight,
			handshake,
			version,
			t0Count,
			t1Count,
			bestOf,
			duelFlagsLow,
			forbidden,
			extraRules,
			mainDeckMin,
			mainDeckMax,
			extraDeckMin,
			extraDeckMax,
			sideDeckMin,
			sideDeckMax,
			unknown,
		]);
	}

	static createFromRoom(joinGameMessage: JoinGameMessage, room: Room): Buffer {
		const header = Buffer.from([0x45, 0x00, 0x12]);
		const banList = decimalToBytesBuffer(room.banlistHash, 4);
		const allowed = decimalToBytesBuffer(room.deckRules.rule, 1);
		const mode = decimalToBytesBuffer(room.mode, 1);
		const duelRule = decimalToBytesBuffer(room.duelRule, 1);
		const dontCheckDeck = decimalToBytesBuffer(Number(room.noCheck), 1);
		const dontShuffleDeck = decimalToBytesBuffer(Number(room.noShuffle), 1);
		const padding = Buffer.from([0x1e, 0x3c, 0xb2]);
		const lp = decimalToBytesBuffer(room.startLp, 4);
		const startingHandCount = decimalToBytesBuffer(room.startHand, 1);
		const drawCount = decimalToBytesBuffer(room.drawCount, 1);
		const timeLimit = decimalToBytesBuffer(room.timeLimit, 2);
		const duelFlagsHight = decimalToBytesBuffer(room.duelFlagsHight, 4);
		const handshake = decimalToBytesBuffer(room.handshake, 4);
		const version = decimalToBytesBuffer(joinGameMessage.clientVersion, 4);
		const t0Count = decimalToBytesBuffer(room.team0, 4);
		const t1Count = decimalToBytesBuffer(room.team1, 4);
		const bestOf = decimalToBytesBuffer(room.bestOf, 4);
		const duelFlagsLow = decimalToBytesBuffer(room.duelFlagsLow, 4);
		const forbidden = decimalToBytesBuffer(room.forbiddenTypes, 4);
		const extraRules = decimalToBytesBuffer(room.extraRules, 2);
		const mainDeckMin = decimalToBytesBuffer(room.deckRules.mainMin, 2);
		const mainDeckMax = decimalToBytesBuffer(room.deckRules.mainMax, 2);
		const extraDeckMin = decimalToBytesBuffer(room.deckRules.extraMin, 2);
		const extraDeckMax = decimalToBytesBuffer(room.deckRules.extraMax, 2);
		const sideDeckMin = decimalToBytesBuffer(room.deckRules.sideMin, 2);
		const sideDeckMax = decimalToBytesBuffer(room.deckRules.sideMax, 2);
		const unknown = Buffer.from([0x55, 0x54]);

		return Buffer.concat([
			header,
			banList,
			allowed,
			mode,
			duelRule,
			dontCheckDeck,
			dontShuffleDeck,
			padding,
			lp,
			startingHandCount,
			drawCount,
			timeLimit,
			duelFlagsHight,
			handshake,
			version,
			t0Count,
			t1Count,
			bestOf,
			duelFlagsLow,
			forbidden,
			extraRules,
			mainDeckMin,
			mainDeckMax,
			extraDeckMin,
			extraDeckMax,
			sideDeckMin,
			sideDeckMax,
			unknown,
		]);
	}
}

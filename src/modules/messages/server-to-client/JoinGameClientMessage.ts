import { decimalToBytesBuffer } from "../../../utils/decimalToBytesBuffer";
import { CreateGameMessage } from "../client-to-server/CreateGameMessage";

export class JoinGameClientMessage {
	static createFromCreateGameMessage(message: CreateGameMessage): Buffer {
		const header = Buffer.from([0x45, 0x00, 0x12]);
		const banList = decimalToBytesBuffer(message.banList, 4);
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
		const unknown = Buffer.from([
			0x67, 0x53, 0x2b, 0x00, 0x20, 0x54, 0x00, 0x65, 0x00, 0x72, 0x00, 0x6d, 0x00, 0x6f, 0x00,
			0x2d, 0x00, 0x44, 0x00, 0x41, 0x00, 0x4b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x02, 0x00, 0x21, 0x0a, 0x02, 0x00, 0x13, 0x10,
		]);

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

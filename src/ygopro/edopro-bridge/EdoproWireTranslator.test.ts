import {
	IndexResponse,
	YGOProMsgSelectCard,
	YGOProMsgSelectIdleCmd,
	YGOProStoc,
	YGOProStocChat,
	YGOProStocErrorMsg,
	YGOProStocGameMsg,
	YGOProStocJoinGame,
} from "ygopro-msg-encode";

import { EdoproWireTranslator } from "./EdoproWireTranslator";
import { IgnisWriter } from "./IgnisWriter.testing";
import { translateIgnisGameMsg } from "./translateIgnisGameMsg";

const BORA = 49003716;
const HAND = 0x02;
const MZONE = 0x04;
const GRAVE = 0x10;

function frame(command: number, body: Uint8Array): Buffer {
	const header = Buffer.alloc(3);
	header.writeUInt16LE(body.length + 1, 0);
	header[2] = command;

	return Buffer.concat([header, Buffer.from(body)]);
}

const gameFrame = (writer: IgnisWriter): Buffer => frame(0x01, writer.build());
const decode = (bytes: Buffer | null): unknown =>
	bytes ? YGOProStoc.getInstanceFromPayload(bytes) : null;

/** One payload per message the translator forwards untouched. */
const SAME_LAYOUT_SAMPLES: Array<[number, IgnisWriter]> = [
	[1, new IgnisWriter().u8(1)],
	[3, new IgnisWriter().u8(3)],
	[5, new IgnisWriter().u8(5).u8(1).u8(1)],
	[18, new IgnisWriter().u8(18).u8(0).u8(1).u32(0xffff_fffb)],
	[19, new IgnisWriter().u8(19).u8(0).u32(BORA).u8(0x5)],
	[24, new IgnisWriter().u8(24).u8(1).u8(2).u32(0)],
	[32, new IgnisWriter().u8(32).u8(1)],
	[37, new IgnisWriter().u8(37)],
	[40, new IgnisWriter().u8(40).u8(1)],
	[41, new IgnisWriter().u8(41).u16(0x200)],
	[53, new IgnisWriter().u8(53).u32(BORA).u8(0).u8(MZONE).u8(2).u8(0x1).u8(0x4)],
	[56, new IgnisWriter().u8(56).u32(0x1171_1171)],
	[61, new IgnisWriter().u8(61)],
	[63, new IgnisWriter().u8(63)],
	[65, new IgnisWriter().u8(65)],
	[71, new IgnisWriter().u8(71).u8(2)],
	[72, new IgnisWriter().u8(72).u8(2)],
	[73, new IgnisWriter().u8(73).u8(2)],
	[74, new IgnisWriter().u8(74)],
	[75, new IgnisWriter().u8(75).u8(2)],
	[76, new IgnisWriter().u8(76).u8(2)],
	[91, new IgnisWriter().u8(91).u8(1).u32(1700)],
	[92, new IgnisWriter().u8(92).u8(1).u32(1700)],
	[94, new IgnisWriter().u8(94).u8(1).u32(6300)],
	[100, new IgnisWriter().u8(100).u8(1).u32(1000)],
	[101, new IgnisWriter().u8(101).u16(0x1).u8(0).u8(MZONE).u8(2).u16(3)],
	[102, new IgnisWriter().u8(102).u16(0x1).u8(0).u8(MZONE).u8(2).u16(1)],
	[112, new IgnisWriter().u8(112)],
	[113, new IgnisWriter().u8(113)],
	[114, new IgnisWriter().u8(114)],
	[130, new IgnisWriter().u8(130).u8(0).u8(2).u8(1).u8(0)],
	[131, new IgnisWriter().u8(131).u8(0).u8(2).u8(6).u8(3)],
	[141, new IgnisWriter().u8(141).u8(0).u8(1).u32(0x7f)],
];

describe("EdoproWireTranslator", () => {
	describe("messages laid out the same in both cores", () => {
		it.each(SAME_LAYOUT_SAMPLES)("forwards message %i untouched", (_type, writer) => {
			const original = gameFrame(writer);

			expect(new EdoproWireTranslator().toClient(original)).toBe(original);
		});

		it.each(
			SAME_LAYOUT_SAMPLES,
		)("message %i really is the bytes a YGOPro client decodes", (_type, writer) => {
			const translated = translateIgnisGameMsg(writer.build(), { duelRule: 5 });
			if (translated.kind !== "message") {
				throw new Error(`no decoder to compare against: ${translated.kind}`);
			}
			const stoc = new YGOProStocGameMsg();
			stoc.msg = translated.message;

			expect(Buffer.from(stoc.toFullPayload())).toEqual(gameFrame(writer));
		});
	});

	it("re-encodes a message whose layout differs so a YGOPro client reads it", () => {
		const idle = new IgnisWriter()
			.u8(11)
			.u8(0)
			.u32(1)
			.u32(BORA)
			.u8(0)
			.u8(HAND)
			.u32(2)
			.u32(0)
			.u32(0)
			.u32(0)
			.u32(0)
			.u32(0)
			.u8(1)
			.u8(1)
			.u8(0);

		const decoded = decode(
			new EdoproWireTranslator().toClient(gameFrame(idle)),
		) as YGOProStocGameMsg;

		expect(decoded.msg).toBeInstanceOf(YGOProMsgSelectIdleCmd);
		expect((decoded.msg as YGOProMsgSelectIdleCmd).summonableCards[0]).toMatchObject({
			code: BORA,
			location: HAND,
			sequence: 2,
		});
	});

	it("rewrites the answer to the prompt it last sent, and only that one", () => {
		const translator = new EdoproWireTranslator();
		const selectCard = new IgnisWriter()
			.u8(15)
			.u8(0)
			.u8(0)
			.u32(1)
			.u32(1)
			.u32(2)
			.u32(BORA)
			.location(0, GRAVE, 0, 0x1)
			.u32(BORA)
			.location(0, GRAVE, 1, 0x1);
		const prompt = (decode(translator.toClient(gameFrame(selectCard))) as YGOProStocGameMsg)
			.msg as YGOProMsgSelectCard;
		const answer = frame(0x01, prompt.prepareResponse([IndexResponse(1)]));

		expect([...translator.toRoom(answer).subarray(3)]).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1]);

		translator.toClient(gameFrame(new IgnisWriter().u8(19).u8(0).u32(BORA).u8(0x5)));
		const position = frame(0x01, Uint8Array.from([1, 0, 0, 0]));

		expect(translator.toRoom(position)).toEqual(position);
	});

	it("leaves every frame that is not a response as the client sent it", () => {
		const ready = frame(0x22, new Uint8Array(0));

		expect(new EdoproWireTranslator().toRoom(ready)).toBe(ready);
	});

	it("turns the EDOPro host info into the YGOPro one and keeps the room's Master Rule", () => {
		const hostInfo = Buffer.alloc(68);
		hostInfo.writeUInt32LE(8000, 12);
		hostInfo.writeUInt32LE(0xd0700, 44);
		const translator = new EdoproWireTranslator();

		const joined = decode(translator.toClient(frame(0x12, hostInfo))) as YGOProStocJoinGame;
		const start = new IgnisWriter().u8(4).u8(0).u32(8000).u32(8000).u16(40).u16(0).u16(40).u16(0);
		const started = decode(translator.toClient(gameFrame(start))) as YGOProStocGameMsg;

		expect(joined.info).toMatchObject({ start_lp: 8000, duel_rule: 1 });
		expect(started.msg).toMatchObject({ duelRule: 1 });
	});

	it("re-encodes an EDOPro deck error as the padded YGOPro error frame", () => {
		const body = Buffer.alloc(24);
		body[0] = 2;
		body.writeUInt32LE(4, 4);
		body.writeUInt32LE(BORA, 20);

		const error = decode(
			new EdoproWireTranslator().toClient(frame(0x02, body)),
		) as YGOProStocErrorMsg;

		expect(error.code >>> 28).toBe(4);
		expect(error.code & 0x0fff_ffff).toBe(BORA);
	});

	it("carries a player's chat with the name in the text", () => {
		const body = Buffer.concat([
			Buffer.from([0x00, 0x00]),
			Buffer.from("Yugi".padEnd(20, "\0"), "utf16le"),
			Buffer.from("hola\0", "utf16le"),
		]);

		const chat = decode(new EdoproWireTranslator().toClient(frame(0xf3, body))) as YGOProStocChat;

		expect(chat).toMatchObject({ player_type: 7, msg: "Yugi: hola" });
	});

	it("passes the frames the shared kernel encodes for both wire formats", () => {
		const token = frame(0xfd, Buffer.from("token"));

		expect(new EdoproWireTranslator().toClient(token)).toBe(token);
	});

	it("drops a core message it cannot translate and names it", () => {
		const untranslated = jest.fn();

		const sent = new EdoproWireTranslator(untranslated).toClient(
			frame(0x01, Uint8Array.from([161])),
		);

		expect(sent).toBeNull();
		expect(untranslated).toHaveBeenCalledWith(161);
	});

	it("drops the EDOPro-only frames a YGOPro client has no use for", () => {
		expect(new EdoproWireTranslator().toClient(frame(0xf0, Buffer.alloc(4)))).toBeNull();
	});
});

import { MessageProcessor } from "../../../src/modules/messages/application/MessageHandler/MessageProcessor";
import { Commands } from "../../../src/modules/messages/domain/Commands";

describe("Message Processor", () => {
	let data: Buffer;

	beforeEach(() => {
		data = Buffer.from(
			"2900106300680061007a007a000000000000000000000000000000000000000000000000000000000000005d01111c6a241a0400000000000000401f00000501fa0000000000016201f128010a0001000000010000000500000080060d0000000005000028003c0000000f0000000f00410849003a005000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000cec47b0000000000000000000000000000000000000000000000000000000000003e0008000000180000006cfd7a0a429cc27b30003f0003001f0014fd7a0a00003e00050000000a00000800103f0002100000e8c83e00000000004000000000003e00e8c83e00021000008cfd7a0afe81c27b2000000016000000bcfe7a0aa050087b00103f0020003f0000000000021000005000000038004108021000009f6c077b00103f00e8c83e0000000000e0c83e000c000000040000008cfd7a0a0210000000003e00",
			"hex"
		);
	});
	it("Should...", () => {
		const messageProcessor = new MessageProcessor();
		messageProcessor.read(data);
		messageProcessor.process();
		expect(messageProcessor.command).toBe(Commands.PLAYER_INFO);
		expect(messageProcessor.size).toBe(41);
		expect(messageProcessor.bufferLength).toBe(351);
	});

	it("Should...", () => {
		const messageProcessor = new MessageProcessor();
		messageProcessor.read(data);
		messageProcessor.process();
		expect(messageProcessor.command).toBe(Commands.PLAYER_INFO);
		expect(messageProcessor.size).toBe(41);
		expect(messageProcessor.bufferLength).toBe(351);

		messageProcessor.process();
		expect(messageProcessor.command).toBe(Commands.CREATE_GAME);
		expect(messageProcessor.size).toBe(349);
		expect(messageProcessor.bufferLength).toBe(0);
	});

	it("Should...", () => {
		data = Buffer.from("050001", "hex");
		const messageProcessor = new MessageProcessor();
		messageProcessor.read(data);
		messageProcessor.process();

		expect(messageProcessor.command).toBe(undefined);
		expect(messageProcessor.size).toBe(undefined);
		expect(messageProcessor.bufferLength).toBe(3);

		data = Buffer.from("ffffffff010015", "hex");
		messageProcessor.read(data);
		messageProcessor.process();

		expect(messageProcessor.command).toBe(Commands.RESPONSE);
		expect(messageProcessor.size).toBe(5);
		expect(messageProcessor.bufferLength).toBe(3);

		messageProcessor.process();

		expect(messageProcessor.command).toBe(Commands.TIME_CONFIRM);
		expect(messageProcessor.size).toBe(1);
		expect(messageProcessor.bufferLength).toBe(0);
	});
});

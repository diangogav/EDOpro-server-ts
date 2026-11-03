import { ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";

import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { RoomMother } from "@test-support/mothers/room/RoomMother";

type FakeStdin = EventEmitter & { write: jest.Mock<boolean, [string]> };

function makeCore(writeResults: boolean[] = []): {
	core: ChildProcessWithoutNullStreams;
	stdin: FakeStdin;
} {
	const stdin = new EventEmitter() as FakeStdin;
	stdin.write = jest.fn((_line: string) =>
		writeResults.length > 0 ? (writeResults.shift() as boolean) : true,
	);

	return { core: { stdin } as unknown as ChildProcessWithoutNullStreams, stdin };
}

describe("Room core-process channel", () => {
	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
		delete process.env.IPC_METRICS_ENABLED;
	});

	it("writes each command to the core stdin in order, one line each", () => {
		const room = RoomMother.create();
		const { core, stdin } = makeCore();
		room.setDuel(core);

		room.sendMessageToCpp("first");
		room.sendMessageToCpp("second");

		expect(stdin.write.mock.calls).toEqual([["first\n"], ["second\n"]]);
	});

	it("holds later commands while stdin is full and writes them after drain", () => {
		const room = RoomMother.create();
		const { core, stdin } = makeCore([false]);
		room.setDuel(core);

		room.sendMessageToCpp("first");
		room.sendMessageToCpp("second");
		expect(stdin.write.mock.calls).toEqual([["first\n"]]);

		stdin.emit("drain");

		// stdin already buffered "first", so it is not written again.
		expect(stdin.write.mock.calls).toEqual([["first\n"], ["second\n"]]);
	});

	it("writes every command exactly once across several stalls", () => {
		const room = RoomMother.create();
		const { core, stdin } = makeCore([false, false]);
		room.setDuel(core);

		room.sendMessageToCpp("a");
		room.sendMessageToCpp("b");
		room.sendMessageToCpp("c");
		stdin.emit("drain");
		stdin.emit("drain");

		expect(stdin.write.mock.calls).toEqual([["a\n"], ["b\n"], ["c\n"]]);
	});

	it("drops commands sent before the core is attached", () => {
		const room = RoomMother.create();
		room.sendMessageToCpp("lost");
		const { core, stdin } = makeCore();

		room.setDuel(core);
		room.sendMessageToCpp("kept");

		expect(stdin.write.mock.calls).toEqual([["kept\n"]]);
	});

	it("starts a newly attached core with an empty queue, even if the previous one was waiting for drain", () => {
		const room = RoomMother.create();
		const previous = makeCore([false]);
		room.setDuel(previous.core);
		room.sendMessageToCpp("stuck");
		room.sendMessageToCpp("pending");
		const next = makeCore();

		room.setDuel(next.core);
		room.sendMessageToCpp("fresh");

		expect(next.stdin.write.mock.calls).toEqual([["fresh\n"]]);
	});

	it("ignores a late drain from the previous core while the new one is still full", () => {
		const room = RoomMother.create();
		const previous = makeCore([false]);
		room.setDuel(previous.core);
		room.sendMessageToCpp("old");
		const next = makeCore([false]);
		room.setDuel(next.core);
		room.sendMessageToCpp("first");
		room.sendMessageToCpp("second");

		previous.stdin.emit("drain");
		expect(next.stdin.write.mock.calls).toEqual([["first\n"]]);

		next.stdin.emit("drain");
		expect(next.stdin.write.mock.calls).toEqual([["first\n"], ["second\n"]]);
	});

	it("logs stdin write errors", () => {
		const error = jest.spyOn(LoggerMock.prototype, "error");
		const room = RoomMother.create();
		const { core, stdin } = makeCore();
		room.setDuel(core);
		const failure = new Error("EPIPE");

		stdin.emit("error", failure);

		expect(error).toHaveBeenCalledWith("Error writing to the child process");
		expect(error).toHaveBeenCalledWith(failure);
	});

	it("sends DESTROY_DUEL to the core when the room is destroyed", async () => {
		const room = RoomMother.create();
		const { core, stdin } = makeCore();
		room.setDuel(core);

		room.destroy();
		await new Promise((resolve) => setImmediate(resolve));

		expect(stdin.write).toHaveBeenCalledWith(
			`${JSON.stringify({ command: "DESTROY_DUEL", data: {} })}\n`,
		);
	});

	it("does not report IPC metrics unless IPC_METRICS_ENABLED is true", () => {
		jest.useFakeTimers();
		const info = jest.spyOn(LoggerMock.prototype, "info");
		const room = RoomMother.create();
		room.setDuel(makeCore().core);

		jest.advanceTimersByTime(60_000);

		expect(info).not.toHaveBeenCalledWith("IPC_METRICS", expect.anything());
	});

	it("reports an IPC metrics snapshot every minute and stops when the room is destroyed", async () => {
		process.env.IPC_METRICS_ENABLED = "true";
		jest.useFakeTimers();
		const info = jest.spyOn(LoggerMock.prototype, "info");
		const room = RoomMother.create();
		const { core, stdin } = makeCore([true, false]);
		room.setDuel(core);
		room.sendMessageToCpp("a");
		room.sendMessageToCpp("b");
		room.sendMessageToCpp("c");
		room.recordCppStdoutChunk(10);
		room.recordCppStdoutChunk(5);
		room.recordCppFrameProcessed();
		room.recordCppParseError();
		room.recordCppDeferredProcessTick();
		stdin.emit("error", new Error("EPIPE"));

		jest.advanceTimersByTime(60_000);

		expect(info).toHaveBeenCalledTimes(1);
		expect(info).toHaveBeenCalledWith("IPC_METRICS", {
			uptimeMs: 60_000,
			queueDepth: 1,
			maxQueueDepth: 1,
			commandsEnqueued: 3,
			commandsWritten: 2,
			stdinWriteErrors: 1,
			drainCount: 1,
			totalDrainWaitMs: 0,
			stdoutChunks: 2,
			stdoutBytes: 15,
			framesProcessed: 1,
			parseErrors: 1,
			deferredProcessTicks: 1,
		});

		room.destroy();
		await jest.advanceTimersByTimeAsync(0);
		jest.advanceTimersByTime(120_000);

		expect(info).toHaveBeenCalledTimes(1);
	});
});

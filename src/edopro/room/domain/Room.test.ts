import { Room } from "./Room";
import { Client } from "@edopro/client/domain/Client";
import { ClientMother } from "@test-support/mothers/client/ClientMother";
import { RoomMother } from "@test-support/mothers/room/RoomMother";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { MessageProcessor } from "@shared/messages/MessageProcessor";

class CapturingSocket extends SocketMock {
	private readonly listeners: ((message: Buffer) => void)[] = [];

	override onMessage(callback: (message: Buffer) => void): void {
		this.listeners.push(callback);
	}

	deliver(message: Buffer): void {
		this.listeners.forEach((listener) => listener(message));
	}
}

describe("Room", () => {
	let room: Room;

	beforeEach(() => {
		room = RoomMother.create();
	});

	describe("Lock-Free Integration", () => {
		it("addSpectator no genera race conditions", async () => {
			const s1 = ClientMother.create();
			const s2 = ClientMother.create();

			room.addSpectator(s1);
			room.addSpectator(s2);

			await new Promise((r) => {
				setTimeout(r, 50);
			});

			expect(room.spectators.length).toBe(2);
			expect(room.spectators[0]).toBe(s1);
			expect(room.spectators[1]).toBe(s2);
		});

		it("nextSpectatorPosition siempre devuelve valores únicos", async () => {
			const arr: number[] = [];

			for (let i = 0; i < 5; i++) {
				const position = await room.nextSpectatorPosition();
				arr.push(position);
				room.addSpectator(ClientMother.create({ id: `${i}`, position }));
			}

			const set = new Set(arr);
			expect(set.size).toBe(arr.length);
		});
	});

	describe("spectator account binding", () => {
		it("keeps the account of a spectator when it takes a seat", () => {
			const room = RoomMother.create({ team0: 1, team1: 1, ranked: true });
			const spectator = room.createSpectatorUnsafe(ClientMother.create().socket, "Spec", "user-1");
			room.addSpectatorUnsafe(spectator);

			room.spectatorToPlayerUnsafe(spectator);

			expect(room.players).toContain(spectator);
			expect(spectator.id).toBe("user-1");
		});

		it("creates spectators without an account by default", () => {
			const room = RoomMother.create();

			const spectator = room.createSpectatorUnsafe(ClientMother.create().socket, "Spec");

			expect(spectator.id).toBeNull();
		});
	});
	describe("room socket buffering", () => {
		const chatFrame = Buffer.from([0x03, 0x00, 0x16, 0x41, 0x00]);
		let readSpy: jest.SpyInstance;
		let processSpy: jest.SpyInstance;

		beforeEach(() => {
			readSpy = jest.spyOn(MessageProcessor.prototype, "read");
			processSpy = jest.spyOn(MessageProcessor.prototype, "process");
		});

		afterEach(() => {
			readSpy.mockRestore();
			processSpy.mockRestore();
		});

		const processorsThatOnlyBuffer = (): number => {
			const reading = new Set(readSpy.mock.instances);
			const processing = new Set(processSpy.mock.instances);
			return [...reading].filter((instance) => !processing.has(instance)).length;
		};

		it("drains every processor that reads a player's socket", () => {
			const room = RoomMother.create({ team0: 1, team1: 1 });
			room.waiting();
			const socket = new CapturingSocket();
			room.addPlayerUnsafe(ClientMother.create({ socket, host: true, position: 0, team: 0 }));
			readSpy.mockClear();
			processSpy.mockClear();

			socket.deliver(chatFrame);

			expect(readSpy).toHaveBeenCalledTimes(1);
			expect(processorsThatOnlyBuffer()).toBe(0);
		});

		it("drains every processor that reads a spectator's socket", () => {
			const room = RoomMother.create({ team0: 1, team1: 1 });
			room.waiting();
			const socket = new CapturingSocket();
			room.addSpectatorUnsafe(room.createSpectatorUnsafe(socket, "Spec"));
			readSpy.mockClear();
			processSpy.mockClear();

			socket.deliver(chatFrame);

			expect(readSpy).toHaveBeenCalledTimes(1);
			expect(processorsThatOnlyBuffer()).toBe(0);
		});

		it("drains every processor that reads a reconnected player's socket", () => {
			const room = RoomMother.create({ team0: 1, team1: 1 });
			room.waiting();
			const client = ClientMother.create({ host: true, position: 0, team: 0 });
			room.addPlayerUnsafe(client);
			const socket = new CapturingSocket();
			client.setSocket(socket, room.players as Client[], room);
			readSpy.mockClear();
			processSpy.mockClear();

			socket.deliver(chatFrame);

			expect(readSpy).toHaveBeenCalledTimes(1);
			expect(processorsThatOnlyBuffer()).toBe(0);
		});
	});
});

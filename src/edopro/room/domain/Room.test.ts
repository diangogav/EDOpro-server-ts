import { Room } from "./Room";
import { ClientMother } from "@test-support/mothers/client/ClientMother";
import { RoomMother } from "@test-support/mothers/room/RoomMother";

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
});

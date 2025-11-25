 
import { Room } from "../../../../src/edopro/room/domain/Room";
import { ClientMother } from "../../shared/mothers/client/ClientMother";
import { RoomMother } from "../../shared/mothers/room/RoomMother";

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
});

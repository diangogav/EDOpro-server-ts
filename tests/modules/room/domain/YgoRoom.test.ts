import { YgoRoom } from "../../../../src/shared/room/domain/YgoRoom";
import { ClientMother } from "../../shared/mothers/client/ClientMother";
import { SimpleRoomMother } from "../../shared/mothers/room/SimpleRoomMother";

describe("YgoRoom", () => {
	describe("Lock-Free", () => {
		let room: YgoRoom;

		beforeEach(() => {
			room = SimpleRoomMother.create();
		});

		it("evita condiciones de carrera al agregar jugadores concurrently", async () => {
			const c1 = ClientMother.create({ id: "1" });
			const c2 = ClientMother.create({ id: "2" });

			room.actionQueue.enqueue(() => {
				room.clients.push(c1);
			});
			room.actionQueue.enqueue(() => {
				room.clients.push(c2);
			});

			await new Promise((r) => {
				setTimeout(r, 30);
			});

			expect(room.clients.length).toBe(2);
			expect(room.clients).toContain(c1);
			expect(room.clients).toContain(c2);
		});

		it("removePlayer se ejecuta de forma segura y secuencial", async () => {
			const c1 = ClientMother.create({ id: "1" });
			const c2 = ClientMother.create({ id: "2" });

			room.actionQueue.enqueue(() => {
				room.clients.push(c1);
			});
			room.actionQueue.enqueue(() => {
				room.clients.push(c2);
			});
			room.actionQueue.enqueue(() => room.removePlayer(c1));

			await new Promise((r) => {
				setTimeout(r, 30);
			});

			expect(room.clients.length).toBe(1);
			expect(room.clients[0]).toBe(c2);
		});
	});
});

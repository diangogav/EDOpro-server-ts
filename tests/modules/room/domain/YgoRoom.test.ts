import { YgoRoom } from "../../../../src/shared/room/domain/YgoRoom";
import { ClientMother } from "../../shared/mothers/client/ClientMother";
import { SimpleRoomMother } from "../../shared/mothers/room/SimpleRoomMother";

describe("YgoRoom", () => {
  describe("Lock-Free", () => {
    let room: ReturnType<typeof SimpleRoomMother.create>;

    beforeEach(() => {
      room = SimpleRoomMother.create();
    });

    it("evita condiciones de carrera al agregar jugadores concurrently", async () => {
      const c1 = ClientMother.create({ id: "1" });
      const c2 = ClientMother.create({ id: "2" });

      room.mutex.runExclusive(() => {
        room.players.push(c1);
      });
      room.mutex.runExclusive(() => {
        room.players.push(c2);
      });

      await new Promise((r) => {
        setTimeout(r, 30);
      });

      expect(room.players.length).toBe(2);
      expect(room.players).toContain(c1);
      expect(room.players).toContain(c2);
    });

    it("removePlayer se ejecuta de forma segura y secuencial", async () => {
      const c1 = ClientMother.create({ id: "1" });
      const c2 = ClientMother.create({ id: "2" });

      room.mutex.runExclusive(() => {
        room.players.push(c1);
      });
      room.mutex.runExclusive(() => {
        room.players.push(c2);
      });
      room.mutex.runExclusive(() => room.removePlayer(c1));

      await new Promise((r) => {
        setTimeout(r, 30);
      });

      expect(room.players.length).toBe(1);
      expect(room.players[0]).toBe(c2);
    });

    it("permite ejecutar lógica síncrona dentro del mutex (simulando pattern Unsafe) sin deadlock", async () => {
      const c1 = ClientMother.create({ id: "1" });
      const c2 = ClientMother.create({ id: "2" });

      await room.mutex.runExclusive(() => {
        // Simula addPlayerUnsafe síncrono
        room.players.push(c1);

        // Simula lógica adicional que depende del estado actualizado inmediatamente
        if (room.players.includes(c1)) {
          room.players.push(c2);
        }
      });

      expect(room.players.length).toBe(2);
      expect(room.players[0]).toBe(c1);
      expect(room.players[1]).toBe(c2);
    });
  });
});

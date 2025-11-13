import { RoomActionQueue } from "../../../src/shared/room/RoomActionQueue";

describe("RoomActionQueue (Lock-Free Queue)", () => {
	it("ejecuta acciones en orden FIFO", async () => {
		const queue = new RoomActionQueue();
		const result: number[] = [];

		queue.enqueue(() => {
			result.push(1);
		});
		queue.enqueue(() => {
			result.push(2);
		});
		queue.enqueue(() => {
			result.push(3);
		});

		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});

		expect(result).toEqual([1, 2, 3]);
	});

	it("soporta acciones async dentro de la cola sin romper el orden", async () => {
		const queue = new RoomActionQueue();
		const result: string[] = [];

		queue.enqueue(async () => {
			await new Promise((r) => {
				setTimeout(r, 10);
			});
			result.push("A");
		});

		queue.enqueue(() => {
			result.push("B");
		});

		await new Promise((resolve) => {
			setTimeout(resolve, 30);
		});

		expect(result).toEqual(["A", "B"]);
	});

	it("procesa nuevas acciones que llegan mientras se está ejecutando la cola", async () => {
		const queue = new RoomActionQueue();
		const result: number[] = [];

		queue.enqueue(() => {
			result.push(1);
			queue.enqueue(() => {
				result.push(2);
			});
		});

		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});

		expect(result).toEqual([1, 2]);
	});
});

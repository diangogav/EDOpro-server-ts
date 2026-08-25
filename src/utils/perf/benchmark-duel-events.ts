/**
 * Measures the per-message cost of publishing duel messages as domain events,
 * against the inline switch in processDuelMessage.
 *
 * Scenarios, cheapest to most expensive:
 *   1. inline_switch          — today's baseline: offset reads + LP arithmetic
 *   2. decode_to_domain_event — building {roomId, team, amount, turn} from the Buffer
 *   3. publish_no_subscribers — EventBus.publish floor when nothing subscribed
 *   4. decode_publish_1_sub   — decode + awaited publish, one no-op subscriber
 *   5. decode_publish_3_subs  — decode + awaited publish, three no-op subscribers
 *   6. decode_room_queue      — decode + per-room queue, drained outside the
 *                               loop in insertion order
 *
 * Run: npx ts-node -r tsconfig-paths/register src/utils/perf/benchmark-duel-events.ts
 */
import { EventBus } from "@shared/event-bus/EventBus";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

const iterations = Number(process.env.BENCH_ITERATIONS ?? 100_000);

// MSG_DAMAGE payload as processDuelMessage reads it: [type, player, lp x4]
const damageBuffer = Buffer.from([0x5b, 0x01, 0xe8, 0x03, 0x00, 0x00]);

interface DamageDealtEvent {
	roomId: number;
	team: number;
	amount: number;
	turn: number;
}

const fakeRoom = { firstToPlay: 0, lps: [8000, 8000], turn: 3, id: 42 };

const decode = (data: Buffer): DamageDealtEvent => ({
	roomId: fakeRoom.id,
	team: fakeRoom.firstToPlay ^ data.readUint8(1),
	amount: data.readUint32LE(2),
	turn: fakeRoom.turn,
});

const measure = async (name: string, fn: () => Promise<void> | void) => {
	const started = process.hrtime.bigint();
	await fn();
	const elapsed = process.hrtime.bigint() - started;
	return {
		name,
		elapsedMs: Number(elapsed) / 1e6,
		nsPerMessage: Number(elapsed) / iterations,
		opsPerSec: iterations / (Number(elapsed) / 1e9),
	};
};

async function main(): Promise<void> {
	let sink = 0;

	const inlineSwitch = await measure("inline_switch", () => {
		for (let i = 0; i < iterations; i += 1) {
			const team = fakeRoom.firstToPlay ^ damageBuffer.readUint8(1);
			const damage = damageBuffer.readUint32LE(2);
			fakeRoom.lps[team] -= damage;
			sink += fakeRoom.lps[team];
			fakeRoom.lps[team] += damage; // restore so numbers stay realistic
		}
	});

	const decodeOnly = await measure("decode_to_domain_event", () => {
		for (let i = 0; i < iterations; i += 1) {
			sink += decode(damageBuffer).amount;
		}
	});

	const emptyBus = new EventBus(new LoggerMock());
	const publishNoSubs = await measure("publish_no_subscribers", async () => {
		for (let i = 0; i < iterations; i += 1) {
			await emptyBus.publish("duel.damage", decode(damageBuffer));
		}
	});

	const makeBusWith = (count: number): EventBus => {
		const bus = new EventBus(new LoggerMock());
		for (let s = 0; s < count; s += 1) {
			bus.subscribe("duel.damage", {
				handle: (event) => {
					sink += (event as DamageDealtEvent).amount;
				},
			});
		}
		return bus;
	};

	const oneSubBus = makeBusWith(1);
	const publishOneSub = await measure("decode_publish_1_sub", async () => {
		for (let i = 0; i < iterations; i += 1) {
			await oneSubBus.publish("duel.damage", decode(damageBuffer));
		}
	});

	const threeSubBus = makeBusWith(3);
	const publishThreeSubs = await measure("decode_publish_3_subs", async () => {
		for (let i = 0; i < iterations; i += 1) {
			await threeSubBus.publish("duel.damage", decode(damageBuffer));
		}
	});

	// Proposed design: the hot loop only decodes and pushes; a single drain
	// outside the loop delivers to handlers in order.
	const handler = (event: DamageDealtEvent): void => {
		sink += event.amount;
	};
	const roomQueue: DamageDealtEvent[] = [];
	const decodeRoomQueue = await measure("decode_room_queue", async () => {
		for (let i = 0; i < iterations; i += 1) {
			roomQueue.push(decode(damageBuffer));
			if (roomQueue.length >= 1000) {
				await Promise.resolve(); // yield, as the real drain would
				for (const event of roomQueue) {
					handler(event);
				}
				roomQueue.length = 0;
			}
		}
		for (const event of roomQueue) {
			handler(event);
		}
		roomQueue.length = 0;
	});

	if (sink === Number.MIN_SAFE_INTEGER) {
		throw new Error("sink escaped"); // keep the JIT honest
	}

	process.stdout.write(
		`${JSON.stringify(
			{
				iterations,
				results: [
					inlineSwitch,
					decodeOnly,
					publishNoSubs,
					publishOneSub,
					publishThreeSubs,
					decodeRoomQueue,
				],
			},
			null,
			2,
		)}\n`,
	);
}

void main();

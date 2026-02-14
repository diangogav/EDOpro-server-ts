import { spawn } from "child_process";
import path from "path";

const totalMessages = Number(process.env.BENCH_MESSAGES ?? 20_000);
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 512);
const payloadBytes = Number(process.env.BENCH_PAYLOAD_BYTES ?? 128);

const childPath = path.join(__dirname, "ipc-echo-child.ts");
const child = spawn(
	process.execPath,
	["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register", childPath],
	{ stdio: ["pipe", "pipe", "inherit"] }
);

const payload = "x".repeat(payloadBytes);
let nextId = 1;
let sent = 0;
let completed = 0;
let inflight = 0;
let drainCount = 0;
let backpressureWaitNs = 0n;
let waitingDrainStart: bigint | null = null;
const startedAt = process.hrtime.bigint();
const pending = new Map<number, bigint>();
const latenciesNs: bigint[] = [];

let readBuffer = Buffer.alloc(0);

const quantile = (sorted: bigint[], q: number) => {
	if (sorted.length === 0) return 0;
	const pos = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
	return Number(sorted[pos]);
};

const flushSend = () => {
	while (sent < totalMessages && inflight < concurrency) {
		const id = nextId++;
		const now = process.hrtime.bigint();
		const wire =
			JSON.stringify({
				command: "PING",
				id,
				sentAtNs: now.toString(),
				payload,
			}) + "\n";

		pending.set(id, now);
		sent += 1;
		inflight += 1;

		const writeOk = child.stdin.write(wire);
		if (!writeOk) {
			drainCount += 1;
			waitingDrainStart = process.hrtime.bigint();
			return;
		}
	}

	if (completed === totalMessages) {
		finish();
	}
};

child.stdin.on("drain", () => {
	if (waitingDrainStart !== null) {
		backpressureWaitNs += process.hrtime.bigint() - waitingDrainStart;
		waitingDrainStart = null;
	}
	flushSend();
});

const handlePayload = (data: { type?: string; id?: number }) => {
	if (data.type !== "PONG" || data.id === undefined) {
		return;
	}

	const started = pending.get(data.id);
	if (started === undefined) {
		return;
	}

	pending.delete(data.id);
	const latency = process.hrtime.bigint() - started;
	latenciesNs.push(latency);
	inflight -= 1;
	completed += 1;

	if (completed % 5000 === 0) {
		process.stdout.write(`progress: ${completed}/${totalMessages}\n`);
	}

	flushSend();
};

child.stdout.on("data", (chunk: Buffer) => {
	readBuffer = Buffer.concat([readBuffer, chunk]);

	while (readBuffer.length >= 4) {
		const size = readBuffer.readUInt32LE(0);
		if (readBuffer.length < size + 4) {
			return;
		}

		const body = readBuffer.subarray(4, size + 4).toString("utf8");
		readBuffer = readBuffer.subarray(size + 4);

		try {
			handlePayload(JSON.parse(body) as { type?: string; id?: number });
		} catch (error) {
			process.stderr.write(`parse_error=${(error as Error).message}\n`);
		}
	}
});

child.on("error", (error) => {
	process.stderr.write(`child_error=${error.message}\n`);
	process.exitCode = 1;
});

const finish = () => {
	const endedAt = process.hrtime.bigint();
	const elapsedNs = endedAt - startedAt;
	latenciesNs.sort((a, b) => (a < b ? -1 : 1));

	const elapsedSec = Number(elapsedNs) / 1e9;
	const p50Ms = quantile(latenciesNs, 0.5) / 1e6;
	const p95Ms = quantile(latenciesNs, 0.95) / 1e6;
	const p99Ms = quantile(latenciesNs, 0.99) / 1e6;

	const result = {
		totalMessages,
		concurrency,
		payloadBytes,
		elapsedMs: Number(elapsedNs) / 1e6,
		throughputMsgPerSec: totalMessages / elapsedSec,
		latencyMs: { p50: p50Ms, p95: p95Ms, p99: p99Ms },
		backpressure: {
			drainCount,
			totalDrainWaitMs: Number(backpressureWaitNs) / 1e6,
		},
	};

	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

	child.stdin.write(`${JSON.stringify({ command: "EXIT" })}\n`);
	setTimeout(() => child.kill("SIGTERM"), 100);
};

flushSend();

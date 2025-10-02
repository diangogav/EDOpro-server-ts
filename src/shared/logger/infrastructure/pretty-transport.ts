import pretty, { type PrettyOptions } from "pino-pretty";
import type { Transform } from "stream";

const color =
	(number: number) =>
	(value: unknown): string =>
		`\x1b[${number}m${String(value)}\x1b[0m`;

function factory(opts?: PrettyOptions): Transform {
	return pretty({
		...(opts ?? {}),
		customPrettifiers: {
			...(opts?.customPrettifiers as Record<string, (v: unknown) => string>),
			roomId: color(33), // yellow
			clientId: color(36), // cyan
			clientName: color(35), // magenta
			socketId: color(34), // blue
			remoteAddress: color(90), // gray
			file: color(34), // blue
		},
	});
}

export default factory;

module.exports = factory;

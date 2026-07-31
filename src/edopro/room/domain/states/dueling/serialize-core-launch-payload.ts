const SEEDS_PLACEHOLDER = "__SEEDS_PLACEHOLDER__";

export interface CoreLaunchPayload {
	config: {
		startLp: string;
		seeds: bigint[];
		flags: number;
		lp: number;
		startingDrawCount: number;
		drawCountPerTurn: number;
		firstToPlay: number;
		timeLimit: number;
	};
	players: unknown[];
}

// The core parses `seeds` as uint64_t. Serializing them through Number
// rounds everything above 2^53, so they are spliced into the JSON as raw
// integer literals. The splice runs only over the config serialization,
// which contains no player-provided data, so the placeholder cannot be
// forged from the outside.
export const serializeCoreLaunchPayload = (payload: CoreLaunchPayload): string => {
	const { seeds, ...config } = payload.config;
	const configJson = JSON.stringify({ ...config, seeds: SEEDS_PLACEHOLDER }).replace(
		`"${SEEDS_PLACEHOLDER}"`,
		`[${seeds.join(",")}]`,
	);
	return `{"config":${configJson},"players":${JSON.stringify(payload.players)}}`;
};

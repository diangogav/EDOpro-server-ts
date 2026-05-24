/**
 * WindbotConfig — parses and validates windbot-related environment variables.
 *
 * Deliberately NOT reading process.env at module load time.
 * Call parseWindbotConfig(process.env) at boot so the function is testable.
 */

export type WindbotConfigDisabled = {
	enabled: false;
};

export type WindbotConfigEnabled = {
	enabled: true;
	endpoint: string;
	myIp: string;
	botlistPath: string;
};

export type WindbotConfig = WindbotConfigDisabled | WindbotConfigEnabled;

const TRUTHY_VALUES = new Set(["true", "1"]);

/**
 * Parses windbot configuration from the given environment map.
 *
 * Throws with a clear error message if:
 *  - ENABLE_WINDBOT is truthy AND WINDBOT_ENDPOINT is missing
 *  - ENABLE_WINDBOT is truthy AND WINDBOT_BOTLIST is missing
 */
export function parseWindbotConfig(env: Record<string, string | undefined>): WindbotConfig {
	const enabledRaw = env["ENABLE_WINDBOT"];
	const enabled = TRUTHY_VALUES.has(enabledRaw ?? "");

	if (!enabled) {
		return { enabled: false };
	}

	const errors: string[] = [];

	const endpoint = env["WINDBOT_ENDPOINT"];
	if (!endpoint) {
		errors.push("WINDBOT_ENDPOINT is required when ENABLE_WINDBOT is true");
	}

	const botlistPath = env["WINDBOT_BOTLIST"];
	if (!botlistPath) {
		errors.push("WINDBOT_BOTLIST is required when ENABLE_WINDBOT is true");
	}

	if (errors.length > 0) {
		throw new Error(`Invalid windbot configuration:\n${errors.join("\n")}`);
	}

	return {
		enabled: true,
		endpoint: endpoint as string,
		myIp: env["WINDBOT_MY_IP"] ?? "windbot",
		botlistPath: botlistPath as string,
	};
}

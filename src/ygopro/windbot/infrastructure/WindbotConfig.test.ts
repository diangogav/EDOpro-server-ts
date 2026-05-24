import { parseWindbotConfig, WindbotConfigEnabled } from "./WindbotConfig";

describe("parseWindbotConfig", () => {
	describe("when ENABLE_WINDBOT is absent or false", () => {
		it("returns disabled config when ENABLE_WINDBOT is not set", () => {
			const config = parseWindbotConfig({});
			expect(config.enabled).toBe(false);
		});

		it("returns disabled config when ENABLE_WINDBOT is 'false'", () => {
			const config = parseWindbotConfig({ ENABLE_WINDBOT: "false" });
			expect(config.enabled).toBe(false);
		});

		it("returns disabled config when ENABLE_WINDBOT is '0'", () => {
			const config = parseWindbotConfig({ ENABLE_WINDBOT: "0" });
			expect(config.enabled).toBe(false);
		});

		it("does not throw when endpoint and botlist are missing and ENABLE_WINDBOT is false", () => {
			expect(() => parseWindbotConfig({ ENABLE_WINDBOT: "false" })).not.toThrow();
		});
	});

	describe("when ENABLE_WINDBOT is true", () => {
		it("returns enabled config with all required fields", () => {
			const env = {
				ENABLE_WINDBOT: "true",
				WINDBOT_ENDPOINT: "http://windbot:7790",
				WINDBOT_MY_IP: "windbot",
				WINDBOT_BOTLIST: "/data/botlist.json",
			};

			const config = parseWindbotConfig(env) as WindbotConfigEnabled;
			expect(config.enabled).toBe(true);
			expect(config.endpoint).toBe("http://windbot:7790");
			expect(config.myIp).toBe("windbot");
			expect(config.botlistPath).toBe("/data/botlist.json");
		});

		it("coerces '1' to true", () => {
			const env = {
				ENABLE_WINDBOT: "1",
				WINDBOT_ENDPOINT: "http://windbot:7790",
				WINDBOT_MY_IP: "windbot",
				WINDBOT_BOTLIST: "/data/botlist.json",
			};
			const config = parseWindbotConfig(env);
			expect(config.enabled).toBe(true);
		});

		it("throws when WINDBOT_ENDPOINT is missing", () => {
			const env = {
				ENABLE_WINDBOT: "true",
				WINDBOT_MY_IP: "windbot",
				WINDBOT_BOTLIST: "/data/botlist.json",
			};
			expect(() => parseWindbotConfig(env)).toThrow();
		});

		it("throws when WINDBOT_BOTLIST is missing", () => {
			const env = {
				ENABLE_WINDBOT: "true",
				WINDBOT_ENDPOINT: "http://windbot:7790",
				WINDBOT_MY_IP: "windbot",
			};
			expect(() => parseWindbotConfig(env)).toThrow();
		});

		it("defaults WINDBOT_MY_IP to 'windbot' when not set", () => {
			const env = {
				ENABLE_WINDBOT: "true",
				WINDBOT_ENDPOINT: "http://windbot:7790",
				WINDBOT_BOTLIST: "/data/botlist.json",
			};
			const config = parseWindbotConfig(env) as WindbotConfigEnabled;
			expect(config.enabled).toBe(true);
			expect(config.myIp).toBe("windbot");
		});

		it("uses provided WINDBOT_MY_IP when set", () => {
			const env = {
				ENABLE_WINDBOT: "true",
				WINDBOT_ENDPOINT: "http://windbot:7790",
				WINDBOT_MY_IP: "192.168.1.100",
				WINDBOT_BOTLIST: "/data/botlist.json",
			};
			const config = parseWindbotConfig(env) as WindbotConfigEnabled;
			expect(config.myIp).toBe("192.168.1.100");
		});

		it("throws a clear error message when endpoint is missing", () => {
			const env = {
				ENABLE_WINDBOT: "true",
				WINDBOT_BOTLIST: "/data/botlist.json",
			};
			expect(() => parseWindbotConfig(env)).toThrow(/WINDBOT_ENDPOINT/i);
		});

		it("throws a clear error message when botlist is missing", () => {
			const env = {
				ENABLE_WINDBOT: "true",
				WINDBOT_ENDPOINT: "http://windbot:7790",
			};
			expect(() => parseWindbotConfig(env)).toThrow(/WINDBOT_BOTLIST/i);
		});
	});
});

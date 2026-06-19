import { HttpWindBotProvider, HttpWindBotProviderConfig } from "./HttpWindBotProvider";
import { WindbotData } from "../domain/WindbotData";
import { WindbotUnreachableError } from "../domain/WindbotErrors";

const makeBot = (overrides: Partial<WindbotData> = {}): WindbotData => ({
	name: "Anna",
	deck: "Anna.ydk",
	...overrides,
});

const makeConfig = (
	overrides: Partial<HttpWindBotProviderConfig> = {},
): HttpWindBotProviderConfig => ({
	endpoint: "http://windbot:7790",
	myIp: "windbot",
	serverPort: 7911,
	version: 0x1362,
	...overrides,
});

const notFinalizing = () => false;
const alreadyFinalizing = () => true;

const makeOkResponse = () => new Response(null, { status: 200 });

const makeErrorResponse = () => new Response(null, { status: 500 });

describe("HttpWindBotProvider", () => {
	let fetchMock: jest.Mock;

	beforeEach(() => {
		fetchMock = jest.fn();
		global.fetch = fetchMock;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("requestJoin — success paths", () => {
		it("resolves void on first 2xx response", async () => {
			fetchMock.mockResolvedValueOnce(makeOkResponse());

			const provider = new HttpWindBotProvider(makeConfig());
			await expect(
				provider.requestJoin({
					token: "abc123def456",
					bot: makeBot(),
					isFinalizing: notFinalizing,
				}),
			).resolves.toBeUndefined();

			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("sends GET to the configured endpoint", async () => {
			fetchMock.mockResolvedValueOnce(makeOkResponse());

			const config = makeConfig({ endpoint: "http://windbot:7790" });
			const provider = new HttpWindBotProvider(config);
			await provider.requestJoin({
				token: "abc123def456",
				bot: makeBot(),
				isFinalizing: notFinalizing,
			});

			const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(url).toMatch(/^http:\/\/windbot:7790\//);
		});

		it("sends GET method", async () => {
			fetchMock.mockResolvedValueOnce(makeOkResponse());

			const provider = new HttpWindBotProvider(makeConfig());
			await provider.requestJoin({
				token: "abc123def456",
				bot: makeBot(),
				isFinalizing: notFinalizing,
			});

			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(options.method).toBe("GET");
		});

		it("query string contains password: 'AIJOIN#' + token", async () => {
			fetchMock.mockResolvedValueOnce(makeOkResponse());

			const provider = new HttpWindBotProvider(makeConfig());
			await provider.requestJoin({
				token: "tok123456789",
				bot: makeBot(),
				isFinalizing: notFinalizing,
			});

			const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
			const params = new URL(url).searchParams;
			expect(params.get("password")).toBe("AIJOIN#tok123456789");
		});

		it("query string contains bot name, deck, host, port and version", async () => {
			fetchMock.mockResolvedValueOnce(makeOkResponse());

			const config = makeConfig({ myIp: "192.168.1.1", serverPort: 8800, version: 0x1362 });
			const bot = makeBot({ name: "Gear", deck: "Gear.ydk" });
			const provider = new HttpWindBotProvider(config);
			await provider.requestJoin({ token: "abc123def456", bot, isFinalizing: notFinalizing });

			const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
			const params = new URL(url).searchParams;
			expect(params.get("name")).toBe("Gear");
			expect(params.get("deck")).toBe("Gear.ydk");
			expect(params.get("host")).toBe("192.168.1.1");
			expect(params.get("port")).toBe("8800");
			expect(params.get("version")).toBe((0x1362).toString());
		});

		it("query string includes optional dialog and deckcode when present", async () => {
			fetchMock.mockResolvedValueOnce(makeOkResponse());

			const bot = makeBot({ dialog: "default", deckcode: "ABC123" });
			const provider = new HttpWindBotProvider(makeConfig());
			await provider.requestJoin({ token: "abc123def456", bot, isFinalizing: notFinalizing });

			const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
			const params = new URL(url).searchParams;
			expect(params.get("dialog")).toBe("default");
			expect(params.get("deckcode")).toBe("ABC123");
		});

		it("fetch is called with an AbortSignal (timeout)", async () => {
			fetchMock.mockResolvedValueOnce(makeOkResponse());

			const provider = new HttpWindBotProvider(makeConfig());
			await provider.requestJoin({
				token: "abc123def456",
				bot: makeBot(),
				isFinalizing: notFinalizing,
			});

			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(options.signal).toBeDefined();
			expect(options.signal).toBeInstanceOf(AbortSignal);
		});

		it("resolves void after failure then success (retries)", async () => {
			fetchMock
				.mockRejectedValueOnce(new Error("network error"))
				.mockRejectedValueOnce(new Error("timeout"))
				.mockResolvedValueOnce(makeOkResponse());

			const provider = new HttpWindBotProvider(makeConfig());
			await expect(
				provider.requestJoin({
					token: "abc123def456",
					bot: makeBot(),
					isFinalizing: notFinalizing,
				}),
			).resolves.toBeUndefined();

			expect(fetchMock).toHaveBeenCalledTimes(3);
		});

		it("retries on non-2xx response", async () => {
			fetchMock.mockResolvedValueOnce(makeErrorResponse()).mockResolvedValueOnce(makeOkResponse());

			const provider = new HttpWindBotProvider(makeConfig());
			await expect(
				provider.requestJoin({
					token: "abc123def456",
					bot: makeBot(),
					isFinalizing: notFinalizing,
				}),
			).resolves.toBeUndefined();

			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});

	describe("requestJoin — failure paths", () => {
		it("throws WindbotUnreachableError after 10 consecutive failures", async () => {
			fetchMock.mockRejectedValue(new Error("network error"));

			const provider = new HttpWindBotProvider(makeConfig());
			await expect(
				provider.requestJoin({
					token: "abc123def456",
					bot: makeBot(),
					isFinalizing: notFinalizing,
				}),
			).rejects.toThrow(WindbotUnreachableError);

			expect(fetchMock).toHaveBeenCalledTimes(10);
		});

		it("throws WindbotUnreachableError after 10 non-2xx responses", async () => {
			fetchMock.mockResolvedValue(makeErrorResponse());

			const provider = new HttpWindBotProvider(makeConfig());
			await expect(
				provider.requestJoin({
					token: "abc123def456",
					bot: makeBot(),
					isFinalizing: notFinalizing,
				}),
			).rejects.toThrow(WindbotUnreachableError);

			expect(fetchMock).toHaveBeenCalledTimes(10);
		});

		it("WindbotUnreachableError message includes bot name and attempt count", async () => {
			fetchMock.mockRejectedValue(new Error("connection refused"));

			const provider = new HttpWindBotProvider(makeConfig());
			const error = await provider
				.requestJoin({
					token: "abc123def456",
					bot: makeBot({ name: "Anna" }),
					isFinalizing: notFinalizing,
				})
				.catch((e: unknown) => e);

			expect(error).toBeInstanceOf(WindbotUnreachableError);
			expect((error as WindbotUnreachableError).message).toContain("Anna");
			expect((error as WindbotUnreachableError).attempts).toBe(10);
		});
	});

	describe("requestJoin — isFinalizing guard", () => {
		it("aborts the retry loop immediately when isFinalizing returns true before first attempt", async () => {
			fetchMock.mockResolvedValue(makeOkResponse());

			const provider = new HttpWindBotProvider(makeConfig());
			await expect(
				provider.requestJoin({
					token: "abc123def456",
					bot: makeBot(),
					isFinalizing: alreadyFinalizing,
				}),
			).rejects.toThrow(WindbotUnreachableError);

			expect(fetchMock).toHaveBeenCalledTimes(0);
		});

		it("aborts retry loop mid-flight when isFinalizing flips to true", async () => {
			let callCount = 0;
			const isFinalizing = () => {
				callCount++;
				return callCount > 1; // true from 2nd check onwards
			};

			fetchMock.mockRejectedValue(new Error("network error"));

			const provider = new HttpWindBotProvider(makeConfig());
			await expect(
				provider.requestJoin({ token: "abc123def456", bot: makeBot(), isFinalizing }),
			).rejects.toThrow(WindbotUnreachableError);

			// 1st attempt fires (isFinalizing returned false), then 2nd check = true → abort
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("does not make further fetch calls after isFinalizing aborts", async () => {
			let attempt = 0;
			const isFinalizing = () => {
				attempt++;
				return attempt > 2; // abort after 2 real attempts
			};

			fetchMock.mockRejectedValue(new Error("err"));

			const provider = new HttpWindBotProvider(makeConfig());
			await expect(
				provider.requestJoin({ token: "abc123def456", bot: makeBot(), isFinalizing }),
			).rejects.toThrow(WindbotUnreachableError);

			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});
});

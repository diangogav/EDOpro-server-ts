import type { Request, Response } from "express";

const loaderState = {
	isInitialized: true,
	standardSha512Hex: null as string | null,
	extendedSha512Hex: null as string | null,
};
const cardDbState = { shared: null as { fingerprint: string | null } | null };
const banlistState = {
	edopro: [] as Array<{ name: string | null; hash: number }>,
	ygopro: [] as Array<{ name: string | null; hash: number }>,
	reloadedAt: null as string | null,
};

jest.mock("@ygopro/ygopro/YGOProResourceLoader", () => ({
	YGOProResourceLoader: {
		get isInitialized() {
			return loaderState.isInitialized;
		},
		get: () => loaderState,
	},
}));
jest.mock("@edopro/card/infrastructure/sqlite/EdoProCardDbHotReload", () => ({
	EdoProCardDbHotReload: { getShared: () => cardDbState.shared },
}));
jest.mock("@edopro/ban-list/infrastructure/BanListMemoryRepository", () => ({
	__esModule: true,
	default: { get: () => banlistState.edopro },
}));
jest.mock("@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository", () => ({
	__esModule: true,
	default: { get: () => banlistState.ygopro },
}));
jest.mock("src/bootstrap/bootstrapBanListReloader", () => ({
	getBanListReloadedAt: () => banlistState.reloadedAt,
}));

import { GetResourceVersionController } from "./GetResourceVersionController";

function fakeResponse(): { res: Response; body: () => unknown; status: () => number } {
	let statusCode = 0;
	let payload: unknown;
	const res = {
		status(code: number) {
			statusCode = code;
			return this;
		},
		json(data: unknown) {
			payload = data;
			return this;
		},
	} as unknown as Response;
	return { res, body: () => payload, status: () => statusCode };
}

function run(): ReturnType<typeof fakeResponse> {
	const out = fakeResponse();
	new GetResourceVersionController().run({} as Request, out.res);
	return out;
}

describe("GetResourceVersionController", () => {
	beforeEach(() => {
		loaderState.isInitialized = true;
		loaderState.standardSha512Hex = null;
		loaderState.extendedSha512Hex = null;
		cardDbState.shared = null;
		banlistState.edopro = [];
		banlistState.ygopro = [];
		banlistState.reloadedAt = null;
	});

	it("returns schemaVersion 1 and all sections with a 200 status", () => {
		const out = run();

		expect(out.status()).toBe(200);
		expect(out.body()).toMatchObject({
			schemaVersion: 1,
			ygopro: expect.any(Object),
			edopro: expect.any(Object),
			banlists: expect.any(Object),
		});
	});

	it("reports the ygopro sha512 hexes when the loader has them", () => {
		loaderState.standardSha512Hex = "abc123";
		loaderState.extendedSha512Hex = "def456";

		const body = run().body() as { ygopro: { standardSha512: string; extendedSha512: string } };

		expect(body.ygopro.standardSha512).toBe("abc123");
		expect(body.ygopro.extendedSha512).toBe("def456");
	});

	it("reports null ygopro hashes before the loader is initialized", () => {
		loaderState.isInitialized = false;

		const body = run().body() as { ygopro: { standardSha512: string | null } };

		expect(body.ygopro.standardSha512).toBeNull();
	});

	it("reports null cardDbFingerprint when no hot-reload instance exists yet", () => {
		cardDbState.shared = null;

		const body = run().body() as { edopro: { cardDbFingerprint: string | null } };

		expect(body.edopro.cardDbFingerprint).toBeNull();
	});

	it("reports the cardDbFingerprint from the shared hot-reload instance", () => {
		cardDbState.shared = { fingerprint: "fp-xyz" };

		const body = run().body() as { edopro: { cardDbFingerprint: string } };

		expect(body.edopro.cardDbFingerprint).toBe("fp-xyz");
	});

	it("maps banlists to name+hash and passes through reloadedAt", () => {
		banlistState.edopro = [{ name: "2026.04 OCG", hash: 111 }];
		banlistState.ygopro = [{ name: "2026.04", hash: 222 }];
		banlistState.reloadedAt = "2026-07-14T12:00:00.000Z";

		const body = run().body() as {
			banlists: {
				edopro: Array<{ name: string; hash: number }>;
				ygopro: Array<{ name: string; hash: number }>;
				reloadedAt: string;
			};
		};

		expect(body.banlists.edopro).toEqual([{ name: "2026.04 OCG", hash: 111 }]);
		expect(body.banlists.ygopro).toEqual([{ name: "2026.04", hash: 222 }]);
		expect(body.banlists.reloadedAt).toBe("2026-07-14T12:00:00.000Z");
	});

	it("skips unnamed banlists", () => {
		banlistState.edopro = [
			{ name: null, hash: 1 },
			{ name: "Named", hash: 2 },
		];

		const body = run().body() as { banlists: { edopro: Array<{ name: string; hash: number }> } };

		expect(body.banlists.edopro).toEqual([{ name: "Named", hash: 2 }]);
	});
});

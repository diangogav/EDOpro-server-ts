import { redactSecret } from "./redactSecret";

describe("redactSecret", () => {
	it("keeps only a short prefix of a long secret", () => {
		const token = "0123456789abcdef0123456789abcdef";

		const redacted = redactSecret(token);

		expect(redacted).toBe("012345…");
		expect(redacted).not.toContain(token);
	});

	it("reveals nothing from values no longer than the prefix", () => {
		expect(redactSecret("abc")).toBe("…");
		expect(redactSecret("abcdef")).toBe("…");
	});

	it("handles empty values", () => {
		expect(redactSecret("")).toBe("…");
	});
});

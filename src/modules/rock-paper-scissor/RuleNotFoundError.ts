export class RuleNotFoundError extends Error {
	constructor() {
		super("Rule not found");
		this.name = "RuleNotFoundError";
	}
}

import { Logger } from "@shared/logger/domain/Logger";

import { bootstrapEdoproResources } from "./bootstrapEdoproResources";
import { bootstrapYgoproResources } from "./bootstrapYgoproResources";

// Order is mandatory: ygopro resources cross-reference edopro ban lists by name
// (YGOProRoom resolves _edoBanListHash from BanListMemoryRepository), so edopro
// ban lists must load first. Do not reorder these two calls.
export async function bootstrapResources(logger: Logger): Promise<void> {
	await bootstrapEdoproResources(logger);
	await bootstrapYgoproResources(logger);
}

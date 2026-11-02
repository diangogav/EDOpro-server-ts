import { EdoproBanListHashLookup } from "@edopro/ban-list/infrastructure/EdoproBanListHashLookup";
import { Logger } from "@shared/logger/domain/Logger";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { bootstrapEdoproResources } from "./bootstrapEdoproResources";
import { bootstrapYgoproResources } from "./bootstrapYgoproResources";

// Order is mandatory: ygopro resources cross-reference edopro ban lists by name
// (YGOProRoom resolves _edoBanListHash through the EDOPro catalog registered
// here), so edopro ban lists must load first. Do not reorder these calls.
export async function bootstrapResources(logger: Logger): Promise<void> {
	await bootstrapEdoproResources(logger);
	YGOProRoom.useBanListHashLookup(new EdoproBanListHashLookup());
	await bootstrapYgoproResources(logger);
}

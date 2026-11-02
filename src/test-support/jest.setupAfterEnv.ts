// Registers the production room-state ports and ban list catalogs before every
// test. The adapters are imported here, after each suite's jest.mock calls ran,
// so they bind to whatever a suite mocks (WebSocketSingleton, the DI container,
// the in-memory ban list repositories).
beforeEach(async () => {
	const { registerRoomStatePorts } = await import("src/bootstrap/roomStatePorts");
	const { registerBanListCatalogs } = await import("src/bootstrap/banListCatalogs");
	registerRoomStatePorts();
	registerBanListCatalogs();
});

// Registers the production room-state ports before every test. The adapter is
// imported here, after each suite's jest.mock calls ran, so it binds to the
// mocked WebSocketSingleton or dependency-injection container a suite asks for.
beforeEach(async () => {
	const { registerRoomStatePorts } = await import("src/bootstrap/roomStatePorts");
	registerRoomStatePorts();
});

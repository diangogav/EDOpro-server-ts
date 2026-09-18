/**
 * Port for allocating a ygopro room id. Consulted whenever a room is created
 * without a real client-driven id sequence — the default implementation
 * wraps the existing collision-checked generator; a test can inject a
 * deterministic one instead.
 */
export interface RoomIdGenerator {
	next(): number;
}

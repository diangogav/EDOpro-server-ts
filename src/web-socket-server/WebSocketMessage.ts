export type WebSocketMessage = {
	action: string;
	data: { [key: string]: unknown };
};

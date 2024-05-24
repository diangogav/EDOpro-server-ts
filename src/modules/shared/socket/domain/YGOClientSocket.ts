import { Socket } from "net";

export class YGOClientSocket extends Socket {
	id?: string;
	roomId?: number;
}

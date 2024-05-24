import { Socket } from "net";

export abstract class TCPClientSocket extends Socket {
	id?: string;
	roomId?: number;
}

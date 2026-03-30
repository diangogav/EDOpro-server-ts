import { HostInfo } from "@ygopro/room/domain/host-info/HostInfo";

export abstract class MessageRepository {
    abstract errorMessage(type: number, code?: number): Buffer;
    abstract duelStartMessage(): Buffer;
    abstract joinGameMessage(hostInfo: HostInfo): Buffer;
    abstract typeChangeMessage(position: number, isHost: boolean): Buffer;
    abstract typeChangeMessageFromType(type: number): Buffer;
    abstract playerEnterMessage(name: string, position: number): Buffer;
    abstract playerChangeMessage(position: number, state: number): Buffer;
    abstract watchChangeMessage(watchCount: number): Buffer;
    abstract selectHandMessage(): Buffer;
    abstract selectTpMessage(): Buffer;
    abstract handResultMessage(response1: number, response2: number): Buffer;
    abstract changeSideMessage(): Buffer;
}

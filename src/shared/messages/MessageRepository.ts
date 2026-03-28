import { HostInfo } from "@ygopro/room/domain/host-info/HostInfo";

export abstract class MessageRepository {
    abstract errorMessage(errorCode: number): Buffer;
    abstract duelStartMessage(): Buffer;
    abstract joinGameMessage(hostInfo: HostInfo): Buffer;
    abstract typeChangeMessage(position: number, isHost: boolean): Buffer;
    abstract typeChangeMessageFromType(type: number): Buffer;
    abstract playerEnterMessage(name: string, position: number): Buffer;
    abstract playerChangeMessage(position: number, state: number): Buffer;
    abstract watchChangeMessage(watchCount: number): Buffer;
}

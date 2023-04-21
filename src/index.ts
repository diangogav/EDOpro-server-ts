import { HostServer } from './HostServer';
import { Server } from './Server';
const server = new Server()
const hostServer = new HostServer()
server.initialize()
hostServer.initialize()
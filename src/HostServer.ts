import net, { Socket } from 'net'

export class HostServer {
  private readonly server

  constructor() {
    this.server = net.createServer()
  }

  async initialize() {
    this.server.listen(7911, () => console.log('Server listen in port 7911'))
    this.server.on('connection', (socket:Socket) => {
      socket.on('data', (data) => {
        console.log(JSON.stringify([...data]))
        const playerInfoCommand = data.subarray(0,3)
        const playerName = data.subarray(3, 43).toString()
        const createGameCommand = data.subarray(43, 46)
        const banList = data.subarray(46, 50)
        const unknown = data.subarray(50, 58)
        const lp = data.subarray(58, 60).readUInt16LE(0)
        const unknown2 = data.subarray(60, 62)
        const startingHandCount = data.subarray(62, 63).readInt8(0)
        const drawCount = data.subarray(63, 64).readInt8(0)
        const timeLimit = data.subarray(64, 68).readUInt16LE(0)
        const unknown3 = data.subarray(68, 86)
        const bestOf = data.subarray(86, 88).readUInt16LE(0)
        const name = data.subarray(114, 154).toString()
        const password = data.subarray(154, 194).toString()
        const notes = data.subarray(194, 219).toString()
        
        console.log("playerName", playerName)
        console.log("createGameCommand", createGameCommand)
        console.log("banList", banList)
        console.log("unknown", unknown)
        console.log("lp", lp)
        console.log("startingHandCount", startingHandCount)
        console.log("drawCount", drawCount)
        console.log("timeLimit", timeLimit)
        console.log("unknown3", unknown3)
        console.log("bestOf", bestOf)
        console.log("name", name)
        console.log("password", password)
        console.log("notes", notes)

        // TODO: create client and room

      })

      socket.on('close', () => {
        console.log('socket cerrado')
      })

      socket.on('error', (error) => {
        console.log('error', error)
      })
    })
  }
}
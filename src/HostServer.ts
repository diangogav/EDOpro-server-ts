import net, { Socket } from 'net'
import { Room } from './Room'
import RoomList from './RoomList'
import { Client } from './Client'

export class HostServer {
  private readonly server

  constructor() {
    this.server = net.createServer()
  }

  async initialize() {
    this.server.listen(7711, () => console.log('Server listen in port 7711'))
    this.server.on('connection', (socket:Socket) => {
      socket.on('data', (data) => {
        console.log(JSON.stringify([...data]))
        console.log(JSON.stringify(data.toString('hex')))
        const playerInfoCommand = data.subarray(0,3)
        const playerName = data.subarray(3, 43).toString()
        const createGameCommand = data.subarray(43, 46)
        const banList = data.subarray(46, 50).readUint32LE()
        const allowed = data.subarray(50, 51).readUInt8()
        const mode = data.subarray(51, 52).readUInt8()
        const duelRule = data.subarray(52, 53).readUInt8()
        const dontCheckDeckContent = data.subarray(53, 54).readUInt8()
        const dontShuffleDeck = data.subarray(54, 55).readUInt8()
        const offset = data.subarray(55, 58).readUInt8()
        const lp = data.subarray(58, 62).readUInt16LE()
        const startingHandCount = data.subarray(62, 63).readInt8(0)
        const drawCount = data.subarray(63, 64).readInt8(0)
        const timeLimit = data.subarray(64, 66).readUInt16LE(0)
        const duelFlagsHight = data.subarray(66, 70).readUInt32LE()
        const handshake = data.subarray(70, 74).readUInt32LE()
        const clientVersion = data.subarray(74, 78).readUInt32LE()
        const t0Count = data.subarray(78, 82).readInt32LE()
        const t1Count = data.subarray(82, 86).readInt32LE()
        const bestOf = data.subarray(86, 90).readInt16LE(0)
        const duelFlagsLow = data.subarray(90, 94)
        const forbidden = data.subarray(94, 98).readUInt32LE()
        const extraRules = data.subarray(98, 100).readUInt16LE(0)
        const mainDeckMin = data.subarray(100, 102).readUInt16LE(0)
        const mainDeckMax = data.subarray(102, 104).readUInt16LE(0)
        const extraDeckMin = data.subarray(104, 106).readUInt16LE(0)
        const extraDeckMax = data.subarray(106, 108).readUInt16LE(0)
        const sideDeckMin = data.subarray(108, 110).readUInt16LE(0)
        const sideDeckMax = data.subarray(110, 112).readUInt16LE(0)
        const name = data.subarray(112, 152).toString()
        const password = data.subarray(152, 192).toString()
        const notes = data.subarray(192, 392).toString()
        
        console.log("playerName", playerName)
        console.log("banList", banList)
        console.log("allowed", allowed)
        console.log("mode", mode)
        console.log("duelRule", duelRule)
        console.log("dontCheckDeckContent", dontCheckDeckContent)
        console.log("dontShuffleDeck", dontShuffleDeck)
        console.log("lp", lp)
        console.log("startingHandCount", startingHandCount)
        console.log("drawCount", drawCount)
        console.log("timeLimit", timeLimit)
        console.log("clientVersion", clientVersion)
        console.log("t0Count", t0Count)
        console.log("t1Count", t1Count)
        console.log("bestOf", bestOf)
        console.log("duelFlagsLow", duelFlagsLow)
        console.log("forbidden", forbidden)
        console.log("extraRules", extraRules)
        console.log("mainDeckMin", mainDeckMin)
        console.log("mainDeckMax", mainDeckMax)
        console.log("extraDeckMin", extraDeckMin)
        console.log("extraDeckMax", extraDeckMax)
        console.log("sideDeckMin", sideDeckMin)
        console.log("sideDeckMax", sideDeckMax)
        console.log("name", name)
        console.log("password", password)
        console.log("notes", notes)
        const roomid = 1 
        const room = new Room({
          roomid,
          roomname: name,
          roomnotes: notes,
          roommode: mode,
          needpass: password.length > 0,
          team1: t0Count,
          team2: t1Count,
          best_of: bestOf,
          duel_flag: 4295820800,
          forbidden_types: forbidden,
          extra_rules: extraRules,
          start_lp: lp,
          start_hand: startingHandCount,
          draw_count: drawCount,
          time_limit: timeLimit,
          rule: allowed,
          no_check: Boolean(dontCheckDeckContent),
          no_shuffle: Boolean(dontShuffleDeck),
          banlist_hash: banList,
          istart: 'waiting',
          main_min: mainDeckMin,
          main_max: mainDeckMax,
          extra_min: extraDeckMin,
          extra_max: extraDeckMax,
          side_min: sideDeckMin,
          side_max: sideDeckMax,
          users: [{
            pos: 0,
            name: playerName
          }]
        })

        RoomList.addRoom(room)

        const stocCreateGameCommand = Buffer.from([0x05, 0x00, 0x11])
        const stoId = decimalToBytesBuffer(roomid, 4)
        const stocJoinGameCommand = Buffer.from([0x45, 0x00, 0x12])
        const stcBanList = decimalToBytesBuffer(banList, 4)
        const stcAllowed = decimalToBytesBuffer(allowed, 1)
        const stcMode = decimalToBytesBuffer(mode, 1)
        const stcDuelRule = decimalToBytesBuffer(duelRule, 1)
        const stcDontCheckDeck = decimalToBytesBuffer(dontCheckDeckContent, 1)
        const stcDontShuffleDeck = decimalToBytesBuffer(dontShuffleDeck, 1)
        const unknown = Buffer.from([0x1e, 0x3c, 0xb2])
        const stcLp = decimalToBytesBuffer(lp, 4)
        const stcStartingCards = decimalToBytesBuffer(startingHandCount, 1)
        const stcDrawCount = decimalToBytesBuffer(drawCount, 1)
        const stcTimeLimits = decimalToBytesBuffer(timeLimit, 2)
        const stcduelFlagsHigh = decimalToBytesBuffer(duelFlagsHight, 4)
        const stcHandshake = decimalToBytesBuffer(handshake, 4)
        const stcVersion = decimalToBytesBuffer(clientVersion, 4)
        const stcT01 = decimalToBytesBuffer(t0Count, 4)        
        const stcT02 = decimalToBytesBuffer(t1Count, 4)
        const stcBestOf = decimalToBytesBuffer(bestOf, 4)
        const stcDuelFlagsLow = decimalToBytesBuffer(duelFlagsLow, 4)
        const stcForbidden = decimalToBytesBuffer(forbidden, 4)
        const stcExtraRules = decimalToBytesBuffer(extraRules, 2) 
        const stcMainDeckMin = decimalToBytesBuffer(mainDeckMin, 2)
        const stcMainDeckMax = decimalToBytesBuffer(mainDeckMax, 2)
        const stcExtraDeckMin = decimalToBytesBuffer(extraDeckMin, 2)
        const stcExtraDeckMax = decimalToBytesBuffer(extraDeckMax, 2)
        const stcSideDeckMin = decimalToBytesBuffer(sideDeckMin, 2) 
        const stcSideDeckMax = decimalToBytesBuffer(sideDeckMax, 2)
        const unknown2 = Buffer.from([
          0x67,0x53,0x2B,0x00,0x20,0x54,0x00,0x65,0x00,0x72,0x00,0x6D,0x00,0x6F,0x00,0x2D,0x00,0x44,0x00,0x41,0x00,0x4B,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x02,0x00,0x21,0x0A,0x02,0x00,0x13,0x10
       ])
  
        room.addClient(new Client(socket))
        
        socket.write(Buffer.concat([
          stocCreateGameCommand, 
          stoId,
        ]))

        socket.write(Buffer.concat([
          stocJoinGameCommand,
          stcBanList,
          stcAllowed,
          stcMode,
          stcDuelRule,
          stcDontCheckDeck,
          stcDontShuffleDeck,
          unknown,
          stcLp,
          stcStartingCards,
          stcDrawCount,
          stcTimeLimits,
          stcduelFlagsHigh,
          stcHandshake,
          stcVersion,
          stcT01,
          stcT02,
          stcBestOf,
          stcDuelFlagsLow,
          stcForbidden,
          stcExtraRules,
          stcMainDeckMin,
          stcMainDeckMax,
          stcExtraDeckMin,
          stcExtraDeckMax,
          stcSideDeckMin,
          stcSideDeckMax,
          unknown2
        ]))


        // socket.write(Buffer.from([0x05, 0x00, 0x11, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x1E, 0x3C, 0xB2, 0x40, 0x1F, 0x00, 0x00, 0x05, 0x01, 0xFA, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x01, 0x0A, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x28, 0x00, 0x3C, 0x00, 0x00, 0x00, 0x0F, 0x00, 0x00, 0x00, 0x0F, 0x00, 0x67, 0x53, 0x2B, 0x00, 0x20, 0x54, 0x00, 0x65, 0x00, 0x72, 0x00, 0x6D, 0x00, 0x6F, 0x00, 0x2D, 0x00, 0x44, 0x00, 0x41, 0x00, 0x4B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x21, 0x0A, 0x02, 0x00, 0x13, 0x10]))
        
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

const hexToDecimal = hex => parseInt(hex, 16);
function decimalToHex(decimal) {
  return decimal.toString(16);
}

function bufferToBytes(buffer) {
  const reversed = Buffer.from(buffer).reverse();
  const hex = reversed.toString('hex').padStart(8, '0');
  const bytes = hex.match(/.{1,2}/g).reverse().join(' ');
  return bytes;
}

function decimalToBytesBuffer(decimal, numBytes) {
  const buffer = Buffer.alloc(numBytes);
  buffer.writeUIntBE(decimal, 0, numBytes);
  const bytes = [...buffer].map(byte => '0x' + byte.toString(16).padStart(2, '0')).join(' ');
  return Buffer.from(bytes.split(' ').reverse().map(item => Number(item)))
}
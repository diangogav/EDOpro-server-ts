import RoomList from "./RoomList";
import { createDirectoryIfNotExists } from "./utils";
import express, { Request, Response } from 'express'

export class Server {
  private readonly app
  constructor() {
    this.app = express()
    this.app.get('/api/getrooms', (req: Request, response: Response) => {
      const rooms = RoomList.getRooms()
      response.status(200).json({ rooms })
      // console.log('Llego el request....!!!')
      // response.status(200).json({
      //   rooms: [
      //     {
      //       roomid: 1,
      //       roomname: "",
      //       roomnotes: "soylasnotas",
      //       roommode: 0,
      //       needpass: true,
      //       team1: 1,
      //       team2: 1,
      //       best_of: 5,
      //       duel_flag: 4295820800,
      //       forbidden_types: 83886080,
      //       extra_rules: 0,
      //       start_lp: 8000,
      //       start_hand: 5,
      //       draw_count: 1,
      //       time_limit: 250,
      //       rule: 4,
      //       no_check: false,
      //       no_shuffle: false,
      //       banlist_hash: 0,
      //       istart: "waiting",
      //       main_min: 40,
      //       main_max: 60,
      //       extra_min: 0,
      //       extra_max: 15,
      //       side_min: 0,
      //       side_max: 15,
      //       users: [
      //         {
      //           pos: 0,
      //           name: "Termo-DAK"
      //         }
      //       ]
      //     }
      //   ]
      // })
    })

    this.app.post('/api/getrooms', (req: Request, response: Response) => {
      console.log('Llego el request....')
      response.status(200).json({})
    })
  }

  async initialize() {
    await createDirectoryIfNotExists('./config')
    this.app.listen(7722, () => console.log('Server listen in port 7722'))
  }
}
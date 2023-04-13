import { createDirectoryIfNotExists } from "./utils";
import express, { Request, Response } from 'express'

export class Server {
  private readonly app
  constructor() {
    this.app = express()
    this.app.get('/api/getrooms', (req: Request, response: Response) => {
      console.log('Llego el request....')
      response.status(200).json({})
    })

    this.app.post('/api/getrooms', (req: Request, response: Response) => {
      console.log('Llego el request....')
      response.status(200).json({})
    })
  }

  async initialize() {
    await createDirectoryIfNotExists('./config')
    this.app.listen(7922, () => console.log('Server listen in port 7922'))
  }
}
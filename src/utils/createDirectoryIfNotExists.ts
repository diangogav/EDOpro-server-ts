import fs from 'fs'
import { checkFileExists } from '.'

export async function createDirectoryIfNotExists(path: string) {
  if(!path) { return }
  if(await checkFileExists(path)) { return }
  await fs.promises.mkdir(path, { recursive: true })
}
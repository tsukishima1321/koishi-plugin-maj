import { Context, Schema, Session } from 'koishi'
import { Wind } from './utils/utils'
import { MajGame4p } from './majGame4p'
import { buildHora, Hora, Tile, shanten, Furo } from 'mahjong-utils'

export const name = 'mahjong'

export const inject = {
  required: [],
  optional: [],
}

export interface Config {
  inGameMessagePrefix: string
}

export const Config = Schema.object({
  inGameMessagePrefix: Schema.string().default('maj')
})

const waitUserReply = async (ctx: Context, prefix: string, guildID: string, userID: string): Promise<string> => {
  let finished = false
  let result = ''
  let listener = (session: Session) => {
    if (session.content.startsWith(prefix + ' ') && session.userId == userID && session.guildId == guildID) {
      finished = true
      result = session.content.slice(4)
    }
  }
  const dispose = ctx.on('message', listener)
  let count = 0
  while (!finished) {
    await new Promise(resolve => setTimeout(resolve, 500))
    count++
    if (count > 1200) {
      finished = true
      dispose()
      throw new Error('Timeout')
    }
  }
  dispose()
  return result
}

export function apply(ctx: Context, cfg: Config) {
  let activeGames: { [key: string]: MajGame4p } = {}
  ctx.command('startGame').action(async ({ session }) => {
    if (activeGames[session.userId]) {
      session.send('You are already in a game')
      return
    }
    const sendMessage = (mes: string) => {
      session.send(mes);
    }
    const waitResponse = () => {
      return waitUserReply(ctx, cfg.inGameMessagePrefix, session.guildId, session.userId)
    }
    const game = new MajGame4p('You', Wind.East, 0, sendMessage, waitResponse)
    activeGames[session.userId] = game
    await game.startGame()
    activeGames[session.userId] = undefined
    return "游戏结束"
  })
}

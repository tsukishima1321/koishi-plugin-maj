import { Context, Schema, Session } from 'koishi'
import { Wind } from './utils/utils'
import { MajGame4p } from './majGame4p'
import { buildHora,Hora } from 'mahjong-utils'

export const name = 'mahjong'

export const inject = {
  required: [],
  optional: [],
}

export interface Config { }

export const Config = Schema.object({})

const waitUserReply = async (ctx: Context, guildID: string, userID: string): Promise<string> => {
  let finished = false
  let result = ''
  let listener = (session: Session) => {
    if (session.content.startsWith('maj ') && session.userId == userID && session.guildId == guildID) {
      finished = true
      result = session.content.slice(4)
    }
  }
  const dispose = ctx.on('message', listener)
  let count = 0
  while (!finished) {
    await new Promise(resolve => setTimeout(resolve, 500))
    count++
    if (count > 120) {
      finished = true
      throw new Error('Timeout')
    }
  }
  dispose()
  return result
}

export function apply(ctx: Context) {
  let horaParas = {
    agari: '1p',
    tsumo: false,
    dora: 1,
    tiles: '1112345678999p',
  }
  let res = buildHora(horaParas)
  console.log(res)
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
      return waitUserReply(ctx, session.guildId, session.userId)
    }
    const game = new MajGame4p('aaa', Wind.East, 0, sendMessage, waitResponse)
    activeGames[session.userId] = game
    await game.startGame()
    activeGames[session.userId] = undefined
    return "Game finished"
  })
}

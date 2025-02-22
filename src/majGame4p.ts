import { Tile, TileType, shanten } from 'mahjong-utils'
import { shuffle } from './utils/utils'
import { tileToUnicode, Wind } from './utils/utils'

class Player {
    name: string
    point: number
    hand: Tile[]
    furos: Tile[][]
    river: Tile[]
    seat: Wind
    riichi: boolean
    riichiTurn: number
    constructor(playerName: string, seat: Wind) {
        this.name = playerName
        this.seat = seat
        this.river = []
        this.hand = []
        this.furos = []
        this.point = 25000
        this.riichi = false
    }
}

class GameProcess {
    wind: Wind
    turn: number
    action: number
}

const nextWind = (wind: Wind): Wind => {
    switch (wind) {
        case Wind.East: return Wind.South
        case Wind.South: return Wind.West
        case Wind.West: return Wind.North
        case Wind.North: return Wind.East
    }
}

interface PlayerPlayCardActionCandidate {
    tsumo: boolean,
    concealedK: Array<number>,
    extendedK: Array<number>,
    riichi: Array<number>,
}

interface PlayerReactToCardActionCandidate {
    pon: boolean,
    chi: Array<number>,
    kan: boolean,
    ron: boolean,
}

export class MajGame4p {
    sendMessage: (mes: string) => void
    waitResponse: () => Promise<string>
    randomSeed: number
    playerSeat: Wind
    pointPool: number
    gameProcess: GameProcess
    aiPara: [number, number, number, number]
    players: Player[]
    cardBank: Tile[]
    dora: Tile[]
    visibleDoraCount: number
    whoseTurn: number
    constructor(playerName: string, playerSeat: Wind, randomSeed: number, sendMessage: (mes: string) => void, waitResponse: () => Promise<string>) {
        this.sendMessage = sendMessage
        this.waitResponse = waitResponse
        this.randomSeed = randomSeed
        let player = new Player(playerName, playerSeat)
        this.players = []
        this.players.push(player)
        this.playerSeat = playerSeat
        this.players.push(new Player('Alice', nextWind(playerSeat)))
        this.players.push(new Player('Bob', nextWind(nextWind(playerSeat))))
        this.players.push(new Player('Jack', nextWind(nextWind(nextWind(playerSeat)))))
        this.pointPool = 0
        this.whoseTurn = 0
        this.visibleDoraCount = 1
        this.gameProcess = {
            wind: Wind.East,
            turn: 1,
            action: 0
        }
        this.aiPara = [10, 4, 2, 30]
    }
    private startGameRound() {
        this.cardBank = []
        for (let i = 0; i < 4; i++) {
            for (let j = 1; j <= 9; j++) {
                this.cardBank.push(Tile.byTypeAndNum(TileType.M, j)!)
                this.cardBank.push(Tile.byTypeAndNum(TileType.P, j)!)
                this.cardBank.push(Tile.byTypeAndNum(TileType.S, j)!)
            }
            for (let j = 1; j <= 7; j++) {
                this.cardBank.push(Tile.byTypeAndNum(TileType.Z, j)!)
            }
        }
        this.cardBank = shuffle(this.cardBank)
        this.dora = []
        for (let i = 0; i < 5; i++) {
            this.dora.push(this.cardBank.pop()!)
        }
        for (let player of this.players) {
            player.hand = []
            for (let i = 0; i < 13; i++) {
                player.hand.push(this.cardBank.pop()!)
            }
            player.hand.sort((a, b) => a.compareTo(b))
        }
    }
    private moveWind() {
        for (const player of this.players) {
            player.seat = nextWind(player.seat)
            this.playerSeat = nextWind(this.playerSeat)
        }
    }
    private renderGameDeck(): string {
        let res = ''
        res += `${this.gameProcess.wind.toString()}${this.gameProcess.turn}局${this.gameProcess.action}本场|`
        for (let i = 0; i < this.visibleDoraCount; i++) {
            res += tileToUnicode(this.dora[i])
        }
        res += `   余牌：${this.cardBank.length - 14}\n`
        for (let i = 0; i < 4; i++) {
            let player = this.players[i]
            res += `${player.name.padEnd(6)}(${player.seat.toString()}):`
            for (const tile of player.river) {
                res += tileToUnicode(tile)
            }
            if (i == this.whoseTurn) {
                res += '←'
            }
            res += '\n'
            res += String(player.point).padEnd(9) + "|"
            for (const furo of player.furos) {
                for (const tile of furo) {
                    res += tileToUnicode(tile)
                }
                res += ' '
            }
            res += '\n'
        }
        for (let i = 0; i < this.players[0].hand.length; i++) {
            if (i == 13 - this.players[0].furos.length) {
                res += '|'
            }
            res += tileToUnicode(this.players[0].hand[i]).padEnd(3)
        }
        return res;
    }
    public async startGame() {
        while (true) {
            this.startGameRound()
            while (this.cardBank.length > 0) {
                let player = this.players[this.whoseTurn]
                //抽牌阶段
                player.hand.push(this.cardBank.pop()!)
                //抽牌结束

                //出牌确认阶段
                let playerActionCandidate: PlayerPlayCardActionCandidate = {
                    tsumo: false,
                    concealedK: [],
                    extendedK: [],
                    riichi: [],
                }
                let action = 0
                if (this.whoseTurn == 0) {
                    const shantenResult = shanten(player.hand, { furo: [], bestShantenOnly: true })
                    let message = this.renderGameDeck()
                    message += '出牌：'

                    //自摸判定
                    if (shantenResult.shantenInfo.shantenNum == 0) {
                        message += '/自摸(-1)'
                        playerActionCandidate.tsumo = true
                    }

                    //暗杠判定

                    //加杠判定

                    this.sendMessage(this.renderGameDeck())
                    let res = await this.waitResponse()
                    action = player.hand.findIndex(tile => tile.code == Tile.byText(res).code)
                } else {
                    //ai行动
                    action = 0
                }
                //出牌确认阶段结束

                //出牌执行阶段
                if (playerActionCandidate.tsumo) {
                    if (action == -1) {
                        this.moveWind()
                        this.startGameRound()
                        break
                    }
                }
                //出牌执行阶段结束

                //出牌后确认阶段
                for (let i = 0; i < this.players.length; i++) {
                    if (i == this.whoseTurn) {
                        continue
                    }
                    let player = this.players[i]
                    let playerActionCandidate: PlayerReactToCardActionCandidate = {
                        pon: false,
                        chi: [],
                        kan: false,
                        ron: false,
                    }
                    // 荣判定

                    // 杠判定

                    // 碰判定

                    // 吃判定

                    let action = 0
                    if (i == 0) {
                        //
                    } else {
                        //ai行动
                        action = 0
                    }
                }
                player.river.push(player.hand.splice(action, 1)[0])
                //出牌后确认阶段结束

                //出牌后执行阶段

                //出牌后执行阶段结束

                player.hand.sort((a, b) => a.compareTo(b))
                this.whoseTurn = (this.whoseTurn + 1) % 4
            }
        }
    }
}
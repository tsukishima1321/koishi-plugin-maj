import { Tile, TileType, shanten, buildHora, Hora, ShantenWithGot, Furo, FuroType } from 'mahjong-utils'
import { shuffle, padString, isTenWithGot, isTenWithoutGot } from './utils/utils'
import { tileToUnicode, Wind } from './utils/utils'
import { yakuName } from './utils/yakuNames'

class Player {
    name: string
    point: number
    hand: Tile[]
    furos: Furo[]
    river: Tile[]
    seat: Wind
    riichi: boolean
    riichiIppatsu: boolean
    riichiTurn: number
    menzen: boolean
    constructor(playerName: string, seat: Wind) {
        this.name = playerName
        this.seat = seat
        this.river = []
        this.hand = []
        this.furos = []
        this.riichiTurn = 9999
        this.point = 25000
        this.riichi = false
        this.riichiIppatsu = false
        this.menzen = true
    }
    public startGameRound(cardBank: Tile[]) {
        this.hand = []
        this.river = []
        this.furos = []
        this.riichi = false
        this.riichiTurn = 9999
        this.riichiIppatsu = false
        this.menzen = true
        for (let i = 0; i < 13; i++) {
            this.hand.push(cardBank.pop()!)
        }
        this.hand.sort((a, b) => a.compareTo(b))
    }
}

class GameProcess {
    wind: Wind
    turn: number
    action: number
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

interface RoundResult {
    renchann: boolean
    ryuu: boolean
    error: boolean
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
        this.players.push(new Player('P2', playerSeat.next()))
        this.players.push(new Player('P3', playerSeat.next().next()))
        this.players.push(new Player('P4', playerSeat.next().next().next()))
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
        this.visibleDoraCount = 1
        this.dora = []
        for (let i = 0; i < 5; i++) {
            this.dora.push(this.cardBank.pop()!)
        }
        this.players.forEach((p) => { p.startGameRound(this.cardBank) })
        for (let i = 0; i < 4; i++) {
            if (this.players[i].seat == Wind.East) {
                this.whoseTurn = i
                break
            }
        }
    }
    private moveWind() {
        this.gameProcess.action = 0
        this.gameProcess.turn++
        if (this.gameProcess.turn == 5) {
            this.gameProcess.turn = 1
            this.gameProcess.wind = this.gameProcess.wind.next()
        }
        for (const player of this.players) {
            player.seat = player.seat.next()
            this.playerSeat = this.playerSeat.next()
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
            for (let j = 0; j < player.river.length; j++) {
                if (j == player.riichiTurn) {
                    res += '>'
                }
                res += tileToUnicode(player.river[j])
            }
            if (i == this.whoseTurn) {
                res += '←'
            }
            res += '\n'
            res += String(player.point).padEnd(9) + "|"
            for (const furo of player.furos) {
                for (const tile of furo.tiles) {
                    res += tileToUnicode(tile)
                }
                res += ' '
            }
            res += '\n'
        }
        for (let i = 0; i < this.players[0].hand.length; i++) {
            if (i == 13 - this.players[0].furos.length * 3) {
                res += '|'
            }
            res += tileToUnicode(this.players[0].hand[i]).padEnd(3)
        }
        return res;
    }
    private calculatePoints(winnner: number, horaResult: Hora, tsumo: boolean, target?: number): void {
        const player = this.players[winnner]
        if (tsumo) {
            if (player.seat == Wind.East) {
                player.point += horaResult.parentPoint.tsumo * 3 + this.gameProcess.action * 100 * 3
                for (let i = 0; i < 4; i++) {
                    if (i != winnner) {
                        this.players[i].point -= horaResult.parentPoint.tsumo + this.gameProcess.action * 100
                    }
                }
            } else {
                player.point += horaResult.childPoint.tsumoParent + horaResult.childPoint.tsumoChild * 2 + this.gameProcess.action * 100 * 3
                for (let i = 0; i < 4; i++) {
                    if (i != winnner) {
                        if (this.players[i].seat == Wind.East) {
                            this.players[i].point -= horaResult.childPoint.tsumoParent + this.gameProcess.action * 100
                        } else {
                            this.players[i].point -= horaResult.childPoint.tsumoChild + this.gameProcess.action * 100
                        }
                    }
                }
            }
        } else {
            if (player.seat == Wind.East) {
                player.point += horaResult.parentPoint.ron
                this.players[target].point -= horaResult.parentPoint.ron
            } else {
                player.point += horaResult.childPoint.ron
                this.players[target].point -= horaResult.childPoint.ron
            }
        }
        player.point += this.pointPool
        this.pointPool = 0
    }
    private roundResult(winner: number, tsumo: boolean, target?: number, ronAgari?: Tile): string {
        const tiles = this.players[winner].hand
        const furos = this.players[winner].furos
        const player = this.players[winner]
        let extraYaku = []
        if (player.riichi) {
            extraYaku.push('Richi')
        }
        if (player.riichiIppatsu) {
            extraYaku.push('Ippatsu')
        }
        if (this.cardBank.length == 0) {
            extraYaku.push('Haitei')
        }
        let doraCount = 0
        const dora = this.dora.map((tile) => {
            if (tile.num == 9) {
                return tile.advance(-8)
            }
            return tile.advance(1)
        })
        let concealedDora = []
        for (let i = 0; i < this.visibleDoraCount; i++) {
            concealedDora.push(this.cardBank[5 + 1 + 2 * i])
        }
        concealedDora = concealedDora.map((tile) => {
            if (tile.num == 9) {
                return tile.advance(-8)
            }
            return tile.advance(1)
        }
        )
        for (let i = 0; i < this.visibleDoraCount; i++) {
            const doratile = dora[i]
            if (tiles.includes(doratile)) {
                doraCount++
            }
        }
        if (player.riichi) {
            for (let i = 0; i < this.visibleDoraCount; i++) {
                const doratile = concealedDora[i]
                if (tiles.includes(doratile)) {
                    doraCount++
                }
            }
        }
        const horaResult = buildHora({
            tiles: player.hand,
            agari: tsumo ? player.hand[13] : ronAgari,
            tsumo: tsumo,
            furo: player.furos,
            selfWind: player.seat.ToPrimitive(),
            roundWind: this.gameProcess.wind.ToPrimitive(),
            extraYaku: extraYaku,
            dora: doraCount
        })
        let res = ''
        res += `${this.gameProcess.wind.toString()}${this.gameProcess.turn}局${this.gameProcess.action}本场|`
        if (tsumo) {
            res += '自摸：\n'
        } else {
            res += '荣：\n'
        }
        for (let i = 0; i < tiles.length; i++) {
            const tile = tiles[i]
            if (i == 13 - this.players[winner].furos.length * 3) {
                res += ' '
            }
            res += tileToUnicode(tile)
        }
        if (!tsumo) {
            res += ' ' + tileToUnicode(ronAgari)
        }
        res += '|'
        for (const furoItem of furos) {
            for (const tile of furoItem.tiles) {
                res += tileToUnicode(tile)
            }
            res += ' '
        }
        res += '\n宝：'
        for (let i = 0; i < this.visibleDoraCount; i++) {
            res += tileToUnicode(this.dora[i])
        }
        if (this.players[winner].riichi) {
            res += '\n里宝：'
            for (let i = 0; i < this.visibleDoraCount; i++) {
                res += tileToUnicode(this.cardBank[5 + 1 + 2 * i])
            }
        }
        res += '\n'
        res += `${horaResult.han}番${horaResult.hu}符，${horaResult.yaku.map((yaku => yakuName[yaku])).join('、')}\n`
        const playerPointsOld = this.players.map(player => player.point)
        this.calculatePoints(winner, horaResult, tsumo, target)
        for (let i = 0; i < 4; i++) {
            res += `${this.players[i].name.padEnd(6)}:${String(playerPointsOld[i]).padStart(5)}|`
        }
        res += '\n'
        for (let i = 0; i < 4; i++) {
            res += `${padString(String(this.players[i].point - playerPointsOld[i]), 16)}`
        }
        res += '\n'
        for (let i = 0; i < 4; i++) {
            res += `${this.players[i].name.padEnd(6)}:${String(this.players[i].point).padStart(5)}|`
        }
        res += '\n'
        return res
    }
    private aiValueTiles(player: Player, darkTiles: Tile[]): Array<number> {
        let res = []
        for (const tile of player.hand) {
            let value = 0
            for (const tile2 of player.hand) {
                const distance = Math.abs(tile.distance(tile2))
                if (distance <= 2) {
                    value += this.aiPara[distance] * this.aiPara[3]
                }
            }
            for (const tile2 of darkTiles) {
                const distance = Math.abs(tile.distance(tile2))
                if (distance <= 2) {
                    value += this.aiPara[distance]
                }
            }
            res.push(value)
        }
        return res
    }
    private calculacePointsLiu() {
        const tenList = Array<number>()
        for (let i = 0; i < 4; i++) {
            const player = this.players[i]
            if (isTenWithoutGot(player.hand)) {
                tenList.push(i)
            }
        }
        switch (tenList.length) {
            case 0:
                break
            case 1:
                this.players[tenList[0]].point += 3000
                for (let i = 0; i < 4; i++) {
                    if (i != tenList[0]) {
                        this.players[i].point -= 1000
                    }
                }
                break
            case 2:
                for (let i = 0; i < 4; i++) {
                    if (tenList.includes(i)) {
                        this.players[i].point += 1500
                    } else {
                        this.players[i].point -= 1500
                    }
                }
                break
            case 3:
                for (let i = 0; i < 4; i++) {
                    if (tenList.includes(i)) {
                        this.players[i].point += 1000
                    } else {
                        this.players[i].point -= 3000
                    }
                }
                break
        }
    }
    private roundResultLiu(): string {
        let res = '流局：\n'
        const playerPointsOld = this.players.map(player => player.point)
        this.calculacePointsLiu()
        for (let i = 0; i < 4; i++) {
            res += `${this.players[i].name.padEnd(6)}:${String(playerPointsOld[i]).padStart(5)}|`
        }
        res += '\n'
        for (let i = 0; i < 4; i++) {
            res += `${padString(String(this.players[i].point - playerPointsOld[i]), 17)}`
        }
        res += '\n'
        for (let i = 0; i < 4; i++) {
            res += `${this.players[i].name.padEnd(6)}:${String(this.players[i].point).padStart(5)}|`
        }
        res += '\n'
        return res
    }
    public async startGame() {
        while (true) {
            // 每次循环为一局游戏
            this.startGameRound()
            const roundResult = await (async () => {
                let roundResult: RoundResult = { renchann: false, ryuu: false, error: false }
                let skipDraw = false
                while (this.cardBank.length - 13 > 0) {
                    // 每次循环为一次出牌
                    let player = this.players[this.whoseTurn]
                    //抽牌阶段
                    if (!skipDraw) {
                        player.hand.push(this.cardBank.pop()!)
                    } else {
                        skipDraw = false
                    }
                    //抽牌结束

                    //出牌确认阶段
                    let playerActionCandidate: PlayerPlayCardActionCandidate = {
                        tsumo: false,
                        concealedK: [],
                        extendedK: [],
                        riichi: [],
                    }

                    const shantenResult = shanten(player.hand, { furo: [], bestShantenOnly: true })
                    let message = this.renderGameDeck()
                    message += '\n出牌：'

                    //自摸判定
                    if (shantenResult.shantenInfo.shantenNum == -1) {
                        let extraYaku = []
                        if (player.riichi) {
                            extraYaku.push('Richi')
                        }
                        if (player.riichiIppatsu) {
                            extraYaku.push('Ippatsu')
                        }
                        if (this.cardBank.length == 0) {
                            extraYaku.push('Haitei')
                        }
                        let horaResult = buildHora({
                            tiles: player.hand,
                            agari: player.hand[13],
                            tsumo: true,
                            furo: player.furos,
                            selfWind: player.seat.ToPrimitive(),
                            roundWind: this.gameProcess.wind.ToPrimitive(),
                            extraYaku: extraYaku
                        })
                        if (horaResult.han >= 1) {
                            message += '/自摸(-1)'
                            playerActionCandidate.tsumo = true
                        } else {
                            message += '/自摸无役'
                        }
                    }

                    // 立直判定
                    if (player.point >= 1000 && player.riichi == false && player.menzen) {
                        for (let i = 0; i < player.hand.length; i++) {
                            let hand = player.hand.slice()
                            hand.splice(i, 1)
                            if (isTenWithoutGot(hand)) {
                                message += `/立直${tileToUnicode(player.hand[i])}(${i + 26})`
                                playerActionCandidate.riichi.push(i + 26)
                            }
                        }
                    }

                    //暗杠判定
                    for (let i = 0; i < player.hand.length; i++) {
                        if (player.hand.filter(tile => tile.code === player.hand[i].code).length == 4) {
                            message += `/暗杠${tileToUnicode(player.hand[i])}(${i + 13})`
                            playerActionCandidate.concealedK.push(i + 13)
                            break
                        }
                    }

                    //加杠判定
                    for (let i = 0; i < player.furos.length; i++) {
                        if (player.furos[i].tiles.length === 3 && player.furos[i].tiles[0].code === player.furos[i].tiles[1].code) {
                            for (let j = 0; j < player.hand.length; j++) {
                                if (player.hand[j].code === player.furos[i].tiles[0].code) {
                                    message += `/加杠${tileToUnicode(player.hand[j])}(${j + 13})`
                                    playerActionCandidate.extendedK.push(j + 13)
                                    break
                                }
                            }
                        }
                    }
                    let action = 0
                    if (player.riichi && !playerActionCandidate.tsumo && playerActionCandidate.concealedK.length == 0) {
                        // 自动出牌
                        action = player.hand.length - 1
                    } else {
                        if (this.whoseTurn == 0) {
                            // 获取输入
                            this.sendMessage(message)
                            let res = ''
                            try {
                                res = await this.waitResponse()
                            } catch (e) {
                                if (e.message == 'Timeout') {
                                    this.sendMessage('Timeout')
                                }
                                console.error(e)
                                roundResult.error = true
                                return roundResult
                            }
                            if (res == "endGame") {
                                roundResult.error = true
                                return roundResult
                            }
                            if (res == "r") {
                                break
                            }
                            if (res == '') {
                                action = player.hand.length - 1
                                console.log(action)
                            } else {
                                if (Tile.byText(res) !== undefined) {
                                    action = player.hand.findIndex(tile => tile.code == Tile.byText(res).code) // -1 when not found
                                } else {
                                    action = -1
                                }
                            }
                            if (action === -1) {
                                action = parseInt(res)
                                if (Number.isNaN(action)) {
                                    this.sendMessage('Invalid input')
                                    action = player.hand.length - 1
                                }
                            }
                        } else {
                            //ai行动
                            const shantenResult = shanten(player.hand, { furo: player.furos, bestShantenOnly: true })
                            const shantenInfo = shantenResult.shantenInfo as ShantenWithGot
                            let darkTiles = this.cardBank.concat()
                            for (const p of this.players) {
                                if (p != player) {
                                    darkTiles = darkTiles.concat(p.hand)
                                }
                            }
                            if (shantenResult.shantenInfo.shantenNum >= 2) {
                                let valueTiles = this.aiValueTiles(player, darkTiles)
                                let minAction = 0
                                let minValue = 99999
                                for (let i = 0; i < valueTiles.length; i++) {
                                    if (valueTiles[i] < minValue) {
                                        minValue = valueTiles[i]
                                        minAction = i
                                    }
                                }
                                action = minAction;
                            } else {
                                if (playerActionCandidate.tsumo) {
                                    action = -1
                                } else {
                                    let maxDarkAdvanceNum = -1
                                    let maxDarkAdvanceTile: Tile
                                    for (const [tile, res] of shantenInfo.discardToAdvance) {
                                        let darkAdvanceNum = 0
                                        for (let ad of res.advance) {
                                            darkAdvanceNum += darkTiles.filter(tile => tile.code == ad.code).length
                                        }
                                        if (darkAdvanceNum > maxDarkAdvanceNum) {
                                            maxDarkAdvanceNum = darkAdvanceNum
                                            maxDarkAdvanceTile = tile
                                        }
                                    }
                                    action = player.hand.findIndex(tile => tile.code == maxDarkAdvanceTile.code)
                                    if (playerActionCandidate.riichi.length > 0) {
                                        action = action + 26
                                        if (!playerActionCandidate.riichi.includes(action)) {
                                            throw new Error('AI error')
                                        }
                                    }
                                }
                            }
                        }
                    }
                    //出牌确认阶段结束

                    //出牌执行阶段
                    let actionChose = false
                    let actionIsKan = false

                    //自摸
                    if (!actionChose && playerActionCandidate.tsumo) {
                        if (action == -1) {
                            actionChose = true
                            let mes = this.renderGameDeck()
                            this.sendMessage(mes)
                            mes = this.roundResult(this.whoseTurn, true)
                            this.sendMessage(mes)
                            break
                        }
                    }

                    player.riichiIppatsu = false

                    //立直
                    if (!actionChose && playerActionCandidate.riichi.length > 0) {
                        if (playerActionCandidate.riichi.includes(action)) {
                            action = action % 13
                            actionChose = true
                            player.riichi = true
                            player.riichiIppatsu = true
                            player.riichiTurn = player.river.length
                            player.point -= 1000
                            this.pointPool += 1000
                            player.river.push(player.hand.splice(action, 1)[0])
                        }
                    }

                    //暗杠
                    if (!actionChose && playerActionCandidate.concealedK.includes(action)) {
                        actionChose = true
                        actionIsKan = true
                        this.visibleDoraCount++
                        action = action % 13
                        player.furos.push(new Furo(FuroType.Ankan, player.hand[action]))
                        for (let i = 0; i < 4; i++) {
                            let position = player.hand.findIndex(tile => tile.code == player.hand[action].code)
                            player.hand.splice(position, 1)
                        }
                    }

                    //加杠
                    if (!actionChose && playerActionCandidate.extendedK.includes(action)) {
                        actionChose = true
                        actionIsKan = true
                        this.visibleDoraCount++
                        action = action % 13
                        for (let i = 0; i < player.furos.length; i++) {
                            if (player.furos[i].tiles[0].code == player.hand[action].code) {
                                player.furos.splice(i, 1)
                                player.furos.push(new Furo(FuroType.Minkan, player.hand[action]))
                                player.hand.splice(action, 1)
                                break
                            }
                        }
                    }

                    //出牌
                    if (!actionChose) {
                        actionChose = true
                        player.river.push(player.hand.splice(action, 1)[0])
                    }

                    let tilePlayed: Tile
                    if (!actionIsKan) {
                        tilePlayed = player.river.slice(-1)[0]
                    } else {
                        tilePlayed = player.furos.slice(-1)[0][0]
                    }
                    //出牌执行阶段结束

                    //出牌后确认阶段
                    let playersActionCandidate: [PlayerReactToCardActionCandidate, PlayerReactToCardActionCandidate, PlayerReactToCardActionCandidate, PlayerReactToCardActionCandidate] = [undefined, undefined, undefined, undefined]
                    let playersAction: [number, number, number, number] = [-1, -1, -1, -1]
                    for (let i = this.whoseTurn + 1; i < 3 + this.whoseTurn + 1; i++) {
                        let message = this.renderGameDeck()
                        message += '\n'
                        let player = this.players[i % 4]
                        let playerActionCandidate: PlayerReactToCardActionCandidate = {
                            pon: false,
                            chi: [],
                            kan: false,
                            ron: false,
                        }

                        if (actionIsKan) {
                            // 抢杠判定
                        } else {
                            // 荣判定
                            if (shanten(player.hand.concat(tilePlayed), { furo: player.furos, bestShantenOnly: true }).shantenInfo.shantenNum == -1) {
                                let extraYaku = []
                                if (player.riichi) {
                                    extraYaku.push('Richi')
                                }
                                if (player.riichiIppatsu) {
                                    extraYaku.push('Ippatsu')
                                }
                                if (this.cardBank.length == 0) {
                                    extraYaku.push('Houtei')
                                }
                                let horaResult = buildHora({
                                    tiles: player.hand,
                                    agari: tilePlayed,
                                    tsumo: true,
                                    furo: player.furos,
                                    selfWind: player.seat.ToPrimitive(),
                                    roundWind: this.gameProcess.wind.ToPrimitive(),
                                    extraYaku: extraYaku
                                })
                                if (horaResult.han >= 1) {
                                    message += '/荣(-1)'
                                    playerActionCandidate.ron = true
                                } else {
                                    message += '/荣无役'
                                }
                            }

                            // 杠判定
                            if (player.hand.filter(tile => tile.code == tilePlayed.code).length == 3) {
                                message += `/杠${tileToUnicode(tilePlayed)}(2)`
                                playerActionCandidate.kan = true
                            }

                            // 碰判定
                            if (player.hand.filter(tile => tile.code == tilePlayed.code).length >= 2) {
                                message += `/碰${tileToUnicode(tilePlayed)}(1)`
                                playerActionCandidate.pon = true
                            }

                            if (i == this.whoseTurn + 1) {
                                // 吃判定
                                if (tilePlayed.type == TileType.M || tilePlayed.type == TileType.P || tilePlayed.type == TileType.S) {
                                    if (tilePlayed.num <= 7) {
                                        if (player.hand.filter(tile => tile.code == tilePlayed.code + 1).length > 0 && player.hand.filter(tile => tile.code == tilePlayed.code + 2).length > 0) {
                                            message += `/吃${tileToUnicode(Tile.byCode(tilePlayed.code + 1))}${tileToUnicode(Tile.byCode(tilePlayed.code + 2))}(3)`
                                            playerActionCandidate.chi.push(3)
                                        }
                                    }
                                    if (tilePlayed.num >= 3) {
                                        if (player.hand.filter(tile => tile.code == tilePlayed.code - 1).length > 0 && player.hand.filter(tile => tile.code == tilePlayed.code - 2).length > 0) {
                                            message += `/吃${tileToUnicode(Tile.byCode(tilePlayed.code - 2))}${tileToUnicode(Tile.byCode(tilePlayed.code - 1))}(5)`
                                            playerActionCandidate.chi.push(5)
                                        }
                                    }
                                    if (tilePlayed.num <= 8 && tilePlayed.num >= 2) {
                                        if (player.hand.filter(tile => tile.code == tilePlayed.code - 1).length > 0 && player.hand.filter(tile => tile.code == tilePlayed.code + 1).length > 0) {
                                            message += `/吃${tileToUnicode(Tile.byCode(tilePlayed.code - 1))}${tileToUnicode(Tile.byCode(tilePlayed.code + 1))}(4)`
                                            playerActionCandidate.chi.push(4)
                                        }
                                    }
                                }
                            }
                        }
                        playersActionCandidate[i % 4] = playerActionCandidate

                        let action = 0
                        if (i % 4 == 0) {
                            if (playerActionCandidate.ron || playerActionCandidate.kan || playerActionCandidate.pon || playerActionCandidate.chi.length > 0) {
                                //获取输入
                                this.sendMessage(message)
                                let res = ''
                                try {
                                    res = await this.waitResponse()
                                }
                                catch (e) {
                                    if (e.message == 'Timeout') {
                                        this.sendMessage('Timeout')
                                    }
                                    console.error(e)
                                    roundResult.error = true
                                    return roundResult
                                }
                                if (res == "endGame") {
                                    roundResult.error = true
                                    return roundResult
                                }
                                if (res == '') {
                                    action = 0
                                } else {
                                    action = parseInt(res)
                                    if (Number.isNaN(action)) {
                                        this.sendMessage('Invalid input')
                                        action = player.hand.length - 1
                                    }
                                }
                            }
                        } else {
                            //ai行动
                            action = 0
                            if (playerActionCandidate.ron) {
                                action = -1
                            }
                        }
                        playersAction[i % 4] = action
                        //出牌后确认阶段结束
                    }

                    // 出牌后执行阶段
                    let endGame: Array<number> = [];
                    (() => {
                        //荣执行
                        for (let i = this.whoseTurn + 1; i <= this.whoseTurn + 3; i++) {
                            const playerActionCandidate = playersActionCandidate[i % 4]
                            if (playerActionCandidate.ron) {
                                if (playersAction[i % 4] == -1) {
                                    let mes = this.renderGameDeck()
                                    this.sendMessage(mes)
                                    mes = this.roundResult(i % 4, false, this.whoseTurn, tilePlayed)
                                    this.sendMessage(mes)
                                    endGame.push(i % 4)
                                    break
                                }
                            }
                        }
                        if (endGame.length > 0) { return }

                        const afterFuro = (i: number) => {
                            let player = this.players[i % 4]
                            this.players[this.whoseTurn].river.pop()
                            this.whoseTurn = i % 4 - 1
                            player.menzen = false
                            skipDraw = true
                        }

                        //杠、碰执行
                        for (let i = this.whoseTurn + 1; i <= this.whoseTurn + 3; i++) {
                            const playerActionCandidate = playersActionCandidate[i % 4]
                            if (playerActionCandidate.kan) {
                                if (playersAction[i % 4] == 2) {
                                    let player = this.players[i % 4]
                                    player.furos.push(new Furo(FuroType.Minkan, tilePlayed))
                                    for (let j = 0; j < 3; j++) {
                                        let position = player.hand.findIndex(tile => tile.code == tilePlayed.code)
                                        player.hand.splice(position, 1)
                                    }
                                    player.menzen = false
                                    this.visibleDoraCount++
                                    this.whoseTurn = i % 4 - 1
                                    this.players[this.whoseTurn].river.pop()
                                    return
                                }
                                if (playersAction[i % 4] == 1) {
                                    let player = this.players[i % 4]
                                    player.furos.push(new Furo(FuroType.Pon, tilePlayed))
                                    for (let j = 0; j < 2; j++) {
                                        let position = player.hand.findIndex(tile => tile.code == tilePlayed.code)
                                        player.hand.splice(position, 1)
                                    }
                                    afterFuro(i)
                                    return
                                }
                            }
                        }

                        //碰执行
                        for (let i = this.whoseTurn + 1; i <= this.whoseTurn + 3; i++) {
                            const playerActionCandidate = playersActionCandidate[i % 4]
                            if (playerActionCandidate.pon) {
                                if (playersAction[i % 4] == 1) {
                                    let player = this.players[i % 4]
                                    player.furos.push(new Furo(FuroType.Pon, tilePlayed))
                                    for (let j = 0; j < 2; j++) {
                                        let position = player.hand.findIndex(tile => tile.code == tilePlayed.code)
                                        player.hand.splice(position, 1)
                                    }
                                    afterFuro(i)
                                    return
                                }
                            }
                        }

                        //吃执行
                        for (let i = this.whoseTurn + 1; i < this.whoseTurn + 2; i++) {
                            const playerActionCandidate = playersActionCandidate[i % 4]
                            if (playerActionCandidate.chi.length > 0) {
                                if (playerActionCandidate.chi.includes(3)) {
                                    if (playersAction[i % 4] == 3) {
                                        let player = this.players[i % 4]
                                        player.furos.push(Furo.parse([tilePlayed, tilePlayed.advance(1), tilePlayed.advance(2)]))
                                        let position = player.hand.findIndex(tile => tile.code == tilePlayed.advance(2).code)
                                        player.hand.splice(position, 1)
                                        position = player.hand.findIndex(tile => tile.code == tilePlayed.advance(1).code)
                                        player.hand.splice(position, 1)
                                        afterFuro(i)
                                        return
                                    }
                                }
                                if (playerActionCandidate.chi.includes(4)) {
                                    if (playersAction[i % 4] == 4) {
                                        let player = this.players[i % 4]
                                        player.furos.push(Furo.parse([tilePlayed.advance(-1), tilePlayed, tilePlayed.advance(1)]))
                                        let position = player.hand.findIndex(tile => tile.code == tilePlayed.advance(-1).code)
                                        player.hand.splice(position, 1)
                                        position = player.hand.findIndex(tile => tile.code == tilePlayed.advance(1).code)
                                        player.hand.splice(position, 1)
                                        afterFuro(i)
                                        return
                                    }
                                }
                                if (playerActionCandidate.chi.includes(5)) {
                                    if (playersAction[i % 4] == 5) {
                                        let player = this.players[i % 4]
                                        player.furos.push(Furo.parse([tilePlayed.advance(-2), tilePlayed.advance(-1), tilePlayed]))
                                        let position = player.hand.findIndex(tile => tile.code == tilePlayed.advance(-1).code)
                                        player.hand.splice(position, 1)
                                        position = player.hand.findIndex(tile => tile.code == tilePlayed.advance(-2).code)
                                        player.hand.splice(position, 1)
                                        afterFuro(i)
                                        return
                                    }
                                }
                            }
                        }
                    })()
                    if (endGame.length > 0) {
                        for (let i = 0; i < 4; i++) {
                            if (endGame.includes(i) && this.players[i].seat == Wind.East) {
                                roundResult.renchann = true
                            }
                        }
                        return roundResult
                    }

                    player.hand.sort((a, b) => a.compareTo(b))
                    if (!actionIsKan) {
                        this.whoseTurn = (this.whoseTurn + 1) % 4
                    }
                    // 一次出牌结束
                }
                // 一局游戏结束
                roundResult.ryuu = true
                return roundResult
            })()

            if (roundResult.error) {
                return
            }

            if (this.gameProcess.wind == Wind.South && this.gameProcess.turn == 4 && this.players.filter((player) => player.point >= 30000).length > 0) {
                if (roundResult.ryuu) {
                    const message = this.roundResultLiu()
                    this.sendMessage(message)
                }
                return
            }
            if (roundResult.ryuu) {
                const message = this.roundResultLiu()
                this.sendMessage(message)
                if (isTenWithoutGot(this.players.filter((player) => player.seat == Wind.East)[0].hand)) {
                    this.gameProcess.action++
                } else {
                    this.moveWind()
                }
            } else if (!roundResult.renchann) {
                this.moveWind()
            } else {
                this.gameProcess.action++
            }
        }
    }
}
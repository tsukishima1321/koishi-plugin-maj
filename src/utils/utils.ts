import { Wind as _Wind, Tile, TileType } from 'mahjong-utils'

export const shuffle = (arr: Array<any>): Array<any> => {
    let length = arr.length;
    for (let i = length - 1; i > 0; i--) {
        let randomIndex = Math.floor((Math.random() * i));
        [arr[i], arr[randomIndex]] = [arr[randomIndex], arr[i]];
    }
    return arr;
}

export const tileToUnicode = (tile: Tile): string => {
    switch (tile.type) {
        case TileType.M: return String.fromCodePoint(0x1f007 + tile.num - 1)
        case TileType.S: return String.fromCodePoint(0x1f010 + tile.num - 1)
        case TileType.P: return String.fromCodePoint(0x1f019 + tile.num - 1)
        case TileType.Z: return String.fromCodePoint(0x1f000 + tile.num - 1)
    }
}

export class Wind {
    _Wind: _Wind
    constructor(wind: _Wind) {
        this._Wind = wind
    }
    public ToPrimitive(): _Wind {
        return this._Wind
    }
    public toString(): string {
        switch (this._Wind) {
            case _Wind.East: return '东'
            case _Wind.South: return '南'
            case _Wind.West: return '西'
            case _Wind.North: return '北'
        }
    }
    public next(): Wind {
        switch (this._Wind) {
            case _Wind.East: return Wind.South
            case _Wind.South: return Wind.West
            case _Wind.West: return Wind.North
            case _Wind.North: return Wind.East
        }
    }
    public static East = new Wind(_Wind.East)
    public static South = new Wind(_Wind.South)
    public static West = new Wind(_Wind.West)
    public static North = new Wind(_Wind.North)
}
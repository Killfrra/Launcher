import sha1 from 'simple-sha1'
import path from 'path'

export enum TeamID {
    SPEC = 0,
    BLUE = 1,
    PURP = 2
}

export const TID2str = [ 'spectators', 'blue team', 'red team' ]

export const WS_PORT = 8080
export const DHT_PORT = 20000
export const DHT_REANNOUNCE_INTERVAL = 15 * 60 * 1000
export const INFO_HASH = sha1.sync('nonexistent')
export const GAMESERVER_DIR = path.resolve('../branches/indev/GameServerConsole/bin/Debug/net6.0')
export const GAMESERVER_EXE = 'GameServerConsole' //.exe
export const GAMESERVER_PORT = 5119

const verbose = process.argv[2] === '-v'
export class debug {
    static log(...args: any[]){
        if(verbose){
            console.log('LOG:', ...args)
        }
    }
    static error(...args: any[]){
        if(verbose){
            console.log('ERROR:', ...args)
        }
    }
}

function groupBy<T, K>(array: Iterable<T>, value: (item: T) => K){
    let ret = new Map<K, T[]>()
    for(let item of array){
        let k = value(item)
        let group = ret.get(k)
        if(!group){
            ret.set(k, group = [])
        }
        group.push(item)
    }
    return ret
}

export function makeID(len: number) {
    let res = ''
    let alph = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for(let i = 0; i < len; i++){
        res += alph.charAt(Math.floor(Math.random() * alph.length))
    }
    return res
}

export const champions = [
    'Aatrox', 'Akali', 'Anivia', 'Annie', 'Ashe',
    'Blitzcrank',
    'Caitlyn', 'Corki',
    'Darius', 'Diana',
    'Evelynn', 'Ezreal',
    'Gangplank', 'Garen', 'Gragas', 'Graves',
    'Heimerdinger',
    'Kalista', 'Karthus', 'Kassadin', 'Katarina', 'Kayle', 'Khazix',
    'Leblanc', 'LeeSin', 'Leona', 'Lucian', 'Lulu', 'Lux',
    'Maokai', 'MasterYi', 'Mordekaiser',
    'Nasus', 'Nidalee', 'Nunu',
    'Olaf',
    'Shaco', 'Sion', 'Sivir',
    'Talon', 'Taric', 'Teemo', 'Tristana',
    'Veigar',
    'XinZhao',
    'Yasuo',
    'Zed',
]
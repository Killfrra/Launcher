import sha1 from 'simple-sha1'
import path from 'path'
import os from 'os'

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
const GAMESERVER_RELATIVE_DIR = '../branches/indev' + '/' + 'GameServerConsole/bin/Debug/net6.0'

export let GAMESERVER_EXE = 'GameServerConsole'
export let CONTENT_PATH = '../../../../Content'
if(os.platform() === 'win32'){
    GAMESERVER_EXE = 'GameServerConsole.exe'
    CONTENT_PATH = '../../../../../Content' //TODO: check if it is necessary
}

export const GAMESERVER_DIR = path.resolve(GAMESERVER_RELATIVE_DIR)
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

export function makeID() {
    return Math.floor(Math.random() * (Math.pow(2,32) - 1)).toString(36)
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

// https://github.com/MatthewBarker/hash-string/blob/master/source/hash-string.js
// based on Daniel J. Bernstein's 'times 33' hash algorithm.
export function hash(text: string) {
    var hash = 5381, index = text.length;
    while (index) {
        hash = (hash * 33) ^ text.charCodeAt(--index);
    }
    return (hash >>> 0).toString(36);
}
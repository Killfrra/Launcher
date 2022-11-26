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
export const DHT_LOOKUP_INTERVAL = 15 * 60 * 1000
export const INFO_HASH = sha1.sync('nonexistent')

const CLIENT_RELATIVE_DIR = 'client'
export const CLIENT_DIR = path.resolve(CLIENT_RELATIVE_DIR)
//  export const CLIENT_BIN_DIR = 'RADS/solutions/lol_game_client_sln/releases/0.0.1.68/deploy'
    export const CLIENT_BIN_DIR = ''
export const CLIENT_EXE = 'League of Legends.exe'

const WINEPREFIX_RELATIVE_DIR = 'prefix'
export const WINEPREFIX_DIR = path.resolve(WINEPREFIX_RELATIVE_DIR)

const SERVER_RELATIVE_DIR = 'server'
export const SERVER_DIR = path.resolve(SERVER_RELATIVE_DIR)
export const SERVER_BIN_DIR = 'GameServerConsole/bin/Debug/net6.0'
export const SERVER_CFG = 'Settings/GameInfo.json'
export const SERVER_PORT = 5119

export const CACHE_DIR = 'cache'
export const CLIENT_ARCHIVE = CACHE_DIR + '/' + 'GameClient.7z'
export const CLIENT_ARCHIVE_HASH = ''
export const SERVER_ARCHIVE = CACHE_DIR + '/' + 'GameServer.7z'
export const SERVER_ARCHIVE_HASH = ''

export const PLATFORM = os.platform()
export let CLIENT_RUNNER = '/usr/bin/wine'
export let SERVER_EXE = 'GameServerConsole'
export let SERVER_CONTENT_PATH = '../../../../Content'
if(PLATFORM === 'win32'){
    SERVER_EXE = 'GameServerConsole.exe'
    //SERVER_CONTENT_PATH = '../../../../../Content'
    CLIENT_RUNNER = ''
}

const verbose = process.argv.slice(2).includes('-v')
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
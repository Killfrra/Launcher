import prompts from 'prompts'
import LocalClient from './client'
import LocalServer from './server'
import { debug, makeID } from './shared'
import * as sh from './shared'
//@ts-ignore
import DHT from 'bittorrent-dht'
import { promises as fs } from 'fs'
import { constants as fs_constants } from 'fs'

type u = undefined

let clientName: string = makeID()
let serverName: string = makeID()
let roomName: string = makeID()

class DHTFake
{
    on(evt: string, cb?: (peer: any, infoHash: any, from: any) => void){}
    lookup(hash: string, cb?: () => void){}
    listen(port: number, cb?: () => void){}
    announce(hash: string, port: number, cb?: () => void){}
    destroy(cb?: () => void){}
}

function newDHT()
{
    return new DHTFake()
}

let perm2str = {
    [fs_constants.F_OK]: 'found',
    [fs_constants.R_OK]: 'read',
    [fs_constants.W_OK]: 'written',
    [fs_constants.X_OK]: 'executed',
}
async function checkFile(desc: string, mode: number, file: string)
{
    try
    {
        await fs.access(file, mode)
        return true
    }
    catch(e)
    {
        console.log(`The ${desc} could not be ${perm2str[mode]}`)
        debug.log(e)
        return false
    }
}
async function checkFileHash(file: string, hash: string)
{
    return false    
}
main()
async function main()
{
    let mode = fs_constants.X_OK
    if(sh.LEAGUE_RUNNER)
    {
        if(!(await checkFile('runner exe', mode, sh.LEAGUE_RUNNER)))
        {
            return
        }
        mode = fs_constants.R_OK
    }
    if(!(await checkFile('game client exe', mode, sh.LEAGUE_DIR + '/' + sh.LEAGUE_EXE)))
    {
        if(await checkFile('game client archive', mode, sh.LEAGUE_ARCHIVE))
        {
            let matches = await checkFileHash(sh.LEAGUE_ARCHIVE, sh.LEAGUE_ARCHIVE_HASH)
            
        }
        let action: u|string = (await prompts({
            type: 'select', name: 'name',
            message: 'Select action',
            choices: [
                { title: 'Specify the client folder', value: 'set_folder' },
                { title: 'Specify the client archive', value: 'set_archive' },
                { title: 'Download the client archive', value: 'download' },
                { title: 'Use corrupted client archive file', value: 'use_corrupted' }
            ]
        })).name
        if(action === undefined)
        {
            return
        }
    }
    if(!(await checkFile('game server exe', fs_constants.X_OK, sh.GAMESERVER_DIR + '/' + sh.GAMESERVER_EXE)))
    {

    }
    if(!(await checkFile('game server cfg', fs_constants.W_OK, sh.GAMESERVER_DIR + '/' + sh.GAMESERVER_CFG)))
    {
        return
    }

    let dht: u|DHT|DHTFake
    let localClient: u|LocalClient
    let localServer: u|LocalServer
    while(true)
    {
        let new_clientName: u|string = (await prompts({
            type: 'text', name: 'name',
            message: 'Enter player name',
            initial: clientName
        })).name
        if(new_clientName === undefined)
        {
            break
        }
        clientName = new_clientName
        while(true)
        {
            let action: u|string = (await prompts({
                type: 'select', name: 'name',
                message: 'Select action',
                choices: [
                    { title: 'Make custom game', value: 'make' },
                    { title: 'Join custom game', value: 'join' },
                ]
            })).name
            if(action === undefined)
            {
                break;
            }
            else if(action === 'make')
            {
                let new_serverName: u|string = (await prompts({
                    type: 'text', name: 'name',
                    message: 'Enter server name',
                    initial: serverName
                })).name
                if(new_serverName === undefined)
                {
                    continue;
                }
                serverName = new_serverName
                let new_roomName: u|string = (await prompts({
                    type: 'text', name: 'name',
                    message: 'Enter room name',
                    initial: roomName
                })).name
                if(new_roomName === undefined)
                {
                    continue;
                }
                roomName = new_roomName

                dht = dht || newDHT()
                localClient = localClient?.setName(clientName) || new LocalClient(dht, clientName)
                localServer = localServer?.setName(serverName) || new LocalServer(dht, serverName)
                let client = await localServer.addLocalClient(localClient)
                let server = await localClient.addLocalServer(localServer)
                client.caller = server
                server.caller = client

                let roomID = localServer.addRoom(roomName, client)
                localServer.startAnounce() //TODO: move to ctr?

                await localClient.screenRoom(roomID, server)
            }
            else if(action === 'join')
            {
                dht = dht || newDHT()
                localClient = localClient?.setName(clientName) || new LocalClient(dht, clientName)
                localClient.startLookup() //TODO: move to screenRooms?
                await localClient.screenRooms()
            }
        }
    }
    localClient?.destroy()
    localServer?.destroy()
    dht?.destroy()
}
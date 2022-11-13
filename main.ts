import prompts from 'prompts'
import LocalClient from './client'
import LocalServer from './server'
import { debug, makeID } from './shared'
//@ts-ignore
//import DHT from 'bittorrent-dht'

type u = undefined

let clientName: string = makeID()
let serverName: string = makeID()
let roomName: string = makeID()

///*
class DHT
{
    on(evt: string, cb?: (peer: any, infoHash: any, from: any) => void){}
    lookup(hash: string, cb?: () => void){}
    listen(port: number, cb?: () => void){}
    announce(hash: string, port: number, cb?: () => void){}
    destroy(cb?: () => void){}
}
//*/

main()
async function main()
{
    let dht: u|DHT
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

                dht = dht || new DHT()
                localClient = localClient?.setName(clientName) || new LocalClient(dht, clientName)
                localServer = localServer?.setName(serverName) || new LocalServer(dht, serverName)
                let client = await localServer.addLocalClient(localClient)
                let server = await localClient.addLocalServer(localServer)
                client.caller = server
                server.caller = client

                let roomID = localServer.addRoom(roomName, client)

                await localClient.screenRoom(roomID, server)
            }
            else if(action === 'join')
            {
                dht = dht || new DHT()
                localClient = localClient?.setName(clientName) || new LocalClient(dht, clientName)
                await localClient.screenRooms()
            }
        }
    }
    localClient?.destroy()
    localServer?.destroy()
    dht?.destroy()
}
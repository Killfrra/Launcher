import prompts from 'prompts'
//@ts-ignore
import DHT from 'bittorrent-dht'
import Server from './server'
import Client from './client'
import * as sh from './shared'
import { debug, makeID } from './shared'

async function main(){

    /*
    const dht = {
        on: (evt: string, cb: (peer: any, infoHash: any, from: any) => void) => {},
        lookup: (hash: string, cb: () => void) => {},
        listen: (port: number, cb: () => void) => {},
        announce: (hash: string, port: number, cb: () => void) => {},
    }
    //*/const dht = new DHT()

    dht.listen(sh.DHT_PORT, () => {
        debug.log('DHT is now listening on', sh.DHT_PORT)
    })

    let clientName: string = (await prompts({
        type: 'text', name: 'name',
        message: 'Enter player name',
        initial: makeID()
    })).name

    let { action } = await prompts({
        name: 'action',
        message: 'Select action',
        type: 'select',
        choices: [
            { title: 'Make custom game', value: 'make' },
            { title: 'Join custom game', value: 'join' },
        ]
    })

    if (action === 'make') {
        /*
        let serverName: string = (await prompts({
            type: 'text', name: 'name',
            message: 'Enter server name',
            initial: makeID(8)
        })).name
        //*/let serverName = 'undefined'
        let server = new Server(dht, serverName)
        let client = new Client(dht, clientName)
        let otherClient: { other?: any } = {} //TODO: X
        let otherServer: { other?: any } = {} //TODO: X
        let remoteClient = otherClient.other = await server.addLocalClient(client, otherServer)
        let remoteServer = otherServer.other = await client.addLocalServer(server, otherClient)

        let roomName: string = (await prompts({
            type: 'text', name: 'name',
            message: 'Enter room name',
            initial: makeID()
        })).name
        let roomID = await server.addRoom(roomName, remoteClient);

        await client.joinRoom(roomID!, remoteServer)

    } else if(action === 'join') {
        let client = new Client(dht, clientName)
        await client.lookup()
    }

}

main()
import prompts from 'prompts'
//@ts-ignore
import DHT from 'bittorrent-dht'
import Server from './server'
import Client from './client'
import * as sh from './shared'
import { local } from './remote'

const dht = new DHT()
dht.listen(sh.DHT_PORT, () => {
    console.log('DHT is now listening on', sh.DHT_PORT)
})

let { action } = await prompts({
    name: 'action',
    message: 'Select action',
    type: 'select',
    choices: [
        { title: 'Create custom game', value: 'create' },
        { title: 'Join   custom game', value: 'join' },
    ]
})

let clientName: string = (await prompts({
    type: 'text', name: 'name',
    message: 'Enter player name',
    initial: 'TEST CLIENT'
})).name

if (action === 'create') {

    let serverName: string = (await prompts({
        type: 'text', name: 'name',
        message: 'Enter server name',
        initial: 'TEST SERVER'
    })).name
    let server = new Server(dht, serverName)
    let client = new Client(dht, clientName)

    let roomName: string = (await prompts({
        type: 'text', name: 'name',
        message: 'Enter room name',
        initial: 'TEST ROOM'
    })).name
    let roomID = await server.addRoom(roomName);

    let remoteClient = await server.addLocalClient(client)
    let remoteServer = await client.addLocalServer(server)
    await client.joinRoom(roomID, remoteServer)
    

} else if(action === 'join') {
    let client = new Client(dht, clientName)
    await client.lookup()
}
import prompts from 'prompts';
import Server from './server'
import Client from './client'

let { action } = await prompts({
    name: 'action',
    message: 'Select action',
    type: 'select',
    choices: [
        { title: 'Create custom game', value: 'create' },
        { title: 'Join   custom game', value: 'join' },
    ]
})

if (action === 'create') {
    let server = new Server()
    server.main()
} else if(action === 'join') {
    let client = new Client()
    client.main()
}
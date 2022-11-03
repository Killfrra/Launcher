import prompts from 'prompts';
/*
import DHT from 'bittorrent-dht';
import sha1 from 'simple-sha1';

const dht = new DHT()

dht.listen(20000, function () {
    console.log('now listening')
})

dht.on('peer', function (peer, infoHash, from) {
    console.log('found potential peer ' + peer.host + ':' + peer.port + ' through ' + from.address + ':' + from.port)
})

const infoHash = sha1.sync('nonexistent')
//const infoHash = 'e3811b9539cacff680e418124272177c47477157'
dht.announce(infoHash, () => {
    dht.lookup(infoHash)
})
*/
let servers = [];
let serverPrompt;
async function main() {
    await prompts({
        name: 'action',
        message: 'Select action',
        type: 'select',
        choices: [
            { title: 'Create custom game', value: 'create' },
            { title: 'Join   custom game', value: 'join' },
        ]
    });
    /*
    await prompts(({
        type: 'select',
        name: 'server',
        message: 'Select server',
        choices: servers,
        onRender(){
            if(this.firstRender){
                //console.log('Render', this);
                this.choices = servers
                serverPrompt = this
            }
        }
    }) as any)
    */
}
main();

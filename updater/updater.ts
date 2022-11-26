import fs from 'fs/promises'
import { promisify } from 'util'
import parseTorrent from 'parse-torrent'
import MutableWebTorrent from '../mutable-webtorrent'

type u = undefined

main()
async function main()
{
    let action = process.argv[2]
    let torrent = await promisify(parseTorrent.remote).call(parseTorrent, 'archive.torrent')

    if(!torrent)
    {
        console.log('undefined torrent')
        return
    }

    let first = 1669470475000
    let twoHours = 1000 * 60 * 60 * 2
    let sequence = (torrent.created?.getTime() ?? first) - first
    let infoHash = torrent.infoHash

    console.log(sequence, infoHash)

    let mwt = new MutableWebTorrent()
    let publicKey = await fs.readFile('public_key.txt', 'utf8')
    if(action === 'publish')
    {
        let secretKey = await fs.readFile('secret_key.txt', 'utf8')
        await promisify(mwt.publish).call(mwt, publicKey, secretKey, infoHash, { sequence })
        //TODO: log
    }
    else
    {
        let {
            infoHash: dhtInfoHash,
            sequence: dhtSequence
        } = (await promisify(mwt.resolve).call(mwt, publicKey))!
        
        if(sequence > dhtSequence)
        {
            //TODO: publish
        }
        else if(sequence < dhtSequence)
        {
            //TODO: consume
        }
    }
    //TODO: seed
    //TODO: reannonce
}
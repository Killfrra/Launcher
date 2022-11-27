import fs from 'fs/promises'
import { promisify } from 'util'
import parseTorrent from 'parse-torrent'
import MutableWebTorrent from '../mutable-webtorrent'

const ZSYNC_PORT = 8888
const ARCHIVE_FOLDER = 'archive'
const ARCHIVE_ZSYNC = 'archive.tar.zsync'
const ARCHIVE_GZ = 'archive.tar.gz'

type LastVersionFile = {
    sequence: number
    infoHash: string
    signature: string
}

main()
async function main()
{
    let action = process.argv[2]

    //TODO: defaults
    let lastVersion: LastVersionFile = {
        sequence: 0,
        infoHash: '',
        signature: '',
    }
    try
    {
        lastVersion = JSON.parse(await fs.readFile('last_version.json', 'utf8'))
    }
    catch(e)
    {
        console.log(e)
    }

    let sequence = lastVersion.sequence
    let infoHash = lastVersion.infoHash
    let signature = lastVersion.signature

    let mwt = new MutableWebTorrent()
    let mwt_publish = promisify(mwt.publish).bind(mwt)
    let mwt_resolve = promisify(mwt.resolve).bind(mwt)

    let publicKey = await fs.readFile('public_key.txt', 'utf8')
    if(action === 'publish')
    {
        let parseTorrent_remote = promisify(parseTorrent.remote).bind(parseTorrent)
        let torrent = await parseTorrent_remote('archive.torrent')
        if(!torrent)
        {
            console.log('undefined torrent')
            return
        }
        let first = 1669470475000
        let twoHours = 1000 * 60 * 60 * 2
        sequence = (torrent.created?.getTime() ?? first) - first
        infoHash = torrent.infoHash
        
        console.log('Torrent was read:', sequence, infoHash)

        let secretKey = await fs.readFile('secret_key.txt', 'utf8')
        signature = (await mwt_publish(publicKey, infoHash, sequence, { secretKey }))!.signature
        lastVersion = { sequence, infoHash, signature }
        await fs.writeFile('last_version.json', JSON.stringify(lastVersion), 'utf8')

        console.log('Torrent successfully published')
    }
    else
    {
        let {
            infoHash: dhtInfoHash,
            sequence: dhtSequence
        } = (await mwt_resolve(publicKey))!

        if(sequence > dhtSequence)
        {
            await mwt_publish(publicKey, infoHash, sequence, { signature })
        }
        else if(sequence < dhtSequence)
        {
            sequence = dhtSequence
            infoHash = dhtInfoHash.toString('hex')
            
            let hasArchive = false
            try
            {
                await fs.access(`${ARCHIVE_FOLDER}/${ARCHIVE_GZ}`, fs.constants.R_OK)
                hasArchive = true
            }
            catch(e)
            {
                console.log(e)
            }
            if(hasArchive)
            {
                let torrent = mwt.add(infoHash, { path: ARCHIVE_FOLDER })
                torrent.on('metadata', () => {
                    torrent.deselect(0, torrent.pieces.length - 1, 0)
                    let zsyncFile = torrent.files.find(f => f.name === ARCHIVE_ZSYNC)
                    if(zsyncFile)
                    {
                        zsyncFile.select()
                        zsyncFile.on('done', () => {
                            console.log(`${ARCHIVE_ZSYNC} is downloaded`)
                            let server = torrent.createServer()
                                server.listen(ZSYNC_PORT)
                        })
                    }
                    else
                    {
                        console.log('Could not find zsync file in torrent')
                    }
                })
                
            }
        }
    }
    //TODO: seed
    //TODO: reannonce
}
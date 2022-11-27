import fs from 'fs/promises'
import { constants as fs_constants } from 'fs'
import { promisify } from 'util'
import parseTorrent from 'parse-torrent'
import MutableWebTorrent from '../mutable-webtorrent'
import { spawn } from 'child_process'
import path from 'path'

const ZSYNC_PORT = 8888
const ARCHIVE_DIR = 'archive'
const ARCHIVE_ZSYNC = 'archive.tar.zsync'
const ARCHIVE_GZ = 'archive.tar.gz'
const ZSYNC_EXE = '/usr/bin/zsync'

type LastVersionFile = {
    sequence: number
    infoHash: string
    signature: string
}

let action = process.argv[2]

//TODO: defaults
let lastVersion: LastVersionFile = {
    sequence: 0,
    infoHash: '',
    signature: '',
}

let mwt = new MutableWebTorrent()
let mwt_publish = promisify(mwt.publish).bind(mwt)
let mwt_resolve = promisify(mwt.resolve).bind(mwt)

async function saveLastVersion(sequence: number, infoHash: string, signature: string)
{
    lastVersion = { sequence, infoHash, signature }
    await fs.writeFile('last_version.json', JSON.stringify(lastVersion), 'utf8')
}

main()
async function main()
{
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
        saveLastVersion(sequence, infoHash, signature)

        console.log('Torrent successfully published')
    }
    else
    {
        let {
            infoHash: dhtInfoHash,
            sequence: dhtSequence,
            signature: dhtSignature
        } = (await mwt_resolve(publicKey))!

        if(sequence > dhtSequence)
        {
            await mwt_publish(publicKey, infoHash, sequence, { signature })
        }
        else if(sequence < dhtSequence)
        {
            sequence = dhtSequence
            infoHash = dhtInfoHash.toString('hex')
            signature = dhtSignature.toString('hex')
            saveLastVersion(sequence, infoHash, signature)
            
            await download(lastVersion)
        }
    }
    //TODO: seed
    //TODO: reannonce
}

async function download({ sequence, infoHash, signature }: LastVersionFile)
{
    let hasArchive = false
    try
    {
        await fs.access(`${ARCHIVE_DIR}/${ARCHIVE_GZ}`, fs_constants.R_OK | fs_constants.W_OK)
        hasArchive = true
    }
    catch(e)
    {
        console.log(e)
    }
    if(hasArchive)
    {
        let torrent = mwt.add(infoHash, {
            path: ARCHIVE_DIR,
            skipVerify: true,
            strategy: 'rarest'
        })
        let torrent_rescanFiles = promisify((torrent as any).rescanFiles).bind(torrent)
        
        await new Promise((res, rej) => {
            torrent.once('metadata', res)
            torrent.once('error', rej)
        })

        let zsyncFile = torrent.files.find(f => f.name === ARCHIVE_ZSYNC)
        let gzFileIndex = torrent.files.findIndex(f => f.name === ARCHIVE_GZ)
        let gzFile = torrent.files[gzFileIndex]
        if(zsyncFile && gzFile)
        {
            torrent.deselect(0, torrent.pieces.length - 1, 0)
            zsyncFile.select()
            await torrent_rescanFiles()

            await new Promise((res, rej) => {
                zsyncFile!.once('done', res)
                torrent.once('error', rej)
            })

            console.log(`${ARCHIVE_ZSYNC} is downloaded`)
            let server = torrent.createServer()
                server.listen(ZSYNC_PORT)
            let zsync = spawn(ZSYNC_EXE, [
                '-u', `http://127.0.0.1:${ZSYNC_PORT}/${gzFileIndex}`,
                '-o', ARCHIVE_GZ,
                ARCHIVE_ZSYNC
            ], {
                cwd: path.resolve(ARCHIVE_DIR),
                stdio: 'inherit'
            })

            await new Promise((res, rej) => {
                zsync.on('exit', res)
                zsync.on('error', rej)
                torrent.once('error', rej)
            })

            server.close()
            torrent.select(0, torrent.pieces.length - 1, 0)
            await torrent_rescanFiles()
        }
        else
        {
            let file = (!zsyncFile && !gzFile) ?
                `${ARCHIVE_ZSYNC} and ${ARCHIVE_GZ}` :
                (!zsyncFile) ? ARCHIVE_ZSYNC :
                ARCHIVE_GZ
            console.log(`Could not find ${file} in torrent`)
        }
    }
}
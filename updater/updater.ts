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
const LASTVER_JSON = 'last_version.json'
const PUBKEY_TXT = 'public_key.txt'
const SECKEY_TXT = 'secret_key.txt'
const ARG3_TORRENT = 'archive.torrent'

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
    console.log(`Saving ${LASTVER_JSON}...`)
    lastVersion = { sequence, infoHash, signature }
    await fs.writeFile(LASTVER_JSON, JSON.stringify(lastVersion), 'utf8')
    console.log(`${LASTVER_JSON} saved`)
}

async function loadLastVersion()
{
    console.log(`Loading ${LASTVER_JSON}...`)
    lastVersion = JSON.parse(await fs.readFile(LASTVER_JSON, 'utf8'))
    console.log(`${LASTVER_JSON} loaded:`, lastVersion)
}

main()
async function main()
{
    try
    {
        await loadLastVersion()
    }
    catch(e)
    {
        console.log(e)
    }

    let sequence = lastVersion.sequence
    let infoHash = lastVersion.infoHash
    let signature = lastVersion.signature

    console.log(`Loading ${PUBKEY_TXT}...`)
    let publicKey = await fs.readFile(PUBKEY_TXT, 'utf8')
    console.log(`${PUBKEY_TXT} loaded`)
    if(action === 'publish')
    {
        let parseTorrent_remote = promisify(parseTorrent.remote).bind(parseTorrent)
        console.log(`Parsing ${ARG3_TORRENT}...`)
        let torrent = await parseTorrent_remote(ARG3_TORRENT)
        if(torrent)
        {
            console.log(`${ARG3_TORRENT} parsed`)
        }
        else
        {
            console.log(`Unable to parse ${ARG3_TORRENT}`)
            return
        }
        let first = 1669470475000
        let twoHours = 1000 * 60 * 60 * 2
        sequence = (torrent.created?.getTime() ?? first) - first
        infoHash = torrent.infoHash

        console.log(sequence, infoHash)

        console.log(`Loading ${SECKEY_TXT}...`)
        let secretKey = await fs.readFile(SECKEY_TXT, 'utf8')
        console.log(`${SECKEY_TXT} loaded`)

        console.log('Publishing...')
        signature = (await mwt_publish(publicKey, infoHash, sequence, { secretKey }))!.signature
        console.log('Published')

        await saveLastVersion(sequence, infoHash, signature)
    }
    else
    {
        console.log('Resolving...')
        let {
            infoHash: dhtInfoHash,
            sequence: dhtSequence,
            signature: dhtSignature
        } = (await mwt_resolve(publicKey))!
        let dhtInfoHashString = dhtInfoHash.toString('hex')
        let dhtSignatureString = dhtSignature.toString('hex')
        console.log('Resolved:', dhtSequence, dhtInfoHashString, dhtSignatureString)

        if(sequence > dhtSequence)
        {
            console.log('Publishing...')
            await mwt_publish(publicKey, infoHash, sequence, { signature })
            console.log('Published')
        }
        else if(sequence < dhtSequence)
        {
            sequence = dhtSequence
            infoHash = dhtInfoHashString
            signature = dhtSignatureString
            await saveLastVersion(sequence, infoHash, signature)
            
            console.log('Downloading...')
            await download(lastVersion)
            console.log('Downloaded')
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
        let archive = `${ARCHIVE_DIR}/${ARCHIVE_GZ}`
        console.log(`Accessing ${archive}...`)
        await fs.access(archive, fs_constants.R_OK | fs_constants.W_OK)
        console.log(`${archive} is readable and writable`)
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
        
        console.log('Awaiting metadata...')
        await new Promise((res, rej) => {
            torrent.once('metadata', res)
            torrent.once('error', rej)
        })
        console.log('Metadata received')

        let zsyncFile = torrent.files.find(f => f.name === ARCHIVE_ZSYNC)
        let gzFileIndex = torrent.files.findIndex(f => f.name === ARCHIVE_GZ)
        let gzFile = torrent.files[gzFileIndex]
        if(zsyncFile && gzFile)
        {
            torrent.deselect(0, torrent.pieces.length - 1, 0)
            zsyncFile.select()

            console.log('Scanning files...')
            /*await*/ torrent_rescanFiles()
            console.log('Files scanned')

            console.log(`Downloading ${ARCHIVE_ZSYNC}...`)
            await new Promise((res, rej) => {
                zsyncFile!.once('done', res)
                torrent.once('error', rej)
            })
            console.log(`${ARCHIVE_ZSYNC} downloaded`)

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

            console.log(`Waiting for ${ZSYNC_EXE} to exit...`)
            await new Promise((res, rej) => {
                zsync.on('exit', res)
                zsync.on('error', rej)
                torrent.once('error', rej)
            })
            console.log(`${ZSYNC_EXE} exited`)

            server.close()
            torrent.select(0, torrent.pieces.length - 1, 0)

            console.log('Scanning files...')
            await torrent_rescanFiles()
            console.log('Files scanned')

            console.log(`${ARCHIVE_GZ} progress:`, gzFile.progress)
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
    else
    {
        let torrent = mwt.add(infoHash, {
            path: ARCHIVE_DIR,
            skipVerify: false,
            strategy: 'rarest'
        })
        console.log(`Downloading the entire torrent...`)
        await new Promise((res, rej) => {
            torrent.once('done', res)
            torrent.once('error', rej)
        })
        console.log(`The entire torrent downloaded`)
    }
}
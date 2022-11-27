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
let sequence = 0
let infoHash = ''
let signature = ''
let publicKey: string

function hasVersion()
{
    return sequence && infoHash && signature
}

let mwt = new MutableWebTorrent()
let mwt_publish = def(promisify(mwt.publish)).bind(mwt)
let mwt_resolve = def(promisify(mwt.resolve)).bind(mwt)
let mwt_destroy = def(promisify(mwt.destroy)).bind(mwt)

async function saveLastVersion()
{
    console.log(`Saving ${LASTVER_JSON}...`)
    let lastVersion = { sequence, infoHash, signature }
    await fs.writeFile(LASTVER_JSON, JSON.stringify(lastVersion), 'utf8')
    console.log(`${LASTVER_JSON} saved`)
}

async function loadLastVersion()
{
    console.log(`Loading ${LASTVER_JSON}...`)
    let lastVersion = JSON.parse(await fs.readFile(LASTVER_JSON, 'utf8'))
    sequence = lastVersion.sequence
    infoHash = lastVersion.infoHash
    signature = lastVersion.signature
    console.log(`${LASTVER_JSON} loaded:`, lastVersion)
}

type NonUndefined<T> = T extends undefined ? never : T;
type ReturnsNonUndefinedPromise<FUNC> =
    FUNC extends (...args: any) => Promise<infer RET> ?
    (...args: Parameters<FUNC>) => Promise<NonUndefined<RET>>
    : FUNC

function def<FUNC>(f: FUNC)
{
    return f as ReturnsNonUndefinedPromise<FUNC>
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

    console.log(`Loading ${PUBKEY_TXT}...`)
    publicKey = await fs.readFile(PUBKEY_TXT, 'utf8')
    console.log(`${PUBKEY_TXT} loaded`)
    if(action === 'publish')
    {
        let parseTorrent_remote = def(promisify(parseTorrent.remote)).bind(parseTorrent)
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
        console.log('Published:', signature)

        await saveLastVersion()
    }
    else
    {
        console.log('Resolving...')
        let resolved
        try
        {
            resolved = await mwt_resolve(publicKey)
        }
        catch(e)
        {
            console.log(e)
        }

        if(resolved)
        {
            let dhtSequence = resolved.sequence
            let dhtInfoHashString = resolved.infoHash.toString('hex')
            let dhtSignatureString = resolved.signature.toString('hex')
            console.log('Resolved:', dhtSequence, dhtInfoHashString, dhtSignatureString)

            if(hasVersion() && sequence > dhtSequence)
            {
                await republish()
            }
            else if(!hasVersion() || sequence < dhtSequence)
            {
                sequence = dhtSequence
                infoHash = dhtInfoHashString
                signature = dhtSignatureString
                await saveLastVersion()
                
                await downloadDifferentVersion()
            }
        }
        else
        {
            console.log('Unable to resolve')
            if(hasVersion())
            {
                await republish()
            }
            else
            {
                console.log('Nothing to republish')
                await mwt_destroy()
                return
            }
        }
    }
    if(mwt.torrents.length === 0)
    {
        //TODO: Verify only size and modification date
        await download()
    }
    //TODO: reannonce and recheck
}

async function republish()
{
    console.log('Publishing...')
    await mwt_publish(publicKey, infoHash, sequence, { signature })
    console.log('Published')
}

async function downloadDifferentVersion()
{
    console.log('Downloading...')

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
        await downloadWithZSync()
    }
    else
    {
        await download()
    }
    console.log('Downloaded')
}

async function download()
{
    let torrent = mwt.add(infoHash, {
        path: ARCHIVE_DIR,
        skipVerify: false,
        strategy: 'rarest'
    })
    
    //TODO: fix hang by saving and loading torrent file
    console.log(`Downloading the entire torrent...`)
    
    //TODO: await metadata + check gzFile existence
    //TODO: throw errors in download*
    //TODO: catch errors and destroy WT client
    
    await new Promise((res, rej) => {
        torrent.once('done', res)
        torrent.once('error', rej)
    })
    console.log(`The entire torrent downloaded`)    
}

async function downloadWithZSync()
{
    let torrent = mwt.add(infoHash, {
        path: ARCHIVE_DIR,
        skipVerify: true,
        strategy: 'rarest'
    })
    let torrent_rescanFiles = def(promisify((torrent as any).rescanFiles)).bind(torrent)
    
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
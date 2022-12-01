import fs from 'fs/promises'
import { promisify } from 'util'
//@ts-ignore
import tgz from 'targz'
const tgz_compress = promisify(tgz.compress).bind(tgz)
const tgz_decompress = promisify(tgz.decompress).bind(tgz)
import createTorrentWithCallback from 'create-torrent'
const createTorrent = promisify(createTorrentWithCallback) as (input: string) => Promise<Buffer>
import parseTorrent from 'parse-torrent'

const MODS_LIST = './mods.json'
const MANAGED_DIR = './managed'
const MANAGED_TREE = './managed_tree.json'
const CACHE_PACKED_DIR = './cache/packed'
const CACHE_PACKED_TREE = './cache_packed_tree.json'
const CACHE_UNPACKED_DIR = './cache/unpacked'
const CACHE_UNPACKED_TREE = './cache_unpacked_tree.json'
const CACHE_TORRENTS_DIR = './cache/torrents'
const CACHE_TORRENTS_TREE = './cache_torrents_tree.json'

type u = undefined

class File
{
    mtime: number
    source?: string

    size: number
    hash?: string    
    constructor(size: number, mtime: number, hash?: string)
    {
        this.size = size
        this.mtime = mtime
        this.hash = hash
    }
}
class Dir
{
    mtime: number
    source?: string

    entries: Entries = {}
    constructor(mtime: number)
    {
        this.mtime = mtime
    }
}
type Entry = File | Dir
type Entries = {
    [name: string]: u|Entry
}

async function rescan(basepath: string = '.', base?: Entry)
{
    let stats = await fs.stat(basepath)
    
    if (stats.isDirectory())
    {
        if(base && base instanceof Dir)
        {
            if(stats.mtimeMs === base.mtime)
            {
                return base
            }
        }
        else
        {
            base = undefined
        }

        let dir = new Dir(stats.mtimeMs)
        let fsentries = await fs.readdir(basepath)
        for (let fsentry_name of fsentries)
        {
            let path = `${basepath}/${fsentry_name}`
            let corresp = base && base.entries[fsentry_name]
            let subentry = await rescan(path, corresp)
            if(subentry)
            {
                dir.entries[fsentry_name] = subentry
            }
        }
        return dir
    }
    else if(stats.isFile())
    {
        if(
            base && base instanceof File &&
            stats.mtimeMs === base.mtime && stats.size === base.size
        )
        {
            return base
        }
        return new File(stats.size, stats.mtimeMs)
    }
}

function add(a?: Entry, b?: Entry): Entry
{
    if(a instanceof Dir && b instanceof Dir)
    {
        let dir = new Dir(b.mtime)
        for(let entry_name of new Set(Object.keys(a.entries).concat(Object.keys(b.entries))))
        {
            dir.entries[entry_name] = add(a.entries[entry_name], b.entries[entry_name])
        }
        return dir
    }
    else
    {
        let b_or_a = b || a
        if(b_or_a)
        {
            return b_or_a
        }
        else
        {
            throw new Error()
        }
    }
}

type SimpleDir = { [name: string]: SimpleEntry }
type SimpleEntry = boolean | SimpleDir

function unite(ret: SimpleDir): SimpleEntry
{
    if(Object.values(ret).every(e => e === true))
    {
        return true
    }
    else if(Object.values(ret).every(e => e === false))
    {
        return false
    }
    else
    {
        return ret
    }
}

function diff_unchanged(a?: Entry, b?: Entry): SimpleEntry
{
    if(a instanceof Dir && b instanceof Dir)
    {
        let ret: SimpleDir = {}
        for(let entry_name of Object.keys(a.entries).concat(Object.keys(b.entries)))
        {
            ret[entry_name] = diff_unchanged(a.entries[entry_name], b.entries[entry_name])
        }
        return unite(ret)
    }
    else if(a instanceof File && b instanceof File)
    {
        return a.size === b.size && a.mtime === b.mtime
    }
    else
    {
        return !!(a && b)
    }
}

function diff_removed(a?: Entry, b?: Entry, unchanged?: SimpleEntry): SimpleEntry
{
    if(unchanged === true)
    {
        return false
    }
    else if(a instanceof Dir && b instanceof Dir)
    {
        let ret: SimpleDir = {}
        for(let entry_name of Object.keys(a.entries))
        {
            let u = (unchanged as SimpleDir)[entry_name]
            ret[entry_name] = diff_removed(a.entries[entry_name], b.entries[entry_name], u)
        }
        return unite(ret)
    }
    else
    {
        return !!b // overwriting
    }
}

function diff_added(a?: Entry, b?: Entry, unchanged?: SimpleEntry): SimpleEntry
{
    if(unchanged === true)
    {
        return false
    }
    else if(a instanceof Dir && b instanceof Dir)
    {
        let ret: SimpleDir = {}
        for(let entry_name of Object.keys(b.entries))
        {
            let u = (unchanged as SimpleDir)[entry_name]
            ret[entry_name] = diff_removed(a.entries[entry_name], b.entries[entry_name], u)
        }
        return unite(ret)
    }
    else
    {
        return true
    }
}

async function check_and_repair()
{
    //TODO: try-catches
    //TODO: reviver
    let cache_old = JSON.parse(await fs.readFile(CACHE_UNPACKED_TREE, 'utf8'))
    let cache_new = await rescan(CACHE_UNPACKED_DIR, cache_old)
    let cache_unc = diff_unchanged(cache_old, cache_new)
    if(cache_unc === true)
    {
        console.log('The cache has not changed, everything is fine')
    }
}

async function foreach_file(entry: Entry, path: string[] = [], cb: (entry: Entry, path: string[]) => any)
{
    if(entry instanceof Dir)
    {
        for(let [subentry_name, subentry] of Object.entries(entry.entries))
        {
            path.push(subentry_name)
            await foreach_file(subentry!, path, cb)
            path.pop()
        }
    }
    else
    {
        cb(entry, path)
    }
}

async function create_new_modpack()
{
    const CACHE_NEW_DIR = `${CACHE_PACKED_DIR}/new`
    const CACHE_NEW_ARCHIVE = `${CACHE_NEW_DIR}/archive.tar.gz`
    const CACHE_NEW_MODS = `${CACHE_NEW_DIR}/mods.json`

    let managed_json: u|string
    try
    {
        managed_json = await fs.readFile(MANAGED_TREE, 'utf8')
    }
    catch(e: any)
    {
        if(e.code !== 'ENOENT')
        {
            throw e
        }
    }
    let managed_old = undefined
    if(managed_json)
    {
        //TODO: reviver
        managed_old = JSON.parse(managed_json)
    }

    let managed_new: u|Entry
    try
    {
        managed_new = await rescan(MANAGED_DIR, managed_old)
    }
    catch(e: any)
    {
        if(e.code !== 'ENOENT')
        {
            throw e
        }
    }
    if(!managed_new)
    {
        console.log('The managed folder does not exist, there is nothing to assemble the pack from')
        return
    }

    let entries_to_pack: string[] = []
    foreach_file(managed_new, [], (entry, path) =>
    {
        if(entry.source === undefined)
        {
            entries_to_pack.push(path.join('/'))
        }
    })
    if(entries_to_pack.length === 0)
    {
        console.log('The files have not changed, there is nothing to assemble the pack from')
        return
    }

    await fs.mkdir(CACHE_NEW_DIR, { recursive: true })

    let mods_json: u|string
    try
    {
        await fs.readFile(MODS_LIST, 'utf8')
    }
    catch(e: any)
    {
        if(e.code !== 'ENOENT')
        {
            throw e
        }
    }
    let mods: string[] = []
    if(mods_json)
    {
        mods = JSON.parse(mods_json)
        await fs.writeFile(CACHE_NEW_MODS, mods_json, 'utf8')
    }

    await tgz_compress({
        src: MANAGED_DIR,
        dest: CACHE_NEW_ARCHIVE,
        tar: {
            entries: entries_to_pack
        }
    })

    let torrentBuffer = await createTorrent(CACHE_NEW_DIR)
    let torrent = parseTorrent(torrentBuffer)
    let infoHash = torrent.infoHash!

    await fs.mkdir(CACHE_TORRENTS_DIR, { recursive: true })
    await fs.writeFile(`${CACHE_TORRENTS_DIR}/${infoHash}.torrent`, torrentBuffer/*, 'binary'*/)
    
    await fs.mkdir(CACHE_PACKED_DIR, { recursive: true })
    await fs.rename(CACHE_NEW_DIR, `${CACHE_PACKED_DIR}/${infoHash}`)

    foreach_file(managed_new, [], (entry, path) =>
    {
        if(entry.source === undefined)
        {
            entry.source = infoHash
        }
    })

    mods.push(infoHash)
    mods_json = JSON.stringify(mods, null, 4)
    await fs.writeFile(MODS_LIST, mods_json, 'utf8')

    await fs.writeFile(MANAGED_TREE, JSON.stringify(managed_new, null, 4), 'utf8')

    console.log('The modpack is successfully created')
}

main()
async function main()
{
    let argv2 = process.argv[2]
    let argv3 = process.argv[3]
    if(argv2 === 'new' && (argv3 === 'pack' || argv3 === 'modpack'))
    {
        await create_new_modpack()
    }
    else if(argv2 === 'check' || argv2 === 'repair')
    {
        await check_and_repair()
    }
}
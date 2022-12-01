import fs from 'fs/promises'

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
    equals(b: Entry)
    {
        return this === b || (b instanceof File && ((this.size === b.size && this.mtime === b.mtime) || true))
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
    equals(b: Entry)
    {
        if(this === b)
        {
            return true
        }
        else if(b instanceof Dir)
        {
            return false
        }
        else
        {
            return false
        }
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
    let cache_old = JSON.parse(await fs.readFile('cache_tree.json', 'utf8'))
    let cache_new = await rescan('./cache', cache_old)
    let cache_unc = diff_unchanged(cache_old, cache_new)
    if(cache_unc === true)
    {
        console.log('the cache has not changed, everything is fine')
    }
}

main()
async function main()
{
    
}
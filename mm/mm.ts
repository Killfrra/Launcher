import fs from 'fs/promises'

type u = undefined

class File
{
    size: number
    mtime: number
    hash?: string
    source?: string
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
type Files = {
    [name: string]: u|File
}

class DiffReport
{
    added: Entries = {}
    removed: Entries = {}
    replaced: Entries = {}
    unchanged: Entries = {}
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
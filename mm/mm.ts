import fs from 'fs/promises'

type u = undefined

class File
{
    size: number
    mtime: number
    hash?: string
    source?: string
    constructor(size: number, mtime: number /*hash*/)
    {
        this.size = size
        this.mtime = mtime
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
}

// all files in    dir removed
// all files in fs dir added

async function rescan(basedir: Dir, wd: string, basepath: string = '.', report = new DiffReport())
{
    let fsentries = await fs.readdir(`${wd}/${basepath}`)
    for (let fsentry_name of fsentries)
    {
        let path = (basepath !== '.') ? `${basepath}/${fsentry_name}` : fsentry_name
        let corresp = basedir.entries[fsentry_name]
        let stats = await fs.stat(`${path}/${fsentry_name}`)
        if(corresp)
        {
            if (stats.isDirectory())
            {
                if(corresp instanceof Dir)
                {
                    if(stats.mtimeMs === corresp.mtime)
                    {
                        // skip
                    }
                    else
                    {
                        let dir = new Dir(stats.mtimeMs)
                        await rescan(dir, wd, path, report)
                    }
                }
                else
                {
                    report.removed[path] = corresp
                    let dir = new Dir(stats.mtimeMs)
                    report.added[path] = dir
                }
            }
            else if(stats.isFile())
            {
                if(corresp instanceof File)
                {
                    if(stats.mtimeMs === corresp.mtime && stats.size === corresp.size)
                    {
                        // skip
                    }
                    else
                    {
                        report.removed[path] = corresp
                        let file = new File(stats.size, stats.mtimeMs)
                        report.added[path] = file
                    }
                }
                else
                {
                    report.removed[path] = corresp
                    let file = new File(stats.size, stats.mtimeMs)
                    report.added[path] = file
                }
            }
        }
        else
        {
            if (stats.isDirectory())
            {
                let dir = new Dir(stats.mtimeMs)
                report.added[path] = dir
            }
            else if(stats.isFile())
            {
                let file = new File(stats.size, stats.mtimeMs)
                report.added[path] = file
            }
        }
    }
    for(let [entry_name, entry] of Object.entries(basedir.entries))
    {
        let path = (basepath !== '.') ? `${basepath}/${entry_name}` : entry_name
        if(!(entry_name in fsentries))
        {
            report.removed[path] = entry
        }
    }
}
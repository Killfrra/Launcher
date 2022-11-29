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
    static FromExisting(dir: Dir)
    {
        return new Dir(dir.mtime)
    }
    static FromStats(stats: { mtimeMs: number })
    {
        return new Dir(stats.mtimeMs)
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
    //replaced: Entries = {}
    unchanged: Entries = {}
}

async function rescan3(basedir?: Dir, basepath: string = '.')
{
    let stats = await fs.stat(basepath)

    console.assert(stats.isDirectory())
    
    let dir
    if(basedir && stats.mtimeMs === basedir.mtime)
    {
        return basedir
    }
    dir = Dir.FromStats(stats)

    let fsentries = await fs.readdir(basepath)
    for (let fsentry_name of fsentries)
    {
        let path = `${basepath}/${fsentry_name}`
        let stats = await fs.stat(path)

        let corresp = basedir?.entries[fsentry_name]
        if (stats.isDirectory())
        {
            let correspDir = corresp instanceof Dir ? corresp : undefined
            dir.entries[fsentry_name] = await rescan3(correspDir, path)
        }
        else if(stats.isFile())
        {
            if(
                corresp && corresp instanceof File &&
                stats.mtimeMs === corresp.mtime && stats.size === corresp.size
            )
            {
                dir.entries[fsentry_name] = corresp
            }
            else
            {
                dir.entries[fsentry_name] = File.FromStats(stats)
            }
        }
    }

    return dir
}

// all files in    dir removed
// all files in fs dir added
async function rescan2(basedir: Dir, basepath: string = '.')
{
    let report = new DiffReport()
    let fsentries = await fs.readdir(basepath)
    for(let [entry_name, entry] of Object.entries(basedir.entries))
    {
        let path = `${basepath}/${entry_name}`
        if(!(entry_name in fsentries))
        {
            report.removed[path] = entry
        }
    }
    for (let fsentry_name of fsentries)
    {
        let corresp = basedir.entries[fsentry_name]
        let path = `${basepath}/${fsentry_name}`
        let stats = await fs.stat(path)
        if(corresp)
        {
            if (stats.isDirectory())
            {
                if(corresp instanceof Dir)
                {
                    if(stats.mtimeMs === corresp.mtime)
                    {
                        report.unchanged[path] = corresp
                    }
                    else
                    {
                        let subreport = await rescan2(corresp, path)

                        if(Object.keys(corresp.entries).every(entry_name => `${path}/${entry_name}` in subreport.removed))
                        {
                            report.removed[path] = corresp
                        }
                        else
                        {
                            Object.assign(report.removed, subreport.removed)
                        }

                        let dir = new Dir(stats.mtimeMs)

                        if(
                            Object.keys(subreport.unchanged).length === 0 && 
                            Object.keys(subreport.added).length !== 0
                        )
                        {
                            report.added[path] = dir
                        }
                        else
                        {
                            Object.assign(report.unchanged, subreport.unchanged)
                            Object.assign(report.added, subreport.added)
                        }
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
                        report.unchanged[path] = corresp
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
    }
    return report
}

async function rescan1(basedir: Dir, wd: string, basepath: string = '.', report = new DiffReport())
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
                        await rescan1(dir, wd, path, report)
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
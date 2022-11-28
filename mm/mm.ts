import fs from 'fs/promises'

type u = undefined

class FSFile
{
    name: string
    size: number
    mtime: number
    hash?: string
    source?: string
    constructor(name: string, size: number, mtime: number)
    {
        this.name = name;
        this.size = size;
        this.mtime = mtime;
    }
}

class FSDir
{
    name: string
    mtime: number
    files: FSEntries = {}
    constructor(name: string, mtime: number)
    {
        this.name = name;
        this.mtime = mtime;
    }
}

type FSEntry = FSFile | FSDir
type FSEntries = {
    [name: string]: u|FSEntry
}

//TODO: gen diff report
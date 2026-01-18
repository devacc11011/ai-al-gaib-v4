import { cp, rm, mkdir } from 'fs/promises'
import { join } from 'path'

const source = join(process.cwd(), 'node_modules', 'monaco-editor', 'min', 'vs')
const dest = join(process.cwd(), 'src', 'renderer', 'public', 'monaco', 'vs')

await rm(dest, { recursive: true, force: true })
await mkdir(dest, { recursive: true })
await cp(source, dest, { recursive: true })

console.log(`Monaco assets copied to ${dest}`)

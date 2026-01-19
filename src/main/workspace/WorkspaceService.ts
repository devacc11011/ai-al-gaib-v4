import { promises as fs } from 'fs'
import { dirname, join, relative } from 'path'

export interface WorkspaceEntry {
  type: 'file' | 'dir'
  path: string
  name: string
}

const DEFAULT_IGNORE = new Set(['.git', 'node_modules', '.context', '.logs', 'dist', 'out', 'build'])

export class WorkspaceService {
  async listFiles(root: string, depth = 3): Promise<WorkspaceEntry[]> {
    const entries: WorkspaceEntry[] = []
    await this.walk(root, root, depth, entries)
    return entries
  }

  async readFile(root: string, target: string): Promise<string> {
    const filePath = join(root, target)
    return fs.readFile(filePath, 'utf-8')
  }

  async writeFile(root: string, target: string, contents: string): Promise<void> {
    const filePath = join(root, target)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, contents, 'utf-8')
  }

  private async walk(
    root: string,
    current: string,
    depth: number,
    entries: WorkspaceEntry[]
  ): Promise<void> {
    if (depth < 0) return
    const dirEntries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of dirEntries) {
      if (DEFAULT_IGNORE.has(entry.name)) continue
      const fullPath = join(current, entry.name)
      const relPath = relative(root, fullPath)
      if (entry.isDirectory()) {
        entries.push({ type: 'dir', path: relPath, name: entry.name })
        await this.walk(root, fullPath, depth - 1, entries)
      } else {
        entries.push({ type: 'file', path: relPath, name: entry.name })
      }
    }
  }
}

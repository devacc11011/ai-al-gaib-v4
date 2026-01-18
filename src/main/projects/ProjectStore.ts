import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

export interface Project {
  id: string
  name: string
  workspacePath: string
  createdAt: string
  updatedAt: string
}

interface ProjectIndex {
  projects: Project[]
}

export class ProjectStore {
  private indexPath: string

  constructor(baseDir: string) {
    this.indexPath = join(baseDir, 'projects.json')
  }

  async list(): Promise<Project[]> {
    const index = await this.loadIndex()
    return index.projects
  }

  async create(name: string, workspacePath: string): Promise<Project> {
    const now = new Date().toISOString()
    const project: Project = {
      id: `project-${randomUUID()}`,
      name,
      workspacePath,
      createdAt: now,
      updatedAt: now
    }

    const index = await this.loadIndex()
    index.projects.push(project)
    await this.saveIndex(index)
    return project
  }

  async update(projectId: string, partial: Partial<Project>): Promise<Project | null> {
    const index = await this.loadIndex()
    const project = index.projects.find((item) => item.id === projectId)
    if (!project) return null

    Object.assign(project, partial, { updatedAt: new Date().toISOString() })
    await this.saveIndex(index)
    return project
  }

  async get(projectId: string): Promise<Project | null> {
    const index = await this.loadIndex()
    return index.projects.find((item) => item.id === projectId) ?? null
  }

  private async loadIndex(): Promise<ProjectIndex> {
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8')
      const parsed = JSON.parse(data) as ProjectIndex
      return { projects: parsed.projects ?? [] }
    } catch {
      await this.saveIndex({ projects: [] })
      return { projects: [] }
    }
  }

  private async saveIndex(index: ProjectIndex): Promise<void> {
    await fs.mkdir(dirname(this.indexPath), { recursive: true })
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8')
  }
}

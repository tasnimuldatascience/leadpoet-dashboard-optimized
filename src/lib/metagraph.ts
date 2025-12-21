// Metagraph fetching utilities
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { MetagraphData } from './types'

const execAsync = promisify(exec)

export async function fetchMetagraph(): Promise<MetagraphData> {
  const condaPath = process.env.HOME + '/anaconda3'
  const pythonPath = condaPath + '/envs/leadpoet/bin/python'
  const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_metagraph.py')

  try {
    const { stdout, stderr } = await execAsync(
      `${pythonPath} ${scriptPath}`,
      {
        timeout: 120000,
        env: {
          ...process.env,
          PATH: `${condaPath}/envs/leadpoet/bin:${process.env.PATH}`,
        }
      }
    )

    if (stderr) {
      console.error('Python stderr:', stderr)
    }

    return JSON.parse(stdout)
  } catch (error) {
    console.error('Error fetching metagraph:', error)
    return {
      hotkeyToUid: {},
      uidToHotkey: {},
      incentives: {},
      emissions: {},
      stakes: {},
      isValidator: {},
      totalNeurons: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch metagraph data'
    }
  }
}

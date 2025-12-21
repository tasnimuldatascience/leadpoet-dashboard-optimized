// Metagraph fetching utilities
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { MetagraphData } from './types'

const execAsync = promisify(exec)

export async function fetchMetagraph(): Promise<MetagraphData> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_metagraph.py')

  // Use PYTHON_PATH env var, or try common locations
  const pythonPath = process.env.PYTHON_PATH
    || (process.env.HOME + '/bittensor-venv/bin/python')  // AWS default
    || (process.env.HOME + '/anaconda3/bin/python3')       // Local fallback

  try {
    const { stdout, stderr } = await execAsync(
      `${pythonPath} ${scriptPath}`,
      {
        timeout: 120000,
        env: {
          ...process.env,
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

// Metagraph fetching utilities
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { MetagraphData } from './types'

const execAsync = promisify(exec)

export async function fetchMetagraph(): Promise<MetagraphData> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_metagraph.py')

  // Use the bittensor virtual environment on EC2
  const pythonPath = process.env.HOME + '/bittensor-venv/bin/python'

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

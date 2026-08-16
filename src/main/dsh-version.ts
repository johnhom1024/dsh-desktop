export function parseDshVersionFromText(text: string): string | null {
  const match = text.match(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)
  return match?.[1] ?? null
}

export function parseDshVersionOutput(stdout: string): string | null {
  const line = stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0)
  if (!line) {
    return null
  }
  return parseDshVersionFromText(line) ?? line
}

export async function readCliDshVersion(
  exec: (command: string, args: string[]) => Promise<string | null>,
): Promise<string | null> {
  const output = await exec('dsh', ['-V'])
  return output ? parseDshVersionOutput(output) : null
}

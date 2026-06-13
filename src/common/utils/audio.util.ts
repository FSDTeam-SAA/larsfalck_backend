/**
 * Extracts duration in seconds from a local audio file.
 * Uses dynamic import because music-metadata v8+ is ESM-only.
 * Returns 0 if extraction fails (never throws).
*/

export const extractAudioDuration = async (filePath: string): Promise<number> => {
  try {
    const { parseFile } = await import('music-metadata');
    const metadata = await parseFile(filePath);
    return Math.round(metadata.format.duration ?? 0);
  } catch {
    return 0;
  }
};
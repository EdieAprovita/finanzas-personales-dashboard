function withoutByteOrderMark(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

/** Decodes bank CSV exports, retrying Windows-1252 only when UTF-8 is invalid. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return withoutByteOrderMark(new TextDecoder('utf-16le').decode(bytes))
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return withoutByteOrderMark(new TextDecoder('utf-16be').decode(bytes))
  }

  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('\uFFFD')) return withoutByteOrderMark(utf8)

  return withoutByteOrderMark(new TextDecoder('windows-1252').decode(bytes))
}

export async function readCsvFileText(file: File): Promise<string> {
  return decodeCsvBytes(new Uint8Array(await file.arrayBuffer()))
}

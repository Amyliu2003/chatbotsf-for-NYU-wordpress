export function chunk(text, size = 1200, overlap = 180) {
  const words = text.split(/\s+/);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const part = words.slice(i, i + size).join(' ');
    chunks.push(part);
    i += Math.max(1, size - overlap);
  }
  return chunks;
}

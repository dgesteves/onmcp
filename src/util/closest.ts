/**
 * The candidate closest to a word that was probably meant to be it, by edit distance: at most a
 * third of the word's length away, so "qeury" finds "query" but "id" doesn't find "url".
 */
export function closest(word: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Math.floor(word.length / 3) + 1;
  for (const candidate of candidates) {
    const distance = editDistance(word.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

// Levenshtein distance, with a swap of two letters counted as one edit.
function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => rows[i]?.[j] ?? Infinity;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let distance = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance = Math.min(distance, at(i - 2, j - 2) + 1);
      }
      const row = rows[i];
      if (row) row[j] = distance;
    }
  }
  return at(a.length, b.length);
}

// Chinese, Japanese and Korean, which tokenizers split about a character a token, not a word piece.
const DENSE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/**
 * About how many tokens a model reads for the text. Each model's tokenizer splits text its own
 * way, so this is an estimate: about four characters a token, as English and code come out of
 * most of them, and a token for each Chinese, Japanese or Korean character.
 */
export function estimateTokens(text: string): number {
  const dense = text.match(DENSE)?.length ?? 0;
  return Math.ceil((text.length - dense) / 4) + dense;
}

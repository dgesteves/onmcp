/**
 * The text with each character a terminal acts on instead of showing written as its code point,
 * such as `<U+001B>`, so text a server wrote is shown and does nothing: C0 controls (ESC starts
 * the sequences that clear the screen, move the cursor or plant a hyperlink), DEL, C1 controls
 * (which some terminals read as ESC sequences on their own), and the bidi controls that make text
 * show in another order than it reads. Line breaks too, unless `lines` keeps them, for a message
 * onmcp wrote over several lines.
 */
export function printable(text: string, { lines = false } = {}): string {
  let shown = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    shown +=
      isControl(code) && !(lines && character === '\n')
        ? `<U+${code.toString(16).toUpperCase().padStart(4, '0')}>`
        : character;
  }
  return shown;
}

function isControl(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

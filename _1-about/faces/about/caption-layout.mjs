const PANEL_EXTENT = 40; // 34 px fill padding plus half of the 12 px outline.
const ROW_BASELINES = Object.freeze({
  1: [1590],
  2: [1480, 1680],
  3: [1415, 1590, 1765]
});
const CIRCLE_RADIUS = 1024;

function maxTextWidth(baseline) {
  const bottom = baseline + 31;
  const dy = Math.abs(bottom - CIRCLE_RADIUS);
  return Math.max(0, 2 * Math.sqrt(CIRCLE_RADIUS ** 2 - dy ** 2) - PANEL_EXTENT * 2);
}

function makeTokens(paragraphs, fontSize, measureText, narrowestWidth) {
  const tokens = [];
  let wordId = 0;
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const words = paragraph.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) continue;
    for (const [wordIndex, word] of words.entries()) {
      const currentWordId = wordId++;
      let spaceBefore = wordIndex > 0;
      if (measureText(word, fontSize) <= narrowestWidth) {
        tokens.push({text: word, spaceBefore, paragraphIndex, wordId: currentWordId});
        continue;
      }
      let chunk = '';
      for (const character of word) {
        if (chunk && measureText(chunk + character, fontSize) > narrowestWidth) {
          tokens.push({text: chunk, spaceBefore, paragraphIndex, wordId: currentWordId});
          // Only the first fragment of an authored word carries its preceding whitespace.
          spaceBefore = false;
          chunk = character;
        } else chunk += character;
      }
      if (chunk) tokens.push({text: chunk, spaceBefore, paragraphIndex, wordId: currentWordId});
    }
  }
  return tokens;
}

function getLineText(tokens, start, end) {
  let text = '';
  for (let index = start; index < end; index++) {
    const token = tokens[index];
    const previous = tokens[index - 1];
    const sameWord = previous?.wordId === token.wordId;
    text += index > start && token.spaceBefore && !sameWord ? ' ' : '';
    text += token.text;
  }
  return text;
}

function pack(tokens, rows, baselines, widths, fontSize, measureText) {
  const memo = new Map();
  function search(start, row) {
    if (row === rows) return start === tokens.length ? [] : null;
    const key = `${start}:${row}`;
    if (memo.has(key)) return memo.get(key);
    const remainingRows = rows - row;
    const lastEnd = tokens.length - remainingRows + 1;
    const options = [];
    for (let end = start + 1; end <= lastEnd; end++) {
      if (tokens[end - 1].paragraphIndex !== tokens[start].paragraphIndex) break;
      const text = getLineText(tokens, start, end);
      const width = measureText(text, fontSize);
      if (width <= widths[row]) {
        const rest = search(end, row + 1);
        if (rest) options.push([{text, textWidth: width, baseline: baselines[row], maxWidth: widths[row]}, ...rest]);
      }
    }
    options.sort((a, b) => {
      const spread = rows => Math.max(...rows.map(x => x.textWidth)) - Math.min(...rows.map(x => x.textWidth));
      return spread(a) - spread(b);
    });
    const result = options[0] || null;
    memo.set(key, result);
    return result;
  }
  return search(0, 0);
}

/** Fit text with one shared font size, preserving words and authored line breaks when possible. */
export function layoutCaption(lines, measureText, {fontSize = 128, minFontSize = 6} = {}) {
  const paragraphs = (Array.isArray(lines) ? lines : []).flatMap(line => String(line ?? '').split(/\r?\n/u));
  if (!paragraphs.some(line => line.trim())) return {fontSize, lines: []};

  for (let size = fontSize; size >= minFontSize; size -= 2) {
    for (let rows = Math.min(3, paragraphs.filter(line => line.trim()).length || 1); rows <= 3; rows++) {
      const baselines = ROW_BASELINES[rows];
      const widths = baselines.map(maxTextWidth);
      const tokens = makeTokens(paragraphs, size, measureText, Math.min(...widths));
      const layout = pack(tokens, rows, baselines, widths, size, measureText);
      if (layout) return {fontSize: size, lines: layout};
    }
  }
  throw new RangeError('Caption could not fit inside three circle-safe lines.');
}

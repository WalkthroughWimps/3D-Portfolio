// Original References section: about.html, commit 4857de0, lines 127–142.
// Preserve the original wording and order; remove only the trailing spaces
// before the first two closing quotation marks.
export const REFS_ORIGINAL_QUOTES = Object.freeze([
  Object.freeze({
    quote: 'Matt’s contributions fostered a positive learning environment, making English learning enjoyable and accessible to students, resulting in remarkable outcomes from the lessons he designed.',
    author: 'Jinny Jeon', role: 'Manager of Foreign Language Department'
  }),
  Object.freeze({
    quote: 'He willingly helps his coworkers with any problems or questions they have, and he has proved a valuable addition to both the office and the school.',
    author: 'Ashley Kim', role: 'Head Teacher'
  }),
  Object.freeze({
    quote: 'His commitment to excellence and continuous pursuit of improvement have had a profound impact on me, both as an educator and as an individual.',
    author: 'Matt Stone', role: 'Native English Teacher'
  })
]);

export const REFS_ORIGINAL_QUOTE_TEXTS = Object.freeze(REFS_ORIGINAL_QUOTES.map(
  ({quote, author, role}) => `“${quote}”\n— ${author}, ${role}`));

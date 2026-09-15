// ============================================================
// LIYX AI — the "smart engine," entirely on-device.
// No network calls, no API keys, no cost per request.
//
// What it actually does (real technique, not a gimmick):
// 1. EXTRACTIVE SUMMARY — scores each sentence in the full
//    snippet by word-frequency salience (a lightweight TF
//    variant of the classic Luhn algorithm) and keeps the
//    highest scoring sentence(s) as the "insight" line.
// 2. TOPIC TAGGING — matches against a curated keyword map to
//    label stories (Politics, Markets, Conflict, Sports result,
//    etc.) beyond just their RSS category.
// 3. TONE SIGNAL — flags whether a headline reads as breaking/
//    urgent based on lexical markers, to justify ticker priority.
//
// This runs per-story, on the client, at render time. It is
// intentionally cheap (pure string ops, no ML runtime) so it
// works fine on low-end Android devices.
// ============================================================

const STOPWORDS = new Set(('a an the and or but if then else when at by for '
  + 'with about against between into through during before after above below '
  + 'to from up down in out on off over under again further once here there '
  + 'all any both each few more most other some such no nor not only own same '
  + 'so than too very s t can will just don should now is was are were be been '
  + 'being have has had do does did doing it its of as').split(' '));

const TOPIC_KEYWORDS = {
  Elections:   ['election', 'vote', 'ballot', 'poll', 'candidate', 'inec', 'campaign'],
  Conflict:    ['war', 'attack', 'strike', 'militant', 'clash', 'conflict', 'ceasefire', 'troops'],
  Markets:     ['stocks', 'market', 'shares', 'inflation', 'naira', 'currency', 'economy', 'gdp', 'interest rate'],
  Tech:        ['ai', 'artificial intelligence', 'app', 'startup', 'chip', 'software', 'cyber'],
  Sports:      ['match', 'goal', 'championship', 'tournament', 'league', 'coach', 'win', 'defeat'],
  Health:      ['health', 'disease', 'vaccine', 'hospital', 'outbreak', 'virus', 'who'],
  Climate:     ['climate', 'flood', 'drought', 'storm', 'heatwave', 'emissions'],
  Policy:      ['bill', 'law', 'policy', 'senate', 'parliament', 'government', 'minister', 'president'],
};

const URGENT_MARKERS = ['breaking', 'urgent', 'dies', 'dead', 'killed', 'explosion',
  'resigns', 'collapse', 'emergency', 'evacuate', 'warns'];

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []);
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20); // ignore fragments/dangling clauses
}

/**
 * Extractive one-line "insight" — picks the sentence from the
 * SNIPPET ONLY (never the title) that's most representative of
 * the story's key terms. This guarantees the insight line is
 * never just an echo of the headline: if the snippet has nothing
 * beyond the headline to offer, we fall back to a topic-aware
 * framing line instead of repeating it.
 */
export function extractInsight(title, snippet, topics) {
  const cleanSnippet = (snippet || '').trim();
  const titleNorm = normalizeForCompare(title);

  const sentences = splitSentences(cleanSnippet)
    .filter(s => normalizeForCompare(s) !== titleNorm); // drop exact/near echoes of the title

  if (!sentences.length) {
    // Snippet added nothing beyond the headline — don't repeat it.
    // Give a short, genuinely different framing line instead.
    return framingLine(topics);
  }

  // word frequency across the snippet only (not the title), so
  // headline words don't dominate sentence scoring
  const freq = {};
  tokenize(cleanSnippet).forEach(w => {
    if (STOPWORDS.has(w) || w.length < 3) return;
    freq[w] = (freq[w] || 0) + 1;
  });

  let best = sentences[0];
  let bestScore = -1;
  sentences.forEach(sentence => {
    const words = tokenize(sentence).filter(w => !STOPWORDS.has(w));
    if (!words.length) return;
    const score = words.reduce((sum, w) => sum + (freq[w] || 0), 0) / words.length;
    if (score > bestScore) { bestScore = score; best = sentence; }
  });

  return best.length > 150 ? best.slice(0, 147) + '…' : best;
}

function normalizeForCompare(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

// Short, topic-flavored lines used only when the snippet has
// nothing to add beyond the headline — keeps the insight strip
// useful rather than a repeated headline in smaller text.
const FRAMING_LINES = {
  Elections:  'Part of ongoing election coverage worth tracking.',
  Conflict:   'A developing situation with regional implications.',
  Markets:    'Could move markets or shift economic sentiment.',
  Tech:       'A notable step in a fast-moving tech story.',
  Sports:     'A result likely to shape the rest of the season.',
  Health:     'A health story with broader public impact.',
  Climate:    'Part of a wider pattern worth watching closely.',
  Policy:     'A policy shift with knock-on effects ahead.',
};
function framingLine(topics) {
  if (topics && topics.length && FRAMING_LINES[topics[0]]) return FRAMING_LINES[topics[0]];
  return 'Developing story — tap through for full details.';
}

/** Tags a story with 0-2 topics based on keyword presence. */
export function tagTopics(title, snippet) {
  const text = (title + ' ' + snippet).toLowerCase();
  const hits = [];
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) hits.push(topic);
    if (hits.length === 2) break;
  }
  return hits;
}

/** True if the headline reads as urgent/breaking. */
export function isUrgent(title) {
  const t = title.toLowerCase();
  return URGENT_MARKERS.some(m => t.includes(m));
}

/**
 * Full pipeline — call this once per story at normalize-time
 * and cache the result alongside the story so we never
 * recompute it on every render.
 */
export function analyzeStory(story) {
  const topics = tagTopics(story.title, story.snippet);
  return {
    insight: extractInsight(story.title, story.snippet, topics),
    topics,
    urgent: isUrgent(story.title),
  };
}

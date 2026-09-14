// ============================================================
// SOURCES — every feed URL lives here, grouped by country and
// category. To add a source: add one line. To add a country:
// add one block. Nothing else in the app needs to change.
//
// All sources are public RSS feeds, fetched through the same
// free, keyless RSS->JSON bridge as before.
// ============================================================

export const RSS_BRIDGE = 'https://api.rss2json.com/v1/api.json?rss_url=';

export const CATEGORIES = [
  { id: 'top',          label: 'For You' },
  { id: 'world',        label: 'World' },
  { id: 'local',        label: 'Local' },
  { id: 'business',     label: 'Business' },
  { id: 'tech',         label: 'Technology' },
  { id: 'entertainment',label: 'Entertainment' },
  { id: 'sport',        label: 'Sport' },
  { id: 'science',      label: 'Science' },
  { id: 'health',       label: 'Health' },
];

// ---- GLOBAL fallback sources (used for 'top' + 'world' everywhere,
// and as a base layer mixed into every country) ----
const GLOBAL = {
  top: [
    { name: 'BBC News',   url: 'http://feeds.bbci.co.uk/news/rss.xml' },
    { name: 'Reuters',    url: 'https://feeds.reuters.com/reuters/topNews' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'NPR',        url: 'https://feeds.npr.org/1001/rss.xml' },
  ],
  world: [
    { name: 'BBC World',  url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  ],
  business: [
    { name: 'BBC Business', url: 'http://feeds.bbci.co.uk/news/business/rss.xml' },
  ],
  tech: [
    { name: 'BBC Technology', url: 'http://feeds.bbci.co.uk/news/technology/rss.xml' },
    { name: 'TechCrunch',     url: 'https://techcrunch.com/feed/' },
    { name: 'The Verge',      url: 'https://www.theverge.com/rss/index.xml' },
  ],
  entertainment: [
    { name: 'BBC Entertainment', url: 'http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  ],
  sport: [
    { name: 'BBC Sport', url: 'http://feeds.bbci.co.uk/sport/rss.xml' },
  ],
  science: [
    { name: 'BBC Science', url: 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
    { name: 'NASA',        url: 'https://www.nasa.gov/feed/' },
  ],
  health: [
    { name: 'BBC Health', url: 'http://feeds.bbci.co.uk/news/health/rss.xml' },
  ],
};

// ---- Country-specific "local" layer ----
// Each country only needs to define what's DIFFERENT/LOCAL —
// 'top' and 'world' inherit from GLOBAL unless overridden.
const BY_COUNTRY = {
  NG: {
    local: [
      { name: 'Punch',        url: 'https://punchng.com/feed/' },
      { name: 'Vanguard',     url: 'https://www.vanguardngr.com/feed/' },
      { name: 'Premium Times',url: 'https://www.premiumtimesng.com/feed' },
      { name: 'The Guardian NG', url: 'https://guardian.ng/feed/' },
    ],
    business: [
      { name: 'Nairametrics', url: 'https://nairametrics.com/feed/' },
    ],
  },
  ZA: {
    local: [
      { name: 'News24',   url: 'https://feeds.news24.com/articles/news24/TopStories/rss' },
      { name: 'IOL',      url: 'https://www.iol.co.za/cmlink/1.640' },
      { name: 'TimesLIVE',url: 'https://www.timeslive.co.za/rss/?section=news' },
    ],
  },
  GB: {
    local: [
      { name: 'BBC UK',    url: 'http://feeds.bbci.co.uk/news/uk/rss.xml' },
      { name: 'The Guardian UK', url: 'https://www.theguardian.com/uk/rss' },
      { name: 'Sky News',  url: 'https://feeds.skynews.com/feeds/rss/uk.xml' },
    ],
  },
  KE: {
    local: [
      { name: 'Nation Africa', url: 'https://nation.africa/kenya/rss' },
      { name: 'The Standard',  url: 'https://www.standardmedia.co.ke/rss/headlines.php' },
    ],
  },
  GH: {
    local: [
      { name: 'GhanaWeb', url: 'https://www.ghanaweb.com/GhanaHomePage/NewsArchive/rss.php' },
      { name: 'MyJoyOnline', url: 'https://www.myjoyonline.com/feed/' },
    ],
  },
  EG: {
    local: [
      { name: 'Ahram Online', url: 'http://english.ahram.org.eg/rss/NewsFeed.aspx' },
    ],
  },
  US: {
    local: [
      { name: 'NPR National', url: 'https://feeds.npr.org/1003/rss.xml' },
    ],
  },
  DE: {
    local: [
      { name: 'DW Europe', url: 'https://rss.dw.com/rdf/rss-en-eu' },
    ],
  },
  FR: {
    local: [
      { name: 'DW Europe', url: 'https://rss.dw.com/rdf/rss-en-eu' },
    ],
  },
};

// Regional fallback local feeds, for supported-region countries
// that don't have a dedicated block yet (e.g. Ireland, Ghana edge
// cases, or any GB-region neighbor).
const BY_REGION = {
  africa: [
    { name: 'Al Jazeera Africa', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  ],
  europe: [
    { name: 'DW Europe', url: 'https://rss.dw.com/rdf/rss-en-eu' },
  ],
  americas: [
    { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
  ],
  global: [
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
  ],
};

/**
 * Resolve the actual list of sources to fetch for a given
 * category, country code, and region.
 */
export function sourcesFor(categoryId, countryCode, region) {
  const countryBlock = BY_COUNTRY[countryCode] || {};

  if (categoryId === 'local') {
    return countryBlock.local || BY_REGION[region] || BY_REGION.global;
  }

  // country override takes priority, then global default
  return countryBlock[categoryId] || GLOBAL[categoryId] || GLOBAL.top;
}

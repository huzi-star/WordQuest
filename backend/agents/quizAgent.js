// quizAgent.js — Gemini quiz generator with retries + large bilingual
// fallback pool. Topic varies each call via excludeTopics + a random seed.

const { GoogleGenerativeAI } = require('@google/generative-ai');

// 40+ questions per language — keeps the game playable when AI is offline
// and stops obvious repeats. Each call shuffles + excludes recent.
const POOL = {
  english: [
    { q: 'Which planet is known as the Red Planet?', opts: ['Mars', 'Venus', 'Jupiter', 'Mercury'], a: 0, e: 'Mars looks red because of iron oxide on its surface.' },
    { q: 'Largest ocean on Earth?', opts: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], a: 2, e: 'The Pacific covers more area than all continents combined.' },
    { q: 'Who was Pakistan\'s first Prime Minister?', opts: ['Jinnah', 'Liaqat Ali Khan', 'Ayub Khan', 'Iqbal'], a: 1, e: 'Liaqat Ali Khan was Pakistan\'s first PM (1947-1951).' },
    { q: 'Fastest land animal?', opts: ['Lion', 'Cheetah', 'Horse', 'Wolf'], a: 1, e: 'Cheetahs sprint up to 110 km/h.' },
    { q: 'Babar Azam plays for which national team?', opts: ['India', 'Pakistan', 'Bangladesh', 'England'], a: 1, e: 'Babar Azam captains the Pakistan cricket team.' },
    { q: 'Largest country by area?', opts: ['USA', 'China', 'Canada', 'Russia'], a: 3, e: 'Russia spans 11 time zones.' },
    { q: 'Painter of the Mona Lisa?', opts: ['Picasso', 'Da Vinci', 'Van Gogh', 'Michelangelo'], a: 1, e: 'Leonardo da Vinci painted it around 1503.' },
    { q: 'How many continents on Earth?', opts: ['5', '6', '7', '8'], a: 2, e: 'There are seven continents.' },
    { q: 'Capital of Pakistan?', opts: ['Karachi', 'Lahore', 'Islamabad', 'Peshawar'], a: 2, e: 'Islamabad is the federal capital since 1967.' },
    { q: 'Currency of Japan?', opts: ['Yuan', 'Won', 'Yen', 'Ringgit'], a: 2, e: 'The Japanese yen is one of the world\'s major currencies.' },
    { q: 'Tallest mountain in the world?', opts: ['K2', 'Everest', 'Kilimanjaro', 'McKinley'], a: 1, e: 'Mount Everest stands at 8,849 m.' },
    { q: 'Second-tallest mountain (in Pakistan)?', opts: ['Nanga Parbat', 'K2', 'Tirich Mir', 'Rakaposhi'], a: 1, e: 'K2 is 8,611 m, in the Karakoram range.' },
    { q: 'Author of "Romeo and Juliet"?', opts: ['Tolkien', 'Shakespeare', 'Dickens', 'Twain'], a: 1, e: 'William Shakespeare wrote it in the 1590s.' },
    { q: 'Chemical symbol for gold?', opts: ['Go', 'Au', 'Gd', 'Ag'], a: 1, e: 'Au from Latin "aurum".' },
    { q: 'Which gas do plants absorb?', opts: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], a: 2, e: 'CO2 is used in photosynthesis.' },
    { q: 'Pakistan\'s national poet?', opts: ['Faiz', 'Iqbal', 'Ghalib', 'Faraz'], a: 1, e: 'Allama Iqbal is the national poet.' },
    { q: 'Capital of France?', opts: ['Rome', 'Paris', 'Berlin', 'Madrid'], a: 1, e: 'Paris has been the French capital since the 5th century.' },
    { q: 'Number of planets in our solar system?', opts: ['7', '8', '9', '10'], a: 1, e: 'Eight since Pluto was reclassified in 2006.' },
    { q: 'Founder of Microsoft?', opts: ['Steve Jobs', 'Bill Gates', 'Elon Musk', 'Larry Page'], a: 1, e: 'Bill Gates co-founded Microsoft in 1975.' },
    { q: 'Which country invented the game of chess?', opts: ['China', 'India', 'Persia', 'Egypt'], a: 1, e: 'Chess originated in India around the 6th century.' },
    { q: 'Famous Pakistani Sufi singer (deceased)?', opts: ['Atif Aslam', 'Nusrat Fateh Ali Khan', 'Rahat', 'Sabri'], a: 1, e: 'Nusrat Fateh Ali Khan was the king of Qawwali.' },
    { q: 'Hottest planet in solar system?', opts: ['Mercury', 'Venus', 'Mars', 'Sun'], a: 1, e: 'Venus is hotter than Mercury due to runaway greenhouse effect.' },
    { q: 'Pakistan won which cricket World Cup?', opts: ['1987', '1992', '1996', '2007'], a: 1, e: 'Pakistan won the 1992 ODI World Cup under Imran Khan.' },
    { q: 'How many provinces does Pakistan have?', opts: ['3', '4', '5', '6'], a: 1, e: 'Punjab, Sindh, KP, and Balochistan — four provinces.' },
    { q: 'Capital of Australia?', opts: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], a: 2, e: 'Canberra is the federal capital, not Sydney.' },
    { q: 'Inventor of the telephone?', opts: ['Edison', 'Bell', 'Tesla', 'Marconi'], a: 1, e: 'Alexander Graham Bell, 1876.' },
    { q: 'What is the largest desert in the world?', opts: ['Sahara', 'Antarctic', 'Arabian', 'Gobi'], a: 1, e: 'The Antarctic desert is the largest by area.' },
    { q: 'Famous Mughal monument in Lahore?', opts: ['Taj Mahal', 'Badshahi Mosque', 'Red Fort', 'Jama Masjid'], a: 1, e: 'Badshahi Mosque was built by Aurangzeb in 1673.' },
    { q: 'Most spoken language in Pakistan?', opts: ['Urdu', 'Punjabi', 'Sindhi', 'Pashto'], a: 1, e: 'Punjabi is the most widely spoken native language.' },
    { q: 'Smallest planet in our solar system?', opts: ['Mars', 'Mercury', 'Pluto', 'Venus'], a: 1, e: 'Mercury is the smallest of the eight planets.' },
    { q: 'Element with chemical symbol O?', opts: ['Osmium', 'Oxygen', 'Olivine', 'Oganesson'], a: 1, e: 'O stands for Oxygen.' },
    { q: 'Pakistan ka national fruit?', opts: ['Apple', 'Mango', 'Banana', 'Orange'], a: 1, e: 'Mango (aam) is Pakistan\'s national fruit.' },
    { q: 'Most populous country in 2024?', opts: ['China', 'India', 'USA', 'Indonesia'], a: 1, e: 'India overtook China to become the most populous country.' },
    { q: 'How many bones in adult human body?', opts: ['196', '206', '216', '226'], a: 1, e: 'Adults have 206 bones (babies have ~270).' },
    { q: 'Currency of UK?', opts: ['Euro', 'Pound', 'Dollar', 'Krone'], a: 1, e: 'The pound sterling has been used for over 1,200 years.' },
    { q: 'Faiz Ahmed Faiz was famous for?', opts: ['Cricket', 'Poetry', 'Music', 'Politics'], a: 1, e: 'Faiz was a celebrated Urdu poet.' },
    { q: 'Largest river in Pakistan?', opts: ['Ravi', 'Jhelum', 'Indus', 'Chenab'], a: 2, e: 'The Indus is Pakistan\'s longest river (~3,180 km).' },
    { q: 'Speed of light is approximately?', opts: ['300 km/s', '300,000 km/s', '3,000 km/s', '30,000 km/s'], a: 1, e: 'Light travels at ~299,792 km/s in a vacuum.' },
    { q: 'Father of computers?', opts: ['Bill Gates', 'Charles Babbage', 'Steve Jobs', 'Alan Turing'], a: 1, e: 'Charles Babbage designed the Analytical Engine in the 1830s.' },
    { q: 'Capital of Saudi Arabia?', opts: ['Mecca', 'Riyadh', 'Jeddah', 'Medina'], a: 1, e: 'Riyadh is the capital and largest city.' },
  ],
  urdu: [
    { q: 'Red Planet kis ko kehte hain?', opts: ['Mars', 'Venus', 'Jupiter', 'Mercury'], a: 0, e: 'Mars iron oxide ke wajah se red dikhta hai.' },
    { q: 'Sabse bara ocean konsa?', opts: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], a: 2, e: 'Pacific Ocean sabse bara hai.' },
    { q: 'Pakistan ke pehle PM?', opts: ['Jinnah', 'Liaqat Ali Khan', 'Ayub Khan', 'Iqbal'], a: 1, e: 'Liaqat Ali Khan pehle PM the (1947-51).' },
    { q: 'Sabse fast land animal?', opts: ['Lion', 'Cheetah', 'Horse', 'Wolf'], a: 1, e: 'Cheetah 110 km/h tak chal sakta hai.' },
    { q: 'Babar Azam kis team mein?', opts: ['India', 'Pakistan', 'Bangladesh', 'England'], a: 1, e: 'Babar Azam Pakistan team ke captain hain.' },
    { q: 'Area ke hisab se sabse bara mulk?', opts: ['USA', 'China', 'Canada', 'Russia'], a: 3, e: 'Russia 11 time zones cover karta hai.' },
    { q: 'Mona Lisa kis ne paint kiya?', opts: ['Picasso', 'Da Vinci', 'Van Gogh', 'Michelangelo'], a: 1, e: 'Leonardo da Vinci ne 1503 mein banai.' },
    { q: 'Earth pe kitne continents hain?', opts: ['5', '6', '7', '8'], a: 2, e: 'Saat continents hain.' },
    { q: 'Pakistan ka capital?', opts: ['Karachi', 'Lahore', 'Islamabad', 'Peshawar'], a: 2, e: '1967 se Islamabad federal capital hai.' },
    { q: 'Japan ki currency?', opts: ['Yuan', 'Won', 'Yen', 'Ringgit'], a: 2, e: 'Yen Japan ki currency hai.' },
    { q: 'Duniya ka sabse uncha pahar?', opts: ['K2', 'Everest', 'Kilimanjaro', 'McKinley'], a: 1, e: 'Mount Everest 8,849 m uncha.' },
    { q: 'Pakistan ka sabse uncha pahar?', opts: ['Nanga Parbat', 'K2', 'Tirich Mir', 'Rakaposhi'], a: 1, e: 'K2 ki height 8,611 m.' },
    { q: 'Romeo and Juliet ka writer?', opts: ['Tolkien', 'Shakespeare', 'Dickens', 'Twain'], a: 1, e: 'Shakespeare ne 1590s mein likha.' },
    { q: 'Gold ka chemical symbol?', opts: ['Go', 'Au', 'Gd', 'Ag'], a: 1, e: 'Au — Latin "aurum" se.' },
    { q: 'Plants konsi gas absorb karte hain?', opts: ['Oxygen', 'Nitrogen', 'CO2', 'Hydrogen'], a: 2, e: 'Photosynthesis mein CO2 use hoti.' },
    { q: 'Pakistan ka national poet?', opts: ['Faiz', 'Iqbal', 'Ghalib', 'Faraz'], a: 1, e: 'Allama Iqbal national poet hain.' },
    { q: 'France ka capital?', opts: ['Rome', 'Paris', 'Berlin', 'Madrid'], a: 1, e: 'Paris 5th century se capital hai.' },
    { q: 'Solar system mein kitne planets?', opts: ['7', '8', '9', '10'], a: 1, e: 'Pluto 2006 mein reclassify hua, ab 8.' },
    { q: 'Microsoft ka founder?', opts: ['Steve Jobs', 'Bill Gates', 'Elon Musk', 'Larry Page'], a: 1, e: 'Bill Gates ne 1975 mein founded.' },
    { q: 'Chess kis country mein invent hua?', opts: ['China', 'India', 'Persia', 'Egypt'], a: 1, e: 'Chess India se aaya, 6th century.' },
    { q: 'Pakistan ka Sufi Qawwali king (deceased)?', opts: ['Atif Aslam', 'Nusrat Fateh Ali Khan', 'Rahat', 'Sabri'], a: 1, e: 'Nusrat Fateh Ali Khan Qawwali ke king the.' },
    { q: 'Sabse garam planet?', opts: ['Mercury', 'Venus', 'Mars', 'Sun'], a: 1, e: 'Venus runaway greenhouse effect ke wajah se sabse garam.' },
    { q: 'Pakistan ne kab World Cup jeeta?', opts: ['1987', '1992', '1996', '2007'], a: 1, e: '1992 mein Imran Khan ki captaincy mein.' },
    { q: 'Pakistan ke kitne provinces hain?', opts: ['3', '4', '5', '6'], a: 1, e: 'Punjab, Sindh, KP, Balochistan.' },
    { q: 'Australia ka capital?', opts: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], a: 2, e: 'Canberra federal capital hai.' },
    { q: 'Telephone ka inventor?', opts: ['Edison', 'Bell', 'Tesla', 'Marconi'], a: 1, e: 'Alexander Graham Bell ne 1876 mein invent kiya.' },
    { q: 'Duniya ka sabse bara desert?', opts: ['Sahara', 'Antarctic', 'Arabian', 'Gobi'], a: 1, e: 'Antarctic desert sabse bara hai area mein.' },
    { q: 'Lahore ka Mughal monument?', opts: ['Taj Mahal', 'Badshahi Mosque', 'Red Fort', 'Jama Masjid'], a: 1, e: 'Badshahi Mosque Aurangzeb ne 1673 mein banai.' },
    { q: 'Pakistan ki sabse zyada boli jane wali zubaan?', opts: ['Urdu', 'Punjabi', 'Sindhi', 'Pashto'], a: 1, e: 'Punjabi sabse zyada boli jati hai.' },
    { q: 'Sabse chhota planet?', opts: ['Mars', 'Mercury', 'Pluto', 'Venus'], a: 1, e: 'Mercury sabse chhota planet hai.' },
    { q: 'O symbol kis element ka?', opts: ['Osmium', 'Oxygen', 'Olivine', 'Oganesson'], a: 1, e: 'O Oxygen ka symbol hai.' },
    { q: 'Pakistan ka national fruit?', opts: ['Apple', 'Mango', 'Banana', 'Orange'], a: 1, e: 'Aam (Mango) Pakistan ka national fruit hai.' },
    { q: '2024 ka most populous country?', opts: ['China', 'India', 'USA', 'Indonesia'], a: 1, e: 'India ab sabse populous country hai.' },
    { q: 'Adult insaan ke kitne bones?', opts: ['196', '206', '216', '226'], a: 1, e: 'Adults mein 206 bones.' },
    { q: 'UK ki currency?', opts: ['Euro', 'Pound', 'Dollar', 'Krone'], a: 1, e: 'Pound sterling 1,200+ saal se use.' },
    { q: 'Faiz Ahmed Faiz kis cheez ke liye famous?', opts: ['Cricket', 'Shayari', 'Music', 'Politics'], a: 1, e: 'Faiz Urdu shayari ke maestro the.' },
    { q: 'Pakistan ka sabse lamba river?', opts: ['Ravi', 'Jhelum', 'Indus', 'Chenab'], a: 2, e: 'Indus ~3,180 km lamba hai.' },
    { q: 'Light ki speed approximately?', opts: ['300 km/s', '300,000 km/s', '3,000 km/s', '30,000 km/s'], a: 1, e: '~299,792 km/s vacuum mein.' },
    { q: 'Computers ka father?', opts: ['Bill Gates', 'Charles Babbage', 'Steve Jobs', 'Alan Turing'], a: 1, e: 'Charles Babbage ne 1830s mein design kiya.' },
    { q: 'Saudi Arabia ka capital?', opts: ['Mecca', 'Riyadh', 'Jeddah', 'Medina'], a: 1, e: 'Riyadh capital aur largest city hai.' },
  ],
};

function shuffleAndSlice(arr, n) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, n);
}

function poolToQuestions(items) {
  return items.map((q) => ({
    question: q.q,
    options: q.opts,
    correctIndex: q.a,
    explanation: q.e,
  }));
}

async function tryGemini({ apiKey, topic, count, language, difficulty, excludeTopics = [], excludeQuestions = [] }) {
  const langInstruction = language === 'urdu'
    ? 'All questions, options and explanations in Roman Urdu mixed with English (Pakistani conversational style).'
    : 'All questions, options and explanations in clear English.';
  const excludeTopicsHint = excludeTopics.length
    ? `\nDO NOT use these topics (already recent): ${excludeTopics.join(', ')}.`
    : '';
  const excludeQHint = excludeQuestions.length
    ? `\nDO NOT repeat any of these questions: ${excludeQuestions.slice(0, 8).map((q) => `"${q}"`).join(', ')}.`
    : '';
  const variancePrompt = `Variation seed: ${Math.floor(Math.random() * 100000)}`;
  const topicHint = topic
    ? `Topic / theme: ${topic}.`
    : 'Pick a fresh, surprising cultural/world topic — Pakistani, Indian, sports, science, history, mythology, food, art, music, geography, anything. Be highly varied.';

  const prompt = `You are a trivia quiz designer.

${topicHint}
Difficulty: ${difficulty}
${variancePrompt}
${excludeTopicsHint}
${excludeQHint}
${langInstruction}

Generate exactly ${count} multiple-choice questions, each:
- Self-contained.
- Exactly 4 plausible options.
- Exactly ONE correct option (index 0..3).
- Includes a one-sentence explanation.

Return STRICTLY valid JSON only (no markdown):
{"topic":"...","topicEmoji":"...","questions":[{"question":"...","options":["a","b","c","d"],"correctIndex":0,"explanation":"..."}]}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 1.0 }, // higher randomness for variety
  });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 22000)),
  ]);
  const text = result.response.text() || '';
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('No JSON');
  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  const questions = (parsed.questions || [])
    .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length === 4)
    .slice(0, count)
    .map((q) => ({
      question: String(q.question),
      options: q.options.map((o) => String(o)),
      correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
      explanation: String(q.explanation || ''),
    }));
  if (!questions.length) throw new Error('No questions parsed');
  return {
    topic: String(parsed.topic || 'Quiz'),
    topicEmoji: String(parsed.topicEmoji || '❓'),
    questions,
  };
}

async function quizAgent({ topic = '', count = 8, language = 'english', difficulty = 'medium', excludeTopics = [], excludeQuestions = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const lang = language === 'urdu' ? 'urdu' : 'english';

  if (apiKey && apiKey !== 'your_key_here') {
    try {
      return await tryGemini({ apiKey, topic, count, language: lang, difficulty, excludeTopics, excludeQuestions });
    } catch (err) {
      console.warn('[quizAgent] Gemini failed, falling back:', err.message);
    }
  }

  // Emergency fallback: 40-question bilingual pool, exclude what's been seen.
  const pool = POOL[lang] || POOL.english;
  const seen = new Set(excludeQuestions);
  const fresh = pool.filter((p) => !seen.has(p.q));
  const source = fresh.length >= count ? fresh : pool;
  const picked = shuffleAndSlice(source, Math.min(count, source.length));
  return {
    topic: 'World Trivia',
    topicEmoji: '🌍',
    questions: poolToQuestions(picked),
  };
}

module.exports = quizAgent;

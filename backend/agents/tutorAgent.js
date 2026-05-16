// tutorAgent.js
// Gemini-powered word explainer.
// Given a word + its category, returns a tiny educational fact
// (1-2 sentences, Urdu/English mix to match the game's voice).
// Falls back to a static lookup if Gemini is offline or rate-limited.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const STATIC_FALLBACK = {
  LAHORE: 'Lahore Punjab ka cultural capital hai — Mughal heritage ka khazana.',
  KARACHI: 'Karachi Pakistan ka sabse bara shehr aur economic hub hai.',
  MULTAN: 'Multan "City of Saints" kehlata hai — Sufi shrines famous hain.',
  QUETTA: 'Quetta Balochistan ka capital hai, mountains se ghira hua.',
  PESHAWAR: 'Peshawar Khyber Pakhtunkhwa ka capital, ancient Gandhara civilization.',
  BIRYANI: 'Biryani Mughal kitchen se aaya — rice + meat + masala layered dish.',
  NIHARI: 'Nihari slow-cooked beef stew hai, breakfast ka favorite.',
  HALEEM: 'Haleem wheat + lentils + meat se bana protein-rich dish.',
  KEBAB: 'Kebab Central Asia se aaya, BBQ meat ki sub-categories hain.',
  PULAO: 'Pulao rice dish hai meat aur masalas ke saath — biryani se simpler.',
  SAMOSA: 'Samosa triangular pastry potato/meat se bhari, evening snack king.',
  BABAR: 'Babar Azam — Pakistan ka top ODI batsman, world #1 ranked tha.',
  SHAHEEN: 'Shaheen Afridi — fast bowler, 145+ kmh speed maintain karta.',
  RIZWAN: 'Mohammad Rizwan — wicketkeeper-batsman, T20 specialist.',
  AFRIDI: 'Shahid Afridi "Boom Boom" — record holder for many T20 sixes.',
  IMAM: 'Imam-ul-Haq — opener, runs aur consistency ka master.',
  NASEEM: 'Naseem Shah — teenage fast-bowling prodigy, raw pace.',
  MOHABBAT: 'Urdu mein "Mohabbat" ka matlab love — Sufi poetry mein common.',
  KHUSHI: 'Khushi = happiness. Roz-marra Urdu mein use hota hai.',
  SUKOON: 'Sukoon = peace, tranquility. Cozy aur calm feeling.',
  YAARI: 'Yaari = friendship. Punjabi/Urdu dono mein bond ko describe karta.',
  IZZAT: 'Izzat = honor/respect. Pakistani culture ka core value.',
  DOST: 'Dost = friend. Simple, warm word for a close companion.',
  JINNAH: 'Muhammad Ali Jinnah — Quaid-e-Azam, Pakistan ke founder.',
  IQBAL: 'Allama Iqbal — national poet, "Khudi" philosophy ke inventor.',
  EDHI: 'Abdul Sattar Edhi — humanitarian, world ki largest volunteer ambulance.',
  MALALA: 'Malala Yousafzai — youngest Nobel Peace Prize laureate.',
  KHAN: 'Imran Khan — cricket legend, 1992 World Cup winning captain.',
  LIAQAT: 'Liaqat Ali Khan — Pakistan ke pehle Prime Minister.',
  MANGO: 'Pakistan world ka top mango producer hai — Sindhri aur Chaunsa famous.',
  GUAVA: 'Amrood (Guava) Pakistani winters ka favorite fruit.',
  ORANGE: 'Sangtara (Orange) Sargodha district ka famous fruit.',
  MELON: 'Garma (Melon) Pakistani summer fruit, sweet aur juicy.',
  LYCHEE: 'Lychee Pakistani Punjab mein season mein milta hai.',
  PAPAYA: 'Papita digestive fruit, Pakistan mein season aata.',
};

async function tutorAgent({ word, category = '', funFact = '' }) {
  const upper = String(word || '').toUpperCase();
  const apiKey = process.env.GEMINI_API_KEY;

  // Fast path: use local fallback if no Gemini key.
  if (!apiKey || apiKey === 'your_key_here') {
    return { explanation: STATIC_FALLBACK[upper] || `${upper} — ${category} category ka ek important word.` };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a friendly Pakistani trivia tutor.
The player just found the word "${upper}" in the category "${category}".
${funFact ? `Category context: ${funFact}` : ''}

Return ONE short educational sentence (max 20 words) explaining what this
word means or why it's culturally significant. Mix Urdu and English casually
("Roman Urdu") — example tone: "Babar Azam Pakistan ka best ODI batsman hai".

Output ONLY the sentence, nothing else. No quotes, no labels.`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('tutor timeout')), 4500)),
    ]);
    const text = result.response.text().trim().replace(/^["']|["']$/g, '');
    if (!text || text.length > 200) throw new Error('bad output');
    return { explanation: text };
  } catch (err) {
    return { explanation: STATIC_FALLBACK[upper] || `${upper} — ${category} category ka famous word.` };
  }
}

module.exports = tutorAgent;

"use strict";

const GAME_MODES = [
  {
    id: "meaning",
    label: "Meaning Sprint",
    prompt: "Pick the closest meaning before the combo cools down.",
    coach: "Quick read. Choose the meaning you would trust in a real chat.",
  },
  {
    id: "dialogue",
    label: "Dialogue Pick",
    prompt: "Choose the most natural reply for this situation.",
    coach: "Imagine you are in the scene. Natural beats literal.",
  },
  {
    id: "fill",
    label: "Blank Rescue",
    prompt: "Complete the sentence with the right phrase.",
    coach: "Listen to the rhythm of the sentence. The phrase should fit cleanly.",
  },
  {
    id: "translate",
    label: "Say It Better",
    prompt: "Pick the most natural English line for the situation.",
    coach: "Use it like a person would say it, not like a dictionary entry.",
  },
];

const COMMUNICATION_SCENES = [
  {
    id: "work-update",
    title: "Work update",
    setup: "Your teammate asks what happened after yesterday's meeting.",
    cueVi: "Nói rằng bạn sẽ liên hệ lại với khách hàng hôm nay.",
    sentence: 'I will _____ with the client today.',
    answerTemplate: 'I will {term} with the client today.',
    distractors: ["I will ignore the client today.", "I will postpone every update today.", "I will confuse the client today."],
  },
  {
    id: "scope-check",
    title: "Project scope",
    setup: "A client keeps adding extra requests before the quote is final.",
    cueVi: "Đề nghị làm rõ phạm vi trước khi báo giá.",
    sentence: 'Can we _____ before we quote the price?',
    answerTemplate: 'Can we {term} before we quote the price?',
    distractors: ["Can we avoid the meeting before we quote the price?", "Can we delete the requirement before we quote the price?", "Can we rush the decision before we quote the price?"],
  },
  {
    id: "social-catchup",
    title: "Coffee chat",
    setup: "You meet an old friend and want to continue the relationship.",
    cueVi: "Nói một câu thân thiện để giữ liên lạc.",
    sentence: "It was great seeing you. Let's _____.",
    answerTemplate: "It was great seeing you. Let's {term}.",
    distractors: ["It was great seeing you. Let's disappear.", "It was great seeing you. Let's cancel this memory.", "It was great seeing you. Let's end the chat coldly."],
  },
  {
    id: "ielts-essay",
    title: "Essay argument",
    setup: "You are improving an IELTS body paragraph.",
    cueVi: "Chọn cách nói học thuật, rõ ý và tự nhiên.",
    sentence: "The essay needs a _____, not a list of random opinions.",
    answerTemplate: "The essay needs a {term}, not a list of random opinions.",
    distractors: ["The essay needs a funny accident, not a list of random opinions.", "The essay needs a late meeting, not a list of random opinions.", "The essay needs a tiny snack, not a list of random opinions."],
  },
  {
    id: "feedback",
    title: "Feedback moment",
    setup: "Your manager gives feedback and asks what you will do next.",
    cueVi: "Trả lời rằng bạn hiểu góp ý và sẽ biến nó thành việc cần làm.",
    sentence: 'Thanks, I will turn that into an _____.',
    answerTemplate: 'Thanks, I will turn that into an {term}.',
    distractors: ["Thanks, I will turn that into an awkward silence.", "Thanks, I will turn that into an excuse.", "Thanks, I will turn that into a random opinion."],
  },
];

const LEVELS = [
  { min: 0, title: "Rookie Speaker", pace: "Warm up", next: 80 },
  { min: 80, title: "Daily Talker", pace: "Steady", next: 180 },
  { min: 180, title: "Meeting Ready", pace: "Confident", next: 320 },
  { min: 320, title: "Sharp Communicator", pace: "Fast", next: 520 },
  { min: 520, title: "Fluent Operator", pace: "Elite", next: null },
];

function normalizeAnswer(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeaning(word) {
  return word?.lesson?.meaning_en || word?.lesson?.meaning || word?.lesson?.meaning_vi || "Use this naturally in a real conversation.";
}

function isGenericMeaning(text) {
  return /^A phrase to practi[cs]e in |^A useful English expression for |^Use this naturally in a real conversation/i.test(String(text || "").trim());
}

function getExamples(word) {
  const examples = Array.isArray(word?.lesson?.examples) ? word.lesson.examples : [];
  return examples
    .filter(Boolean)
    .map(String)
    .filter((example) => !/^can you make|^use ".+" in a|^let's practice/i.test(example.trim()));
}

function getCollocations(word) {
  const items = Array.isArray(word?.lesson?.collocations) ? word.lesson.collocations : [];
  return items.filter(Boolean).map(String);
}

function getCategory(word) {
  const direct = String(word?.category || "").trim();
  if (direct) return direct;
  const source = (Array.isArray(word?.sources) ? word.sources : [])
    .map(String)
    .find((item) => item.startsWith("starter-"));
  return source ? source.replace(/^starter-/, "").replace(/^\w/, (ch) => ch.toUpperCase()) : "General";
}

function seededShuffle(items, seedText = "") {
  const next = items.slice();
  let seed = 17;
  for (const ch of String(seedText)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = next.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function totalXp(words) {
  return (Array.isArray(words) ? words : []).reduce((sum, word) => sum + (Number(word?.score) || 0), 0);
}

function getPlayerLevel(wordsOrXp) {
  const xp = Array.isArray(wordsOrXp) ? totalXp(wordsOrXp) : Math.max(0, Number(wordsOrXp) || 0);
  let levelIndex = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].min) levelIndex = i;
  }
  const level = LEVELS[levelIndex];
  const nextLevel = LEVELS[levelIndex + 1] || null;
  const span = nextLevel ? nextLevel.min - level.min : 1;
  const progress = nextLevel ? Math.round(((xp - level.min) / span) * 100) : 100;
  return {
    level: levelIndex + 1,
    title: level.title,
    pace: level.pace,
    xp,
    nextXp: nextLevel ? nextLevel.min : null,
    progress: Math.max(0, Math.min(100, progress)),
  };
}

function chooseGameMode(word, index = 0) {
  const term = String(word?.term || "");
  const examples = getExamples(word);
  if (examples.some((example) => normalizeAnswer(example).includes(normalizeAnswer(term)))) {
    return GAME_MODES[(index + 2) % GAME_MODES.length].id;
  }
  return GAME_MODES[index % GAME_MODES.length].id;
}

function pickScene(word, seed = 0) {
  const key = normalizeAnswer(word?.term || "");
  let score = seed;
  for (const ch of key) score += ch.charCodeAt(0);
  return COMMUNICATION_SCENES[Math.abs(score) % COMMUNICATION_SCENES.length];
}

function uniqueChoices(choices, limit = 4) {
  const seen = new Set();
  return choices
    .filter(Boolean)
    .map(String)
    .filter((choice) => {
      const key = normalizeAnswer(choice);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function getPeerWords(word, allWords = []) {
  const category = normalizeAnswer(getCategory(word));
  const level = String(word?.level || "").toLowerCase();
  const peers = (Array.isArray(allWords) ? allWords : [])
    .filter((item) => item && item.id !== word.id);
  return peers.sort((a, b) => {
    const aScore = (normalizeAnswer(getCategory(a)) === category ? 0 : 1) + (String(a.level || "").toLowerCase() === level ? 0 : 1);
    const bScore = (normalizeAnswer(getCategory(b)) === category ? 0 : 1) + (String(b.level || "").toLowerCase() === level ? 0 : 1);
    return aScore - bScore || String(a.term || "").localeCompare(String(b.term || ""));
  });
}

function buildMeaningChoices(word, allWords, seedText) {
  const correct = getMeaning(word);
  const peerMeanings = getPeerWords(word, allWords)
    .map(getMeaning)
    .filter((meaning) => !isGenericMeaning(meaning));
  const fallback = [
    "To agree on goals, timing, and responsibilities before starting.",
    "To identify the customer's main problem before choosing a solution.",
    "To check quality before delivery or deployment.",
    "To keep communication open and confirm the next step after a discussion.",
  ];
  return seededShuffle(uniqueChoices([correct, ...peerMeanings, ...fallback], 4), seedText);
}

function buildTermChoices(word, allWords, seedText) {
  const term = String(word.term || "").trim();
  const peers = getPeerWords(word, allWords).map((item) => item.term);
  const fallback = ["follow up", "clarify scope", "align expectations", "action item", "value proposition"];
  return seededShuffle(uniqueChoices([term, ...peers, ...fallback], 4), seedText);
}

function replaceTermWithBlank(example, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blanked = example.replace(new RegExp(escaped, "ig"), "_____");
  return blanked === example ? `${example} (${term}: _____)` : blanked;
}

function buildGameRound(word, allWords = [], options = {}) {
  if (!word) return null;
  const index = Number(options.index) || 0;
  const mode = options.mode || chooseGameMode(word, index);
  const modeMeta = GAME_MODES.find((item) => item.id === mode) || GAME_MODES[0];
  const term = String(word.term || "").trim();
  const meaning = getMeaning(word);
  const examples = getExamples(word);
  const collocations = getCollocations(word);
  const scene = pickScene(word, index);
  const seedText = `${term}:${mode}:${index}`;

  if (mode === "dialogue") {
    const correct = examples[0] || scene.answerTemplate.replace("{term}", term);
    const peerExamples = getPeerWords(word, allWords).flatMap(getExamples);
    return {
      mode,
      title: `${getCategory(word)} dialogue`,
      coach: modeMeta.coach,
      prompt: modeMeta.prompt,
      scene: `Scenario: ${scene.setup}`,
      cue: `Choose the line that naturally uses "${term}".`,
      answer: correct,
      choices: seededShuffle(uniqueChoices([correct, ...peerExamples, ...scene.distractors], 4), seedText),
      speakLine: correct,
    };
  }

  if (mode === "fill") {
    const example = examples.find((item) => normalizeAnswer(item).includes(normalizeAnswer(term))) || scene.answerTemplate.replace("{term}", term);
    const blank = replaceTermWithBlank(example, term);
    return {
      mode,
      title: `${getCategory(word)} fill-in`,
      coach: modeMeta.coach,
      prompt: modeMeta.prompt,
      scene: `Context: ${scene.setup}`,
      cue: blank,
      answer: term,
      choices: buildTermChoices(word, allWords, seedText),
      speakLine: example,
    };
  }

  if (mode === "translate") {
    const correct = examples[1] || scene.answerTemplate.replace("{term}", term);
    const peerExamples = getPeerWords(word, allWords).flatMap(getExamples);
    return {
      mode,
      title: `${getCategory(word)} translation`,
      coach: modeMeta.coach,
      prompt: modeMeta.prompt,
      scene: `Meaning: ${meaning}`,
      cue: `Pick the best English sentence for "${term}".`,
      answer: correct,
      choices: seededShuffle(uniqueChoices([correct, ...peerExamples, ...scene.distractors], 4), seedText),
      speakLine: correct,
    };
  }

  return {
    mode: "meaning",
    title: `${getCategory(word)} meaning sprint`,
    coach: modeMeta.coach,
    prompt: modeMeta.prompt,
    scene: `Term: ${term}`,
    cue: "What does it mean?",
    answer: meaning,
    choices: buildMeaningChoices(word, allWords, seedText),
    speakLine: examples[0] || collocations[0] || term,
  };
}

const EnglishGameCore = {
  GAME_MODES,
  COMMUNICATION_SCENES,
  LEVELS,
  normalizeAnswer,
  getMeaning,
  isGenericMeaning,
  getExamples,
  getCollocations,
  getCategory,
  totalXp,
  getPlayerLevel,
  chooseGameMode,
  pickScene,
  uniqueChoices,
  seededShuffle,
  buildGameRound,
};

if (typeof module !== "undefined" && module.exports) module.exports = EnglishGameCore;
if (typeof window !== "undefined") window.EnglishGameCore = EnglishGameCore;

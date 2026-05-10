"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGameRound,
  getCategory,
  getPlayerLevel,
  normalizeAnswer,
  uniqueChoices,
} = require("../src/english-game-core");

const sampleWords = [
  {
    id: "w1",
    term: "follow up",
    score: 45,
    streak: 2,
    category: "Work",
    level: "medium",
    lesson: {
      meaning_en: "To contact someone again after a previous conversation.",
      examples: ["I will follow up with the client today.", "Let me follow up after the meeting."],
      collocations: ["follow up with the client"],
    },
  },
  {
    id: "w2",
    term: "clarify scope",
    score: 60,
    category: "Work",
    level: "medium",
    lesson: {
      meaning_en: "To make the boundaries of the work clear.",
      examples: ["Can we clarify scope before we quote the price?"],
    },
  },
];

test("buildGameRound creates a playable meaning round with one correct answer", () => {
  const round = buildGameRound(sampleWords[0], sampleWords, { mode: "meaning" });
  assert.equal(round.mode, "meaning");
  assert.equal(round.answer, sampleWords[0].lesson.meaning_en);
  assert.ok(round.choices.includes(round.answer));
  assert.equal(round.choices.length, 4);
  assert.ok(!round.choices.some((choice) => /^Work:|^IELTS:|^Funny:/i.test(choice)));
});

test("buildGameRound creates conversation rounds with speakable lines", () => {
  for (const mode of ["dialogue", "fill", "translate"]) {
    const round = buildGameRound(sampleWords[0], sampleWords, { mode });
    assert.equal(round.mode, mode);
    assert.ok(round.title);
    assert.ok(round.coach);
    assert.ok(round.cue);
    assert.ok(round.answer);
    assert.ok(round.choices.includes(round.answer));
    assert.ok(round.speakLine);
  }
});

test("getPlayerLevel returns stable level progress from word scores", () => {
  const player = getPlayerLevel(sampleWords);
  assert.equal(player.xp, 105);
  assert.equal(player.level, 2);
  assert.equal(player.title, "Daily Talker");
  assert.ok(player.progress > 0);
});

test("normalizeAnswer and uniqueChoices prevent duplicate answer variants", () => {
  assert.equal(normalizeAnswer(" Follow-up!! "), "follow-up");
  assert.deepEqual(uniqueChoices(["A", " a ", "B", "B!"], 4), ["A", "B"]);
});

test("getCategory falls back to starter source without leaking into the meaning", () => {
  const word = { sources: ["starter-sales"], lesson: { meaning_en: "A sales meaning." } };
  assert.equal(getCategory(word), "Sales");
  const round = buildGameRound(word, sampleWords, { mode: "meaning" });
  assert.equal(round.answer, "A sales meaning.");
});

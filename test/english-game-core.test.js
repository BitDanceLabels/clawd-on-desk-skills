"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGameRound,
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
    lesson: {
      meaning_vi: "Liên hệ lại sau một cuộc nói chuyện trước đó.",
      examples: ["I will follow up with the client today.", "Let me follow up after the meeting."],
    },
  },
  {
    id: "w2",
    term: "clarify scope",
    score: 60,
    lesson: {
      meaning_vi: "Làm rõ phạm vi công việc.",
      examples: ["Can we clarify scope before we quote the price?"],
    },
  },
];

test("buildGameRound creates a playable meaning round with one correct answer", () => {
  const round = buildGameRound(sampleWords[0], sampleWords, { mode: "meaning" });
  assert.equal(round.mode, "meaning");
  assert.equal(round.answer, sampleWords[0].lesson.meaning_vi);
  assert.ok(round.choices.includes(round.answer));
  assert.ok(round.choices.length >= 2);
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

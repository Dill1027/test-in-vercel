import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * PreAssessment
 *
 * Stores the result of the 7-question pre-assessment that gates dyslexia game sections.
 * One document per userId — upserted on each submission so retakes overwrite the previous.
 *
 * Score breakdown:
 *   letters    (0-3) — Q1-Q3 letter identification
 *   twoLetter  (0-2) — Q4-Q5 two-letter word recognition
 *   threeLetter(0-2) — Q6-Q7 three-letter word recognition
 *
 * Unlock logic (mirrors frontend computeUnlockedSections):
 *   Sections 1, 2, 5, 6 — always unlocked
 *   Section 3 — requires letters === 3
 *   Section 4 — requires twoLetter === 2
 */
const preAssessmentSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    scores: {
      letters:     { type: Number, default: 0, min: 0, max: 3 },
      twoLetter:   { type: Number, default: 0, min: 0, max: 2 },
      threeLetter: { type: Number, default: 0, min: 0, max: 2 },
    },
    unlockedSections: {
      type: [Number],
      default: [1, 2, 5, 6],
    },
    attemptCount: {
      type: Number,
      default: 1,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const PreAssessment = model('PreAssessment', preAssessmentSchema);

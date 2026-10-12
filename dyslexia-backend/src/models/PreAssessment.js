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
      letterRecognition: { type: Number, default: 0, min: 0, max: 100 },
      letterSound:       { type: Number, default: 0, min: 0, max: 100 },
      twoLetterReading:  { type: Number, default: 0, min: 0, max: 100 },
      threeLetterReading:{ type: Number, default: 0, min: 0, max: 100 },
      pronunciation:     { type: Number, default: 0, min: 0, max: 100 },
      overall:           { type: Number, default: 0, min: 0, max: 100 },
    },
    assessment: {
      type: Schema.Types.Mixed,
      default: null,
    },
    recommendedLevel: {
      type: Number,
      default: 1,
      min: 1,
      max: 4,
    },
    weakLetters: {
      type: [String],
      default: [],
    },
    startedAt: {
      type: Date,
      default: null,
    },
    unlockedSections: {
      type: [Number],
      default: [1, 2, 3, 4, 5, 6],
    },
    completed: {
      type: Boolean,
      default: true,
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

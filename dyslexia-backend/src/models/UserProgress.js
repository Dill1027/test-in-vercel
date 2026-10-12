import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const sectionProgressSchema = new Schema(
  {
    sectionId: { type: Number, required: true },
    sectionTitle: { type: String, default: '' },
    sessionsPlayed: { type: Number, default: 0 },
    completedSessions: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },
    lastScore: { type: Number, default: 0 },
    lastPlayedAt: { type: Date, default: null },
  },
  { _id: false }
);

const recentSessionSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'DyslexiaSession', required: true },
    gameKey: { type: String, required: true },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    status: { type: String, default: 'completed' },
    playedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userProgressSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    moduleId: {
      type: String,
      required: true,
      default: 'dyslexia',
      index: true,
    },
    totalSessions: { type: Number, default: 0 },
    completedSessions: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    lastPlayedAt: { type: Date, default: null },
    lastSessionId: { type: Schema.Types.ObjectId, ref: 'DyslexiaSession', default: null },
    currentSectionId: { type: Number, default: null },
    currentGameKey: { type: String, default: '' },
    sections: { type: [sectionProgressSchema], default: [] },
    recentSessions: { type: [recentSessionSchema], default: [] },
    // ── Pre-assessment fields ──────────────────────────────────────────────
    assessmentDone: { type: Boolean, default: false },
    assessmentScores: {
      letters:     { type: Number, default: 0 },
      twoLetter:   { type: Number, default: 0 },
      threeLetter: { type: Number, default: 0 },
    },
    recommendedLevel: { type: Number, default: 1 },
    weakLetters: { type: [String], default: [] },
    unlockedSections: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
  },
  {
    timestamps: true,
  }
);

export const UserProgress = model('UserProgress', userProgressSchema);

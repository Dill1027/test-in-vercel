import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const dyslexiaSessionSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    moduleId: {
      type: String,
      required: true,
      default: 'dyslexia',
      index: true,
    },
    sectionId: {
      type: Number,
      index: true,
    },
    gameKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    level: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'abandoned'],
      default: 'active',
      index: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
    correctAnswers: {
      type: Number,
      default: 0,
    },
    wrongAnswers: {
      type: Number,
      default: 0,
    },
    attemptsCount: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const DyslexiaSession = model('DyslexiaSession', dyslexiaSessionSchema);

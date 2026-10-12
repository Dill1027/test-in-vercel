import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const gameAttemptSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'DyslexiaSession',
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
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
    questionId: {
      type: String,
      default: '',
      trim: true,
    },
    prompt: {
      type: String,
      default: '',
      trim: true,
    },
    expectedAnswer: {
      type: String,
      default: '',
      trim: true,
    },
    userAnswer: {
      type: String,
      default: '',
      trim: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    attemptNumber: {
      type: Number,
      default: 1,
    },
    responseTimeMs: {
      type: Number,
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

export const GameAttempt = model('GameAttempt', gameAttemptSchema);

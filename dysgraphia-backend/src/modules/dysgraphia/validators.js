const { z } = require("zod");

const shapeAttemptSchema = z.object({
  shapeId: z.string().min(1),
  coverage: z.coerce.number().min(0).max(100),
  strayRatio: z.coerce.number().min(0),  //Represents how much the child drew outside the expected shape
  starsEarned: z.coerce.number().int().min(0).max(3).optional(),
  durationSeconds: z.coerce.number().min(0).default(0),
  clientMetrics: z.record(z.any()).optional(),
});

const parseBooleanField = (value) => {
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return value;
};

const letterAttemptSchema = z.object({
  letterId: z.string().min(1),
  targetChar: z.string().min(1).max(2),
  mode: z.enum(["guided", "free-trace", "review", "independent"]),
  durationSeconds: z.coerce.number().min(0).optional().default(0),
  timerSeconds: z.coerce.number().min(0).optional(),
  strokeCount: z.coerce.number().int().min(1).max(100).optional(),
  eraseCount: z.coerce.number().int().min(0).optional().default(0),
  attemptNumber: z.coerce.number().int().min(1).optional().default(1),
  wrongAttempts: z.coerce.number().int().min(0).optional().default(0),
  choiceWrongAttempts: z.coerce.number().int().min(0).optional().default(0),
});

const letterPracticeAttemptSchema = z.object({
  letterId: z.string().min(1),
  task: z.enum(["free-trace", "guided"]),
  starsEarned: z.coerce.number().int().min(1).max(3),
  breakCount: z.coerce.number().int().min(0).optional(),
  attemptNumber: z.coerce.number().int().min(1).optional().default(1),
  additionalNodesDisplayed: z.preprocess(parseBooleanField, z.boolean()).optional().default(false),
});

const mirrorLetterAttemptSchema = z.object({
  letterId: z.string().min(1),
  targetChar: z.string().min(1).max(2),
  wrongAttempts: z.coerce.number().int().min(0).max(3),
  totalAttempts: z.coerce.number().int().min(1).max(4),
  correctAttempts: z.coerce.number().int().min(0).max(1),
  completed: z.preprocess(parseBooleanField, z.boolean().default(true)),
  drawingCorrect: z.preprocess(parseBooleanField, z.boolean().optional()),
  predictedLetter: z.string().max(2).optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  drawingDurationSeconds: z.coerce.number().min(0).default(0),
  drawingEraseCount: z.coerce.number().int().min(0).default(0),
}).superRefine((value, context) => {
  if (value.totalAttempts !== value.wrongAttempts + value.correctAttempts) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["totalAttempts"],
      message: "totalAttempts must equal wrongAttempts plus correctAttempts.",
    });
  }
  if (value.completed && value.correctAttempts !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["correctAttempts"],
      message: "A completed mirror round must have one correct selection.",
    });
  }
});

const parseJsonField = (value, fallback) => {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const wordAttemptSchema = z.object({
  group: z.enum(["twoLetters", "threeLetters"]),
  wordId: z.string().min(1),
  targetWord: z.string().min(1),
  expectedLength: z.coerce.number().int().min(1).max(10),
  attemptNumber: z.coerce.number().int().min(1).optional().default(1),
  durationSeconds: z.coerce.number().min(0).optional().default(0),
  predictedWord: z.string().min(1).optional(),
  predictedLetters: z.preprocess(
    (value) => parseJsonField(value, undefined),
    z.array(z.string().min(1)).min(1).optional()
  ),
  confidences: z.preprocess(
    (value) => parseJsonField(value, undefined),
    z.array(z.coerce.number()).min(1).optional()
  ),
  spacing: z.preprocess(
    (value) => {
      const parsed = parseJsonField(value, undefined);
      if (typeof parsed === "number") {
        return [parsed];
      }
      return parsed;
    },
    z.array(z.coerce.number().min(0)).optional()
  ),
  sizes: z.preprocess(
    (value) => {
      const parsed = parseJsonField(value, undefined);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => {
          if (typeof item === "string") {
            try {
              return JSON.parse(item);
            } catch {
              return item;
            }
          }
          return item;
        });
      }
      return parsed;
    },
    z.array(
      z.object({
        width: z.coerce.number().positive(),
        height: z.coerce.number().positive()
      })
    ).optional()
  ),
});

const writingLineAttemptSchema = z.object({
  group: z.literal("writingLines"),
  wordId: z.string().min(1),
  targetWord: z.string().min(1),
  expectedLength: z.coerce.number().int().min(1).max(10),
  durationSeconds: z.coerce.number().min(0).optional().default(0),
  attemptNumber: z.coerce.number().int().min(1).optional().default(1),
  wrongAttempts: z.coerce.number().int().min(0).optional().default(0),
  outOfLinesPct: z.coerce.number().min(0).max(100),
  letterHeightRatio: z.coerce.number().min(0).optional(),
  sizeFail: z.preprocess(parseBooleanField, z.boolean().optional()).default(false),
  spacingFail: z.preprocess(parseBooleanField, z.boolean().optional()).default(false),
  predictedWord: z.string().min(1).optional(),
  predictedLetters: z.preprocess(
    (value) => parseJsonField(value, undefined),
    z.array(z.string().min(1)).min(1).optional()
  ),
  confidences: z.preprocess(
    (value) => parseJsonField(value, undefined),
    z.array(z.coerce.number()).min(1).optional()
  ),
  segmentation: z.preprocess(
    (value) => parseJsonField(value, undefined),
    z.object({
      spacing: z.array(z.coerce.number().min(0)).optional(),
      sizes: z.array(
        z.object({
          width: z.coerce.number().positive(),
          height: z.coerce.number().positive(),
        })
      ).optional(),
    }).optional()
  ),
});

const interventionAttemptSchema = z.object({
  completionId: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
  gameType: z.enum(["mirror-letter-drag", "dotted-word-tracing", "node-letter-challenge"]),
  targetLetterId: z.string().min(1).optional(),
  targetLetter: z.string().min(1).max(2).optional(),
  targetWord: z.string().min(1).max(20).optional(),
  correct: z.preprocess(parseBooleanField, z.boolean()),
  score: z.coerce.number().min(0).max(100).optional(),
  accuracy: z.coerce.number().min(0).max(1).optional(),
  attempts: z.coerce.number().int().min(1).max(100).default(1),
  mistakes: z.coerce.number().int().min(0).max(100).default(0),
  completed: z.preprocess(parseBooleanField, z.boolean().default(true)),
  starsEarned: z.coerce.number().int().min(0).max(3).default(0),
  durationSeconds: z.coerce.number().min(0).max(7200).default(0),
}).superRefine((value, context) => {
  if (value.gameType === "node-letter-challenge" && (!value.targetLetterId || !value.targetLetter)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetLetterId"], message: "The node-letter game requires a target letter." });
  }
  if (value.gameType === "dotted-word-tracing" && !value.targetWord) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetWord"], message: "The dotted-word game requires a target word." });
  }
});

const sessionSchema = z.object({
  activityType: z.enum(["shapes", "letter", "review", "two-letter-word", "three-letter-word", "writing-lines"]),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1),
  durationMinutes: z.coerce.number().min(0),
  itemsCompleted: z.coerce.number().int().min(0),
  starsEarned: z.coerce.number().int().min(0),
  itemIds: z.array(z.string().min(1)).optional(),
});

const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(5),
});

module.exports = {
  interventionAttemptSchema,
  letterAttemptSchema,
  letterPracticeAttemptSchema,
  mirrorLetterAttemptSchema,
  recentActivityQuerySchema,
  sessionSchema,
  shapeAttemptSchema,
  wordAttemptSchema,
  writingLineAttemptSchema,
};

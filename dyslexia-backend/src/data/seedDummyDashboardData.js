import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { PreAssessment } from '../models/PreAssessment.js';
import { UserProgress } from '../models/UserProgress.js';
import { DyslexiaSession } from '../models/DyslexiaSession.js';
import { GameAttempt } from '../models/GameAttempt.js';

const seedUserId = 'dummy-child-001';

const connect = async () => {
	if (!env.mongodbUri) {
		throw new Error('MONGODB_URI is required to seed dummy data.');
	}

	const options = {};
	if (env.mongodbDbName) {
		options.dbName = env.mongodbDbName;
	}

	await mongoose.connect(env.mongodbUri, options);
};

const buildDummySessions = () => {
	const now = Date.now();

	return [
		{
			userId: seedUserId,
			moduleId: 'dyslexia',
			sectionId: 2,
			gameKey: 'letter-listening',
			level: 1,
			status: 'completed',
			score: 68,
			totalQuestions: 10,
			correctAnswers: 7,
			wrongAnswers: 3,
			attemptsCount: 10,
			startedAt: new Date(now - 1000 * 60 * 60 * 24 * 5),
			completedAt: new Date(now - 1000 * 60 * 60 * 24 * 5 + 1000 * 240),
			durationSeconds: 240,
			lastAttemptAt: new Date(now - 1000 * 60 * 60 * 24 * 5 + 1000 * 220),
			metadata: { seeded: true },
		},
		{
			userId: seedUserId,
			moduleId: 'dyslexia',
			sectionId: 3,
			gameKey: 'two-letter-word-match',
			level: 1,
			status: 'completed',
			score: 74,
			totalQuestions: 10,
			correctAnswers: 8,
			wrongAnswers: 2,
			attemptsCount: 10,
			startedAt: new Date(now - 1000 * 60 * 60 * 24 * 3),
			completedAt: new Date(now - 1000 * 60 * 60 * 24 * 3 + 1000 * 260),
			durationSeconds: 260,
			lastAttemptAt: new Date(now - 1000 * 60 * 60 * 24 * 3 + 1000 * 240),
			metadata: { seeded: true },
		},
		{
			userId: seedUserId,
			moduleId: 'dyslexia',
			sectionId: 6,
			gameKey: 'word-builder',
			level: 2,
			status: 'completed',
			score: 86,
			totalQuestions: 12,
			correctAnswers: 10,
			wrongAnswers: 2,
			attemptsCount: 12,
			startedAt: new Date(now - 1000 * 60 * 60 * 24),
			completedAt: new Date(now - 1000 * 60 * 60 * 24 + 1000 * 290),
			durationSeconds: 290,
			lastAttemptAt: new Date(now - 1000 * 60 * 60 * 24 + 1000 * 270),
			metadata: { seeded: true },
		},
	];
};

const buildSections = () => [
	{
		sectionId: 2,
		sectionTitle: 'අකුරු කියමු',
		sessionsPlayed: 1,
		completedSessions: 1,
		bestScore: 68,
		lastScore: 68,
		lastPlayedAt: new Date(),
	},
	{
		sectionId: 3,
		sectionTitle: 'අකුරු 2 වචන කියමු',
		sessionsPlayed: 1,
		completedSessions: 1,
		bestScore: 74,
		lastScore: 74,
		lastPlayedAt: new Date(),
	},
	{
		sectionId: 6,
		sectionTitle: 'වචන හදමු',
		sessionsPlayed: 1,
		completedSessions: 1,
		bestScore: 86,
		lastScore: 86,
		lastPlayedAt: new Date(),
	},
];

const seed = async () => {
	await connect();

	await GameAttempt.deleteMany({ userId: seedUserId, moduleId: 'dyslexia' });
	await DyslexiaSession.deleteMany({ userId: seedUserId, moduleId: 'dyslexia' });

	const sessions = await DyslexiaSession.insertMany(buildDummySessions());

	await PreAssessment.findOneAndUpdate(
		{ userId: seedUserId },
		{
			$set: {
				userId: seedUserId,
				scores: {
					letters: 2,
					twoLetter: 1,
					threeLetter: 1,
				},
				assessment: {
					assessmentId: 'seed-assessment-001',
					childId: seedUserId,
					completed: true,
					scores: {
						letterRecognition: 67,
						letterSound: 62,
						twoLetterReading: 50,
						threeLetterReading: 50,
						pronunciation: 58,
						overall: 57,
					},
					weakLetters: ['ක', 'ට', 'ද'],
				},
				recommendedLevel: 1,
				weakLetters: ['ක', 'ට', 'ද'],
				unlockedSections: [1, 2, 5, 6],
				completed: true,
				attemptCount: 1,
				completedAt: new Date(),
			},
		},
		{ upsert: true, new: true }
	);

	const totalScore = sessions.reduce((acc, s) => acc + (s.score || 0), 0);

	await UserProgress.findOneAndUpdate(
		{ userId: seedUserId, moduleId: 'dyslexia' },
		{
			$set: {
				userId: seedUserId,
				moduleId: 'dyslexia',
				totalSessions: sessions.length,
				completedSessions: sessions.length,
				bestScore: Math.max(...sessions.map((s) => s.score || 0)),
				totalScore,
				averageScore: Number((totalScore / sessions.length).toFixed(2)),
				lastPlayedAt: sessions[sessions.length - 1].completedAt,
				lastSessionId: sessions[sessions.length - 1]._id,
				currentSectionId: 6,
				currentGameKey: 'word-builder',
				sections: buildSections(),
				recentSessions: sessions
					.slice()
					.reverse()
					.map((s) => ({
						sessionId: s._id,
						gameKey: s.gameKey,
						score: s.score,
						totalQuestions: s.totalQuestions,
						status: s.status,
						playedAt: s.completedAt,
					})),
				assessmentDone: true,
				assessmentScores: {
					letters: 2,
					twoLetter: 1,
					threeLetter: 1,
				},
				recommendedLevel: 1,
				weakLetters: ['ක', 'ට', 'ද'],
				unlockedSections: [1, 2, 5, 6],
			},
		},
		{ upsert: true, new: true }
	);

	console.log('Dummy dashboard data seeded for user:', seedUserId);
};

seed()
	.catch((error) => {
		console.error('Failed to seed dummy dashboard data:', error.message);
		process.exitCode = 1;
	})
	.finally(async () => {
		await mongoose.disconnect();
	});

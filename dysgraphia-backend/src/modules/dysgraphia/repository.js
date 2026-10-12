const crypto = require("crypto");

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, removeUndefined(fieldValue)])
    );
  }
  return value;
}

function createFirestoreDysgraphiaRepository({ firestore }) {
  async function timeFirestore(operation, uid, callback) {
    const label = `[dysgraphia:${uid}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}] ${operation}`;
    console.time(label);
    try {
      return await callback();
    } finally {
      console.timeEnd(label);
    }
  }

  function userDoc(uid) {
    return firestore.collection("userProfiles").doc(uid);
  }

  function summaryDoc(uid) {
    return userDoc(uid).collection("moduleProgress").doc("dysgraphiaSummary");
  }

  function attemptsCollection(uid) {
    return userDoc(uid).collection("dysgraphiaAttempts");
  }

  function sessionsCollection(uid) {
    return userDoc(uid).collection("dysgraphiaSessions");
  }

  async function getUserRole(uid) {
    const snapshot = await timeFirestore("FIRESTORE_USER_ROLE_READ", uid, () => userDoc(uid).get());
    return snapshot.exists ? snapshot.data()?.role || null : null;
  }

  async function getSummary(uid) {
    const snapshot = await timeFirestore("FIRESTORE_SUMMARY_READ", uid, () => summaryDoc(uid).get());
    return snapshot.exists ? snapshot.data() : null;
  }

  async function saveSummary(uid, summary) {
    await timeFirestore("FIRESTORE_SUMMARY_WRITE", uid, () =>
      summaryDoc(uid).set(removeUndefined(summary), { merge: true })
    );
  }

  async function createAttempt(uid, attempt) {
    const docRef = attemptsCollection(uid).doc();
    await timeFirestore("FIRESTORE_ATTEMPT_WRITE", uid, () =>
      docRef.set(removeUndefined({
        ...attempt,
        attemptId: docRef.id,
      }))
    );
    return docRef.id;
  }

  async function createSession(uid, session) {
    const docRef = sessionsCollection(uid).doc();
    await timeFirestore("FIRESTORE_SESSION_WRITE", uid, () =>
      docRef.set(removeUndefined({
        ...session,
        sessionId: docRef.id,
      }))
    );
    return docRef.id;
  }

  async function listRecentSessions(uid, limit = 5) {
    const snapshot = await timeFirestore("FIRESTORE_RECENT_SESSIONS_READ", uid, () =>
      sessionsCollection(uid)
        .orderBy("endedAt", "desc")
        .limit(limit)
        .get()
    );

    return snapshot.docs.map((doc) => ({
      sessionId: doc.id,
      ...doc.data(),
    }));
  }

  async function deleteCollection(collectionRef) {
    let snapshot = await collectionRef.limit(200).get();
    while (!snapshot.empty) {
      const batch = firestore.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      snapshot = await collectionRef.limit(200).get();
    }
  }

  async function resetUserProgress(uid) {
    await deleteCollection(attemptsCollection(uid));
    await deleteCollection(sessionsCollection(uid));
    await summaryDoc(uid).delete().catch(() => undefined);
  }

  return {
    createAttempt,
    createSession,
    getSummary,
    getUserRole,
    listRecentSessions,
    resetUserProgress,
    saveSummary,
  };
}

function createMemoryDysgraphiaRepository() {
  const summaries = new Map();
  const attempts = new Map();
  const sessions = new Map();
  const profiles = new Map();

  function getCollection(map, uid) {
    if (!map.has(uid)) {
      map.set(uid, []);
    }
    return map.get(uid);
  }

  return {
    async getUserRole(uid) {
      return profiles.get(uid)?.role || null;
    },
    async getSummary(uid) {
      return summaries.get(uid) || null;
    },
    async saveSummary(uid, summary) {
      summaries.set(uid, JSON.parse(JSON.stringify(summary)));
    },
    async createAttempt(uid, attempt) {
      const attemptId = attempt.attemptId || crypto.randomUUID();
      getCollection(attempts, uid).push({
        ...JSON.parse(JSON.stringify(attempt)),
        attemptId,
      });
      return attemptId;
    },
    async createSession(uid, session) {
      const sessionId = session.sessionId || crypto.randomUUID();
      getCollection(sessions, uid).push({
        ...JSON.parse(JSON.stringify(session)),
        sessionId,
      });
      return sessionId;
    },
    async listRecentSessions(uid, limit = 5) {
      return [...getCollection(sessions, uid)]
        .sort((left, right) => String(right.endedAt).localeCompare(String(left.endedAt)))
        .slice(0, limit);
    },
    async resetUserProgress(uid) {
      summaries.delete(uid);
      attempts.delete(uid);
      sessions.delete(uid);
    },
    seedUserProfile(uid, profile) {
      profiles.set(uid, JSON.parse(JSON.stringify(profile)));
    },
    debugGetAttempts(uid) {
      return [...getCollection(attempts, uid)];
    },
    debugGetSessions(uid) {
      return [...getCollection(sessions, uid)];
    },
  };
}

module.exports = {
  createFirestoreDysgraphiaRepository,
  createMemoryDysgraphiaRepository,
};

const { AppError } = require("../utils/appError");

function getSafeRequestContext(req) {
  return {
    method: req.method,
    path: req.originalUrl || req.url,
  };
}

function parseBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

function resolveRole(decodedToken, profileRole) {
  if (decodedToken?.role) {
    return decodedToken.role;
  }

  if (decodedToken?.roles && Array.isArray(decodedToken.roles) && decodedToken.roles.length > 0) {
    return decodedToken.roles[0];
  }

  return profileRole || "student";
}

function createAuthMiddleware({ authClient, repository, logger }) {
  return async function authMiddleware(req, res, next) {
    const token = parseBearerToken(req.headers.authorization);

    if (!token) {
      logger?.warn(getSafeRequestContext(req), "Authentication header missing or malformed");
      next(new AppError(401, "UNAUTHENTICATED", "Missing or invalid Authorization header."));
      return;
    }

    try {
      const decodedToken = await authClient.verifyIdToken(token);
      const profileRole = repository?.getUserRole ? await repository.getUserRole(decodedToken.uid) : null;

      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email || "",
        role: resolveRole(decodedToken, profileRole),
        claims: decodedToken,
      };

      logger?.debug(getSafeRequestContext(req), "Firebase token verified");
      next();
    } catch (error) {
      logger?.warn(
        {
          ...getSafeRequestContext(req),
          errorCode: typeof error?.code === "string" ? error.code : "TOKEN_VERIFICATION_FAILED",
        },
        "Firebase token verification failed"
      );

      next(new AppError(401, "UNAUTHENTICATED", "Authentication failed."));
    }
  };
}

module.exports = {
  createAuthMiddleware,
};

/**
 * M2-Tools – Standardized API Error Class
 * 
 * Extends the native Error to include HTTP status codes and optional details.
 */
class ApiError extends Error {
    /**
     * @param {number} statusCode – HTTP Status Code (e.g., 400, 401, 403, 404, 500)
     * @param {string} message – User-facing error message
     * @param {any} details – Optional additional context (e.g., validation errors)
     */
    constructor(statusCode, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'ApiError';
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Factory for 400 Bad Request
     */
    static badRequest(msg, details) {
        return new ApiError(400, msg, details);
    }

    /**
     * Factory for 401 Unauthorized
     */
    static unauthorized(msg = 'Nicht autorisiert') {
        return new ApiError(401, msg);
    }

    /**
     * Factory for 403 Forbidden
     */
    static forbidden(msg = 'Keine Berechtigung') {
        return new ApiError(403, msg);
    }

    /**
     * Factory for 404 Not Found
     */
    static notFound(msg = 'Ressource nicht gefunden') {
        return new ApiError(404, msg);
    }

    /**
     * Factory for 500 Internal Server Error
     */
    static internal(msg = 'Ein interner Serverfehler ist aufgetreten') {
        return new ApiError(500, msg);
    }
}

module.exports = ApiError;

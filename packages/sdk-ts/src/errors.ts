/**
 * Base error class for all Holocron API errors.
 * @category Errors
 */
export class HolocronError extends Error {
	/** HTTP status code from the API response */
	readonly statusCode?: number;

	/** Raw error response from the API */
	readonly apiError?: unknown;

	/** The operation that failed */
	readonly operation?: string;

	constructor(
		message: string,
		options?: {
			statusCode?: number;
			apiError?: unknown;
			operation?: string;
			cause?: Error;
		},
	) {
		super(message, { cause: options?.cause });
		this.name = "HolocronError";
		this.statusCode = options?.statusCode;
		this.apiError = options?.apiError;
		this.operation = options?.operation;
	}
}

/**
 * Thrown when a requested resource is not found (404).
 * @category Errors
 */
export class NotFoundError extends HolocronError {
	/** The type of resource that was not found */
	readonly resourceType?: string;

	/** The UID of the resource that was not found */
	readonly resourceUid?: string;

	constructor(
		message: string,
		options?: {
			resourceType?: string;
			resourceUid?: string;
			apiError?: unknown;
			operation?: string;
		},
	) {
		super(message, { statusCode: 404, ...options });
		this.name = "NotFoundError";
		this.resourceType = options?.resourceType;
		this.resourceUid = options?.resourceUid;
	}
}

/**
 * Thrown when the API returns a validation error (422).
 * @category Errors
 */
export class ValidationError extends HolocronError {
	/** Validation error details from the API */
	readonly details?: Array<{
		loc: (string | number)[];
		msg: string;
		type: string;
	}>;

	constructor(
		message: string,
		options?: {
			details?: Array<{ loc: (string | number)[]; msg: string; type: string }>;
			apiError?: unknown;
			operation?: string;
		},
	) {
		super(message, { statusCode: 422, ...options });
		this.name = "ValidationError";
		this.details = options?.details;
	}
}

/**
 * Thrown when the API request fails due to network or other issues.
 * @category Errors
 */
export class NetworkError extends HolocronError {
	constructor(message: string, options?: { cause?: Error; operation?: string }) {
		super(message, { ...options });
		this.name = "NetworkError";
	}
}

/**
 * Parses an API error response and returns the appropriate error class.
 * @internal
 */
export function createApiError(
	operation: string,
	error: unknown,
	statusCode?: number,
): HolocronError {
	// Handle validation errors (422)
	if (statusCode === 422 && error && typeof error === "object" && "detail" in error) {
		const details = (error as { detail?: unknown[] }).detail;
		const messages = Array.isArray(details)
			? details.map((d) => (d as { msg?: string }).msg).filter(Boolean)
			: [];
		const message = messages.length > 0 ? messages.join(", ") : `Validation failed: ${operation}`;

		return new ValidationError(message, {
			details: details as Array<{ loc: (string | number)[]; msg: string; type: string }>,
			apiError: error,
			operation,
		});
	}

	// Handle not found (404)
	if (statusCode === 404) {
		return new NotFoundError(`Not found: ${operation}`, {
			apiError: error,
			operation,
		});
	}

	// Default error
	const message =
		error && typeof error === "object" && "message" in error
			? String((error as { message: unknown }).message)
			: `Failed: ${operation}`;

	return new HolocronError(message, {
		statusCode,
		apiError: error,
		operation,
	});
}

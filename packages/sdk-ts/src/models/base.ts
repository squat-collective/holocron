import type { HolocronClient } from "../client";

/**
 * Abstract base class for Active Record style entities.
 * Provides state management, dirty tracking, and common CRUD operations.
 *
 * @typeParam TData - The response type from the API (e.g., Asset, Actor)
 * @typeParam TCreate - The create input type
 * @typeParam TUpdate - The update input type
 * @category Models
 */
export abstract class BaseEntity<TData extends { uid: string }, TCreate, TUpdate> {
	/** Reference to the client for API calls */
	protected readonly _client: HolocronClient;

	/** Current entity data */
	protected _data: TData;

	/** Original data from last save/refresh (for revert) */
	protected _originalData: TData;

	/** Set of field names that have been modified */
	protected _dirtyFields: Set<string> = new Set();

	/** Whether this entity exists on the server */
	protected _persisted: boolean;

	/**
	 * Creates a new entity instance.
	 * @param client - The HolocronClient instance
	 * @param data - The entity data
	 * @param persisted - Whether this entity exists on the server
	 */
	constructor(client: HolocronClient, data: TData, persisted: boolean) {
		this._client = client;
		this._data = { ...data };
		this._originalData = { ...data };
		this._persisted = persisted;
	}

	/**
	 * The entity's unique identifier.
	 * Empty string for new (unpersisted) entities.
	 */
	get uid(): string {
		return this._data.uid;
	}

	/**
	 * Whether this entity has unsaved changes.
	 */
	get isDirty(): boolean {
		return this._dirtyFields.size > 0;
	}

	/**
	 * Whether this entity is new (not yet saved to server).
	 */
	get isNew(): boolean {
		return !this._persisted;
	}

	/**
	 * The set of field names that have been modified.
	 */
	get dirtyFields(): ReadonlySet<string> {
		return this._dirtyFields;
	}

	/**
	 * Sets a field value and tracks the change.
	 * @param field - The field name
	 * @param value - The new value
	 */
	protected _setField<K extends keyof TData>(field: K, value: TData[K]): void {
		const currentValue = this._data[field];

		// Deep comparison for objects/arrays
		if (this._deepEqual(currentValue, value)) {
			return;
		}

		this._data[field] = value;

		// Check if value matches original (for revert detection)
		if (this._deepEqual(this._originalData[field], value)) {
			this._dirtyFields.delete(field as string);
		} else {
			this._dirtyFields.add(field as string);
		}
	}

	/**
	 * Deep equality check for values.
	 */
	protected _deepEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (a === null || b === null) return a === b;
		if (typeof a !== "object" || typeof b !== "object") return false;

		const aKeys = Object.keys(a as object);
		const bKeys = Object.keys(b as object);
		if (aKeys.length !== bKeys.length) return false;

		return aKeys.every((key) =>
			this._deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
		);
	}

	/**
	 * Saves the entity to the server.
	 * Creates a new entity if `isNew` is true, otherwise updates existing.
	 * Only sends dirty fields on update.
	 * @returns This entity instance (for chaining)
	 */
	async save(): Promise<this> {
		if (this.isNew) {
			const created = await this._create();
			this._data = { ...created };
			this._originalData = { ...created };
			this._dirtyFields.clear();
			this._persisted = true;
		} else if (this.isDirty) {
			const updateData = this._buildUpdatePayload();
			const updated = await this._update(updateData);
			this._data = { ...updated };
			this._originalData = { ...updated };
			this._dirtyFields.clear();
		}
		return this;
	}

	/**
	 * Deletes this entity from the server.
	 * @throws Error if entity is new (not yet persisted)
	 */
	async delete(): Promise<void> {
		if (this.isNew) {
			throw new Error("Cannot delete an entity that has not been saved");
		}
		await this._delete();
		this._persisted = false;
	}

	/**
	 * Reloads this entity's data from the server.
	 * Discards any local changes.
	 * @returns This entity instance (for chaining)
	 * @throws Error if entity is new (not yet persisted)
	 */
	async refresh(): Promise<this> {
		if (this.isNew) {
			throw new Error("Cannot refresh an entity that has not been saved");
		}
		const data = await this._fetch();
		this._data = { ...data };
		this._originalData = { ...data };
		this._dirtyFields.clear();
		return this;
	}

	/**
	 * Discards local changes and reverts to the last saved state.
	 */
	revert(): void {
		this._data = { ...this._originalData };
		this._dirtyFields.clear();
	}

	/**
	 * Converts the entity to a plain JSON object.
	 * @returns The entity data
	 */
	toJSON(): TData {
		return { ...this._data };
	}

	/**
	 * Builds the update payload with only dirty fields.
	 */
	protected _buildUpdatePayload(): TUpdate {
		const payload: Record<string, unknown> = {};
		for (const field of this._dirtyFields) {
			payload[field] = this._data[field as keyof TData];
		}
		return payload as TUpdate;
	}

	/**
	 * Creates a new entity on the server.
	 * Subclasses must implement this.
	 */
	protected abstract _create(): Promise<TData>;

	/**
	 * Updates the entity on the server.
	 * Subclasses must implement this.
	 */
	protected abstract _update(data: TUpdate): Promise<TData>;

	/**
	 * Deletes the entity from the server.
	 * Subclasses must implement this.
	 */
	protected abstract _delete(): Promise<void>;

	/**
	 * Fetches the entity from the server.
	 * Subclasses must implement this.
	 */
	protected abstract _fetch(): Promise<TData>;

	/**
	 * Builds the create payload from current data.
	 * Subclasses must implement this.
	 */
	protected abstract _buildCreatePayload(): TCreate;
}

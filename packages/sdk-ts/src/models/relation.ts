import type {
	EntityRef,
	HolocronClient,
	Relation,
	RelationCreateInput,
	RelationType,
} from "../client";
import { NotFoundError } from "../errors";
import { resolveUid } from "../utils";
import type { ActorEntity } from "./actor";
import type { AssetEntity } from "./asset";

/**
 * Input for creating a new RelationEntity.
 * @category Models
 */
export interface RelationEntityCreate {
	uid?: string | null;
	from: EntityRef;
	to: EntityRef;
	type: RelationType;
	verified?: boolean;
	discovered_by?: string | null;
	properties?: Record<string, unknown>;
}

/** Entity type that can be on either end of a relation */
export type RelatedEntity = AssetEntity | ActorEntity;

/**
 * Active Record style entity for relations between entities.
 * Supports lazy loading of related entities via `fetchFrom()` and `fetchTo()`.
 *
 * Note: Relations only support create and delete operations (no update API).
 *
 * @example
 * ```typescript
 * // Create a relation
 * const relation = client.models.relations.new({
 *   from: actor,
 *   to: asset,
 *   type: 'owns'
 * });
 * await relation.save();
 *
 * // Lazy load related entities
 * const owner = await relation.fetchFrom();
 * const owned = await relation.fetchTo();
 * ```
 *
 * @category Models
 */
export class RelationEntity {
	/** Reference to the client for API calls */
	protected readonly _client: HolocronClient;

	/** Current relation data */
	protected _data: Relation;

	/** Whether this relation exists on the server */
	protected _persisted: boolean;

	/** Cached 'from' entity */
	protected _fromEntity: RelatedEntity | undefined;

	/** Cached 'to' entity */
	protected _toEntity: RelatedEntity | undefined;

	/**
	 * Creates a new RelationEntity.
	 * Use `client.models.relations.new()` or `client.models.relations.list()` instead.
	 * @internal
	 */
	constructor(client: HolocronClient, data: Relation, persisted: boolean) {
		this._client = client;
		this._data = { ...data };
		this._persisted = persisted;
	}

	/**
	 * Creates a new (unpersisted) RelationEntity from create input.
	 * @internal
	 */
	static _fromCreate(client: HolocronClient, input: RelationEntityCreate): RelationEntity {
		const now = new Date().toISOString();
		const data: Relation = {
			uid: input.uid ?? "",
			from_uid: resolveUid(input.from),
			to_uid: resolveUid(input.to),
			type: input.type,
			verified: input.verified ?? true,
			discovered_by: input.discovered_by ?? null,
			properties: input.properties ?? {},
			created_at: now,
		};
		return new RelationEntity(client, data, false);
	}

	/**
	 * Creates a RelationEntity from server data.
	 * @internal
	 */
	static _fromData(client: HolocronClient, data: Relation): RelationEntity {
		return new RelationEntity(client, data, true);
	}

	// ===== Property Getters =====

	/**
	 * The relation's unique identifier.
	 * Empty string for new (unpersisted) relations.
	 */
	get uid(): string {
		return this._data.uid;
	}

	/**
	 * The UID of the source entity.
	 */
	get fromUid(): string {
		return this._data.from_uid;
	}

	/**
	 * The UID of the target entity.
	 */
	get toUid(): string {
		return this._data.to_uid;
	}

	/**
	 * The relation type.
	 */
	get type(): RelationType {
		return this._data.type;
	}

	/**
	 * Whether the relation has been human-verified.
	 */
	get verified(): boolean {
		return this._data.verified;
	}

	/**
	 * The reader/connector that discovered this relation.
	 */
	get discoveredBy(): string | null {
		return this._data.discovered_by;
	}

	/**
	 * Custom properties for the relation.
	 */
	get properties(): Record<string, unknown> {
		return this._data.properties;
	}

	/**
	 * When the relation was created (read-only).
	 */
	get createdAt(): Date {
		return new Date(this._data.created_at);
	}

	/**
	 * Whether this relation is new (not yet saved to server).
	 */
	get isNew(): boolean {
		return !this._persisted;
	}

	// ===== Lazy Loading =====

	/**
	 * The cached 'from' entity, if previously fetched.
	 * Returns undefined if not yet fetched.
	 */
	get from(): RelatedEntity | undefined {
		return this._fromEntity;
	}

	/**
	 * The cached 'to' entity, if previously fetched.
	 * Returns undefined if not yet fetched.
	 */
	get to(): RelatedEntity | undefined {
		return this._toEntity;
	}

	/**
	 * Fetches and caches the 'from' entity.
	 * Tries to fetch as an asset first, falls back to actor.
	 * @returns The source entity
	 */
	async fetchFrom(): Promise<RelatedEntity> {
		if (this._fromEntity) {
			return this._fromEntity;
		}

		this._fromEntity = await this._fetchEntity(this._data.from_uid);
		return this._fromEntity;
	}

	/**
	 * Fetches and caches the 'to' entity.
	 * Tries to fetch as an asset first, falls back to actor.
	 * @returns The target entity
	 */
	async fetchTo(): Promise<RelatedEntity> {
		if (this._toEntity) {
			return this._toEntity;
		}

		this._toEntity = await this._fetchEntity(this._data.to_uid);
		return this._toEntity;
	}

	/**
	 * Fetches an entity by UID, trying asset then actor.
	 * Only falls back to actor if asset returns 404, re-throws other errors.
	 */
	protected async _fetchEntity(uid: string): Promise<RelatedEntity> {
		// Import dynamically to avoid circular dependency
		const { AssetEntity } = await import("./asset");
		const { ActorEntity } = await import("./actor");

		// Try to fetch as asset first
		try {
			const assetData = await this._client.assets.get(uid);
			return AssetEntity._fromData(this._client, assetData);
		} catch (error) {
			// Only fall back to actor on 404, re-throw other errors
			if (!(error instanceof NotFoundError)) {
				throw error;
			}
		}

		// Try to fetch as actor
		const actorData = await this._client.actors.get(uid);
		return ActorEntity._fromData(this._client, actorData);
	}

	// ===== CRUD Operations =====

	/**
	 * Saves the relation to the server.
	 * Only supports creating new relations (update not available).
	 * @returns This relation instance (for chaining)
	 * @throws Error if trying to save an already persisted relation
	 */
	async save(): Promise<this> {
		if (!this.isNew) {
			throw new Error("Relations cannot be updated. Delete and create a new one instead.");
		}

		const body: RelationCreateInput = {
			uid: this._data.uid || undefined,
			from: this._data.from_uid,
			to: this._data.to_uid,
			type: this._data.type,
			verified: this._data.verified,
			discovered_by: this._data.discovered_by,
			properties: this._data.properties,
		};

		const created = await this._client.relations.create(body);
		this._data = { ...created };
		this._persisted = true;
		return this;
	}

	/**
	 * Deletes this relation from the server.
	 * @throws Error if relation is new (not yet persisted)
	 */
	async delete(): Promise<void> {
		if (this.isNew) {
			throw new Error("Cannot delete a relation that has not been saved");
		}
		await this._client.relations.delete(this._data.uid);
		this._persisted = false;
	}

	/**
	 * Converts the relation to a plain JSON object.
	 * @returns The relation data
	 */
	toJSON(): Relation {
		return { ...this._data };
	}
}

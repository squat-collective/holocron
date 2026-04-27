import type { Actor, ActorCreate, ActorType, ActorUpdate, HolocronClient } from "../client";
import { BaseEntity } from "./base";

/**
 * Input for creating a new ActorEntity.
 * @category Models
 */
export interface ActorEntityCreate {
	uid?: string | null;
	type: ActorType;
	name: string;
	email?: string | null;
	description?: string | null;
	verified?: boolean;
	discovered_by?: string | null;
	metadata?: Record<string, unknown>;
}

/**
 * Active Record style entity for actors (people or groups).
 * Provides `.save()`, `.delete()`, `.refresh()` methods and change tracking.
 *
 * @example
 * ```typescript
 * // Create a new actor
 * const actor = client.models.actors.new({
 *   type: 'person',
 *   name: 'Jane Doe',
 *   email: 'jane@example.com'
 * });
 * await actor.save();
 *
 * // Modify and save
 * actor.name = 'Jane Smith';
 * await actor.save();
 * ```
 *
 * @category Models
 */
export class ActorEntity extends BaseEntity<Actor, ActorCreate, ActorUpdate> {
	/**
	 * Creates a new (unpersisted) ActorEntity from create input.
	 * @internal
	 */
	static _fromCreate(client: HolocronClient, input: ActorEntityCreate): ActorEntity {
		const now = new Date().toISOString();
		const data: Actor = {
			uid: input.uid ?? "",
			type: input.type,
			name: input.name,
			email: input.email ?? null,
			description: input.description ?? null,
			verified: input.verified ?? true,
			discovered_by: input.discovered_by ?? null,
			metadata: input.metadata ?? {},
			created_at: now,
			updated_at: now,
		};
		return new ActorEntity(client, data, false);
	}

	/**
	 * Creates an ActorEntity from server data.
	 * @internal
	 */
	static _fromData(client: HolocronClient, data: Actor): ActorEntity {
		return new ActorEntity(client, data, true);
	}

	// ===== Property Getters and Setters =====

	/**
	 * The actor type (read-only after creation).
	 */
	get type(): ActorType {
		return this._data.type;
	}

	/**
	 * The actor name.
	 */
	get name(): string {
		return this._data.name;
	}

	set name(value: string) {
		this._setField("name", value);
	}

	/**
	 * The actor's email address.
	 */
	get email(): string | null {
		return this._data.email;
	}

	set email(value: string | null) {
		this._setField("email", value);
	}

	/**
	 * The actor description.
	 */
	get description(): string | null {
		return this._data.description;
	}

	set description(value: string | null) {
		this._setField("description", value);
	}

	/**
	 * Whether the actor has been human-verified.
	 */
	get verified(): boolean {
		return this._data.verified;
	}

	set verified(value: boolean) {
		this._setField("verified", value);
	}

	/**
	 * The reader/connector that discovered this actor.
	 */
	get discoveredBy(): string | null {
		return this._data.discovered_by;
	}

	set discoveredBy(value: string | null) {
		this._setField("discovered_by", value);
	}

	/**
	 * Custom metadata for the actor.
	 *
	 * **Note:** Direct mutations to this object are not tracked.
	 * To trigger change detection, reassign the entire object.
	 *
	 * @example
	 * ```typescript
	 * // ❌ Not tracked - direct mutation
	 * actor.metadata.key = 'value';
	 *
	 * // ✅ Tracked - reassignment
	 * actor.metadata = { ...actor.metadata, key: 'value' };
	 * ```
	 */
	get metadata(): Record<string, unknown> {
		return this._data.metadata;
	}

	set metadata(value: Record<string, unknown>) {
		this._setField("metadata", value);
	}

	/**
	 * When the actor was created (read-only).
	 */
	get createdAt(): Date {
		return new Date(this._data.created_at);
	}

	/**
	 * When the actor was last updated (read-only).
	 */
	get updatedAt(): Date {
		return new Date(this._data.updated_at);
	}

	// ===== Protected Implementation Methods =====

	protected _buildCreatePayload(): ActorCreate {
		return {
			uid: this._data.uid || undefined,
			type: this._data.type,
			name: this._data.name,
			email: this._data.email,
			description: this._data.description,
			verified: this._data.verified,
			discovered_by: this._data.discovered_by,
			metadata: this._data.metadata,
		};
	}

	protected async _create(): Promise<Actor> {
		return this._client.actors.create(this._buildCreatePayload());
	}

	protected async _update(data: ActorUpdate): Promise<Actor> {
		return this._client.actors.update(this._data.uid, data);
	}

	protected async _delete(): Promise<void> {
		return this._client.actors.delete(this._data.uid);
	}

	protected async _fetch(): Promise<Actor> {
		return this._client.actors.get(this._data.uid);
	}
}

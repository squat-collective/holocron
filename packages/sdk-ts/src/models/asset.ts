import type {
	Asset,
	AssetCreate,
	AssetStatus,
	AssetType,
	AssetUpdate,
	HolocronClient,
} from "../client";
import { BaseEntity } from "./base";

/**
 * Input for creating a new AssetEntity.
 * @category Models
 */
export interface AssetEntityCreate {
	uid?: string | null;
	type: AssetType;
	name: string;
	description?: string | null;
	location?: string | null;
	status?: AssetStatus;
	verified?: boolean;
	discovered_by?: string | null;
	metadata?: Record<string, unknown>;
}

/**
 * Active Record style entity for assets.
 * Provides `.save()`, `.delete()`, `.refresh()` methods and change tracking.
 *
 * @example
 * ```typescript
 * // Create a new asset
 * const asset = client.models.assets.new({ type: 'dataset', name: 'Sales' });
 * await asset.save();
 *
 * // Modify and save (only sends changed fields)
 * asset.description = 'Monthly sales data';
 * await asset.save();
 *
 * // Revert changes
 * asset.name = 'Wrong Name';
 * asset.revert();
 * ```
 *
 * @category Models
 */
export class AssetEntity extends BaseEntity<Asset, AssetCreate, AssetUpdate> {
	/**
	 * Creates a new (unpersisted) AssetEntity from create input.
	 * @internal
	 */
	static _fromCreate(client: HolocronClient, input: AssetEntityCreate): AssetEntity {
		const now = new Date().toISOString();
		const data: Asset = {
			uid: input.uid ?? "",
			type: input.type,
			name: input.name,
			description: input.description ?? null,
			location: input.location ?? null,
			status: input.status ?? "active",
			verified: input.verified ?? true,
			discovered_by: input.discovered_by ?? null,
			metadata: input.metadata ?? {},
			created_at: now,
			updated_at: now,
		};
		return new AssetEntity(client, data, false);
	}

	/**
	 * Creates an AssetEntity from server data.
	 * @internal
	 */
	static _fromData(client: HolocronClient, data: Asset): AssetEntity {
		return new AssetEntity(client, data, true);
	}

	// ===== Property Getters and Setters =====

	/**
	 * The asset type (read-only after creation).
	 */
	get type(): AssetType {
		return this._data.type;
	}

	/**
	 * The asset name.
	 */
	get name(): string {
		return this._data.name;
	}

	set name(value: string) {
		this._setField("name", value);
	}

	/**
	 * The asset description.
	 */
	get description(): string | null {
		return this._data.description;
	}

	set description(value: string | null) {
		this._setField("description", value);
	}

	/**
	 * The asset location (URL, path, etc.).
	 */
	get location(): string | null {
		return this._data.location;
	}

	set location(value: string | null) {
		this._setField("location", value);
	}

	/**
	 * The asset status.
	 */
	get status(): AssetStatus {
		return this._data.status;
	}

	set status(value: AssetStatus) {
		this._setField("status", value);
	}

	/**
	 * Whether the asset has been human-verified.
	 * Auto-discovered assets default to false; manual creates default to true.
	 */
	get verified(): boolean {
		return this._data.verified;
	}

	set verified(value: boolean) {
		this._setField("verified", value);
	}

	/**
	 * The reader/connector that discovered this asset (e.g. "excel-connector@0.1.0").
	 * Null for manually-created assets.
	 */
	get discoveredBy(): string | null {
		return this._data.discovered_by;
	}

	set discoveredBy(value: string | null) {
		this._setField("discovered_by", value);
	}

	/**
	 * Custom metadata for the asset.
	 *
	 * **Note:** Direct mutations to this object are not tracked.
	 * To trigger change detection, reassign the entire object.
	 *
	 * @example
	 * ```typescript
	 * // ❌ Not tracked - direct mutation
	 * asset.metadata.key = 'value';
	 *
	 * // ✅ Tracked - reassignment
	 * asset.metadata = { ...asset.metadata, key: 'value' };
	 * ```
	 */
	get metadata(): Record<string, unknown> {
		return this._data.metadata;
	}

	set metadata(value: Record<string, unknown>) {
		this._setField("metadata", value);
	}

	/**
	 * When the asset was created (read-only).
	 */
	get createdAt(): Date {
		return new Date(this._data.created_at);
	}

	/**
	 * When the asset was last updated (read-only).
	 */
	get updatedAt(): Date {
		return new Date(this._data.updated_at);
	}

	// ===== Protected Implementation Methods =====

	protected _buildCreatePayload(): AssetCreate {
		return {
			uid: this._data.uid || undefined,
			type: this._data.type,
			name: this._data.name,
			description: this._data.description,
			location: this._data.location,
			status: this._data.status,
			verified: this._data.verified,
			discovered_by: this._data.discovered_by,
			metadata: this._data.metadata,
		};
	}

	protected async _create(): Promise<Asset> {
		return this._client.assets.create(this._buildCreatePayload());
	}

	protected async _update(data: AssetUpdate): Promise<Asset> {
		return this._client.assets.update(this._data.uid, data);
	}

	protected async _delete(): Promise<void> {
		return this._client.assets.delete(this._data.uid);
	}

	protected async _fetch(): Promise<Asset> {
		return this._client.assets.get(this._data.uid);
	}
}

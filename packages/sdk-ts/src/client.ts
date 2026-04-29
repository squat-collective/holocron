import createClient from "openapi-fetch";
import { NotFoundError, createApiError } from "./errors";
import { ActorEntity, type ActorEntityCreate } from "./models/actor";
import { AssetEntity, type AssetEntityCreate } from "./models/asset";
import { RelationEntity, type RelationEntityCreate } from "./models/relation";
import type { components, paths } from "./types/api";
import { resolveUid } from "./utils";

/**
 * A data asset response from the API.
 * @category Types
 */
export type Asset = components["schemas"]["AssetResponse"];

/**
 * Input for creating a new asset.
 *
 * The API's Pydantic model has defaults for `status` (`active`),
 * `verified` (`true`), and `discovered_by` (`null`) — but
 * openapi-typescript surfaces fields with non-nullable defaults as
 * required. Re-make them optional here so callers don't have to
 * spell them out for the common case.
 * @category Types
 */
export type AssetCreate = Omit<
	components["schemas"]["AssetCreate"],
	"status" | "verified" | "discovered_by"
> & {
	status?: components["schemas"]["AssetStatus"];
	verified?: boolean;
	discovered_by?: string | null;
};

/**
 * Input for updating an existing asset.
 * @category Types
 */
export type AssetUpdate = components["schemas"]["AssetUpdate"];

/**
 * Valid asset types: `dataset`, `report`, `process`, `system`.
 * @category Types
 */
export type AssetType = components["schemas"]["AssetType"];

/**
 * Asset lifecycle status: `active`, `deprecated`, `draft`.
 * @category Types
 */
export type AssetStatus = components["schemas"]["AssetStatus"];

/**
 * An actor (person or group) response from the API.
 * @category Types
 */
export type Actor = components["schemas"]["ActorResponse"];

/**
 * Input for creating a new actor. `verified` defaults to `true` and
 * `discovered_by` to `null` server-side; both are optional for clients.
 * @category Types
 */
export type ActorCreate = Omit<
	components["schemas"]["ActorCreate"],
	"verified" | "discovered_by"
> & {
	verified?: boolean;
	discovered_by?: string | null;
};

/**
 * Input for updating an existing actor.
 * @category Types
 */
export type ActorUpdate = components["schemas"]["ActorUpdate"];

/**
 * Valid actor types: `person`, `group`.
 * @category Types
 */
export type ActorType = components["schemas"]["ActorType"];

/**
 * A relation between two entities.
 * @category Types
 */
export type Relation = components["schemas"]["RelationResponse"];

/**
 * Raw input for creating a new relation (API format). Same defaults
 * applied as for assets/actors — `verified` and `discovered_by` are
 * optional for clients.
 * @category Types
 */
export type RelationCreate = Omit<
	components["schemas"]["RelationCreate"],
	"verified" | "discovered_by"
> & {
	verified?: boolean;
	discovered_by?: string | null;
};

/**
 * Valid relation types: `owns`, `uses`, `feeds`, `derived_from`, `contains`, `produces`, `consumes`, `member_of`.
 * @category Types
 */
export type RelationType = components["schemas"]["RelationType"];

/**
 * Reference to an entity - can be a UID string or any object with a `uid` property.
 * @category Types
 */
export type EntityRef = string | { uid: string };

/**
 * Input for creating a relation with flexible entity references.
 * Accepts UIDs as strings or objects with a `uid` property (like Asset or Actor).
 *
 * @example
 * ```typescript
 * // Using UIDs
 * { from: 'actor-uid', to: 'asset-uid', type: 'owns' }
 *
 * // Using objects
 * { from: actor, to: asset, type: 'owns' }
 *
 * // Mixed
 * { from: actor, to: 'asset-uid', type: 'owns' }
 * ```
 * @category Types
 */
export interface RelationCreateInput {
	/** Optional client-supplied UID for idempotent creation */
	uid?: string;
	/** Source entity - UID string or object with `uid` property */
	from: EntityRef;
	/** Target entity - UID string or object with `uid` property */
	to: EntityRef;
	/** Type of relation */
	type: RelationType;
	/** Whether the relation has been human-verified (default: true) */
	verified?: boolean;
	/** Reader/connector that discovered this relation (e.g. "excel-connector@0.1.0") */
	discovered_by?: string | null;
	/** Optional properties for the relation */
	properties?: Record<string, unknown>;
}

/**
 * An audit event from the API.
 * @category Types
 */
export type Event = components["schemas"]["EventResponse"];

/**
 * Event action types: `created`, `updated`, `deleted`.
 * @category Types
 */
export type EventAction = components["schemas"]["EventAction"];

/**
 * Entity types that can be tracked: `asset`, `actor`, `relation`.
 * @category Types
 */
export type EntityType = components["schemas"]["EntityType"];

/**
 * Discriminated response for `client.entities.get()` — exactly one of
 * `asset` / `actor` / `rule` is populated, indicated by `kind`.
 * @category Types
 */
export type Entity =
	| components["schemas"]["EntityAssetResponse"]
	| components["schemas"]["EntityActorResponse"]
	| components["schemas"]["EntityRuleResponse"];

/**
 * Data-landscape map response — nodes + edges with pre-computed layout.
 * @category Types
 */
export type GraphMap = components["schemas"]["GraphMapResponse"];

/**
 * A node on the data-landscape map, with its world-space coordinates.
 * @category Types
 */
export type GraphNode = components["schemas"]["GraphNode"];

/**
 * An edge on the data-landscape map.
 * @category Types
 */
export type GraphEdge = components["schemas"]["GraphEdge"];

/**
 * Level-of-detail tier. `0` = overview (systems + teams), `1` = full map.
 * @category Types
 */
export type LodTier = components["schemas"]["LodTier"];

/**
 * A webhook subscription returned by the API. The HMAC `secret` is never
 * present here — see {@link WebhookCreated} for the one-shot reveal.
 * @category Types
 */
export type Webhook = components["schemas"]["WebhookResponse"];

/**
 * Input for registering a new webhook subscription.
 * @category Types
 */
export type WebhookCreate = components["schemas"]["WebhookCreate"];

/**
 * The response returned by `webhooks.create` — a {@link Webhook} plus the
 * plaintext HMAC `secret`. The secret is only ever exposed at creation
 * time; the API will not surface it again, so the client must store it
 * now to verify future `X-Holocron-Signature` headers.
 * @category Types
 */
export type WebhookCreated = components["schemas"]["WebhookCreateResponse"];

/**
 * Partial update for an existing webhook. Setting `disabled: false`
 * re-enables a webhook that was auto-disabled after consecutive
 * failures and clears the failure counter.
 * @category Types
 */
export type WebhookUpdate = components["schemas"]["WebhookUpdate"];

/**
 * A tag in use somewhere in the catalog, with its usage count.
 * Counts let UI consumers prefer the dominant spelling when offering
 * suggestions (`pii (12)` vs. `PII (1)`).
 * @category Types
 */
export type TagUsage = components["schemas"]["TagUsage"];

/**
 * The `/tags` list response — every distinct tag currently in use,
 * sorted by count descending then name ascending.
 * @category Types
 */
export type TagList = components["schemas"]["TagListResponse"];

/**
 * Body POSTed to subscriber URLs when an event fires. The canonical
 * `topic` (`"<entity>.<action>"`) lets receivers route by string
 * without reading both `action` and `entity_type`.
 *
 * Defined here rather than re-exported from generated types because
 * the API never receives this shape — it's outbound-only and so
 * doesn't appear on any endpoint's request/response schema.
 * Consumers writing webhook receivers need it for typing their
 * handlers, so we mirror the API's Pydantic model by hand.
 * @category Types
 */
export interface WebhookEventPayload {
	/** "<entity>.<action>", e.g. "asset.created". */
	topic: string;
	event_uid: string;
	action: EventAction;
	entity_type: EntityType;
	entity_uid: string;
	actor_uid: string | null;
	timestamp: string;
	changes: Record<string, unknown>;
	metadata: Record<string, unknown>;
}

/**
 * Supported API versions.
 * @category Types
 */
export type ApiVersion = "v1";

/**
 * The default API version used by this SDK.
 */
export const DEFAULT_API_VERSION: ApiVersion = "v1";

/**
 * List of API versions supported by this SDK version.
 */
export const SUPPORTED_API_VERSIONS: readonly ApiVersion[] = ["v1"] as const;

/**
 * Configuration options for the Holocron client.
 * @category Client
 */
export interface HolocronClientOptions {
	/** Base URL of the Holocron API (e.g., `http://localhost:8000`) */
	baseUrl: string;
	/**
	 * API version to use.
	 * @default "v1"
	 */
	apiVersion?: ApiVersion;
}

/**
 * Client for interacting with the Holocron API.
 *
 * @example
 * ```typescript
 * import { HolocronClient } from 'holocron-ts';
 *
 * const client = new HolocronClient({ baseUrl: 'http://localhost:8000' });
 *
 * // Create an asset
 * const asset = await client.assets.create({
 *   type: 'dataset',
 *   name: 'My Dataset',
 * });
 *
 * // List all assets
 * const { items, total } = await client.assets.list();
 * ```
 *
 * @category Client
 */
export class HolocronClient {
	private client: ReturnType<typeof createClient<paths>>;

	/**
	 * The API version this client is configured to use.
	 */
	readonly apiVersion: ApiVersion;

	/**
	 * Creates a new Holocron client instance.
	 * @param options - Client configuration options
	 * @throws Error if an unsupported API version is specified
	 *
	 * @example
	 * ```typescript
	 * // Use default API version (v1)
	 * const client = new HolocronClient({ baseUrl: 'http://localhost:8000' });
	 *
	 * // Explicitly specify API version
	 * const client = new HolocronClient({
	 *   baseUrl: 'http://localhost:8000',
	 *   apiVersion: 'v1'
	 * });
	 * ```
	 */
	constructor(options: HolocronClientOptions) {
		const version = options.apiVersion ?? DEFAULT_API_VERSION;

		if (!SUPPORTED_API_VERSIONS.includes(version)) {
			throw new Error(
				`Unsupported API version: ${version}. Supported versions: ${SUPPORTED_API_VERSIONS.join(", ")}`,
			);
		}

		this.apiVersion = version;
		this.client = createClient<paths>({ baseUrl: options.baseUrl });
	}

	/**
	 * Check if a specific API version is supported by this SDK.
	 * @param version - The API version to check
	 * @returns True if the version is supported
	 *
	 * @example
	 * ```typescript
	 * if (HolocronClient.supportsApiVersion('v1')) {
	 *   // Safe to use v1 features
	 * }
	 * ```
	 */
	static supportsApiVersion(version: string): version is ApiVersion {
		return SUPPORTED_API_VERSIONS.includes(version as ApiVersion);
	}

	/**
	 * Check API and database health.
	 * @returns Health status object
	 * @throws Error if health check fails
	 *
	 * @example
	 * ```typescript
	 * const health = await client.health();
	 * console.log(health.status); // 'healthy'
	 * ```
	 */
	async health(): Promise<Record<string, string>> {
		const { data, error, response } = await this.client.GET("/api/v1/health");
		if (error)
			throw createApiError("health check", error, (response as Response | undefined)?.status);
		return data;
	}

	/**
	 * Asset operations.
	 * @category Assets
	 */
	readonly assets = {
		/**
		 * List assets with optional filtering.
		 * @param params - Filter and pagination options
		 * @returns List of assets and total count
		 *
		 * @example
		 * ```typescript
		 * // List all assets
		 * const { items, total } = await client.assets.list();
		 *
		 * // Filter by type
		 * const datasets = await client.assets.list({ type: 'dataset' });
		 *
		 * // Pagination
		 * const page2 = await client.assets.list({ limit: 10, offset: 10 });
		 * ```
		 */
		list: async (params?: {
			/** Filter by asset type */
			type?: AssetType;
			/** Maximum number of items to return (default: 50, max: 100) */
			limit?: number;
			/** Number of items to skip for pagination */
			offset?: number;
		}) => {
			const { data, error, response } = await this.client.GET("/api/v1/assets", {
				params: { query: params },
			});
			if (error) throw createApiError("list assets", error, response.status);
			return data;
		},

		/**
		 * Get a single asset by UID.
		 * @param uid - The asset's unique identifier
		 * @returns The asset
		 * @throws Error if asset not found
		 *
		 * @example
		 * ```typescript
		 * const asset = await client.assets.get('abc-123');
		 * console.log(asset.name);
		 * ```
		 */
		get: async (uid: string) => {
			const { data, error, response } = await this.client.GET("/api/v1/assets/{uid}", {
				params: { path: { uid } },
			});
			if (error) {
				if (response.status === 404) {
					throw new NotFoundError(`Asset not found: ${uid}`, {
						resourceType: "asset",
						resourceUid: uid,
						apiError: error,
					});
				}
				throw createApiError(`get asset ${uid}`, error, response.status);
			}
			return data;
		},

		/**
		 * Create a new asset.
		 * @param asset - The asset data
		 * @returns The created asset
		 *
		 * @example
		 * ```typescript
		 * const asset = await client.assets.create({
		 *   type: 'dataset',
		 *   name: 'Customer Data',
		 *   description: 'Main customer table',
		 *   location: 'postgres://db/customers',
		 * });
		 * ```
		 */
		create: async (asset: AssetCreate) => {
			const { data, error, response } = await this.client.POST("/api/v1/assets", {
				body: asset as components["schemas"]["AssetCreate"],
			});
			if (error) throw createApiError("create asset", error, response.status);
			return data;
		},

		/**
		 * Update an existing asset.
		 * @param uid - The asset's unique identifier
		 * @param asset - The fields to update
		 * @returns The updated asset
		 *
		 * @example
		 * ```typescript
		 * const updated = await client.assets.update('abc-123', {
		 *   name: 'New Name',
		 *   status: 'deprecated',
		 * });
		 * ```
		 */
		update: async (uid: string, asset: AssetUpdate) => {
			const { data, error, response } = await this.client.PUT("/api/v1/assets/{uid}", {
				params: { path: { uid } },
				body: asset,
			});
			if (error) throw createApiError(`update asset ${uid}`, error, response.status);
			return data;
		},

		/**
		 * Delete an asset.
		 * @param uid - The asset's unique identifier
		 * @throws Error if deletion fails
		 *
		 * @example
		 * ```typescript
		 * await client.assets.delete('abc-123');
		 * ```
		 */
		delete: async (uid: string) => {
			const { error, response } = await this.client.DELETE("/api/v1/assets/{uid}", {
				params: { path: { uid } },
			});
			if (error) throw createApiError(`delete asset ${uid}`, error, response.status);
		},
	};

	/**
	 * Actor operations.
	 * @category Actors
	 */
	readonly actors = {
		/**
		 * List actors with optional filtering.
		 * @param params - Filter and pagination options
		 * @returns List of actors and total count
		 *
		 * @example
		 * ```typescript
		 * // List all actors
		 * const { items, total } = await client.actors.list();
		 *
		 * // Filter by type
		 * const people = await client.actors.list({ type: 'person' });
		 * ```
		 */
		list: async (params?: {
			/** Filter by actor type */
			type?: ActorType;
			/** Maximum number of items to return (default: 50, max: 100) */
			limit?: number;
			/** Number of items to skip for pagination */
			offset?: number;
		}) => {
			const { data, error, response } = await this.client.GET("/api/v1/actors", {
				params: { query: params },
			});
			if (error) throw createApiError("list actors", error, response.status);
			return data;
		},

		/**
		 * Get a single actor by UID.
		 * @param uid - The actor's unique identifier
		 * @returns The actor
		 * @throws NotFoundError if actor not found
		 */
		get: async (uid: string) => {
			const { data, error, response } = await this.client.GET("/api/v1/actors/{uid}", {
				params: { path: { uid } },
			});
			if (error) {
				if (response.status === 404) {
					throw new NotFoundError(`Actor not found: ${uid}`, {
						resourceType: "actor",
						resourceUid: uid,
						apiError: error,
					});
				}
				throw createApiError(`get actor ${uid}`, error, response.status);
			}
			return data;
		},

		/**
		 * Create a new actor.
		 * @param actor - The actor data
		 * @returns The created actor
		 *
		 * @example
		 * ```typescript
		 * const person = await client.actors.create({
		 *   type: 'person',
		 *   name: 'Jane Doe',
		 *   email: 'jane@example.com',
		 * });
		 * ```
		 */
		create: async (actor: ActorCreate) => {
			const { data, error, response } = await this.client.POST("/api/v1/actors", {
				// `verified` is optional in our wrapper but required in the
				// generated POST body type — fill the API default at the
				// boundary so callers don't have to pass it.
				body: actor as components["schemas"]["ActorCreate"],
			});
			if (error) throw createApiError("create actor", error, response.status);
			return data;
		},

		/**
		 * Update an existing actor.
		 * @param uid - The actor's unique identifier
		 * @param actor - The fields to update
		 * @returns The updated actor
		 */
		update: async (uid: string, actor: ActorUpdate) => {
			const { data, error, response } = await this.client.PUT("/api/v1/actors/{uid}", {
				params: { path: { uid } },
				body: actor,
			});
			if (error) throw createApiError(`update actor ${uid}`, error, response.status);
			return data;
		},

		/**
		 * Delete an actor.
		 * @param uid - The actor's unique identifier
		 * @throws Error if deletion fails
		 */
		delete: async (uid: string) => {
			const { error, response } = await this.client.DELETE("/api/v1/actors/{uid}", {
				params: { path: { uid } },
			});
			if (error) throw createApiError(`delete actor ${uid}`, error, response.status);
		},
	};

	/**
	 * Relation operations.
	 * @category Relations
	 */
	readonly relations = {
		/**
		 * List relations with optional filtering.
		 * @param params - Filter and pagination options
		 * @returns List of relations and total count
		 *
		 * @example
		 * ```typescript
		 * // List all relations
		 * const { items } = await client.relations.list();
		 *
		 * // Filter by type
		 * const ownership = await client.relations.list({ type: 'owns' });
		 *
		 * // Filter by source or target
		 * const fromActor = await client.relations.list({ from_uid: 'actor-uid' });
		 * ```
		 */
		list: async (params?: {
			/** Filter by relation type */
			type?: RelationType;
			/** Filter by source node UID */
			from_uid?: string;
			/** Filter by target node UID */
			to_uid?: string;
			/** Maximum number of items to return */
			limit?: number;
			/** Number of items to skip */
			offset?: number;
		}) => {
			const { data, error, response } = await this.client.GET("/api/v1/relations", {
				params: { query: params },
			});
			if (error) throw createApiError("list relations", error, response.status);
			return data;
		},

		/**
		 * Create a new relation between two entities.
		 * Accepts UIDs as strings or objects with a `uid` property.
		 *
		 * @param relation - The relation data with flexible entity references
		 * @returns The created relation
		 *
		 * @example
		 * ```typescript
		 * // Using objects directly
		 * const relation = await client.relations.create({
		 *   from: actor,
		 *   to: asset,
		 *   type: 'owns',
		 * });
		 *
		 * // Using UIDs
		 * const relation = await client.relations.create({
		 *   from: 'actor-uid',
		 *   to: 'asset-uid',
		 *   type: 'owns',
		 * });
		 *
		 * // Mixed
		 * const relation = await client.relations.create({
		 *   from: actor,
		 *   to: 'asset-uid',
		 *   type: 'owns',
		 * });
		 * ```
		 */
		create: async (input: RelationCreateInput) => {
			const body: RelationCreate = {
				uid: input.uid,
				from_uid: resolveUid(input.from),
				to_uid: resolveUid(input.to),
				type: input.type,
				verified: input.verified ?? true,
				discovered_by: input.discovered_by ?? null,
				properties: input.properties,
			};
			const { data, error, response } = await this.client.POST("/api/v1/relations", {
				body: body as components["schemas"]["RelationCreate"],
			});
			if (error) throw createApiError("create relation", error, response.status);
			return data;
		},

		/**
		 * Delete a relation.
		 * @param uid - The relation's unique identifier
		 * @throws Error if deletion fails
		 */
		delete: async (uid: string) => {
			const { error, response } = await this.client.DELETE("/api/v1/relations/{uid}", {
				params: { path: { uid } },
			});
			if (error) throw createApiError(`delete relation ${uid}`, error, response.status);
		},
	};

	/**
	 * Event (audit log) operations.
	 * @category Events
	 */
	readonly events = {
		/**
		 * List events with optional filtering.
		 * @param params - Filter and pagination options
		 * @returns List of events and total count
		 *
		 * @example
		 * ```typescript
		 * // List all events
		 * const { items } = await client.events.list();
		 *
		 * // Filter by entity
		 * const assetEvents = await client.events.list({
		 *   entity_type: 'asset',
		 *   entity_uid: 'asset-uid',
		 * });
		 *
		 * // Filter by action
		 * const deletions = await client.events.list({ action: 'deleted' });
		 * ```
		 */
		list: async (params?: {
			/** Filter by entity type */
			entity_type?: EntityType;
			/** Filter by entity UID */
			entity_uid?: string;
			/** Filter by action type */
			action?: EventAction;
			/** Maximum number of items to return */
			limit?: number;
			/** Number of items to skip */
			offset?: number;
		}) => {
			const { data, error, response } = await this.client.GET("/api/v1/events", {
				params: { query: params },
			});
			if (error) throw createApiError("list events", error, response.status);
			return data;
		},

		/**
		 * Get a single event by UID.
		 * @param uid - The event's unique identifier
		 * @returns The event
		 * @throws NotFoundError if event not found
		 */
		get: async (uid: string) => {
			const { data, error, response } = await this.client.GET("/api/v1/events/{uid}", {
				params: { path: { uid } },
			});
			if (error) {
				if (response.status === 404) {
					throw new NotFoundError(`Event not found: ${uid}`, {
						resourceType: "event",
						resourceUid: uid,
						apiError: error,
					});
				}
				throw createApiError(`get event ${uid}`, error, response.status);
			}
			return data;
		},
	};

	/**
	 * Data-landscape graph operations — the "map" view of the catalog.
	 * @category Graph
	 */
	readonly graph = {
		/**
		 * Fetch the data-landscape map at the requested level-of-detail.
		 *
		 * LOD 0 returns the overview (systems + teams only); LOD 1 returns
		 * the full entity graph (+ datasets, reports, processes, people,
		 * rules). Every node comes with pre-computed `(x, y)` coordinates
		 * so a WebGL renderer can draw without running layout work.
		 *
		 * @example
		 * ```typescript
		 * const map = await client.graph.map({ lod: 0 });
		 * console.log(`${map.nodes.length} nodes at overview tier`);
		 * ```
		 */
		map: async (params?: { lod?: LodTier }): Promise<GraphMap> => {
			const { data, error, response } = await this.client.GET("/api/v1/graph/map", {
				params: { query: params },
			});
			if (error) throw createApiError("graph map", error, response.status);
			return data;
		},
	};

	/**
	 * Active Record style models with `.save()`, `.delete()`, `.refresh()` methods.
	 *
	 * @example
	 * ```typescript
	 * // Create and save
	 * const asset = client.models.assets.new({ type: 'dataset', name: 'Sales' });
	 * await asset.save();
	 *
	 * // Modify and save (only sends changed fields)
	 * asset.description = 'Monthly sales data';
	 * await asset.save();
	 *
	 * // Fetch existing
	 * const existing = await client.models.assets.get('asset-uid');
	 * ```
	 *
	 * @category Models
	 */
	readonly models = {
		/**
		 * Asset model operations.
		 */
		assets: {
			/**
			 * Creates a new (unpersisted) AssetEntity.
			 * Call `.save()` to persist to the server.
			 * @param data - The asset data
			 * @returns A new AssetEntity
			 */
			new: (data: AssetEntityCreate): AssetEntity => {
				return AssetEntity._fromCreate(this, data);
			},

			/**
			 * Fetches an asset by UID and returns it as an AssetEntity.
			 * @param uid - The asset's unique identifier
			 * @returns The asset entity
			 */
			get: async (uid: string): Promise<AssetEntity> => {
				const data = await this.assets.get(uid);
				return AssetEntity._fromData(this, data);
			},

			/**
			 * Lists assets and returns them as AssetEntity instances.
			 * @param params - Filter and pagination options
			 * @returns List of asset entities and total count
			 */
			list: async (params?: {
				type?: AssetType;
				limit?: number;
				offset?: number;
			}): Promise<{ items: AssetEntity[]; total: number }> => {
				const result = await this.assets.list(params);
				return {
					items: result.items.map((item) => AssetEntity._fromData(this, item)),
					total: result.total,
				};
			},
		},

		/**
		 * Actor model operations.
		 */
		actors: {
			/**
			 * Creates a new (unpersisted) ActorEntity.
			 * Call `.save()` to persist to the server.
			 * @param data - The actor data
			 * @returns A new ActorEntity
			 */
			new: (data: ActorEntityCreate): ActorEntity => {
				return ActorEntity._fromCreate(this, data);
			},

			/**
			 * Fetches an actor by UID and returns it as an ActorEntity.
			 * @param uid - The actor's unique identifier
			 * @returns The actor entity
			 */
			get: async (uid: string): Promise<ActorEntity> => {
				const data = await this.actors.get(uid);
				return ActorEntity._fromData(this, data);
			},

			/**
			 * Lists actors and returns them as ActorEntity instances.
			 * @param params - Filter and pagination options
			 * @returns List of actor entities and total count
			 */
			list: async (params?: {
				type?: ActorType;
				limit?: number;
				offset?: number;
			}): Promise<{ items: ActorEntity[]; total: number }> => {
				const result = await this.actors.list(params);
				return {
					items: result.items.map((item) => ActorEntity._fromData(this, item)),
					total: result.total,
				};
			},
		},

		/**
		 * Relation model operations.
		 */
		relations: {
			/**
			 * Creates a new (unpersisted) RelationEntity.
			 * Call `.save()` to persist to the server.
			 * @param data - The relation data
			 * @returns A new RelationEntity
			 */
			new: (data: RelationEntityCreate): RelationEntity => {
				return RelationEntity._fromCreate(this, data);
			},

			/**
			 * Lists relations and returns them as RelationEntity instances.
			 * @param params - Filter and pagination options
			 * @returns List of relation entities and total count
			 */
			list: async (params?: {
				type?: RelationType;
				from_uid?: string;
				to_uid?: string;
				limit?: number;
				offset?: number;
			}): Promise<{ items: RelationEntity[]; total: number }> => {
				const result = await this.relations.list(params);
				return {
					items: result.items.map((item) => RelationEntity._fromData(this, item)),
					total: result.total,
				};
			},
		},
	};

	/**
	 * Tag operations — surface what's already in the catalog so forms
	 * can autosuggest. Tags live on `Asset.metadata.tags` (free-form
	 * strings, normalised lowercase server-side); there's no separate
	 * tag entity.
	 *
	 * @category Tags
	 */
	readonly tags = {
		/**
		 * List every distinct tag currently in use across all assets,
		 * sorted by usage count (most-used first; alphabetical
		 * tie-break for deterministic ordering across requests).
		 *
		 * @example
		 * ```typescript
		 * const { tags } = await client.tags.list();
		 * for (const { name, count } of tags) {
		 *   console.log(`${name} — ${count} asset(s)`);
		 * }
		 * ```
		 */
		list: async (): Promise<TagList> => {
			const { data, error, response } = await this.client.GET("/api/v1/tags");
			// `/tags` takes no params, so FastAPI emits no 422 schema and
			// openapi-fetch types `error` / `response.status` as `never` —
			// fall through to the same shape the `health()` endpoint uses.
			if (error)
				throw createApiError("list tags", error, (response as Response | undefined)?.status);
			return data;
		},
	};

	/**
	 * Polymorphic entity resolver — when you have a uid but don't yet
	 * know whether it's an asset, actor, or rule (graph node clicks,
	 * relation counterparties, event payloads), this is the one call
	 * that returns the typed payload in a single hop and avoids the
	 * old "try /actors → fall back to /assets" pattern that filled the
	 * console with 404s.
	 *
	 * @category Entities
	 */
	readonly entities = {
		/**
		 * Resolve any uid to its typed payload.
		 *
		 * @example
		 * ```typescript
		 * const e = await client.entities.get('abc-123');
		 * if (e.kind === 'asset') console.log(e.asset.name);
		 * else if (e.kind === 'actor') console.log(e.actor.email);
		 * else if (e.kind === 'rule') console.log(e.rule.severity);
		 * ```
		 */
		get: async (uid: string): Promise<Entity> => {
			const { data, error, response } = await this.client.GET("/api/v1/entities/{uid}", {
				params: { path: { uid } },
			});
			if (error) {
				if (response.status === 404) {
					throw new NotFoundError(`Entity not found: ${uid}`, {
						resourceType: "entity",
						resourceUid: uid,
						apiError: error,
					});
				}
				throw createApiError(`get entity ${uid}`, error, response.status);
			}
			return data;
		},
	};

	/**
	 * Webhook subscription operations. Webhooks are workspace-level admin
	 * resources — POST events on the topic filter, HMAC-signed via
	 * `X-Holocron-Signature`, auto-disabled after consecutive failures.
	 *
	 * The HMAC `secret` is returned **once** at creation time only — store
	 * it from `webhooks.create()`'s response, the API will not surface it
	 * again.
	 *
	 * @category Webhooks
	 */
	readonly webhooks = {
		/**
		 * List registered webhooks (newest first).
		 *
		 * @example
		 * ```typescript
		 * const { items, total } = await client.webhooks.list();
		 * for (const wh of items) {
		 *   console.log(wh.url, wh.events, wh.disabled ? "DISABLED" : "active");
		 * }
		 * ```
		 */
		list: async (params?: {
			/** Maximum number of items to return (default: 50, max: 500) */
			limit?: number;
			/** Number of items to skip for pagination */
			offset?: number;
		}) => {
			const { data, error, response } = await this.client.GET("/api/v1/webhooks", {
				params: { query: params },
			});
			if (error) throw createApiError("list webhooks", error, response.status);
			return data;
		},

		/**
		 * Get a single webhook by uid.
		 * @throws NotFoundError when no webhook matches `uid`.
		 */
		get: async (uid: string) => {
			const { data, error, response } = await this.client.GET("/api/v1/webhooks/{uid}", {
				params: { path: { uid } },
			});
			if (error) {
				if (response.status === 404) {
					throw new NotFoundError(`Webhook not found: ${uid}`, {
						resourceType: "webhook",
						resourceUid: uid,
						apiError: error,
					});
				}
				throw createApiError(`get webhook ${uid}`, error, response.status);
			}
			return data;
		},

		/**
		 * Register a new webhook. The returned `secret` is **only ever
		 * exposed once**, on this response — the API will not surface it
		 * again, so the client must persist it now to verify future
		 * `X-Holocron-Signature` headers.
		 *
		 * @example
		 * ```typescript
		 * const wh = await client.webhooks.create({
		 *   url: "https://hook.example/in",
		 *   events: ["asset.created", "actor.updated"],
		 *   description: "Slack notifier",
		 * });
		 * await secretStore.put(wh.uid, wh.secret); // do this NOW
		 * ```
		 */
		create: async (webhook: WebhookCreate) => {
			const { data, error, response } = await this.client.POST("/api/v1/webhooks", {
				body: webhook,
			});
			if (error) throw createApiError("create webhook", error, response.status);
			return data;
		},

		/**
		 * Update a webhook subscription. Setting `disabled: false`
		 * re-enables a webhook that was auto-disabled after consecutive
		 * failures and clears the failure counter.
		 */
		update: async (uid: string, update: WebhookUpdate) => {
			const { data, error, response } = await this.client.PUT("/api/v1/webhooks/{uid}", {
				params: { path: { uid } },
				body: update,
			});
			if (error) throw createApiError(`update webhook ${uid}`, error, response.status);
			return data;
		},

		/** Remove a webhook subscription. */
		delete: async (uid: string) => {
			const { error, response } = await this.client.DELETE("/api/v1/webhooks/{uid}", {
				params: { path: { uid } },
			});
			if (error) throw createApiError(`delete webhook ${uid}`, error, response.status);
		},

		/**
		 * Fire a synthetic test event at the webhook so the receiver can
		 * be verified end-to-end without mutating live data. The synthetic
		 * payload carries `entity_uid="webhook-test"` and `metadata.test=true`
		 * so receivers can filter test traffic out of analytics.
		 *
		 * @returns `{ delivered: boolean }` — `true` if the receiver
		 *   responded with a 2xx, `false` if delivery failed (timeout,
		 *   non-2xx, network error). Failures count toward auto-disable
		 *   like real events.
		 */
		test: async (uid: string) => {
			const { data, error, response } = await this.client.POST("/api/v1/webhooks/{uid}/test", {
				params: { path: { uid } },
			});
			if (error) throw createApiError(`test webhook ${uid}`, error, response.status);
			return data;
		},
	};
}

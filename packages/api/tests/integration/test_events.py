"""Integration tests for events API endpoints."""

from httpx import AsyncClient


class TestListEvents:
    """Tests for GET /events endpoint."""

    async def test_list_events_empty_returns_empty_list(
        self, client: AsyncClient
    ) -> None:
        """Test listing events when none exist."""
        response = await client.get("/api/v1/events")

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_events_returns_events_from_asset_creation(
        self, client: AsyncClient
    ) -> None:
        """Test that creating an asset generates an event."""
        # Create an asset
        asset_response = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Test Dataset"},
        )
        assert asset_response.status_code == 201
        asset_uid = asset_response.json()["uid"]

        # Check events
        response = await client.get("/api/v1/events")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

        # Find the created event
        created_events = [
            e for e in data["items"]
            if e["entity_uid"] == asset_uid and e["action"] == "created"
        ]
        assert len(created_events) == 1
        event = created_events[0]
        assert event["entity_type"] == "asset"
        assert event["action"] == "created"
        assert "changes" in event

    async def test_list_events_filter_by_entity_type(
        self, client: AsyncClient
    ) -> None:
        """Test filtering events by entity type."""
        # Create an asset and an actor
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Test Dataset"},
        )
        await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Test Person"},
        )

        # Filter by asset
        response = await client.get("/api/v1/events?entity_type=asset")
        data = response.json()
        assert all(e["entity_type"] == "asset" for e in data["items"])

        # Filter by actor
        response = await client.get("/api/v1/events?entity_type=actor")
        data = response.json()
        assert all(e["entity_type"] == "actor" for e in data["items"])

    async def test_list_events_filter_by_entity_uid(
        self, client: AsyncClient
    ) -> None:
        """Test filtering events by entity UID."""
        # Create two assets
        response1 = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Asset 1"},
        )
        asset1_uid = response1.json()["uid"]

        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Asset 2"},
        )

        # Filter by first asset
        response = await client.get(f"/api/v1/events?entity_uid={asset1_uid}")
        data = response.json()
        assert data["total"] >= 1
        assert all(e["entity_uid"] == asset1_uid for e in data["items"])

    async def test_list_events_filter_by_action(
        self, client: AsyncClient
    ) -> None:
        """Test filtering events by action."""
        # Create and then update an asset
        create_response = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Test Asset"},
        )
        asset_uid = create_response.json()["uid"]

        await client.put(
            f"/api/v1/assets/{asset_uid}",
            json={"name": "Updated Asset"},
        )

        # Filter by created action
        response = await client.get("/api/v1/events?action=created")
        data = response.json()
        assert all(e["action"] == "created" for e in data["items"])

        # Filter by updated action
        response = await client.get("/api/v1/events?action=updated")
        data = response.json()
        assert all(e["action"] == "updated" for e in data["items"])


class TestGetEvent:
    """Tests for GET /events/{uid} endpoint."""

    async def test_get_event_returns_event(self, client: AsyncClient) -> None:
        """Test getting a specific event by UID."""
        # Create an asset to generate an event
        asset_response = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Test Dataset"},
        )
        asset_uid = asset_response.json()["uid"]

        # Get the event UID from the list
        events_response = await client.get(
            f"/api/v1/events?entity_uid={asset_uid}"
        )
        event_uid = events_response.json()["items"][0]["uid"]

        # Get the event
        response = await client.get(f"/api/v1/events/{event_uid}")

        assert response.status_code == 200
        data = response.json()
        assert data["uid"] == event_uid
        assert data["entity_uid"] == asset_uid

    async def test_get_event_not_found(self, client: AsyncClient) -> None:
        """Test getting nonexistent event returns 404."""
        response = await client.get("/api/v1/events/nonexistent-uid")

        assert response.status_code == 404


class TestEventTracking:
    """Tests for event tracking across different operations."""

    async def test_asset_update_records_changes(
        self, client: AsyncClient
    ) -> None:
        """Test that asset updates record before/after changes."""
        # Create an asset
        create_response = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Original Name"},
        )
        asset_uid = create_response.json()["uid"]

        # Update the asset
        await client.put(
            f"/api/v1/assets/{asset_uid}",
            json={"name": "New Name"},
        )

        # Get the update event
        events_response = await client.get(
            f"/api/v1/events?entity_uid={asset_uid}&action=updated"
        )
        data = events_response.json()
        assert data["total"] >= 1

        event = data["items"][0]
        assert "name" in event["changes"]
        assert event["changes"]["name"]["old"] == "Original Name"
        assert event["changes"]["name"]["new"] == "New Name"

    async def test_asset_delete_records_deleted_state(
        self, client: AsyncClient
    ) -> None:
        """Test that asset deletion records the deleted entity state."""
        # Create an asset
        create_response = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "To Be Deleted"},
        )
        asset_uid = create_response.json()["uid"]

        # Delete the asset
        await client.delete(f"/api/v1/assets/{asset_uid}")

        # Get the delete event
        events_response = await client.get(
            f"/api/v1/events?entity_uid={asset_uid}&action=deleted"
        )
        data = events_response.json()
        assert data["total"] >= 1

        event = data["items"][0]
        assert "asset" in event["changes"]
        assert event["changes"]["asset"]["name"] == "To Be Deleted"

    async def test_relation_events_tracked(self, client: AsyncClient) -> None:
        """Test that relation create/delete generates events."""
        # Create two assets
        asset1 = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Source"},
        )
        asset2 = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Target"},
        )
        uid1 = asset1.json()["uid"]
        uid2 = asset2.json()["uid"]

        # Create relation
        relation_response = await client.post(
            "/api/v1/relations",
            json={"type": "feeds", "from_uid": uid1, "to_uid": uid2},
        )
        relation_uid = relation_response.json()["uid"]

        # Check relation created event
        events_response = await client.get(
            f"/api/v1/events?entity_uid={relation_uid}&action=created"
        )
        data = events_response.json()
        assert data["total"] >= 1
        assert data["items"][0]["entity_type"] == "relation"

        # Delete relation
        await client.delete(f"/api/v1/relations/{relation_uid}")

        # Check relation deleted event
        events_response = await client.get(
            f"/api/v1/events?entity_uid={relation_uid}&action=deleted"
        )
        data = events_response.json()
        assert data["total"] >= 1

    async def test_actor_events_tracked(self, client: AsyncClient) -> None:
        """Test that actor operations generate events."""
        # Create actor
        create_response = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Alice"},
        )
        actor_uid = create_response.json()["uid"]

        # Update actor
        await client.put(
            f"/api/v1/actors/{actor_uid}",
            json={"name": "Alice Smith"},
        )

        # Delete actor
        await client.delete(f"/api/v1/actors/{actor_uid}")

        # Check all events
        events_response = await client.get(
            f"/api/v1/events?entity_uid={actor_uid}"
        )
        data = events_response.json()

        actions = [e["action"] for e in data["items"]]
        assert "created" in actions
        assert "updated" in actions
        assert "deleted" in actions

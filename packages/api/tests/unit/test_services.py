"""Unit tests for service layer logic."""

from datetime import UTC, datetime
from unittest.mock import Mock

import pytest

from holocron.api.schemas.actors import ActorResponse, ActorType, ActorUpdate
from holocron.api.schemas.assets import (
    AssetResponse,
    AssetStatus,
    AssetType,
    AssetUpdate,
)
from holocron.core.services.actor_service import ActorService
from holocron.core.services.asset_service import AssetService


class TestAssetServiceComputeChanges:
    """Tests for AssetService._compute_changes method."""

    @pytest.fixture
    def asset_service(self) -> AssetService:
        """Create an AssetService with mocked dependencies."""
        return AssetService(
            asset_repo=Mock(),
            event_repo=Mock(),
            driver=Mock(),
        )

    @pytest.fixture
    def sample_asset(self) -> AssetResponse:
        """Create a sample asset response."""
        return AssetResponse(
            uid="test-uid",
            type=AssetType.DATASET,
            name="Original Name",
            description="Original description",
            location="s3://bucket/path",
            status=AssetStatus.ACTIVE,
            verified=True,
            discovered_by=None,
            metadata={"key": "value"},
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            updated_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

    def test_no_changes_returns_empty_dict(
        self,
        asset_service: AssetService,
        sample_asset: AssetResponse,
    ) -> None:
        """When no fields are changed, should return empty dict."""
        update = AssetUpdate()  # No fields set
        changes = asset_service._compute_changes(sample_asset, update)
        assert changes == {}

    def test_single_field_change_detected(
        self,
        asset_service: AssetService,
        sample_asset: AssetResponse,
    ) -> None:
        """Single field changes should be detected."""
        update = AssetUpdate(name="New Name")
        changes = asset_service._compute_changes(sample_asset, update)

        assert "name" in changes
        assert changes["name"]["old"] == "Original Name"
        assert changes["name"]["new"] == "New Name"

    def test_multiple_field_changes_detected(
        self,
        asset_service: AssetService,
        sample_asset: AssetResponse,
    ) -> None:
        """Multiple field changes should all be detected."""
        update = AssetUpdate(
            name="New Name",
            description="New description",
            status=AssetStatus.DEPRECATED,
        )
        changes = asset_service._compute_changes(sample_asset, update)

        assert len(changes) == 3
        assert changes["name"]["new"] == "New Name"
        assert changes["description"]["new"] == "New description"
        assert changes["status"]["new"] == "deprecated"

    def test_same_value_not_counted_as_change(
        self,
        asset_service: AssetService,
        sample_asset: AssetResponse,
    ) -> None:
        """Setting same value should not count as a change."""
        update = AssetUpdate(name="Original Name")  # Same as current
        changes = asset_service._compute_changes(sample_asset, update)
        assert changes == {}

    def test_metadata_change_detected(
        self,
        asset_service: AssetService,
        sample_asset: AssetResponse,
    ) -> None:
        """Metadata changes should be detected."""
        update = AssetUpdate(metadata={"new_key": "new_value"})
        changes = asset_service._compute_changes(sample_asset, update)

        assert "metadata" in changes
        assert changes["metadata"]["old"] == {"key": "value"}
        assert changes["metadata"]["new"] == {"new_key": "new_value"}


class TestActorServiceComputeChanges:
    """Tests for ActorService._compute_changes method."""

    @pytest.fixture
    def actor_service(self) -> ActorService:
        """Create an ActorService with mocked dependencies."""
        return ActorService(
            actor_repo=Mock(),
            event_repo=Mock(),
            driver=Mock(),
        )

    @pytest.fixture
    def sample_actor(self) -> ActorResponse:
        """Create a sample actor response."""
        return ActorResponse(
            uid="test-uid",
            type=ActorType.PERSON,
            name="John Doe",
            email="john@example.com",
            description="A test actor",
            verified=True,
            discovered_by=None,
            metadata={"department": "Engineering"},
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            updated_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

    def test_email_change_detected(
        self,
        actor_service: ActorService,
        sample_actor: ActorResponse,
    ) -> None:
        """Email changes should be detected."""
        update = ActorUpdate(email="newemail@example.com")
        changes = actor_service._compute_changes(sample_actor, update)

        assert "email" in changes
        assert changes["email"]["old"] == "john@example.com"
        assert changes["email"]["new"] == "newemail@example.com"

    def test_name_change_detected(
        self,
        actor_service: ActorService,
        sample_actor: ActorResponse,
    ) -> None:
        """Name changes should be detected."""
        update = ActorUpdate(name="Jane Doe")
        changes = actor_service._compute_changes(sample_actor, update)

        assert "name" in changes
        assert changes["name"]["old"] == "John Doe"
        assert changes["name"]["new"] == "Jane Doe"

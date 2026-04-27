"""Wipe the catalog and seed a richly-connected Star-Wars-themed fixture.

Theme: the Rebel Alliance's data platform in the last days of the
Galactic Civil War. Teams, people, source systems, raw/staging/mart
warehouse layers, processes, dashboards, data-quality rules, and a
full web of ownership + lineage relations. Embeddings get backfilled
at the end so semantic search has interesting results.

Usage:

    # Wipe + seed + embed
    podman exec holocron python -m holocron.scripts.reset_and_seed --confirm

The `--confirm` flag is required so nobody nukes a real catalog by
accident. Idempotent: re-runs deterministically rebuild the same fixture
(UIDs are slug-derived).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

from holocron.db.connection import neo4j_driver
from holocron.scripts.backfill_embeddings import backfill as embed_backfill

logger = logging.getLogger("seed")


# ====================================================================
# Utilities
# ====================================================================

def slug(text: str) -> str:
    """Stable, readable UID slug derived from a name. Keeps re-runs
    idempotent so a second `--confirm` produces an identical graph."""
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "x"


def field(
    name: str,
    data_type: str,
    description: str | None = None,
    pii: bool = False,
) -> dict[str, Any]:
    return {
        "id": slug(name),
        "name": name,
        "description": description,
        "nodeType": "field",
        "dataType": data_type,
        "pii": pii,
    }


def container(
    name: str,
    container_type: str,
    children: list[dict[str, Any]],
    description: str | None = None,
) -> dict[str, Any]:
    return {
        "id": slug(name),
        "name": name,
        "description": description,
        "nodeType": "container",
        "containerType": container_type,
        "children": children,
    }


# ====================================================================
# Teams
# ====================================================================

TEAMS: list[dict[str, str]] = [
    {
        "name": "Rebel Intelligence Division",
        "description": "Analysts turning Bothan spy cables into actionable briefings for High Command.",
    },
    {
        "name": "Fleet Operations",
        "description": "Operational data for Rebel starship movements, supply runs, and squadron readiness.",
    },
    {
        "name": "Jedi Archives",
        "description": "Keepers of ancient Holocron records; handle lineage, philosophy, and training records.",
    },
    {
        "name": "Quartermaster Corps",
        "description": "Logistics — starship parts, medical supplies, rations across every Rebel base.",
    },
    {
        "name": "Bothan Spy Network",
        "description": "Field agents that source raw intelligence dumps. High-risk, high-value ingestion.",
    },
    {
        "name": "Senate Treasury",
        "description": "Budget, payroll, and financial reporting across member worlds.",
    },
    {
        "name": "Medical Frigate Analytics",
        "description": "Casualty triage metrics, bacta tank utilization, clone trooper genetics.",
    },
    {
        "name": "Galactic Cartography",
        "description": "Hyperspace route maps, planetary surveys, safe-jump corridor analysis.",
    },
    {
        "name": "Rebel Engineering",
        "description": "Data-platform infrastructure: warehouse, pipelines, BI tooling.",
    },
    {
        "name": "Propaganda & Comms",
        "description": "Marketing of the Rebellion — recruitment analytics, sympathizer outreach.",
    },
    {
        "name": "Jedi Council Compliance",
        "description": "Governance, privacy, and access control across sensitive Force-user records.",
    },
    {
        "name": "Droid Operations",
        "description": "Astromech + protocol droid telemetry, memory-wipe audit trails.",
    },
]


# ====================================================================
# People
# ====================================================================
# Each person belongs to one team. Canonical Star Wars characters are
# mixed with generic-but-thematic invented staff to bulk out the roster.

PEOPLE: list[dict[str, str]] = [
    # Leadership
    {"name": "Mon Mothma", "email": "mmothma@rebellion.net", "team": "Senate Treasury", "description": "Chief of State. Final sign-off on budgets and operational risk."},
    {"name": "Princess Leia Organa", "email": "leia@rebellion.net", "team": "Rebel Intelligence Division", "description": "Head of Rebel Intelligence. Owns the classified intercept pipelines."},
    {"name": "General Jan Dodonna", "email": "dodonna@rebellion.net", "team": "Fleet Operations", "description": "Commander of Yavin squadrons. Consumer of fleet readiness dashboards."},
    {"name": "Admiral Gial Ackbar", "email": "ackbar@mooncalamari.gal", "team": "Fleet Operations", "description": "Mon Calamari strategist. Uses combat telemetry dashboards daily."},
    {"name": "Bail Organa", "email": "bail@alderaan.gov", "team": "Senate Treasury", "description": "Senator, Alderaan. Sponsors treasury visibility initiatives."},

    # Intelligence
    {"name": "Cassian Andor", "email": "cassian@rebellion.net", "team": "Rebel Intelligence Division", "description": "Covert operative. Primary feeder of raw intercept data."},
    {"name": "Jyn Erso", "email": "jerso@rebellion.net", "team": "Rebel Intelligence Division", "description": "Specialises in Imperial schematic extraction and classification."},
    {"name": "K-2SO", "email": "k2@droidops.gal", "team": "Droid Operations", "description": "Reprogrammed Imperial security droid; handles authenticated data pulls."},
    {"name": "Bodhi Rook", "email": "bodhi@rebellion.net", "team": "Bothan Spy Network", "description": "Defected Imperial cargo pilot turned courier for encrypted data dumps."},
    {"name": "Tynnra Pamlo", "email": "pamlo@rebellion.net", "team": "Rebel Intelligence Division", "description": "Senator-analyst. Owns the Imperial movement heatmap."},

    # Fleet
    {"name": "Wedge Antilles", "email": "wedge@rogue.gal", "team": "Fleet Operations", "description": "Rogue Squadron leader. Consumer of squadron-performance cohorts."},
    {"name": "Hera Syndulla", "email": "hera@ghost.gal", "team": "Fleet Operations", "description": "Phoenix Squadron commander. Dashboards for small-fleet logistics."},
    {"name": "Lando Calrissian", "email": "lcalrissian@cloudcity.gal", "team": "Fleet Operations", "description": "Baron administrator of Cloud City. Consumes trade-route analytics."},
    {"name": "Nien Nunb", "email": "nunb@sullust.gal", "team": "Fleet Operations", "description": "Co-pilot, Falcon flight lead. Reviews navigation logs."},

    # Engineering — your data team
    {"name": "Tom Blanc", "email": "tom.blanc@rebellion.net", "team": "Rebel Engineering", "description": "Data platform lead — owns the catalog, lineage, and this very system."},
    {"name": "R2-D2", "email": "r2d2@droidops.gal", "team": "Rebel Engineering", "description": "Astromech. Runs the majority of overnight ETL jobs."},
    {"name": "C-3PO", "email": "c3po@droidops.gal", "team": "Droid Operations", "description": "Protocol droid, fluent in over six million forms of communication — including SQL."},
    {"name": "Chopper", "email": "chopper@ghost.gal", "team": "Droid Operations", "description": "Astromech with a temper. Owns the most brittle DAG."},
    {"name": "Ahsoka Tano", "email": "ahsoka@rebellion.net", "team": "Rebel Engineering", "description": "Former padawan, now platform engineer. Wrote the warehouse's access-control layer."},

    # Logistics
    {"name": "Admiral Raddus", "email": "raddus@mooncalamari.gal", "team": "Quartermaster Corps", "description": "Mon Calamari quartermaster. Owns the starship-parts inventory."},
    {"name": "General Airen Cracken", "email": "cracken@rebellion.net", "team": "Quartermaster Corps", "description": "Supply-chain analyst. Cohort analysis on resupply times."},

    # Spies
    {"name": "Borsk Fey'lya", "email": "bfeylya@bothan.net", "team": "Bothan Spy Network", "description": "Head of the Bothan spynet. Raw data quality is his constant battle."},
    {"name": "Tycho Celchu", "email": "tycho@rogue.gal", "team": "Bothan Spy Network", "description": "Field operative, double-agent asset handler."},

    # Jedi
    {"name": "Luke Skywalker", "email": "luke@jediarchives.gal", "team": "Jedi Archives", "description": "Jedi Master, historian-in-residence. Curates lineage data."},
    {"name": "Obi-Wan Kenobi", "email": "obiwan@jediarchives.gal", "team": "Jedi Archives", "description": "Archive contributor, master chronicler of the old Order."},
    {"name": "Yoda", "email": "yoda@jediarchives.gal", "team": "Jedi Archives", "description": "Senior custodian. Powerful SQL, he writes."},

    # Compliance
    {"name": "Mace Windu", "email": "mwindu@jediarchives.gal", "team": "Jedi Council Compliance", "description": "Council member. Enforces the data-access code of conduct."},
    {"name": "Ki-Adi-Mundi", "email": "kimundi@jediarchives.gal", "team": "Jedi Council Compliance", "description": "Privacy officer for Force-sensitive personal data."},

    # Medical
    {"name": "Dr. Evazan", "email": "evazan@medfrig.gal", "team": "Medical Frigate Analytics", "description": "Reformed cantina surgeon, now triage analytics lead."},
    {"name": "2-1B", "email": "21b@medfrig.gal", "team": "Medical Frigate Analytics", "description": "Medical droid. Owns the bacta utilisation dashboard."},

    # Cartography
    {"name": "Wynssa Starflare", "email": "wstarflare@cartography.gal", "team": "Galactic Cartography", "description": "Hyperspace corridor researcher."},
    {"name": "Sana Starros", "email": "sstarros@cartography.gal", "team": "Galactic Cartography", "description": "Smuggler-turned-cartographer. Owns the safe-jump dashboard."},

    # Comms
    {"name": "Saw Gerrera", "email": "gerrera@partisans.gal", "team": "Propaganda & Comms", "description": "Extremist faction leader. Contributor of recruitment signal."},
    {"name": "Mon Cal Newsfeed", "email": "newsroom@mooncalamari.gal", "team": "Propaganda & Comms", "description": "Editorial bot handle for bulletin dispatching."},

    # General support
    {"name": "Han Solo", "email": "hsolo@falcon.gal", "team": "Fleet Operations", "description": "Consultant / courier. Runs irregular ingest jobs via unofficial channels."},
    {"name": "Chewbacca", "email": "chewie@falcon.gal", "team": "Fleet Operations", "description": "Wookiee co-pilot. Supports Solo's unofficial pipeline."},
]


# ====================================================================
# Systems (source catalogs)
# ====================================================================

SYSTEMS: list[dict[str, Any]] = [
    {"name": "Bothan Spynet Intercepts", "description": "Raw encrypted comms harvested by Bothan field agents. Origin of most Imperial intelligence.", "owner": "Bothan Spy Network", "specs": {"vendor": "Bothan Covert Group", "environment": "production", "api_available": "limited"}},
    {"name": "Imperial HoloNet Tap", "description": "Passive capture of Imperial HoloNet broadcasts. High volume, noisy, needs heavy filtering.", "owner": "Bothan Spy Network", "specs": {"vendor": "Imperial (unauthorised)", "environment": "production", "api_available": "no"}},
    {"name": "Mon Calamari Shipyards MRP", "description": "Materials Requirements Planning system for Rebel starship construction.", "owner": "Quartermaster Corps", "specs": {"vendor": "Mon Calamari Industries", "type": "onprem", "api_available": "yes"}},
    {"name": "Rebel Senate Treasury", "description": "Source of truth for budgets, payroll, and inter-world appropriations.", "owner": "Senate Treasury", "specs": {"vendor": "Republic Senate IT", "environment": "production", "api_available": "yes"}},
    {"name": "Kessel Spice Trade Ledger", "description": "Contraband ledger — tracks who paid whom along the Kessel Run.", "owner": "Fleet Operations", "specs": {"environment": "production", "api_available": "limited"}},
    {"name": "Jedi Holocron Registry", "description": "Ancient records of lightsaber crystals, Force lineages, and training artefacts.", "owner": "Jedi Archives", "specs": {"vendor": "Old Jedi Order", "environment": "production"}},
    {"name": "Medical Frigate EHR", "description": "Electronic Health Records across Rebel medical frigates.", "owner": "Medical Frigate Analytics", "specs": {"vendor": "Haven Medical Systems", "environment": "production", "api_available": "yes"}},
    {"name": "Mandalorian Bounty Guild CRM", "description": "Bounty-hunter contracts, targets, payouts. Populated by freelance correspondents.", "owner": "Bothan Spy Network"},
    {"name": "Coruscant Traffic Control", "description": "Orbital traffic logs — starship arrivals/departures, docking slots.", "owner": "Galactic Cartography", "specs": {"vendor": "Coruscant TCA", "environment": "production", "api_available": "yes"}},
    {"name": "Tatooine Moisture Coop Ledger", "description": "Cooperative records from moisture farmers. Smallest but most reliable source.", "owner": "Quartermaster Corps"},
    {"name": "Imperial Payroll Leak (Q3)", "description": "Dump of Imperial payroll records; verified authentic, highly sensitive.", "owner": "Rebel Intelligence Division", "specs": {"environment": "staging"}},
    {"name": "Hoth Weather Station", "description": "Meteorological feed from Echo Base. Powers storm-warning dashboards.", "owner": "Galactic Cartography", "specs": {"environment": "production", "api_available": "yes"}},
]


# ====================================================================
# Raw → staging → marts datasets
# ====================================================================

def _schema(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    return {"schema": nodes}


RAW_DATASETS: list[dict[str, Any]] = [
    {
        "name": "raw.imperial_intercepts",
        "description": "Raw Bothan intercepts of Imperial HoloNet traffic — unparsed, one row per frame.",
        "owner": "Rebel Intelligence Division",
        "source": "Bothan Spynet Intercepts",
        "specs": {"format": "json", "refresh_schedule": "hourly", "storage": "datalake", "pii": "yes"},
        "metadata_extra": _schema([
            container("intercepts", "table", [
                field("frame_id", "uuid", "Unique intercept id"),
                field("captured_at", "timestamp", "When the Bothan captured it"),
                field("source_world", "string", "Origin planet of the signal"),
                field("encrypted_body", "string", "Base64 encrypted payload"),
                field("callsign", "string", "Imperial callsign, if identified", pii=True),
                field("signal_strength_db", "float", "Raw signal strength"),
            ]),
        ]),
    },
    {
        "name": "raw.holonet_broadcasts",
        "description": "Full text + audio transcripts of Imperial HoloNet broadcasts. Massive volume.",
        "owner": "Bothan Spy Network",
        "source": "Imperial HoloNet Tap",
        "specs": {"format": "parquet", "refresh_schedule": "realtime", "storage": "datalake"},
        "metadata_extra": _schema([
            container("broadcasts", "table", [
                field("broadcast_id", "uuid"),
                field("aired_at", "timestamp"),
                field("channel", "string"),
                field("transcript", "string"),
                field("speaker_voiceprint_hash", "string", pii=True),
                field("sentiment_score", "float"),
            ]),
        ]),
    },
    {
        "name": "raw.shipyard_mrp_orders",
        "description": "Work orders for starship components — frames, ion drives, shield generators.",
        "owner": "Quartermaster Corps",
        "source": "Mon Calamari Shipyards MRP",
        "specs": {"format": "table", "refresh_schedule": "daily", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("work_orders", "table", [
                field("order_id", "uuid"),
                field("placed_at", "timestamp"),
                field("part_number", "string"),
                field("part_description", "string"),
                field("quantity", "int"),
                field("unit_cost_credits", "float"),
                field("supplier_id", "uuid"),
                field("due_by", "date"),
            ]),
        ]),
    },
    {
        "name": "raw.treasury_transactions",
        "description": "Every treasury movement — inbound donations, outbound military stipends, audit flags.",
        "owner": "Senate Treasury",
        "source": "Rebel Senate Treasury",
        "specs": {"format": "csv", "refresh_schedule": "hourly", "storage": "bigquery", "pii": "anonymized"},
        "metadata_extra": _schema([
            container("transactions", "table", [
                field("txn_id", "uuid"),
                field("posted_at", "timestamp"),
                field("from_account", "string", pii=True),
                field("to_account", "string", pii=True),
                field("amount_credits", "float"),
                field("currency", "string"),
                field("memo", "string"),
                field("audit_flag", "bool"),
            ]),
        ]),
    },
    {
        "name": "raw.spice_ledger",
        "description": "Raw Kessel spice-trade ledger. Grey market, partial data.",
        "owner": "Fleet Operations",
        "source": "Kessel Spice Trade Ledger",
        "specs": {"format": "csv", "refresh_schedule": "weekly", "storage": "s3"},
        "metadata_extra": _schema([
            container("spice_shipments", "table", [
                field("shipment_id", "uuid"),
                field("captain_name", "string", pii=True),
                field("spice_grade", "string"),
                field("weight_kg", "float"),
                field("route", "string"),
                field("paid_credits", "float"),
                field("departed_at", "timestamp"),
            ]),
        ]),
    },
    {
        "name": "raw.holocron_entries",
        "description": "Verbatim exports of Jedi Holocron entries — lineage, lightsaber crystals, Force-user tests.",
        "owner": "Jedi Archives",
        "source": "Jedi Holocron Registry",
        "specs": {"format": "json", "refresh_schedule": "monthly", "storage": "datalake"},
        "metadata_extra": _schema([
            container("holocrons", "table", [
                field("holocron_id", "uuid"),
                field("recorded_at", "timestamp"),
                field("subject_name", "string", pii=True),
                field("subject_species", "string"),
                field("force_sensitive", "bool"),
                field("midi_chlorian_count", "int"),
                field("master_name", "string", pii=True),
            ]),
        ]),
    },
    {
        "name": "raw.medfrig_patient_visits",
        "description": "Every triage event across Rebel medical frigates. HIPAA-equivalent restrictions.",
        "owner": "Medical Frigate Analytics",
        "source": "Medical Frigate EHR",
        "specs": {"format": "parquet", "refresh_schedule": "hourly", "storage": "postgresql", "pii": "yes"},
        "metadata_extra": _schema([
            container("visits", "table", [
                field("visit_id", "uuid"),
                field("patient_id", "uuid", pii=True),
                field("arrived_at", "timestamp"),
                field("triage_level", "int"),
                field("diagnosis_code", "string"),
                field("bacta_minutes", "int"),
                field("outcome", "string"),
            ]),
        ]),
    },
    {
        "name": "raw.bounty_contracts",
        "description": "Active + historical Bounty Guild contracts — targets, bounties, claimants.",
        "owner": "Rebel Intelligence Division",
        "source": "Mandalorian Bounty Guild CRM",
        "specs": {"format": "json", "refresh_schedule": "daily", "storage": "datalake"},
        "metadata_extra": _schema([
            container("contracts", "table", [
                field("contract_id", "uuid"),
                field("posted_at", "timestamp"),
                field("target_name", "string", pii=True),
                field("placed_by", "string", pii=True),
                field("reward_credits", "float"),
                field("status", "string"),
                field("claimant_hunter_id", "string", pii=True),
            ]),
        ]),
    },
    {
        "name": "raw.coruscant_docking",
        "description": "Docking slot allocations at every Coruscant orbital platform.",
        "owner": "Galactic Cartography",
        "source": "Coruscant Traffic Control",
        "specs": {"format": "json", "refresh_schedule": "realtime", "storage": "s3"},
        "metadata_extra": _schema([
            container("docking_events", "table", [
                field("event_id", "uuid"),
                field("ship_registration", "string"),
                field("ship_class", "string"),
                field("arrived_at", "timestamp"),
                field("departed_at", "timestamp"),
                field("platform_code", "string"),
            ]),
        ]),
    },
    {
        "name": "raw.moisture_coop_entries",
        "description": "Daily log entries from Tatooine moisture farms.",
        "owner": "Quartermaster Corps",
        "source": "Tatooine Moisture Coop Ledger",
        "specs": {"format": "csv", "refresh_schedule": "daily", "storage": "s3"},
        "metadata_extra": _schema([
            container("coop_logs", "table", [
                field("log_id", "uuid"),
                field("farm_id", "string"),
                field("recorded_on", "date"),
                field("water_litres", "float"),
                field("hazard_notes", "string"),
            ]),
        ]),
    },
    {
        "name": "raw.imperial_payroll",
        "description": "Leaked Imperial payroll: officer rates, stormtrooper pay, Moff expense accounts.",
        "owner": "Rebel Intelligence Division",
        "source": "Imperial Payroll Leak (Q3)",
        "specs": {"format": "csv", "refresh_schedule": "static", "storage": "datalake", "pii": "yes"},
        "metadata_extra": _schema([
            container("payroll", "table", [
                field("officer_id", "string", pii=True),
                field("rank", "string"),
                field("base_pay_credits", "float"),
                field("hazard_bonus_credits", "float"),
                field("assigned_vessel", "string"),
                field("home_world", "string", pii=True),
            ]),
        ]),
    },
    {
        "name": "raw.hoth_weather",
        "description": "Hourly readings from Echo Base weather sensors on Hoth.",
        "owner": "Galactic Cartography",
        "source": "Hoth Weather Station",
        "specs": {"format": "json", "refresh_schedule": "hourly", "storage": "s3"},
        "metadata_extra": _schema([
            container("weather_readings", "table", [
                field("reading_id", "uuid"),
                field("observed_at", "timestamp"),
                field("temperature_c", "float"),
                field("wind_speed_kmh", "float"),
                field("snow_accumulation_cm", "float"),
                field("visibility_m", "float"),
            ]),
        ]),
    },
]


STAGING_DATASETS: list[dict[str, Any]] = [
    {
        "name": "staging.imperial_intercepts_decoded",
        "description": "Decrypted + parsed Imperial intercepts, deduped against known-signal fingerprints.",
        "owner": "Rebel Intelligence Division",
        "feeds_from": ["raw.imperial_intercepts"],
        "specs": {"format": "parquet", "refresh_schedule": "hourly", "storage": "bigquery"},
        "metadata_extra": _schema([
            container("intercepts", "table", [
                field("frame_id", "uuid"),
                field("captured_at", "timestamp"),
                field("source_world", "string"),
                field("decoded_body", "string"),
                field("imperial_unit", "string"),
                field("confidence", "float"),
            ]),
        ]),
    },
    {
        "name": "staging.broadcasts_indexed",
        "description": "HoloNet broadcasts with sentiment + entity tags.",
        "owner": "Propaganda & Comms",
        "feeds_from": ["raw.holonet_broadcasts"],
        "specs": {"format": "parquet", "refresh_schedule": "hourly", "storage": "bigquery"},
        "metadata_extra": _schema([
            container("broadcasts", "table", [
                field("broadcast_id", "uuid"),
                field("aired_at", "timestamp"),
                field("speaker_name", "string"),
                field("sentiment_bucket", "string"),
                field("entities_mentioned", "json"),
            ]),
        ]),
    },
    {
        "name": "staging.shipyard_parts",
        "description": "Deduped shipyard parts with supplier + lead-time enrichment.",
        "owner": "Rebel Engineering",
        "feeds_from": ["raw.shipyard_mrp_orders"],
        "specs": {"format": "table", "refresh_schedule": "daily", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("parts", "table", [
                field("part_number", "string"),
                field("description", "string"),
                field("supplier_name", "string"),
                field("avg_lead_time_days", "float"),
                field("in_flight_orders", "int"),
            ]),
        ]),
    },
    {
        "name": "staging.treasury_clean",
        "description": "Treasury transactions deduplicated + categorised by department.",
        "owner": "Senate Treasury",
        "feeds_from": ["raw.treasury_transactions"],
        "specs": {"format": "table", "refresh_schedule": "hourly", "storage": "bigquery"},
        "metadata_extra": _schema([
            container("transactions", "table", [
                field("txn_id", "uuid"),
                field("posted_at", "timestamp"),
                field("category", "string"),
                field("amount_credits", "float"),
                field("department", "string"),
                field("audit_flag", "bool"),
            ]),
        ]),
    },
    {
        "name": "staging.spice_flow",
        "description": "Staged spice shipments with route resolution + payment normalisation.",
        "owner": "Fleet Operations",
        "feeds_from": ["raw.spice_ledger"],
        "specs": {"format": "parquet", "refresh_schedule": "weekly", "storage": "s3"},
        "metadata_extra": _schema([
            container("shipments", "table", [
                field("shipment_id", "uuid"),
                field("grade", "string"),
                field("kg", "float"),
                field("route_segments", "json"),
                field("paid_credits_usd", "float"),
            ]),
        ]),
    },
    {
        "name": "staging.holocron_lineage",
        "description": "Normalised Jedi lineage graph: who trained whom, generation by generation.",
        "owner": "Jedi Archives",
        "feeds_from": ["raw.holocron_entries"],
        "specs": {"format": "table", "refresh_schedule": "monthly", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("lineage", "table", [
                field("jedi_id", "uuid"),
                field("jedi_name", "string"),
                field("master_id", "uuid"),
                field("rank", "string"),
                field("force_affinity", "string"),
            ]),
        ]),
    },
    {
        "name": "staging.medfrig_visits_enriched",
        "description": "Visits + derived triage severity, hashed patient ids for analytics use.",
        "owner": "Medical Frigate Analytics",
        "feeds_from": ["raw.medfrig_patient_visits"],
        "specs": {"format": "parquet", "refresh_schedule": "hourly", "storage": "postgresql", "pii": "anonymized"},
        "metadata_extra": _schema([
            container("visits", "table", [
                field("visit_id", "uuid"),
                field("patient_hash", "string"),
                field("severity", "string"),
                field("bacta_minutes", "int"),
                field("outcome", "string"),
            ]),
        ]),
    },
    {
        "name": "staging.bounty_catalog",
        "description": "Normalised bounty contracts with hunter reputation scores.",
        "owner": "Rebel Intelligence Division",
        "feeds_from": ["raw.bounty_contracts"],
        "specs": {"format": "table", "refresh_schedule": "daily", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("contracts", "table", [
                field("contract_id", "uuid"),
                field("target_class", "string"),
                field("reward_credits", "float"),
                field("hunter_reputation", "float"),
                field("status", "string"),
            ]),
        ]),
    },
    {
        "name": "staging.coruscant_traffic",
        "description": "Docking events grouped by platform + ship class.",
        "owner": "Galactic Cartography",
        "feeds_from": ["raw.coruscant_docking"],
        "specs": {"format": "parquet", "refresh_schedule": "realtime", "storage": "s3"},
        "metadata_extra": _schema([
            container("docking", "table", [
                field("window_start", "timestamp"),
                field("platform_code", "string"),
                field("ship_class", "string"),
                field("arrivals", "int"),
                field("departures", "int"),
            ]),
        ]),
    },
    {
        "name": "staging.imperial_payroll_normalised",
        "description": "Imperial officer pay with rank hierarchy + redacted identifiers.",
        "owner": "Rebel Intelligence Division",
        "feeds_from": ["raw.imperial_payroll"],
        "specs": {"format": "table", "refresh_schedule": "static", "storage": "bigquery", "pii": "anonymized"},
        "metadata_extra": _schema([
            container("payroll", "table", [
                field("officer_hash", "string"),
                field("rank", "string"),
                field("pay_total_credits", "float"),
                field("vessel_class", "string"),
            ]),
        ]),
    },
    {
        "name": "staging.weather_daily",
        "description": "Daily weather rollups for Hoth + other stationed worlds.",
        "owner": "Galactic Cartography",
        "feeds_from": ["raw.hoth_weather"],
        "specs": {"format": "parquet", "refresh_schedule": "daily", "storage": "s3"},
        "metadata_extra": _schema([
            container("weather", "table", [
                field("day", "date"),
                field("world", "string"),
                field("avg_temp_c", "float"),
                field("max_wind_kmh", "float"),
                field("total_snow_cm", "float"),
            ]),
        ]),
    },
    {
        "name": "staging.moisture_coop_daily",
        "description": "Daily-rollup moisture farm output, keyed by farm.",
        "owner": "Quartermaster Corps",
        "feeds_from": ["raw.moisture_coop_entries"],
        "specs": {"format": "table", "refresh_schedule": "daily", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("output", "table", [
                field("farm_id", "string"),
                field("day", "date"),
                field("water_litres", "float"),
                field("quality_score", "float"),
            ]),
        ]),
    },
]


MART_DATASETS: list[dict[str, Any]] = [
    {
        "name": "marts.imperial_movements",
        "description": "Canonical view of Imperial fleet positions and troop movements.",
        "owner": "Rebel Intelligence Division",
        "feeds_from": ["staging.imperial_intercepts_decoded", "staging.coruscant_traffic"],
        "specs": {"format": "table", "refresh_schedule": "hourly", "storage": "bigquery"},
        "metadata_extra": _schema([
            container("imperial_movements", "table", [
                field("movement_id", "uuid"),
                field("recorded_at", "timestamp"),
                field("system", "string"),
                field("unit_class", "string"),
                field("unit_count", "int"),
                field("confidence", "float"),
                field("destination_system", "string"),
            ]),
        ]),
    },
    {
        "name": "marts.fleet_readiness",
        "description": "Per-squadron readiness: operational ships, pilot strength, fuel reserves.",
        "owner": "Fleet Operations",
        "feeds_from": ["staging.shipyard_parts", "staging.treasury_clean"],
        "specs": {"format": "table", "refresh_schedule": "daily", "storage": "bigquery"},
        "metadata_extra": _schema([
            container("readiness", "table", [
                field("squadron", "string"),
                field("ships_operational", "int"),
                field("ships_in_repair", "int"),
                field("pilots_available", "int"),
                field("avg_parts_lead_days", "float"),
                field("readiness_score", "float"),
            ]),
        ]),
    },
    {
        "name": "marts.senate_budget",
        "description": "Allocated vs spent per department, quarter by quarter.",
        "owner": "Senate Treasury",
        "feeds_from": ["staging.treasury_clean"],
        "specs": {"format": "table", "refresh_schedule": "daily", "storage": "bigquery"},
        "metadata_extra": _schema([
            container("budget", "table", [
                field("quarter", "string"),
                field("department", "string"),
                field("allocated_credits", "float"),
                field("spent_credits", "float"),
                field("variance_pct", "float"),
            ]),
        ]),
    },
    {
        "name": "marts.jedi_lineage_tree",
        "description": "Master → padawan → knight tree with Force-affinity stats.",
        "owner": "Jedi Archives",
        "feeds_from": ["staging.holocron_lineage"],
        "specs": {"format": "table", "refresh_schedule": "monthly", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("lineage", "table", [
                field("jedi_id", "uuid"),
                field("jedi_name", "string"),
                field("master_name", "string"),
                field("training_years", "int"),
                field("affinity", "string"),
            ]),
        ]),
    },
    {
        "name": "marts.spice_revenue_by_route",
        "description": "Spice revenue by trade route + grade. Strategic for blockade planning.",
        "owner": "Fleet Operations",
        "feeds_from": ["staging.spice_flow"],
        "specs": {"format": "table", "refresh_schedule": "weekly", "storage": "s3"},
        "metadata_extra": _schema([
            container("revenue", "table", [
                field("route", "string"),
                field("grade", "string"),
                field("shipments", "int"),
                field("revenue_credits", "float"),
            ]),
        ]),
    },
    {
        "name": "marts.bacta_utilization",
        "description": "Bacta tank occupancy, average stay, triage volume per frigate.",
        "owner": "Medical Frigate Analytics",
        "feeds_from": ["staging.medfrig_visits_enriched"],
        "specs": {"format": "table", "refresh_schedule": "hourly", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("utilization", "table", [
                field("frigate", "string"),
                field("tanks_in_use", "int"),
                field("avg_stay_minutes", "float"),
                field("triage_volume", "int"),
            ]),
        ]),
    },
    {
        "name": "marts.bounty_market",
        "description": "Bounty market snapshots: active contracts, price movements, hunter leaderboards.",
        "owner": "Rebel Intelligence Division",
        "feeds_from": ["staging.bounty_catalog"],
        "specs": {"format": "table", "refresh_schedule": "daily", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("market", "table", [
                field("target_class", "string"),
                field("active_contracts", "int"),
                field("avg_reward_credits", "float"),
                field("top_hunter_reputation", "float"),
            ]),
        ]),
    },
    {
        "name": "marts.safe_hyperspace_corridors",
        "description": "Safe-jump corridor scoring using weather + Imperial movement pressure.",
        "owner": "Galactic Cartography",
        "feeds_from": ["marts.imperial_movements", "staging.weather_daily"],
        "specs": {"format": "table", "refresh_schedule": "hourly", "storage": "s3"},
        "metadata_extra": _schema([
            container("corridors", "table", [
                field("corridor_id", "uuid"),
                field("from_system", "string"),
                field("to_system", "string"),
                field("safety_score", "float"),
                field("imperial_pressure", "float"),
                field("weather_risk", "float"),
            ]),
        ]),
    },
    {
        "name": "marts.imperial_payroll_rollup",
        "description": "Imperial payroll by rank + vessel, used for defector-targeting analytics.",
        "owner": "Rebel Intelligence Division",
        "feeds_from": ["staging.imperial_payroll_normalised"],
        "specs": {"format": "table", "refresh_schedule": "static", "storage": "bigquery"},
        "metadata_extra": _schema([
            container("rollup", "table", [
                field("rank", "string"),
                field("vessel_class", "string"),
                field("officers", "int"),
                field("avg_pay_credits", "float"),
            ]),
        ]),
    },
    {
        "name": "marts.moisture_farm_supply",
        "description": "Forecasted water supply from Tatooine coop, per week.",
        "owner": "Quartermaster Corps",
        "feeds_from": ["staging.moisture_coop_daily"],
        "specs": {"format": "table", "refresh_schedule": "weekly", "storage": "postgresql"},
        "metadata_extra": _schema([
            container("forecast", "table", [
                field("week", "string"),
                field("expected_litres", "float"),
                field("upper_bound", "float"),
                field("lower_bound", "float"),
            ]),
        ]),
    },
]


# ====================================================================
# Processes (Airflow-like DAGs)
# ====================================================================

PROCESSES: list[dict[str, Any]] = [
    {"name": "Nightly Bothan Ingest", "description": "Main nightly DAG pulling from the Bothan Spynet tap.", "owner": "Rebel Engineering", "consumes": ["Bothan Spynet Intercepts"], "produces": ["raw.imperial_intercepts"], "specs": {"orchestrator": "airflow", "schedule": "0 2 * * *", "runtime": "120m", "language": "python"}},
    {"name": "HoloNet Realtime Stream", "description": "Flink pipeline on Imperial HoloNet taps.", "owner": "Bothan Spy Network", "consumes": ["Imperial HoloNet Tap"], "produces": ["raw.holonet_broadcasts"], "specs": {"orchestrator": "dagster", "schedule": "realtime", "runtime": "continuous", "language": "scala"}},
    {"name": "Shipyard MRP Daily Sync", "description": "Daily Mon Cal shipyard CDC dump + load.", "owner": "Rebel Engineering", "consumes": ["Mon Calamari Shipyards MRP"], "produces": ["raw.shipyard_mrp_orders"], "specs": {"orchestrator": "airflow", "schedule": "0 4 * * *", "runtime": "45m", "language": "sql"}},
    {"name": "Treasury Hourly CDC", "description": "Hourly change-capture from Senate Treasury.", "owner": "Senate Treasury", "consumes": ["Rebel Senate Treasury"], "produces": ["raw.treasury_transactions"], "specs": {"orchestrator": "airflow", "schedule": "0 * * * *", "runtime": "10m"}},
    {"name": "Jedi Archive Monthly Ingest", "description": "Monthly Holocron snapshot. Heavy, Yoda-reviewed.", "owner": "Jedi Archives", "consumes": ["Jedi Holocron Registry"], "produces": ["raw.holocron_entries"], "specs": {"orchestrator": "cron", "schedule": "0 0 1 * *", "language": "python"}},
    {"name": "Bacta Utilization Rebuild", "description": "Rebuilds medfrig bacta utilisation dashboards hourly.", "owner": "Medical Frigate Analytics", "consumes": ["staging.medfrig_visits_enriched"], "produces": ["marts.bacta_utilization"], "specs": {"orchestrator": "dbt", "schedule": "15 * * * *"}},
    {"name": "Fleet Readiness DAG", "description": "Computes fleet readiness across squadrons.", "owner": "Fleet Operations", "consumes": ["staging.shipyard_parts", "staging.treasury_clean"], "produces": ["marts.fleet_readiness"], "specs": {"orchestrator": "airflow", "schedule": "0 5 * * *"}},
    {"name": "Safe Corridor Scoring", "description": "Re-scores every hyperspace corridor every hour.", "owner": "Galactic Cartography", "consumes": ["marts.imperial_movements", "staging.weather_daily"], "produces": ["marts.safe_hyperspace_corridors"], "specs": {"orchestrator": "prefect", "schedule": "0 * * * *"}},
    {"name": "Imperial Movement Nowcast", "description": "Merges intercepts + docking to nowcast Imperial fleet positions.", "owner": "Rebel Intelligence Division", "consumes": ["staging.imperial_intercepts_decoded", "staging.coruscant_traffic"], "produces": ["marts.imperial_movements"], "specs": {"orchestrator": "airflow", "schedule": "10 * * * *", "language": "python"}},
    {"name": "Senate Budget Refresh", "description": "Nightly refresh of departmental spend.", "owner": "Senate Treasury", "consumes": ["staging.treasury_clean"], "produces": ["marts.senate_budget"], "specs": {"orchestrator": "dbt", "schedule": "0 3 * * *"}},
    {"name": "Spice Route Rollup", "description": "Weekly grade x route rollup.", "owner": "Fleet Operations", "consumes": ["staging.spice_flow"], "produces": ["marts.spice_revenue_by_route"], "specs": {"orchestrator": "airflow", "schedule": "0 6 * * 0"}},
    {"name": "Bounty Market Refresh", "description": "Daily bounty-market snapshot for the Intel dashboard.", "owner": "Rebel Intelligence Division", "consumes": ["staging.bounty_catalog"], "produces": ["marts.bounty_market"], "specs": {"orchestrator": "airflow", "schedule": "30 4 * * *"}},
    {"name": "Moisture Supply Forecast", "description": "Weekly forecasting pipeline for Tatooine moisture.", "owner": "Quartermaster Corps", "consumes": ["staging.moisture_coop_daily"], "produces": ["marts.moisture_farm_supply"], "specs": {"orchestrator": "prefect", "schedule": "0 5 * * 1"}},
]


# ====================================================================
# Reports / dashboards
# ====================================================================

REPORTS: list[dict[str, Any]] = [
    {"name": "Rebel Fleet Readiness Dashboard", "description": "High-command readiness at-a-glance for Fleet Operations.", "owner": "Fleet Operations", "uses": ["marts.fleet_readiness"], "specs": {"tool": "tableau", "format": "twbx", "audience": "executive"}},
    {"name": "Imperial Movement Heatmap", "description": "Spatial heatmap of likely Imperial fleet positions.", "owner": "Rebel Intelligence Division", "uses": ["marts.imperial_movements"], "specs": {"tool": "powerbi", "format": "pbix", "audience": "analysts"}},
    {"name": "Senate Budget Briefing", "description": "Quarterly budget vs spend briefing for Mon Mothma.", "owner": "Senate Treasury", "uses": ["marts.senate_budget"], "specs": {"tool": "tableau", "audience": "executive"}},
    {"name": "Jedi Lineage Tree", "description": "Interactive family tree of every known Jedi.", "owner": "Jedi Archives", "uses": ["marts.jedi_lineage_tree"], "specs": {"tool": "looker", "audience": "internal"}},
    {"name": "Spice Cartel Revenue", "description": "Revenue per route, informs blockade strategy.", "owner": "Fleet Operations", "uses": ["marts.spice_revenue_by_route"], "specs": {"tool": "tableau", "audience": "ops"}},
    {"name": "Bacta Utilization Live", "description": "Real-time bacta tank occupancy across the medfrig fleet.", "owner": "Medical Frigate Analytics", "uses": ["marts.bacta_utilization"], "specs": {"tool": "looker", "audience": "medical"}},
    {"name": "Bounty Market Weekly", "description": "Hunter leaderboard and target-price movements.", "owner": "Rebel Intelligence Division", "uses": ["marts.bounty_market"], "specs": {"tool": "metabase", "audience": "analysts"}},
    {"name": "Safe Hyperspace Corridors", "description": "Pilot-facing corridor safety dashboard.", "owner": "Galactic Cartography", "uses": ["marts.safe_hyperspace_corridors", "staging.weather_daily"], "specs": {"tool": "tableau", "audience": "ops"}},
    {"name": "Imperial Payroll Intel", "description": "Rank/vessel payroll used by defector recruitment teams.", "owner": "Rebel Intelligence Division", "uses": ["marts.imperial_payroll_rollup"], "specs": {"tool": "powerbi", "audience": "analysts"}},
    {"name": "Moisture Supply Forecast", "description": "Logistics-facing supply forecast dashboard.", "owner": "Quartermaster Corps", "uses": ["marts.moisture_farm_supply"], "specs": {"tool": "metabase", "audience": "ops"}},
    {"name": "Death Star Vulnerability Brief", "description": "Exec brief cross-referencing schematic leaks + payroll movements.", "owner": "Rebel Intelligence Division", "uses": ["marts.imperial_movements", "marts.imperial_payroll_rollup"], "specs": {"tool": "tableau", "audience": "executive"}},
    {"name": "Force-Sensitivity Index", "description": "Rolling index of detected Force-sensitives.", "owner": "Jedi Archives", "uses": ["marts.jedi_lineage_tree"], "specs": {"tool": "looker", "audience": "council"}},
]


# ====================================================================
# Rules
# ====================================================================

RULES: list[dict[str, Any]] = [
    {"name": "Intercept frame_id must be unique", "description": "Duplicate frame ids signal replay attacks or Bothan double-reporting.", "severity": "critical", "category": "integrity"},
    {"name": "Intercept captured_at within 48h", "description": "Old intercepts are less actionable and crowd out fresh intel.", "severity": "warning", "category": "freshness"},
    {"name": "Treasury amount non-zero", "description": "Zero-amount transactions indicate a posting error upstream.", "severity": "warning", "category": "integrity"},
    {"name": "Treasury audit_flag must be boolean", "description": "Nullable audit flags break downstream compliance reporting.", "severity": "critical", "category": "integrity"},
    {"name": "Patient PII hashed, never raw", "description": "Raw patient_id must never reach staging/marts.", "severity": "critical", "category": "privacy"},
    {"name": "Midi-chlorian count positive", "description": "A non-positive count means a sensor calibration issue.", "severity": "critical", "category": "integrity"},
    {"name": "Holocron subject_name not null", "description": "An unnamed Holocron subject is unusable downstream.", "severity": "warning", "category": "completeness"},
    {"name": "Spice grade in known taxonomy", "description": "Grades outside {A, B, glitterstim, spice-dust} require a human review.", "severity": "warning", "category": "taxonomy"},
    {"name": "Docking platform_code formatted", "description": "Enforces Coruscant TCA platform code pattern PLAT-###.", "severity": "info", "category": "format"},
    {"name": "Weather reading_id uniqueness", "description": "Duplicate readings break hourly rollups.", "severity": "warning", "category": "integrity"},
    {"name": "Imperial payroll officer_hash only", "description": "Raw officer_id forbidden in staging.imperial_payroll_normalised.", "severity": "critical", "category": "privacy"},
    {"name": "Bounty contract reward > 0", "description": "Zero-reward contracts are test data that leaked to prod.", "severity": "warning", "category": "integrity"},
    {"name": "Shipyard order due_by future-dated", "description": "Past-due orders should flow to exceptions, not the live queue.", "severity": "info", "category": "business-rule"},
    {"name": "Marts refreshed within SLA", "description": "Every marts.* table must refresh on schedule or raise an alert.", "severity": "critical", "category": "freshness"},
    {"name": "Broadcast sentiment score bounded", "description": "Scores must fall between -1 and 1.", "severity": "warning", "category": "integrity"},
    {"name": "Medfrig triage_level in 1..5", "description": "Triage levels outside the ENAS scale reject the row.", "severity": "warning", "category": "taxonomy"},
    {"name": "Coruscant docking windows non-overlapping", "description": "Overlapping docks on a single platform mean double-booking.", "severity": "warning", "category": "business-rule"},
    {"name": "Hyperspace corridor safety_score ≥ 0", "description": "Negative safety score indicates a calculation bug.", "severity": "critical", "category": "integrity"},
    {"name": "Bothan agent identity redacted", "description": "Any column matching `agent_*` must be redacted before reaching marts.", "severity": "critical", "category": "privacy"},
    {"name": "Imperial movements dedup by signature", "description": "Prevents double-counting when two intercepts describe the same movement.", "severity": "warning", "category": "integrity"},
]


# ====================================================================
# Explicit extra relations (beyond the owner/feeds/produces derived ones)
# ====================================================================

EXTRA_RELATIONS: list[tuple[str, str, str, dict[str, Any] | None]] = [
    # Fleet commanders use fleet readiness
    ("wedge-antilles", "rebel-fleet-readiness-dashboard", "uses", None),
    ("admiral-gial-ackbar", "rebel-fleet-readiness-dashboard", "uses", None),
    ("general-jan-dodonna", "rebel-fleet-readiness-dashboard", "uses", None),
    ("hera-syndulla", "rebel-fleet-readiness-dashboard", "uses", None),

    # Intel consumers
    ("princess-leia-organa", "imperial-movement-heatmap", "uses", None),
    ("cassian-andor", "imperial-movement-heatmap", "uses", None),
    ("jyn-erso", "death-star-vulnerability-brief", "uses", None),
    ("princess-leia-organa", "death-star-vulnerability-brief", "uses", None),

    # Senate
    ("mon-mothma", "senate-budget-briefing", "uses", None),
    ("bail-organa", "senate-budget-briefing", "uses", None),

    # Jedi
    ("luke-skywalker", "jedi-lineage-tree", "uses", None),
    ("obi-wan-kenobi", "jedi-lineage-tree", "uses", None),
    ("yoda", "jedi-lineage-tree", "uses", None),
    ("ahsoka-tano", "jedi-lineage-tree", "uses", None),

    # Force-sensitivity consumers
    ("mace-windu", "force-sensitivity-index", "uses", None),
    ("ki-adi-mundi", "force-sensitivity-index", "uses", None),

    # Medical
    ("dr-evazan", "bacta-utilization-live", "uses", None),
    ("2-1b", "bacta-utilization-live", "uses", None),

    # Cartography
    ("sana-starros", "safe-hyperspace-corridors", "uses", None),
    ("wynssa-starflare", "safe-hyperspace-corridors", "uses", None),
    ("lando-calrissian", "safe-hyperspace-corridors", "uses", None),
    ("han-solo", "safe-hyperspace-corridors", "uses", None),
    ("nien-nunb", "safe-hyperspace-corridors", "uses", None),

    # Quartermaster
    ("admiral-raddus", "moisture-supply-forecast", "uses", None),
    ("general-airen-cracken", "moisture-supply-forecast", "uses", None),

    # Ops/misc cross-team
    ("hera-syndulla", "spice-cartel-revenue", "uses", None),
    ("saw-gerrera", "bounty-market-weekly", "uses", None),
    ("borsk-feylya", "bounty-market-weekly", "uses", None),
]


# Rules → assets with enforcement properties.
RULE_APPLICATIONS: list[tuple[str, str, str, str | None]] = [
    ("intercept-frame-id-must-be-unique", "raw-imperial-intercepts", "enforced", None),
    ("intercept-captured-at-within-48h", "raw-imperial-intercepts", "alerting", None),
    ("treasury-amount-non-zero", "raw-treasury-transactions", "enforced", None),
    ("treasury-audit-flag-must-be-boolean", "staging-treasury-clean", "enforced", None),
    ("patient-pii-hashed-never-raw", "staging-medfrig-visits-enriched", "enforced", None),
    ("midi-chlorian-count-positive", "raw-holocron-entries", "enforced", None),
    ("holocron-subject-name-not-null", "raw-holocron-entries", "alerting", None),
    ("spice-grade-in-known-taxonomy", "staging-spice-flow", "alerting", "Flags rows for manual triage"),
    ("docking-platform-code-formatted", "raw-coruscant-docking", "documented", None),
    ("weather-reading-id-uniqueness", "raw-hoth-weather", "enforced", None),
    ("imperial-payroll-officer-hash-only", "staging-imperial-payroll-normalised", "enforced", None),
    ("bounty-contract-reward-0", "staging-bounty-catalog", "alerting", None),
    ("shipyard-order-due-by-future-dated", "staging-shipyard-parts", "documented", None),
    ("marts-refreshed-within-sla", "marts-imperial-movements", "alerting", "Raises PagerDuty on miss"),
    ("marts-refreshed-within-sla", "marts-fleet-readiness", "alerting", None),
    ("marts-refreshed-within-sla", "marts-senate-budget", "alerting", None),
    ("broadcast-sentiment-score-bounded", "staging-broadcasts-indexed", "enforced", None),
    ("medfrig-triage-level-in-1-5", "raw-medfrig-patient-visits", "enforced", None),
    ("coruscant-docking-windows-non-overlapping", "staging-coruscant-traffic", "alerting", None),
    ("hyperspace-corridor-safety-score-0", "marts-safe-hyperspace-corridors", "enforced", None),
    ("bothan-agent-identity-redacted", "staging-imperial-intercepts-decoded", "enforced", None),
    ("imperial-movements-dedup-by-signature", "marts-imperial-movements", "enforced", None),
]


# ====================================================================
# Runner
# ====================================================================

async def _wipe() -> None:
    logger.info("wiping catalog — dropping every node + relation")
    async with neo4j_driver.session() as session:
        await session.run("MATCH (n) DETACH DELETE n")


async def _create_actor(
    kind: str,
    name: str,
    *,
    description: str | None = None,
    email: str | None = None,
) -> str:
    """Idempotent actor upsert keyed on the generated slug. Returns the uid."""
    uid = f"actor-{slug(name)}"
    now = datetime.now(UTC)
    query = """
        MERGE (a:Actor {uid: $uid})
        SET a.type = $type,
            a.name = $name,
            a.email = $email,
            a.description = $description,
            a.verified = true,
            a.discovered_by = null,
            a.metadata = '{}',
            a.created_at = coalesce(a.created_at, $now),
            a.updated_at = $now
        RETURN a.uid as uid
    """
    async with neo4j_driver.session() as session:
        await session.run(
            query,
            {"uid": uid, "type": kind, "name": name, "email": email, "description": description, "now": now},
        )
    return uid


async def _create_asset(
    asset_type: str,
    name: str,
    *,
    description: str | None = None,
    location: str | None = None,
    metadata: dict[str, Any] | None = None,
    specs: dict[str, Any] | None = None,
) -> str:
    """Idempotent asset upsert. Merges specs into metadata."""
    uid = f"asset-{slug(name)}"
    now = datetime.now(UTC)
    md: dict[str, Any] = {}
    if specs:
        md.update(specs)
    if metadata:
        md.update(metadata)
    label = asset_type.capitalize()
    query = f"""
        MERGE (a:Asset:{label} {{uid: $uid}})
        SET a.type = $type,
            a.name = $name,
            a.description = $description,
            a.location = $location,
            a.status = 'active',
            a.verified = true,
            a.discovered_by = null,
            a.metadata = $metadata,
            a.created_at = coalesce(a.created_at, $now),
            a.updated_at = $now
        RETURN a.uid as uid
    """
    async with neo4j_driver.session() as session:
        await session.run(
            query,
            {
                "uid": uid,
                "type": asset_type,
                "name": name,
                "description": description,
                "location": location,
                "metadata": json.dumps(md),
                "now": now,
            },
        )
    return uid


async def _create_rule(
    name: str,
    description: str,
    severity: str,
    category: str | None,
) -> str:
    uid = f"rule-{slug(name)}"
    now = datetime.now(UTC)
    query = """
        MERGE (r:Rule {uid: $uid})
        SET r.name = $name,
            r.description = $description,
            r.severity = $severity,
            r.category = $category,
            r.verified = true,
            r.discovered_by = null,
            r.metadata = '{}',
            r.created_at = coalesce(r.created_at, $now),
            r.updated_at = $now
        RETURN r.uid as uid
    """
    async with neo4j_driver.session() as session:
        await session.run(
            query,
            {"uid": uid, "name": name, "description": description, "severity": severity, "category": category, "now": now},
        )
    return uid


async def _create_relation(
    from_uid: str,
    to_uid: str,
    rel_type: str,
    properties: dict[str, Any] | None = None,
) -> None:
    """Idempotent relation creation — merges on (from, to, type) pair."""
    rel_cypher = rel_type.upper()
    now = datetime.now(UTC)
    props_json = json.dumps(properties or {})
    query = f"""
        MATCH (f {{uid: $from_uid}})
        MATCH (t {{uid: $to_uid}})
        MERGE (f)-[r:{rel_cypher}]->(t)
        ON CREATE SET r.uid = $uid,
                      r.type = $type,
                      r.verified = true,
                      r.discovered_by = null,
                      r.properties = $properties,
                      r.created_at = $now
        ON MATCH SET  r.properties = $properties,
                      r.verified = true
    """
    uid = f"rel-{slug(from_uid)}-{slug(to_uid)}-{slug(rel_type)}"
    async with neo4j_driver.session() as session:
        await session.run(
            query,
            {
                "from_uid": from_uid,
                "to_uid": to_uid,
                "uid": uid,
                "type": rel_type,
                "properties": props_json,
                "now": now,
            },
        )


async def seed() -> None:
    """Deterministic build-up of the fixture."""
    logger.info("creating %d teams", len(TEAMS))
    team_uid_by_name: dict[str, str] = {}
    for t in TEAMS:
        team_uid_by_name[t["name"]] = await _create_actor(
            "group", t["name"], description=t["description"]
        )

    logger.info("creating %d people", len(PEOPLE))
    person_uid_by_name: dict[str, str] = {}
    for p in PEOPLE:
        uid = await _create_actor(
            "person",
            p["name"],
            description=p["description"],
            email=p["email"],
        )
        person_uid_by_name[p["name"]] = uid
        # member_of their team
        team_uid = team_uid_by_name[p["team"]]
        await _create_relation(uid, team_uid, "member_of")

    logger.info("creating %d source systems", len(SYSTEMS))
    asset_uid_by_name: dict[str, str] = {}
    for s in SYSTEMS:
        uid = await _create_asset(
            "system",
            s["name"],
            description=s.get("description"),
            specs=s.get("specs"),
        )
        asset_uid_by_name[s["name"]] = uid
        owner = team_uid_by_name[s["owner"]]
        await _create_relation(owner, uid, "owns", {"role": "maintainer"})

    logger.info("creating %d raw datasets", len(RAW_DATASETS))
    for d in RAW_DATASETS:
        uid = await _create_asset(
            "dataset",
            d["name"],
            description=d.get("description"),
            metadata=d.get("metadata_extra"),
            specs=d.get("specs"),
        )
        asset_uid_by_name[d["name"]] = uid
        owner = team_uid_by_name[d["owner"]]
        await _create_relation(owner, uid, "owns", {"role": "maintainer"})
        source_uid = asset_uid_by_name[d["source"]]
        await _create_relation(source_uid, uid, "feeds")

    logger.info("creating %d staging datasets", len(STAGING_DATASETS))
    for d in STAGING_DATASETS:
        uid = await _create_asset(
            "dataset",
            d["name"],
            description=d.get("description"),
            metadata=d.get("metadata_extra"),
            specs=d.get("specs"),
        )
        asset_uid_by_name[d["name"]] = uid
        owner = team_uid_by_name[d["owner"]]
        await _create_relation(owner, uid, "owns", {"role": "maintainer"})
        for upstream in d["feeds_from"]:
            await _create_relation(asset_uid_by_name[upstream], uid, "feeds")

    logger.info("creating %d mart datasets", len(MART_DATASETS))
    for d in MART_DATASETS:
        uid = await _create_asset(
            "dataset",
            d["name"],
            description=d.get("description"),
            metadata=d.get("metadata_extra"),
            specs=d.get("specs"),
        )
        asset_uid_by_name[d["name"]] = uid
        owner = team_uid_by_name[d["owner"]]
        await _create_relation(owner, uid, "owns", {"role": "maintainer"})
        for upstream in d["feeds_from"]:
            await _create_relation(asset_uid_by_name[upstream], uid, "feeds")

    logger.info("creating %d processes", len(PROCESSES))
    for p in PROCESSES:
        uid = await _create_asset(
            "process",
            p["name"],
            description=p.get("description"),
            specs=p.get("specs"),
        )
        asset_uid_by_name[p["name"]] = uid
        owner = team_uid_by_name[p["owner"]]
        await _create_relation(owner, uid, "owns", {"role": "maintainer"})
        # Processes are documented as orphan asset nodes — owner, specs,
        # what they consume/produce lives in their metadata. The lineage
        # chain itself runs directly between data assets via the
        # `feeds_from` lists on raw/staging/mart datasets, so we avoid a
        # redundant process-mediated encoding of the same flow.

    logger.info("creating %d reports", len(REPORTS))
    for r in REPORTS:
        uid = await _create_asset(
            "report",
            r["name"],
            description=r.get("description"),
            specs=r.get("specs"),
        )
        asset_uid_by_name[r["name"]] = uid
        owner = team_uid_by_name[r["owner"]]
        await _create_relation(owner, uid, "owns", {"role": "publisher"})
        for src in r.get("uses", []):
            await _create_relation(asset_uid_by_name[src], uid, "feeds")

    logger.info("creating %d rules", len(RULES))
    for r in RULES:
        await _create_rule(
            r["name"], r["description"], r["severity"], r.get("category")
        )

    logger.info("wiring %d rule applications", len(RULE_APPLICATIONS))
    for rule_slug, asset_slug, enforcement, note in RULE_APPLICATIONS:
        props: dict[str, Any] = {"enforcement": enforcement}
        if note:
            props["note"] = note
        await _create_relation(
            f"rule-{rule_slug}",
            f"asset-{asset_slug}",
            "applies_to",
            props,
        )

    logger.info("wiring %d extra actor→asset relations", len(EXTRA_RELATIONS))
    for from_slug, to_slug, rel_type, props in EXTRA_RELATIONS:
        # We don't know if `from_slug` refers to an actor or asset — try
        # actor-prefixed first, fall back to asset-prefixed.
        f_uid = (
            f"actor-{from_slug}"
            if from_slug in {slug(p["name"]) for p in PEOPLE} | {slug(t["name"]) for t in TEAMS}
            else f"asset-{from_slug}"
        )
        t_uid = f"asset-{to_slug}"
        await _create_relation(f_uid, t_uid, rel_type, props)

    # Materialize :Container / :Field graph projection for every asset.
    # The service normally does this during create/update, but the seed
    # writes via raw Cypher for speed, so we run the projection in one
    # batch at the end.
    await _materialize_all_schemas()


async def _materialize_all_schemas() -> None:
    """Walk every asset that has a `metadata.schema` JSON and project it
    into the (:Container) / (:Field) graph so the vector + fulltext
    indexes get populated."""
    from holocron.core.services.embedding_service import EmbeddingService

    logger.info("materializing schema graph for every asset")
    svc = EmbeddingService.instance()

    async with neo4j_driver.session() as session:
        res = await session.run(
            "MATCH (a:Asset) RETURN a.uid AS uid, a.name AS name, "
            "a.metadata AS metadata"
        )
        rows = [dict(r) async for r in res]

    total_nodes = 0
    for row in rows:
        uid = row["uid"]
        name = row["name"]
        meta_raw = row["metadata"] or "{}"
        try:
            meta = json.loads(meta_raw) if isinstance(meta_raw, str) else meta_raw
        except Exception:
            continue
        schema = meta.get("schema") if isinstance(meta, dict) else None
        if not isinstance(schema, list) or not schema:
            continue

        async with neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (a:Asset {uid: $uid})-[:CONTAINS*1..]->(n)
                WHERE n:Container OR n:Field
                DETACH DELETE n
                """,
                {"uid": uid},
            )

        count = await _walk_and_create(svc, uid, name, [], uid, schema)
        total_nodes += count
    logger.info("schema graph: %d nodes projected", total_nodes)


async def _walk_and_create(
    svc: Any,
    parent_uid: str,
    asset_name: str,
    path_prefix: list[str],
    asset_uid: str,
    nodes: list[Any],
) -> int:
    """Recursive batch projector — mirrors `asset_schema_projection.
    _materialize_nodes` but lives in the seed script so it can run with
    its own session-per-write pattern (the service uses one transaction
    per asset, the seed wants per-node session granularity for batching).
    """
    from uuid import uuid4

    created = 0
    for raw in nodes:
        if not isinstance(raw, dict):
            continue
        nm = raw.get("name")
        if not isinstance(nm, str) or not nm:
            continue
        node_type = raw.get("nodeType")
        desc = raw.get("description")
        path = [*path_prefix, nm]
        path_str = " / ".join(path)
        node_uid = f"sn-{uuid4()}"
        label = "Container" if node_type == "container" else "Field"
        extras: dict[str, Any] = {}
        if node_type == "container":
            ct = raw.get("containerType")
            extras["container_type"] = ct if isinstance(ct, str) else None
        else:
            dt = raw.get("dataType")
            extras["data_type"] = dt if isinstance(dt, str) else None
            pii = raw.get("pii")
            extras["pii"] = bool(pii) if isinstance(pii, bool) else False

        embed_text = ". ".join(
            [
                nm,
                path_str,
                desc or "",
                extras.get("container_type") or extras.get("data_type") or "",
            ]
        ).strip()
        try:
            embedding = svc.embed_one(embed_text)
        except Exception:
            embedding = None

        async with neo4j_driver.session() as session:
            await session.run(
                f"""
                MATCH (p {{uid: $parent_uid}})
                CREATE (n:{label} {{
                    uid: $uid, name: $name, description: $desc,
                    path: $path, asset_uid: $asset_uid, asset_name: $asset_name
                }})
                SET n += $extras
                MERGE (p)-[:CONTAINS]->(n)
                """,
                {
                    "parent_uid": parent_uid,
                    "uid": node_uid,
                    "name": nm,
                    "desc": desc if isinstance(desc, str) else None,
                    "path": path_str,
                    "asset_uid": asset_uid,
                    "asset_name": asset_name,
                    "extras": extras,
                },
            )
            if embedding is not None:
                await session.run(
                    f"""
                    MATCH (n:{label} {{uid: $uid}})
                    CALL db.create.setNodeVectorProperty(n, 'embedding', $v)
                    RETURN n.uid AS uid
                    """,
                    {"uid": node_uid, "v": embedding},
                )
        created += 1

        children = raw.get("children")
        if isinstance(children, list) and children:
            created += await _walk_and_create(
                svc, node_uid, asset_name, path, asset_uid, children
            )
    return created


async def _main(confirm: bool, skip_embed: bool) -> None:
    await neo4j_driver.connect()
    try:
        if not confirm:
            logger.error(
                "Refusing to wipe without --confirm. This script drops every "
                "node + relation in Neo4j and rebuilds the Rebel fixture."
            )
            return
        await _wipe()
        await seed()
        if not skip_embed:
            logger.info("backfilling embeddings…")
            await embed_backfill(kinds=["asset", "actor", "rule"], force=True)
        logger.info("done")
    finally:
        await neo4j_driver.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required. Wipes every node in Neo4j before re-seeding.",
    )
    parser.add_argument(
        "--skip-embed",
        action="store_true",
        help="Skip the embedding backfill step (useful while iterating).",
    )
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    asyncio.run(_main(confirm=args.confirm, skip_embed=args.skip_embed))


if __name__ == "__main__":
    main()

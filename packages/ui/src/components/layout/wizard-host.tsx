"use client";

import { AddConsumersWizard } from "@/components/features/add-consumers-wizard";
import { ApplyRuleWizard } from "@/components/features/apply-rule-wizard";
import { AttachRuleToAssetWizard } from "@/components/features/attach-rule-to-asset-wizard";
import { ConfirmWizard } from "@/components/features/confirm-wizard";
import { CreateActorWizard } from "@/components/features/create-actor-wizard";
import { CreateAssetWizard } from "@/components/features/create-asset-wizard";
import { CreateRelationWizard } from "@/components/features/create-relation-wizard";
import { CreateRuleWizard } from "@/components/features/create-rule-wizard";
import { EditAssetFieldWizard } from "@/components/features/edit-asset-field-wizard";
import { EditMetadataFieldWizard } from "@/components/features/edit-metadata-field-wizard";
import { EntityEventsWizard } from "@/components/features/entity-events-wizard";
import { EntityScalarEditWizard } from "@/components/features/entity-scalar-edit-wizard";
import { GovernanceListWizard } from "@/components/features/governance-list-wizard";
import { PluginRunWizard } from "@/components/features/plugin-run-wizard";
import { AddSchemaChildWizard } from "@/components/features/schema/add-schema-child-wizard";
import { EditSchemaFieldWizard } from "@/components/features/schema/edit-schema-field-wizard";
import { useWizardStack, type WizardFrame } from "@/lib/wizard-store";

/**
 * Mounts every active wizard frame. Each frame gets its own Dialog — Radix
 * handles overlay stacking so the top-most wizard is interactive and lower
 * ones sit dimmed behind their own overlays. We also pass `isTop` to the
 * wizard so it only reacts to global keyboard shortcuts when it's the
 * front-most frame.
 */
export function WizardHost() {
	const stack = useWizardStack();
	const topIndex = stack.length - 1;
	return (
		<>
			{stack.map((frame, idx) => (
				<FrameRenderer
					key={frame.id}
					frame={frame}
					isTop={idx === topIndex}
					// Treat keyboard-opened wizards (focusOnOpen) the same as nested
					// frames for autofocus purposes — the user clearly wants the
					// first input to take focus immediately.
					isNested={idx > 0 || !!frame.focusOnOpen}
				/>
			))}
		</>
	);
}

function FrameRenderer({
	frame,
	isTop,
	isNested,
}: {
	frame: WizardFrame;
	isTop: boolean;
	isNested: boolean;
}) {
	switch (frame.kind) {
		case "asset-create":
			return <CreateAssetWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "actor-create":
			return <CreateActorWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "relation-create":
			return <CreateRelationWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "rule-create":
			return <CreateRuleWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "rule-apply":
			return <ApplyRuleWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "consumers-add":
			return <AddConsumersWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "asset-edit-field":
			return <EditAssetFieldWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "rule-attach-to-asset":
			return <AttachRuleToAssetWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "metadata-edit-field":
			return <EditMetadataFieldWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "schema-edit-field":
			return <EditSchemaFieldWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "schema-add-child":
			return <AddSchemaChildWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "confirm":
			return <ConfirmWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "entity-scalar-edit":
			return <EntityScalarEditWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "plugin-run":
			return <PluginRunWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "entity-events":
			return <EntityEventsWizard frame={frame} isTop={isTop} isNested={isNested} />;
		case "governance-list":
			return <GovernanceListWizard frame={frame} isTop={isTop} isNested={isNested} />;
	}
}

# UI extension framework

> Every command in the ⌘K palette comes from an extension. Pages contribute commands; built-ins handle creation, navigation, sharing, governance, dev tools, and plugin invocation.

This is a UI-only concept — distinct from the API plugins ([plugins.md](plugins.md)). Extensions don't run on the server; they're just functions that build commands from the current page context.

## Anatomy

```
packages/ui/src/extensions/
├── types.ts                 # Extension + ExtensionContext interfaces
├── host.tsx                 # ExtensionHost — mounts under the layout
├── registry.ts              # registerExtension(), computeCommands(ctx)
├── plugins-adapter.tsx      # Bridges API plugins → palette commands
└── built-in/
    ├── asset.ts             # Commands while on /assets/[uid]
    ├── actor.ts
    ├── rules.ts
    ├── create.ts            # "Create dataset", "Create person", ...
    ├── actions.ts           # Copy UID, edit, delete
    ├── share.ts             # Open in graph, copy link
    ├── governance.ts        # "Show rules", "Audit this asset"
    ├── events.ts            # "Show audit trail"
    ├── pins.ts              # Bookmark management
    ├── recents.ts           # Session history
    ├── navigation.ts        # Jump between pages
    └── dev-tools.ts         # Inspect React Query cache, etc.
```

## The contract

```ts
type ExtensionContext = {
  pathname: string;
  params: Record<string, string | undefined>;
  searchParams: URLSearchParams;
  asset?: Asset;
  actor?: Actor;
  rule?: Rule;
  queryClient: QueryClient | null;   // can be null in early SSR — guard before use
};

type Command = {
  id: string;
  label: string;
  group?: string;            // section in the palette
  icon?: ReactNode;
  hint?: string;             // right-aligned shortcut hint
  run: () => void | Promise<void>;
};

type Extension = {
  id: string;
  computeCommands: (ctx: ExtensionContext) => Command[];
};
```

A registered extension's `computeCommands()` runs whenever the palette opens. Commands are flat; group them with `group:` for the palette to render section headers.

## Adding an extension

```ts
// packages/ui/src/extensions/built-in/my-thing.ts
import { registerExtension } from '../registry';

registerExtension({
  id: 'my-thing',
  computeCommands(ctx) {
    if (!ctx.asset) return [];
    return [{
      id: 'my-thing.copy-name',
      label: `Copy "${ctx.asset.name}"`,
      group: 'Asset',
      run: () => navigator.clipboard.writeText(ctx.asset!.name),
    }];
  },
});
```

Then import the file once from `packages/ui/src/extensions/built-in/index.ts` so the registration runs.

## Plugin adapter

`plugins-adapter.tsx` bridges the API plugin registry into the palette: every plugin shows up as a command (`Run: <plugin name>`), grouped by capability (Import / Export). Selecting a command opens a wizard that auto-renders inputs from the plugin's manifest, then `POST`s to `/api/holocron/plugins/{slug}/run`.

## Conventions

- Extensions are **pure functions** — no React, no hooks, no I/O at compute time. Side effects happen inside `run()`.
- `ExtensionContext.queryClient` can be `null` during initial hydration — always check before calling `invalidate()`.
- Use `group:` to keep the palette scannable. Existing groups: `Navigation`, `Create`, `Asset`, `Actor`, `Rule`, `Governance`, `Plugins`, `Pins`, `Recents`, `Dev`.
- Commands are deduplicated by `id`; namespace them like `my-thing.copy-name`.
- Don't fetch in `computeCommands` — read from React Query cache via `queryClient.getQueryData()` instead.

## Why extensions, not just inline buttons?

- One palette to learn (⌘K), one search, one keyboard model.
- Commands are dynamic: `pii-detector` can suggest "Apply to email field" only when an `email`-named field is on screen.
- Plugin authors get a UI for free — the plugin adapter exposes their plugin without the UI team writing a button.
- Users discover features they didn't know existed by typing what they want.

# Stateless installs, no manifest or lock file

`myskills` keeps no record of what it installed. Delete and list operate on whatever is present in the skills directory, regardless of who put it there. The cost is accepted: a tool-made Copy cannot be distinguished from a hand-made directory, which is why delete asks for confirmation before removing any real directory, while links are removed without ceremony. An `update` command (refreshing copies, detecting stale links) would require a lock file like vercel-labs/skills' `.agents/.skill-lock.json`; that is the natural v2 extension point, deliberately deferred.

## Considered Options

- **Manifest or lock file**: would let the tool distinguish its own installs from hand-made entries and power an `update` command, at the cost of state that can drift from reality (entries made by hand, manifests deleted by hand). v1 chooses honest ignorance over bookkeeping.

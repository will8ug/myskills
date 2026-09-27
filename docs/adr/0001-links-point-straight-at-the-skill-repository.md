# Linked installs point straight at the skill source

`myskills` installs a skill as a symlink pointing directly at the skill's folder inside the user's local clone of the skill source. This differs from vercel-labs/skills, which first copies each skill into a canonical store and then symlinks agents' directories to that copy. Pointing straight at the clone means a `git pull` (or editing a skill in place) updates every installed target immediately, with no staleness and therefore no lock file to track versions. The trade-off is accepted: moving or renaming the clone breaks every link (visible via `myskills list`), because the clone's location is treated as stable. Links are absolute, matching the hand-made installs this tool replaces.

## Considered Options

- **Canonical store plus lock file (vercel-labs/skills)**: robust against source moves, but copies go stale and require an `update` command and version tracking. It solves problems (remote sources, many agent targets) that this tool deliberately does not have.

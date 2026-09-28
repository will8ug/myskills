# myskills

A small, stateless CLI that installs a chosen subset of skills from a local skills repository into a skills directory: a project's `<project>/.agents/skills/` or the user-level `~/.agents/skills/`.

This is a custom, local-only take on [vercel-labs/skills](https://github.com/vercel-labs/skills). That CLI solves remote sources and 80+ agent targets with far more machinery than a single developer with local clones needs; myskills keeps only the local subset, for personal local use for now — never published to a registry.

- **Link installs (default):** absolute symlinks straight into the skill source clone, so a `git pull` in the source updates every installed target immediately. **Copy installs** (`--copy`) make independent duplicates instead.
- **Stateless:** no config file, no manifest, no lock file. `list` and `delete` operate on whatever is actually present, including links made by hand.
- **Conflict-safe:** replacing a differing link or a real directory asks first (replace is the default for `add`, decline is the default for `delete`); `--force` skips the prompts for scripted runs.

## Install

Requires Node >= 24; macOS only. From a clone of this repo:

    npm run build && npm install -g .

(Build first: modern npm blocks install lifecycle scripts by default.)

## Usage

    myskills                                  interactive chooser
    myskills add [source] [skill...]          install skills (Link default, --copy)
    myskills list                             show installed entries and link targets
    myskills delete [skill...]                delete installed entries

Scope with `--global` or `--project <path>`; positional skill names skip the pickers for scripted runs. Run `myskills help` for the full flag reference.

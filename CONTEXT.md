# myskills

A small CLI that installs a chosen subset of skills from a local skill source into a project's or the user's global skills directory.

## Language

**Skill**:
A folder that contains a `SKILL.md` file.
_Avoid_: capability, plugin

**Skill source**:
The local skills repository a run picks skills from, referenced by its root folder.
_Avoid_: registry, remote

**Skills directory**:
The `.agents/skills/` folder that receives installs, either the user-level one (`~/.agents/skills/`) or a project's (`<project>/.agents/skills/`).
_Avoid_: target folder, agent directory

**Scope**:
Which skills directory an install lands in. Global means the user-level directory; Project means a chosen project's directory.
_Avoid_: destination

**Install**:
Getting a skill from the skill source into a skills directory, either as a Link or a Copy.

**Link**:
An install whose entry in the skills directory is a symlink pointing at the skill's folder inside the skill source.
_Avoid_: symlink install

**Copy**:
An install whose entry in the skills directory is an independent duplicate of the skill's folder.

**Delete**:
Removing an installed skill's entry from a skills directory. The skill source is never modified.
_Avoid_: uninstall, remove

**Broken link**:
A Link whose target no longer exists, for example because the skill source moved.

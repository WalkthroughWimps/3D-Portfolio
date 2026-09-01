# Project Data Files

This directory contains checked-in data files that the static map application can load at runtime or that support style authoring.

- `journeys/`: packaged fallback journey JSON.
- `settings/`: default UI settings loaded on startup.
- `styles/`: default style state and texture catalog metadata.
- `textures/`: texture-resolution reference data for authoring tools.

Browser exports still download through the browser and cannot write back into this directory. Put reviewed exports here manually when they should become new project defaults.

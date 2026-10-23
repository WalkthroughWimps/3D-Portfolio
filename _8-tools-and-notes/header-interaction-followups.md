# Header and GLB interaction follow-ups

## Deferred: animated double-click orientation reset

For global GLB orientation controls, a double-click reset should animate from the current orientation to the default orientation instead of snapping. Honor the applicable animation-off or reduced-motion setting by resetting without animation when animation is disabled. The About cube should continue to use its nearest-face-upright reset rule.

This is a later interaction task, outside the current Music MIDI playback fix. No runtime change has been made for it.

# Moudie Controller Contract — Permanent Project Requirements

This document is the source of truth for controller behavior and layout. Any future controller change must preserve these requirements unless the project owner explicitly replaces them.

## 1. Reference visual language

- The supplied PlayStation 1 controller image is the visual reference for the directional controls.
- This is not a request to copy another emulator UI. The four directions must read as one connected, interlocking PlayStation-style cross/D-pad, with the directional arms meeting in the center rather than appearing as four isolated floating buttons.
- Keep Moudie's current neon/color identity. Do not copy Sony branding, trademarks, or external application artwork.
- Apply the same controller language to all five systems: Famicom/NES, PS1, PSP, Sega, and Arcade.
- Face buttons remain appropriate for each system, while the D-pad keeps the connected reference shape.

## 2. Touch behavior is a hard requirement

- Multi-touch must behave like a real physical controller.
- Holding one direction while pressing another button must work without either input being canceled.
- Multiple face buttons and direction/button combinations must be tracked independently.
- Input is press-and-hold based: ACTION_DOWN sends a key down event and ACTION_UP/ACTION_CANCEL releases only that pointer's key.
- Pointer IDs, not pointer indexes, must be used for multi-touch tracking inside a composite touch surface.
- Cancelling a gesture or leaving the activity must release all held virtual keys to prevent stuck input.
- Do not regress multi-touch while adding editing gestures.

## 3. Editing remains independent from gameplay

- Controls and the game screen are independently movable and resizable.
- Each system and each orientation keeps its own saved layout.
- Editing controls must not remove gameplay functionality or permanently hide resize/move controls.
- Normal gameplay uses the clean controller; edit mode may expose per-control positioning and sizing tools.
- Existing save/reset and orientation-specific persistence behavior must be preserved or migrated safely.

## 4. Preserve the wider project basics

- Do not remove existing features merely to fix controller input.
- Preserve the supplied boot/logo design requirements.
- Local play remains independent from online rooms.
- Voice and gameplay channels remain separate for rooms and should provide low-latency group voice behavior rather than a fake/non-functional toggle.
- Room limits remain: Famicom/NES exactly 2 players + up to 6 spectators; PS1/PSP/Sega/Arcade 2–6 players + up to 4 spectators.
- Emulator changes must prioritize stability, smooth performance, acceptable image quality, and not crashing the app.

## 5. Acceptance test before release

For every one of the five emulators, test at minimum:

1. Hold UP + face button simultaneously.
2. Hold LEFT, then add RIGHT/another face button and release them independently.
3. Two or more simultaneous pointers on different control regions.
4. Rapid press/release without stuck keys.
5. Enter edit mode, move a control, resize it, save, restart, and verify persistence.
6. Rotate or use the other orientation and verify its layout is independent.
7. Confirm local play and room play still launch without removing voice/chat/basic controls.

A controller change is not complete simply because it compiles; it must pass the simultaneous-input checks on a physical Android device.

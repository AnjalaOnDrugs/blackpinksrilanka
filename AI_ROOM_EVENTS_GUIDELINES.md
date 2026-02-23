# Blackpink Sri Lanka - Room Events Development Guidelines

This document serves as a reference for AI agents and developers working on the `room` events (Listen Along, Fill the Map, Vroom Race, Run the Playlist, etc.) in the Blackpink Sri Lanka website. It outlines the core architectural patterns, styling standards, and component behaviors required to maintain consistency.

## 1. General Event Structure
All major room events are initialized using a global `ROOM.[EventName]` object structure (e.g., `ROOM.Vroom`, `ROOM.ListenAlong`).

### Two-State View Architecture
Every room event must implement two distinct UI states:
1. **Full View Card (`_showFullView`)**: A large interactive card that pops up on the screen to show details, progress, or leaderboards.
2. **Compact Capsule View (`_ensureCompactCard`)**: A small persistent pill/capsule that docks to the side of the screen when the full card is minimized, allowing users to re-open the event.

### Auto-Minimize Behavior
Events should not indefinitely block the screen. They must utilize timers to auto-minimize:
- `_initialAutoCompactMs: 10000` (10 seconds) - triggers automatically when the event first pops up.
- `_expandedAutoCompactMs: 20000` (20 seconds) - triggers if the user manually re-opens the full view from the capsule.

## 2. CSS & Styling Conventions

### Naming Convention
Use a BEM-inspired naming convention strictly prefixed with `room-[event-namespace]-*`:
- `.room-vroom-card`
- `.room-vroom-card--minimized`
- `.room-vroom-capsule`
- `.room-vroom-header`

### Z-Index Layering (Crucial)
Maintain strict z-index hierarchies to prevent clipping with the chat, leaderboard, or other overlay elements:
- **Full View Cards:** `z-index: 210;`
- **Compact Capsules:** `z-index: 191;`
- **Capsule Participant Bubbles:** `z-index: 192;`
- **Modals/Thank You Screens:** `z-index: 9999;`

### Mobile Responsiveness
Cards must strictly adapt below `768px` to fit mobile screens. To accurately center and size the event cards without layout shifts on mobile:
```css
@media (max-width: 768px) {
  .room-[event]-card {
    right: 10px;
    left: 10px;
    margin: 0 auto;
    bottom: calc(76px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-width: none;
  }
}
```

## 3. DOM & Interaction Guidelines

### Appending Elements
Do not append loose elements to the document body if they belong to the room UI. Event cards and capsules MUST be appended to the dedicated container:
- Target Container: `document.getElementById('eventOverlay')`

### Animations
To ensure visual consistency, full cards should enter with an overarching bouncy pop mechanism:
- Use `cubic-bezier(0.34, 1.56, 0.64, 1)` for entry animations.
- General "In" property timeline: `transform: translateY(30px) scale(0.92); opacity: 0;` to `transform: translateY(0) scale(1); opacity: 1;`.
- Use `.room-[event]-card--exit` classes for cleanup transitions before DOM removal.

### Pointer Events
If a card is stacked high (z-index: 210), assert `pointer-events: auto;` in its base class. When marginalized (minimized state class), assert `pointer-events: none;` on the card wrapper to allow clicking through to the underlying map.

## 4. Participant Avatars & Bubbles

### Fallback Colors
Always apply logic to handle users with and without profile pictures:
- Background fallback: `linear-gradient(135deg, #f7a6b9, #e8758a)` or `data.avatarColor`.
- Text fallback: Capitalized first letter of `username`.
- When an image is present, set `background: transparent; overflow: hidden;` before rendering the `<img>`.

### Capsule Stacking
Compact Capsules must register with the global Capsule Stack manager to allow sweeping away / swiping actions across multiple concurrent events:
```javascript
ROOM.CapsuleStack.register('event-name', this._compactEl, this._bubbleEl, this);
```

## 5. Security & Realtime Data (Firebase vs. Convex)
- User presences, currently-playing tracks (Spotify/Last.fm integration), and rapid transient data are handled by **Firebase Realtime Database** (e.g., `ROOM.Firebase.getParticipants()`).
- Permanent score tracking, event instantiation checks, and state saving are directed to **Convex Mutations**.

---
*Created dynamically for AI development context.*

# Tournament Player Name Fix

## Problem
Tournament player names were showing as "undefined" and appearing as "TBD" in the tournament bracket UI.

## Root Cause
The server-side WebSocket handlers for `CREATE_PARTY_LOBBY` and `JOIN_PARTY_LOBBY` were expecting player names as direct string properties (`data.hostPlayerName` and `data.playerName`), but the client was sending player objects (`data.player`) with the name nested inside.

## Solution
Modified the server handlers in `gameServer.js` to extract player names from the player object:

### CREATE_PARTY_LOBBY Handler (Line ~208)
```javascript
// Extract player name from player object or use direct hostPlayerName
const hostPlayerName = data.player?.name || data.hostPlayerName || 'Unknown Player';
```

### JOIN_PARTY_LOBBY Handler (Line ~232)
```javascript
// Extract player name from player object or use direct playerName
const playerName = data.player?.name || data.playerName || 'Unknown Player';
```

## Impact
- ✅ Lobby participants now have proper names
- ✅ Tournament players inherit correct names from lobby participants
- ✅ Tournament bracket displays actual player names instead of "TBD"
- ✅ Match notifications show correct player names

## Files Modified
- `tenebris-game/src/server/websocket/gameServer.js`

## Testing
1. Create a party lobby - host name should be visible
2. Have other players join - all names should be visible in lobby
3. Start tournament - bracket should show all player names correctly
4. Match notifications should display correct player names

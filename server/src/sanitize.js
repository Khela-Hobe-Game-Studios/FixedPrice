// Player objects carry `_disconnectTimer` (a Node Timeout with circular linked-list
// internals). Emitting them raw blows the stack inside socket.io's hasBinary().
//
// This lived in two copies — one in index.js, one in gameManager.js — which is how a
// field added for the UI ends up on some payloads and not others. One copy now.
function sanitizePlayers(players) {
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    // Identity on the board is the colour, not the picture: at 3 metres a 20px face
    // is mush and a 20px colour block is instant. Both are assigned server-side so
    // the TV and fifteen phones cannot disagree about who is which.
    colorIndex: p.colorIndex,
    avatar: p.avatar,
    connectionState: p.connectionState,
    seatHoldUntil: p.seatHoldUntil ?? null,
    eliminated: p.eliminated,
  }));
}

module.exports = { sanitizePlayers };

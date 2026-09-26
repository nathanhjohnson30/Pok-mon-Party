const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyCatalogPayload,
  applyEventPayload,
  getLobbyControls,
  getReadyToggle,
  getStatusText,
} = require("../public/app-state");

test("catalog payload initializes available pokemon for the client", () => {
  const state = { pokemonCatalog: [] };
  applyCatalogPayload(state, { pokemon: [{ name: "Pikachu" }] });
  assert.deepEqual(state.pokemonCatalog, [{ name: "Pikachu" }]);
});

test("host and join payloads populate the client session state", () => {
  const state = { playerId: null, eventCode: null, event: null };
  applyEventPayload(state, {
    playerId: "host-id",
    code: "ABCDE",
    event: { code: "ABCDE", players: [] },
  });
  assert.equal(state.playerId, "host-id");
  assert.equal(state.eventCode, "ABCDE");
  assert.deepEqual(state.event, { code: "ABCDE", players: [] });
});

test("lobby controls only allow the host to start once everyone is ready", () => {
  const event = {
    hostId: "host-id",
    players: [{ ready: true }, { ready: true }],
  };

  assert.deepEqual(getLobbyControls(event, "host-id"), {
    isHost: true,
    allReady: true,
  });
  assert.deepEqual(getLobbyControls(event, "guest-id"), {
    isHost: false,
    allReady: true,
  });
});

test("ready toggles produce the submitted value and player-facing message", () => {
  assert.deepEqual(getReadyToggle({ ready: false }), {
    newReadyValue: true,
    message: "You are ready to battle.",
  });
  assert.deepEqual(getReadyToggle({ ready: true }), {
    newReadyValue: false,
    message: "You are no longer ready.",
  });
});

test("status text reflects the current event phase", () => {
  assert.equal(
    getStatusText({ phase: "lobby", players: [{}, {}] }, "host-id"),
    "2/4 trainers joined",
  );
  assert.equal(getStatusText({ phase: "battle", turn: 3 }, "host-id"), "Turn 3");
  assert.equal(
    getStatusText({ phase: "finished", winnerId: "host-id" }, "host-id"),
    "You won the battle!",
  );
});

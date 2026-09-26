(function attachAppState(globalScope, factory) {
  const appState = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = appState;
  }

  globalScope.PokemonPartyAppState = appState;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function applyCatalogPayload(state, payload) {
    state.pokemonCatalog = payload.pokemon;
    return state;
  }

  function applyEventPayload(state, payload) {
    state.playerId = payload.playerId;
    state.eventCode = payload.code;
    state.event = payload.event;
    return state;
  }

  function getLobbyControls(event, playerId) {
    return {
      isHost: event.hostId === playerId,
      allReady: event.players.length > 1 && event.players.every((player) => player.ready),
    };
  }

  function getStatusText(event, playerId) {
    if (event.phase === "lobby") {
      return `${event.players.length}/4 trainers joined`;
    }

    if (event.phase === "battle") {
      return `Turn ${event.turn}`;
    }

    return event.winnerId === playerId ? "You won the battle!" : "Battle finished";
  }

  function getReadyToggle(currentPlayer) {
    const newReadyValue = !currentPlayer.ready;

    return {
      newReadyValue,
      message: newReadyValue ? "You are ready to battle." : "You are no longer ready.",
    };
  }

  return {
    applyCatalogPayload,
    applyEventPayload,
    getLobbyControls,
    getReadyToggle,
    getStatusText,
  };
});

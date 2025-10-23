const BIOME_ANIMALS = {
  'Amazônia': ['Onça-pintada', 'Arara-azul', 'Boto-cor-de-rosa', 'Preguiça', 'Tucano', 'Jacaré', 'Macaco-aranha', 'Anaconda'],
  'Mata Atlântica': ['Mico-leão-dourado', 'Papagaio', 'Jaguatirica', 'Sagui', 'Tatu', 'Anta', 'Tamanduá', 'Bugio'],
  'Cerrado': ['Lobo-guará', 'Tamanduá-bandeira', 'Seriema', 'Tatu-canastra', 'Ema', 'Veado-campeiro', 'Cachorro-do-mato', 'Capivara'],
  'Caatinga': ['Tatu-bola', 'Asa-branca', 'Preá', 'Cachorro-do-mato', 'Jiboia', 'Sagui-de-tufos', 'Veado-catingueiro', 'Mocó'],
  'Pantanal': ['Tuiuiú', 'Jacaré-do-pantanal', 'Onça-pintada', 'Ariranha', 'Capivara', 'Sucuri', 'Garça', 'Piranha'],
  'Pampa': ['Graxaim', 'Tamanduá', 'Veado-campeiro', 'Gato-do-pampa', 'Capivara', 'Quero-quero', 'Perdiz', 'Ratão-do-banhado']
};

const SPECIAL_CARDS = {
  sorte: ['Piedade', 'Devolve', 'Pulo+1', '+2'],
  azar: ['Devolve', 'Pulo', 'Piedade']
};

const gameState = {
  numPlayers: 0,
  selectedBiomes: [],
  specialCardsCount: 18,
  players: [],
  deck: [],
  discardPile: [],
  currentPlayerIndex: 0,
  humanPlayerIndex: 0,
  gameStarted: false,
  actionTaken: false,
  selectedCard: null,
  winner: null
};

function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function buildDeck(selectedBiomes, numPlayers) {
  const deck = [];

  selectedBiomes.forEach(biome => {
    BIOME_ANIMALS[biome].forEach(animal => {
      deck.push({
        type: 'animal',
        name: animal,
        biome: biome,
        id: `${biome}-${animal}-${Math.random()}`
      });
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({
      type: 'fauna',
      name: 'Fauna',
      id: `fauna-${i}`
    });
  }

  const sorteCount = numPlayers >= 3 ? 2 : 1;
  const azarCount = numPlayers >= 3 ? 2 : 1;

  SPECIAL_CARDS.sorte.forEach(cardName => {
    for (let i = 0; i < sorteCount; i++) {
      deck.push({
        type: 'sorte',
        name: cardName,
        id: `sorte-${cardName}-${i}`
      });
    }
  });

  SPECIAL_CARDS.azar.forEach(cardName => {
    for (let i = 0; i < azarCount; i++) {
      deck.push({
        type: 'azar',
        name: cardName,
        id: `azar-${cardName}-${i}`
      });
    }
  });

  return shuffle(deck);
}

function setupGame(numPlayers, selectedBiomes) {
  gameState.numPlayers = numPlayers;
  gameState.selectedBiomes = selectedBiomes;
  gameState.deck = buildDeck(selectedBiomes, numPlayers);
  gameState.discardPile = [];
  gameState.players = [];
  gameState.currentPlayerIndex = 0;
  gameState.humanPlayerIndex = 0;
  gameState.gameStarted = false;
  gameState.actionTaken = false;
  gameState.selectedCard = null;
  gameState.winner = null;

  gameState.players.push({
    id: 0,
    name: 'Você',
    biome: selectedBiomes[0],
    hand: [],
    biomeZone: [],
    isHuman: true,
    activeCard: null,
    effects: {
      skipTurn: false,
      puloMaisUm: null,
      devolvePending: false
    }
  });

  const aiNames = ['IA Alpha', 'IA Beta', 'IA Gamma'];
  for (let i = 1; i < numPlayers; i++) {
    gameState.players.push({
      id: i,
      name: aiNames[i - 1],
      biome: selectedBiomes[i],
      hand: [],
      biomeZone: [],
      isHuman: false,
      activeCard: null,
      effects: {
        skipTurn: false,
        puloMaisUm: null,
        devolvePending: false
      }
    });
  }

  gameState.players.forEach(player => {
    for (let i = 0; i < 3; i++) {
      if (gameState.deck.length > 0) {
        player.hand.push(gameState.deck.pop());
      }
    }
  });

  gameState.gameStarted = true;
}

function getCurrentPlayer() {
  return gameState.players[gameState.currentPlayerIndex];
}

function isHumanTurn() {
  return gameState.currentPlayerIndex === gameState.humanPlayerIndex;
}

function canPlayCard(card, player) {
  if (!card || !player) return false;

  if (card.type === 'animal' || card.type === 'fauna') {
    if (card.type === 'fauna') return true;
    return card.biome === player.biome;
  }

  if (card.type === 'sorte') {
    return true;
  }

  return false;
}

function playAnimalCard(card, player) {
  const cardIndex = player.hand.findIndex(c => c.id === card.id);
  if (cardIndex === -1) return false;

  if (!canPlayCard(card, player)) return false;

  player.hand.splice(cardIndex, 1);
  player.biomeZone.push(card);

  return true;
}

function checkDevolvePending(player, card) {
  if (player.effects.devolvePending && card.type === 'animal' && card.biome === player.biome) {
    returnCardToDeck(card, player);
    player.effects.devolvePending = false;
    return { triggered: true, card: card };
  }
  return null;
}

function drawCard(toPlayer) {
  if (gameState.deck.length === 0) return null;

  const card = gameState.deck.pop();
  toPlayer.hand.push(card);

  const devolveTrigger = checkDevolvePending(toPlayer, card);

  if (card.type === 'azar') {
    return { card, isAzar: true, devolveTrigger };
  }

  return { card, isAzar: false, devolveTrigger };
}

function stealCard(fromPlayer, toPlayer) {
  if (fromPlayer.hand.length < 2) return null;

  const randomIndex = Math.floor(Math.random() * fromPlayer.hand.length);
  const stolenCard = fromPlayer.hand.splice(randomIndex, 1)[0];
  toPlayer.hand.push(stolenCard);

  const devolveTrigger = checkDevolvePending(toPlayer, stolenCard);

  if (stolenCard.type === 'azar') {
    return { card: stolenCard, isAzar: true, devolveTrigger };
  }

  return { card: stolenCard, isAzar: false, devolveTrigger };
}

function stealSpecificCard(fromPlayer, toPlayer, cardIndex) {
  if (fromPlayer.hand.length < 2) return null;
  if (cardIndex < 0 || cardIndex >= fromPlayer.hand.length) return null;

  const stolenCard = fromPlayer.hand.splice(cardIndex, 1)[0];
  toPlayer.hand.push(stolenCard);

  const devolveTrigger = checkDevolvePending(toPlayer, stolenCard);

  if (stolenCard.type === 'azar') {
    return { card: stolenCard, isAzar: true, devolveTrigger };
  }

  return { card: stolenCard, isAzar: false, devolveTrigger };
}

function returnCardToDeck(card, player) {
  const cardIndex = player.hand.findIndex(c => c.id === card.id);
  if (cardIndex !== -1) {
    player.hand.splice(cardIndex, 1);
  }

  gameState.deck.push(card);
  gameState.deck = shuffle(gameState.deck);
}

function checkWin(player) {
  return player.biomeZone.length >= 8;
}

function applyAzarDevolve(player) {
  const ownBiomeCard = player.hand.find(c =>
    (c.type === 'animal' && c.biome === player.biome)
  );

  if (ownBiomeCard) {
    returnCardToDeck(ownBiomeCard, player);
    player.effects.devolvePending = false;
    return { immediate: true, card: ownBiomeCard };
  } else {
    player.effects.devolvePending = true;
    return { immediate: false };
  }
}

function applyAzarPulo(player) {
  player.effects.skipTurn = true;
  return { message: `${player.name} vai pular a próxima rodada` };
}

function applyAzarPiedade(player) {
  const cardsToGive = [];

  gameState.players.forEach(otherPlayer => {
    if (otherPlayer.id === player.id) return;

    const cardOfTheirBiome = player.hand.find(c =>
      c.type === 'animal' && c.biome === otherPlayer.biome
    );

    if (cardOfTheirBiome) {
      const cardIndex = player.hand.findIndex(c => c.id === cardOfTheirBiome.id);
      player.hand.splice(cardIndex, 1);
      otherPlayer.hand.push(cardOfTheirBiome);
      cardsToGive.push({ to: otherPlayer.name, card: cardOfTheirBiome.name });
    }
  });

  return { cardsGiven: cardsToGive };
}

function applyAzar(card, player) {
  const cardIndex = player.hand.findIndex(c => c.id === card.id);
  if (cardIndex !== -1) {
    player.hand.splice(cardIndex, 1);
  }
  gameState.discardPile.push(card);

  const results = {
    cardName: card.name,
    effects: []
  };

  if (card.name === 'Devolve') {
    const result = applyAzarDevolve(player);
    if (result.immediate) {
      results.effects.push(`Devolveu ${result.card.name} para a pilha`);
    } else {
      results.effects.push('Deve devolver uma carta do seu bioma quando obtiver');
    }
  } else if (card.name === 'Pulo') {
    const result = applyAzarPulo(player);
    results.effects.push(result.message);
  } else if (card.name === 'Piedade') {
    const result = applyAzarPiedade(player);
    if (result.cardsGiven.length > 0) {
      result.cardsGiven.forEach(give => {
        results.effects.push(`Entregou ${give.card} para ${give.to}`);
      });
    } else {
      results.effects.push('Não tinha cartas de outros biomas');
    }
  }

  return results;
}

function sortePiedade(fromPlayer) {
  const cardsReceived = [];

  gameState.players.forEach(otherPlayer => {
    if (otherPlayer.id === fromPlayer.id) return;

    const cardOfMyBiome = otherPlayer.hand.find(c =>
      c.type === 'animal' && c.biome === fromPlayer.biome
    );

    if (cardOfMyBiome) {
      const cardIndex = otherPlayer.hand.findIndex(c => c.id === cardOfMyBiome.id);
      otherPlayer.hand.splice(cardIndex, 1);
      fromPlayer.hand.push(cardOfMyBiome);
      cardsReceived.push({ from: otherPlayer.name, card: cardOfMyBiome.name });
    }
  });

  return cardsReceived;
}

function sorteDevolve() {
  const cardsReturned = [];

  gameState.players.forEach(player => {
    if (player.id === getCurrentPlayer().id) return;

    const ownBiomeCard = player.hand.find(c =>
      c.type === 'animal' && c.biome === player.biome
    );

    if (ownBiomeCard) {
      returnCardToDeck(ownBiomeCard, player);
      cardsReturned.push({ player: player.name, card: ownBiomeCard.name });
    }
  });

  return cardsReturned;
}

function sortePuloMaisUm(targetPlayer, fromPlayer) {
  const cardOfMyBiome = targetPlayer.hand.find(c =>
    c.type === 'animal' && c.biome === fromPlayer.biome
  );

  if (cardOfMyBiome) {
    const cardIndex = targetPlayer.hand.findIndex(c => c.id === cardOfMyBiome.id);
    targetPlayer.hand.splice(cardIndex, 1);
    fromPlayer.hand.push(cardOfMyBiome);
    targetPlayer.effects.skipTurn = true;
    return { immediate: true, card: cardOfMyBiome.name };
  } else {
    targetPlayer.effects.puloMaisUm = { from: fromPlayer.id };
    return { immediate: false };
  }
}

function playSorte(card, player, target) {
  const cardIndex = player.hand.findIndex(c => c.id === card.id);
  if (cardIndex === -1) return null;

  player.hand.splice(cardIndex, 1);

  const results = {
    cardName: card.name,
    effects: []
  };

  if (card.name === 'Piedade') {
    player.activeCard = card;
    const received = sortePiedade(player);
    if (received.length > 0) {
      received.forEach(r => {
        results.effects.push(`Recebeu ${r.card} de ${r.from}`);
      });
    } else {
      results.effects.push('Ninguém tinha cartas do seu bioma');
    }
  } else if (card.name === 'Devolve') {
    player.activeCard = card;
    const returned = sorteDevolve();
    if (returned.length > 0) {
      returned.forEach(r => {
        results.effects.push(`${r.player} devolveu ${r.card}`);
      });
    } else {
      results.effects.push('Ninguém tinha cartas para devolver');
    }
  } else if (card.name === 'Pulo+1') {
    if (!target) return null;
    target.activeCard = card;
    const result = sortePuloMaisUm(target, player);
    if (result.immediate) {
      results.effects.push(`${target.name} entregou ${result.card} e perde a vez`);
      target.activeCard = null;
      gameState.discardPile.push(card);
    } else {
      results.effects.push(`${target.name} vai entregar carta e perder vez quando obtiver`);
    }
  } else if (card.name === '+2') {
    player.activeCard = card;
    return results;
  }

  return results;
}

function processTurnStart(player) {
  if (player.effects.skipTurn) {
    player.effects.skipTurn = false;
    return { skipTurn: true, reason: 'Pulo' };
  }

  if (player.effects.puloMaisUm) {
    const fromPlayer = gameState.players.find(p => p.id === player.effects.puloMaisUm.from);
    if (!fromPlayer) {
      player.effects.puloMaisUm = null;
      return { skipTurn: false };
    }

    const cardOfTheirBiome = player.hand.find(c =>
      c.type === 'animal' && c.biome === fromPlayer.biome
    );

    if (cardOfTheirBiome) {
      const cardIndex = player.hand.findIndex(c => c.id === cardOfTheirBiome.id);
      player.hand.splice(cardIndex, 1);
      fromPlayer.hand.push(cardOfTheirBiome);
      player.effects.puloMaisUm = null;
      player.effects.skipTurn = false;

      if (player.activeCard && player.activeCard.name === 'Pulo+1') {
        gameState.discardPile.push(player.activeCard);
        player.activeCard = null;
      }

      return {
        skipTurn: true,
        reason: 'Pulo+1',
        cardGiven: cardOfTheirBiome.name,
        to: fromPlayer.name
      };
    }
  }

  if (player.effects.devolvePending) {
    const ownBiomeCard = player.hand.find(c =>
      c.type === 'animal' && c.biome === player.biome
    );

    if (ownBiomeCard) {
      returnCardToDeck(ownBiomeCard, player);
      player.effects.devolvePending = false;
      return {
        skipTurn: false,
        devolveResolved: true,
        card: ownBiomeCard.name
      };
    }
  }

  return { skipTurn: false };
}

function endTurn() {
  const currentPlayer = getCurrentPlayer();

  if (currentPlayer.activeCard &&
      (currentPlayer.activeCard.name === 'Piedade' ||
       currentPlayer.activeCard.name === 'Devolve' ||
       currentPlayer.activeCard.name === '+2')) {
    gameState.discardPile.push(currentPlayer.activeCard);
    currentPlayer.activeCard = null;
  }

  gameState.actionTaken = false;
  gameState.selectedCard = null;
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
}

function getValidStealTargets() {
  return gameState.players.filter(p =>
    p.id !== getCurrentPlayer().id && p.hand.length >= 2
  );
}

function aiTakeTurn(player) {
  return new Promise((resolve) => {
    const delay = 600 + Math.random() * 300;

    setTimeout(() => {
      const ownBiomeCard = player.hand.find(c =>
        (c.type === 'animal' && c.biome === player.biome) || c.type === 'fauna'
      );

      if (ownBiomeCard) {
        playAnimalCard(ownBiomeCard, player);
        resolve({ action: 'play', card: ownBiomeCard });
        return;
      }

      const sorteCard = player.hand.find(c => c.type === 'sorte');
      if (sorteCard) {
        if (sorteCard.name === 'Pulo+1') {
          const leader = gameState.players
            .filter(p => p.id !== player.id)
            .sort((a, b) => b.biomeZone.length - a.biomeZone.length)[0];

          const result = playSorte(sorteCard, player, leader);
          resolve({ action: 'sorte', card: sorteCard, result, target: leader });
          return;
        } else if (sorteCard.name === '+2') {
          player.hand.splice(player.hand.findIndex(c => c.id === sorteCard.id), 1);
          gameState.discardPile.push(sorteCard);

          const draws = [];
          for (let i = 0; i < 2 && gameState.deck.length > 0; i++) {
            const result = drawCard(player);
            if (result && result.isAzar) {
              const azarResult = applyAzar(result.card, player);
              draws.push({ ...result, azarResult });
            } else if (result) {
              draws.push(result);
            }
          }

          resolve({ action: 'mais2-draw', card: sorteCard, draws });
          return;
        } else {
          const result = playSorte(sorteCard, player);
          resolve({ action: 'sorte', card: sorteCard, result });
          return;
        }
      }

      if (gameState.deck.length > 0) {
        const result = drawCard(player);
        if (result && result.devolveTrigger) {
          resolve({ action: 'draw', devolveTrigger: result.devolveTrigger });
        } else if (result && result.isAzar) {
          const azarResult = applyAzar(result.card, player);
          resolve({ action: 'draw', card: result.card, azarResult });
        } else {
          resolve({ action: 'draw', card: result?.card });
        }
        return;
      }

      const validTargets = getValidStealTargets();
      if (validTargets.length > 0) {
        const target = validTargets.sort((a, b) => b.hand.length - a.hand.length)[0];
        const result = stealCard(target, player);
        if (result && result.devolveTrigger) {
          resolve({ action: 'steal', from: target, devolveTrigger: result.devolveTrigger });
        } else if (result && result.isAzar) {
          const azarResult = applyAzar(result.card, player);
          resolve({ action: 'steal', card: result.card, from: target, azarResult });
        } else {
          resolve({ action: 'steal', card: result?.card, from: target });
        }
        return;
      }

      resolve({ action: 'none' });
    }, delay);
  });
}

export {
  gameState,
  setupGame,
  buildDeck,
  shuffle,
  getCurrentPlayer,
  isHumanTurn,
  canPlayCard,
  playAnimalCard,
  drawCard,
  stealCard,
  stealSpecificCard,
  checkWin,
  applyAzar,
  playSorte,
  processTurnStart,
  endTurn,
  getValidStealTargets,
  aiTakeTurn,
  BIOME_ANIMALS,
  SPECIAL_CARDS
};

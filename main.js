import './style.css';
import {
  gameState,
  setupGame,
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
  buildDeck,
  shuffle
} from './game.js';
import { MultiplayerManager } from './multiplayer.js';

let selectedPlayerCount = 0;
let selectedBiomes = [];
let tooltipTimeout = null;
let pendingAction = null;
let gameMode = 'local';
let multiplayerManager = null;
let stealMode = false;
let stealTargetPlayer = null;

function initSetupScreen() {
  const playerCountBtns = document.querySelectorAll('.player-count-btn');
  const biomeBtns = document.querySelectorAll('.biome-btn');
  const startGameBtn = document.getElementById('start-game-btn');
  const biomeSelection = document.getElementById('biome-selection');
  const biomeCountSpan = document.getElementById('biome-count');

  playerCountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playerCountBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedPlayerCount = parseInt(btn.dataset.count);
      selectedBiomes = [];

      biomeBtns.forEach(b => b.classList.remove('selected'));
      biomeSelection.style.display = 'block';
      biomeCountSpan.textContent = selectedPlayerCount;
      startGameBtn.style.display = 'none';
    });
  });

  biomeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const biome = btn.dataset.biome;

      if (selectedBiomes.includes(biome)) {
        selectedBiomes = selectedBiomes.filter(b => b !== biome);
        btn.classList.remove('selected');
      } else if (selectedBiomes.length < selectedPlayerCount) {
        selectedBiomes.push(biome);
        btn.classList.add('selected');
      }

      if (selectedBiomes.length === selectedPlayerCount) {
        startGameBtn.style.display = 'block';
      } else {
        startGameBtn.style.display = 'none';
      }
    });
  });

  startGameBtn.addEventListener('click', () => {
    if (selectedBiomes.length === selectedPlayerCount) {
      setupGame(selectedPlayerCount, selectedBiomes);
      document.getElementById('setup-screen').classList.remove('active');
      document.getElementById('game-screen').classList.add('active');
      startMatch();
    }
  });
}

function startMatch() {
  renderGame();
  startTurnSequence();
}

function renderGame() {
  renderOpponents();
  renderCenterArea();
  renderPlayerArea();
  updateTurnIndicator();
}

function renderOpponents() {
  const opponentsArea = document.getElementById('opponents-area');
  opponentsArea.innerHTML = '';

  gameState.players.forEach(player => {
    if (player.isHuman) return;

    const opponentCard = document.createElement('div');
    opponentCard.className = 'opponent-card';
    opponentCard.dataset.playerId = player.id;

    const statusIcons = [];
    if (player.effects.skipTurn) statusIcons.push('⏭️');
    if (player.effects.puloMaisUm) statusIcons.push('⚠️');
    if (player.effects.devolvePending) statusIcons.push('🔄');

    const canSteal = isHumanTurn() && !gameState.actionTaken && player.hand.length >= 2;

    const activeCardHTML = player.activeCard ? `
      <div class="active-card-display">
        <div class="active-card-label">Carta Ativa</div>
        <div class="card card-sorte mini">
          <div class="card-icon">🍀</div>
          <div class="card-name">${player.activeCard.name}</div>
        </div>
      </div>
    ` : '';

    opponentCard.innerHTML = `
      <div>
        <div class="opponent-info">
          <div class="opponent-name">${player.name}</div>
          <div class="opponent-biome">${player.biome}</div>
        </div>
        <div class="opponent-stats">
          <div class="opponent-hand-count">🎴 ${player.hand.length}</div>
          <div class="opponent-biome-count">🌿 ${player.biomeZone.length}/8</div>
          ${statusIcons.length > 0 ? `<div class="status-icons">${statusIcons.join(' ')}</div>` : ''}
        </div>
      </div>
      ${activeCardHTML}
      <div class="opponent-biome-cards" id="opponent-biome-${player.id}"></div>
      ${stealMode && stealTargetPlayer === player.id ? '<div class="opponent-hand" id="opponent-hand-' + player.id + '"></div>' : ''}
    `;

    opponentsArea.appendChild(opponentCard);

    const opponentBiomeEl = document.getElementById(`opponent-biome-${player.id}`);
    player.biomeZone.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.className = `card card-small card-${card.type}`;
      cardEl.innerHTML = `
        <div class="card-icon-small">${getCardIcon(card)}</div>
        <div class="card-name-small">${card.name}</div>
      `;
      opponentBiomeEl.appendChild(cardEl);
    });
  });
}

function renderCenterArea() {
  const drawPileCounter = document.getElementById('draw-pile-counter');
  drawPileCounter.textContent = gameState.deck.length;

  const drawPile = document.getElementById('draw-pile');
  const pileCard = drawPile.querySelector('.pile-card');

  if (pileCard) {
    pileCard.onclick = null;
    if (isHumanTurn() && !gameState.actionTaken && gameState.deck.length > 0) {
      pileCard.style.cursor = 'pointer';
      pileCard.onclick = handleDrawAction;
    } else {
      pileCard.style.cursor = 'default';
    }
  }

  const discardPile = document.getElementById('discard-pile');
  if (gameState.discardPile.length > 0) {
    const lastCard = gameState.discardPile[gameState.discardPile.length - 1];
    discardPile.innerHTML = `
      <div class="card card-${lastCard.type}">
        <div class="card-icon">${getCardIcon(lastCard)}</div>
        <div class="card-name">${lastCard.name}</div>
      </div>
    `;
  }
}

function renderPlayerArea() {
  const humanPlayer = gameState.players[gameState.humanPlayerIndex];
  const playerArea = document.getElementById('player-area');

  if (isHumanTurn() && !gameState.actionTaken) {
    playerArea.classList.add('my-turn');
  } else {
    playerArea.classList.remove('my-turn');
  }

  document.getElementById('player-biome-label').textContent = humanPlayer.biome;
  document.getElementById('player-biome-count').textContent = humanPlayer.biomeZone.length;

  const biomeGrid = document.getElementById('player-biome-grid');
  biomeGrid.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const slot = document.createElement('div');
    slot.className = 'biome-slot';

    if (humanPlayer.biomeZone[i]) {
      const card = humanPlayer.biomeZone[i];
      const cardEl = createCardElement(card, false);
      slot.appendChild(cardEl);
    }

    biomeGrid.appendChild(slot);
  }

  const activeCardContainer = document.getElementById('player-active-card-container');
  if (humanPlayer.activeCard) {
    activeCardContainer.style.display = 'block';
    activeCardContainer.innerHTML = `
      <div class="active-card-display player-active">
        <div class="active-card-label">Carta Ativa</div>
        <div class="card card-sorte">
          <div class="card-icon">🍀</div>
          <div class="card-name">${humanPlayer.activeCard.name}</div>
        </div>
      </div>
    `;
  } else {
    activeCardContainer.style.display = 'none';
  }

  const playerHand = document.getElementById('player-hand');
  playerHand.innerHTML = '';
  humanPlayer.hand.forEach(card => {
    const cardEl = createCardElement(card, true);
    playerHand.appendChild(cardEl);
  });

  if (stealMode) {
    playerHand.classList.add('drop-zone');
    playerHand.addEventListener('dragover', handleDragOver);
    playerHand.addEventListener('dragleave', handleDragLeave);
    playerHand.addEventListener('drop', handleDrop);
  } else {
    playerHand.classList.remove('drop-zone', 'drag-over');
    playerHand.removeEventListener('dragover', handleDragOver);
    playerHand.removeEventListener('dragleave', handleDragLeave);
    playerHand.removeEventListener('drop', handleDrop);
  }

  updateActionButtons();
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  try {
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    const targetPlayer = gameState.players.find(p => p.id === data.playerId);

    if (targetPlayer) {
      const modal = document.getElementById('target-selector');
      modal.classList.remove('active');
      executeStealCard(targetPlayer, data.cardIndex);
    }
  } catch (error) {
    console.error('Error handling drop:', error);
  }
}

function handleReorderCards(draggedCardId, targetCardId) {
  const humanPlayer = gameState.players[gameState.humanPlayerIndex];

  const draggedIndex = humanPlayer.hand.findIndex(c => c.id === draggedCardId);
  const targetIndex = humanPlayer.hand.findIndex(c => c.id === targetCardId);

  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return;
  }

  const [draggedCard] = humanPlayer.hand.splice(draggedIndex, 1);
  humanPlayer.hand.splice(targetIndex, 0, draggedCard);

  renderPlayerArea();
}

function createCardElement(card, isInHand) {
  const cardEl = document.createElement('div');
  cardEl.className = `card card-${card.type}`;
  cardEl.dataset.cardId = card.id;

  cardEl.innerHTML = `
    <div class="card-icon">${getCardIcon(card)}</div>
    <div class="card-name">${card.name}</div>
    ${card.biome ? `<div class="card-biome">${card.biome}</div>` : ''}
  `;

  if (isInHand) {
    cardEl.draggable = true;

    if (isHumanTurn() && !gameState.actionTaken) {
      cardEl.addEventListener('click', () => handleCardClick(card, cardEl));
    }

    cardEl.addEventListener('dragstart', (e) => {
      cardEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        cardId: card.id,
        source: 'hand'
      }));
    });

    cardEl.addEventListener('dragend', () => {
      cardEl.classList.remove('dragging');
    });

    cardEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingCard = document.querySelector('.card.dragging');
      if (draggingCard && draggingCard !== cardEl) {
        const rect = cardEl.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        if (e.clientX < midpoint) {
          cardEl.classList.add('drag-left');
          cardEl.classList.remove('drag-right');
        } else {
          cardEl.classList.add('drag-right');
          cardEl.classList.remove('drag-left');
        }
      }
    });

    cardEl.addEventListener('dragleave', () => {
      cardEl.classList.remove('drag-left', 'drag-right');
    });

    cardEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cardEl.classList.remove('drag-left', 'drag-right');

      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.source === 'hand') {
          handleReorderCards(data.cardId, card.id);
        }
      } catch (error) {
        console.error('Error reordering cards:', error);
      }
    });

    let pressTimer;
    cardEl.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => showTooltip(card, e), 1200);
    });
    cardEl.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
      hideTooltip();
    });
    cardEl.addEventListener('mouseenter', (e) => {
      tooltipTimeout = setTimeout(() => showTooltip(card, e), 1200);
    });
    cardEl.addEventListener('mouseleave', () => {
      clearTimeout(tooltipTimeout);
      hideTooltip();
    });
  } else {
    let pressTimer;
    cardEl.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => showTooltip(card, e), 1200);
    });
    cardEl.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
      hideTooltip();
    });
    cardEl.addEventListener('mouseenter', (e) => {
      tooltipTimeout = setTimeout(() => showTooltip(card, e), 1200);
    });
    cardEl.addEventListener('mouseleave', () => {
      clearTimeout(tooltipTimeout);
      hideTooltip();
    });
  }

  return cardEl;
}

function getCardIcon(card) {
  if (card.type === 'animal') return '🐾';
  if (card.type === 'fauna') return '🌀';
  if (card.type === 'sorte') return '⭐';
  if (card.type === 'azar') return '☠';
  return '?';
}

function getCardDescription(card) {
  const descriptions = {
    'animal': 'Carta de animal. Coloque na sua área de bioma se for do seu bioma.',
    'fauna': 'Coringa Fauna. Vale para qualquer bioma.',
    'Piedade (Sorte)': 'Outros jogadores entregam 1 carta do seu bioma (se tiverem).',
    'Devolve (Sorte)': 'Outros jogadores devolvem 1 carta do próprio bioma para a pilha.',
    'Pulo+1 (Sorte)': 'Escolha um alvo. Ele entrega 1 carta do seu bioma e perde a vez.',
    '+2 (Sorte)': 'Compre 2 cartas, roube 2 cartas, ou compre 1 e roube 1.',
    'Devolve (Azar)': 'Devolva imediatamente 1 carta do seu bioma para a pilha.',
    'Pulo (Azar)': 'Você perde sua próxima vez.',
    'Piedade (Azar)': 'Entregue 1 carta de cada bioma aos respectivos jogadores.'
  };

  if (card.type === 'animal') return descriptions['animal'];
  if (card.type === 'fauna') return descriptions['fauna'];

  const key = `${card.name} (${card.type.charAt(0).toUpperCase() + card.type.slice(1)})`;
  return descriptions[key] || 'Carta especial';
}

function showTooltip(card, event) {
  const tooltip = document.getElementById('tooltip');
  const cardType = card.type === 'animal' ? 'Animal' :
                   card.type === 'fauna' ? 'Coringa Fauna' :
                   card.type === 'sorte' ? 'Sorte' : 'Azar';

  tooltip.innerHTML = `
    <div class="tooltip-title">${card.name}</div>
    <div class="tooltip-type">${cardType}${card.biome ? ` - ${card.biome}` : ''}</div>
    <div class="tooltip-description">${getCardDescription(card)}</div>
  `;

  tooltip.classList.add('active');

  const x = event.touches ? event.touches[0].clientX : event.clientX;
  const y = event.touches ? event.touches[0].clientY : event.clientY;

  tooltip.style.left = `${x + 10}px`;
  tooltip.style.top = `${y + 10}px`;

  if (x + tooltip.offsetWidth + 10 > window.innerWidth) {
    tooltip.style.left = `${x - tooltip.offsetWidth - 10}px`;
  }
  if (y + tooltip.offsetHeight + 10 > window.innerHeight) {
    tooltip.style.top = `${y - tooltip.offsetHeight - 10}px`;
  }
}

function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  tooltip.classList.remove('active');
}

function handleCardClick(card, cardEl) {
  if (gameState.actionTaken) return;

  const humanPlayer = gameState.players[gameState.humanPlayerIndex];

  if (gameState.selectedCard?.id === card.id) {
    gameState.selectedCard = null;
    cardEl.classList.remove('selected');
    return;
  }

  document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
  gameState.selectedCard = card;
  cardEl.classList.add('selected');

  if (card.type === 'animal' || card.type === 'fauna') {
    if (canPlayCard(card, humanPlayer)) {
      const success = playAnimalCard(card, humanPlayer);
      if (success) {
        gameState.actionTaken = true;
        gameState.selectedCard = null;
        renderGame();

        if (checkWin(humanPlayer)) {
          showVictory(humanPlayer);
          return;
        }

        setTimeout(() => {
          endTurn();
          startTurnSequence();
        }, 500);
      }
    }
  } else if (card.type === 'sorte') {
    if (card.name === 'Pulo+1') {
      showTargetSelector('Escolha o alvo para Pulo+1', (target) => {
        const result = playSorte(card, humanPlayer, target);
        if (result) {
          gameState.actionTaken = true;
          gameState.selectedCard = null;
          showEffect('Pulo+1', result.effects.join('\n'));
          setTimeout(() => {
            renderGame();
            if (checkWin(humanPlayer)) {
              showVictory(humanPlayer);
              return;
            }
            endTurn();
            startTurnSequence();
          }, 2000);
        }
      });
    } else if (card.name === '+2') {
      showMais2Choice((choice) => {
        handleMais2Choice(card, humanPlayer, choice);
      });
    } else {
      const result = playSorte(card, humanPlayer);
      if (result) {
        gameState.actionTaken = true;
        gameState.selectedCard = null;
        const effectMessage = result.effects.length > 0 ? result.effects.join('\n') : 'Carta jogada com sucesso';
        showEffect(card.name, effectMessage);
        setTimeout(() => {
          renderGame();
          if (checkWin(humanPlayer)) {
            showVictory(humanPlayer);
            return;
          }
          endTurn();
          startTurnSequence();
        }, 2000);
      }
    }
  }
}

function showTargetSelector(title, onSelect, customTargets = null) {
  const modal = document.getElementById('target-selector');
  const titleEl = document.getElementById('target-selector-title');
  const optionsEl = document.getElementById('target-selector-options');

  titleEl.textContent = title;
  optionsEl.innerHTML = '';

  const validTargets = customTargets || gameState.players.filter(p => !p.isHuman);
  validTargets.forEach(player => {
    const option = document.createElement('button');
    option.className = 'target-option';
    option.textContent = `${player.name} (${player.biome})`;
    option.addEventListener('click', () => {
      modal.classList.remove('active');
      onSelect(player);
    });
    optionsEl.appendChild(option);
  });

  modal.classList.add('active');
}

function showMais2Choice(onSelect) {
  const modal = document.getElementById('target-selector');
  const titleEl = document.getElementById('target-selector-title');
  const optionsEl = document.getElementById('target-selector-options');

  titleEl.textContent = 'Escolha uma opção (+2)';
  optionsEl.innerHTML = '';

  const choices = [
    { text: 'Comprar 2 cartas', value: 'draw2' },
    { text: 'Roubar 2 cartas', value: 'steal2' },
    { text: 'Comprar 1 e Roubar 1', value: 'draw1steal1' }
  ];

  choices.forEach(choice => {
    const option = document.createElement('button');
    option.className = 'choice-option';
    option.textContent = choice.text;
    option.addEventListener('click', () => {
      modal.classList.remove('active');
      onSelect(choice.value);
    });
    optionsEl.appendChild(option);
  });

  modal.classList.add('active');
}

function handleMais2Choice(card, player, choice) {
  const humanPlayer = gameState.players[gameState.humanPlayerIndex];
  const cardIndex = player.hand.findIndex(c => c.id === card.id);
  if (cardIndex !== -1) {
    player.hand.splice(cardIndex, 1);
    gameState.discardPile.push(card);
  }

  const effects = [];

  if (choice === 'draw2') {
    for (let i = 0; i < 2 && gameState.deck.length > 0; i++) {
      const result = drawCard(player);
      if (result && result.isAzar) {
        const azarResult = applyAzar(result.card, player);
        effects.push(`Comprou ${result.card.name} (Azar): ${azarResult.effects.join(', ')}`);
      } else if (result) {
        effects.push(`Comprou 1 carta`);
      }
    }
  } else if (choice === 'steal2') {
    showTargetSelector('Escolha o 1º alvo para roubar', (target1) => {
      showCardsOnTableForMais2(target1, player, effects, (result1) => {
        if (result1 && result1.isAzar) {
          const azarResult = applyAzar(result1.card, player);
          effects.push(`Roubou ${result1.card.name} de ${target1.name} (Azar): ${azarResult.effects.join(', ')}`);
        } else if (result1) {
          effects.push(`Roubou 1 carta de ${target1.name}`);
        }

        const availableTargets = gameState.players.filter(p =>
          !p.isHuman && p.hand.length >= 2
        );

        if (availableTargets.length > 0) {
          showTargetSelector('Escolha o 2º alvo para roubar', (target2) => {
            if (target2.hand.length < 2) {
              finalizeMais2(effects, humanPlayer);
              return;
            }

            showCardsOnTableForMais2(target2, player, effects, (result2) => {
              if (result2 && result2.isAzar) {
                const azarResult = applyAzar(result2.card, player);
                effects.push(`Roubou ${result2.card.name} de ${target2.name} (Azar): ${azarResult.effects.join(', ')}`);
              } else if (result2) {
                effects.push(`Roubou 1 carta de ${target2.name}`);
              }

              finalizeMais2(effects, humanPlayer);
            });
          }, availableTargets);
        } else {
          finalizeMais2(effects, humanPlayer);
        }
      });
    });
    return;
  } else if (choice === 'draw1steal1') {
    const result = drawCard(player);
    if (result && result.isAzar) {
      const azarResult = applyAzar(result.card, player);
      effects.push(`Comprou ${result.card.name} (Azar): ${azarResult.effects.join(', ')}`);
    } else if (result) {
      effects.push(`Comprou 1 carta`);
    }

    const validTargets = getValidStealTargets();
    if (validTargets.length > 0) {
      showTargetSelector('Escolha o alvo para roubar', (target) => {
        showCardsOnTableForMais2(target, player, effects, (stealResult) => {
          if (stealResult && stealResult.isAzar) {
            const azarResult = applyAzar(stealResult.card, player);
            effects.push(`Roubou ${stealResult.card.name} de ${target.name} (Azar): ${azarResult.effects.join(', ')}`);
          } else if (stealResult) {
            effects.push(`Roubou 1 carta de ${target.name}`);
          }

          finalizeMais2(effects, humanPlayer);
        });
      });
      return;
    } else {
      finalizeMais2(effects, humanPlayer);
      return;
    }
  }

  finalizeMais2(effects, humanPlayer);
}

function finalizeMais2(effects, humanPlayer) {
  gameState.actionTaken = true;
  gameState.selectedCard = null;
  showEffect('+2', effects.join('\n'));
  setTimeout(() => {
    renderGame();
    if (checkWin(humanPlayer)) {
      showVictory(humanPlayer);
      return;
    }
    endTurn();
    startTurnSequence();
  }, 2000);
}

function showEffect(title, message) {
  const effectDisplay = document.getElementById('effect-display');
  effectDisplay.innerHTML = `
    <div class="effect-title">${title}</div>
    <div class="effect-message">${message}</div>
  `;
  effectDisplay.classList.add('active');

  setTimeout(() => {
    effectDisplay.classList.remove('active');
  }, 2000);
}

function updateActionButtons() {
  const drawBtn = document.getElementById('draw-btn');
  const stealBtn = document.getElementById('steal-btn');

  if (!isHumanTurn() || gameState.actionTaken) {
    drawBtn.disabled = true;
    stealBtn.disabled = true;
    return;
  }

  drawBtn.disabled = gameState.deck.length === 0;
  stealBtn.disabled = getValidStealTargets().length === 0;

  drawBtn.onclick = () => handleDrawAction();
  stealBtn.onclick = () => handleStealAction();
}

function handleDrawAction() {
  if (gameState.actionTaken || gameState.deck.length === 0) return;

  const humanPlayer = gameState.players[gameState.humanPlayerIndex];
  const result = drawCard(humanPlayer);

  if (result && result.devolveTrigger) {
    showEffect('Azar Devolve Ativado', `Devolveu ${result.devolveTrigger.card.name} para a pilha`);
    setTimeout(() => {
      renderGame();
    }, 1500);
    return;
  }

  if (result && result.isAzar) {
    const azarResult = applyAzar(result.card, humanPlayer);
    showEffect(`Azar: ${result.card.name}`, azarResult.effects.join('\n'));
    gameState.actionTaken = true;

    setTimeout(() => {
      renderGame();
      if (checkWin(humanPlayer)) {
        showVictory(humanPlayer);
        return;
      }
      endTurn();
      startTurnSequence();
    }, 2000);
  } else {
    if (result && result.card && canAutoPlaceCard(result.card, humanPlayer)) {
      autoPlaceCard(result.card, humanPlayer);
      gameState.actionTaken = true;
      renderGame();

      if (checkWin(humanPlayer)) {
        showVictory(humanPlayer);
        return;
      }

      setTimeout(() => {
        endTurn();
        startTurnSequence();
      }, 500);
    } else {
      gameState.actionTaken = true;
      renderGame();

      if (checkWin(humanPlayer)) {
        showVictory(humanPlayer);
        return;
      }

      setTimeout(() => {
        endTurn();
        startTurnSequence();
      }, 500);
    }
  }
}

function handleStealAction() {
  if (gameState.actionTaken) return;

  const validTargets = getValidStealTargets();
  if (validTargets.length === 0) return;

  showTargetSelector('Escolha de quem roubar', (target) => {
    showCardsOnTable(target);
  });
}

function showCardsOnTable(targetPlayer) {
  stealMode = true;
  stealTargetPlayer = targetPlayer.id;

  const modal = document.getElementById('target-selector');
  const titleEl = document.getElementById('target-selector-title');
  const optionsEl = document.getElementById('target-selector-options');

  titleEl.textContent = `Escolha uma carta de ${targetPlayer.name}`;
  optionsEl.innerHTML = '';

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'steal-cards-table';

  targetPlayer.hand.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card back table-card';
    cardEl.draggable = true;
    cardEl.innerHTML = '<div class="card-back-content">🂠</div>';

    cardEl.addEventListener('click', () => {
      modal.classList.remove('active');
      executeStealCard(targetPlayer, index);
    });

    cardEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ playerId: targetPlayer.id, cardIndex: index }));
      cardEl.classList.add('dragging');
    });

    cardEl.addEventListener('dragend', () => {
      cardEl.classList.remove('dragging');
    });

    cardsContainer.appendChild(cardEl);
  });

  optionsEl.appendChild(cardsContainer);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-btn';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.style.marginTop = '16px';
  cancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    stealMode = false;
    stealTargetPlayer = null;
  });
  optionsEl.appendChild(cancelBtn);

  modal.classList.add('active');
}

function showCardsOnTableForMais2(targetPlayer, player, effects, callback) {
  const modal = document.getElementById('target-selector');
  const titleEl = document.getElementById('target-selector-title');
  const optionsEl = document.getElementById('target-selector-options');

  titleEl.textContent = `Escolha uma carta de ${targetPlayer.name}`;
  optionsEl.innerHTML = '';

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'steal-cards-table';

  targetPlayer.hand.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card back table-card';
    cardEl.innerHTML = '<div class="card-back-content">🂠</div>';

    cardEl.addEventListener('click', () => {
      modal.classList.remove('active');
      const result = stealSpecificCard(targetPlayer, player, index);
      callback(result);
    });

    cardsContainer.appendChild(cardEl);
  });

  optionsEl.appendChild(cardsContainer);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-btn';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.style.marginTop = '16px';
  cancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    callback(null);
  });
  optionsEl.appendChild(cancelBtn);

  modal.classList.add('active');
}

function executeStealCard(fromPlayer, cardIndex) {
  const humanPlayer = gameState.players[gameState.humanPlayerIndex];
  const result = stealSpecificCard(fromPlayer, humanPlayer, cardIndex);

  stealMode = false;
  stealTargetPlayer = null;

  if (result && result.devolveTrigger) {
    showEffect('Azar Devolve Ativado', `Devolveu ${result.devolveTrigger.card.name} para a pilha`);
    setTimeout(() => {
      renderGame();
    }, 1500);
    return;
  }

  if (result && result.isAzar) {
    const azarResult = applyAzar(result.card, humanPlayer);
    showEffect(`Azar: ${result.card.name}`, azarResult.effects.join('\n'));
    gameState.actionTaken = true;

    setTimeout(() => {
      renderGame();
      if (checkWin(humanPlayer)) {
        showVictory(humanPlayer);
        return;
      }
      endTurn();
      startTurnSequence();
    }, 2000);
  } else if (result) {
    if (result.card && canAutoPlaceCard(result.card, humanPlayer)) {
      autoPlaceCard(result.card, humanPlayer);
      gameState.actionTaken = true;
      renderGame();

      if (checkWin(humanPlayer)) {
        showVictory(humanPlayer);
        return;
      }

      setTimeout(() => {
        endTurn();
        startTurnSequence();
      }, 500);
    } else {
      gameState.actionTaken = true;
      renderGame();

      if (checkWin(humanPlayer)) {
        showVictory(humanPlayer);
        return;
      }

      setTimeout(() => {
        endTurn();
        startTurnSequence();
      }, 500);
    }
  }
}

function canAutoPlaceCard(card, player) {
  if (card.type !== 'animal' && card.type !== 'fauna') return false;
  if (player.biomeZone.length !== 7) return false;

  if (card.type === 'fauna') return true;
  if (card.biome === player.biome) return true;

  return false;
}

function autoPlaceCard(card, player) {
  const cardIndex = player.hand.findIndex(c => c.id === card.id);
  if (cardIndex !== -1) {
    player.hand.splice(cardIndex, 1);
    player.biomeZone.push(card);
    showEffect('Vitória!', `${card.name} completou seu bioma automaticamente!`);
  }
}

function updateTurnIndicator() {
  const currentPlayer = getCurrentPlayer();
  document.getElementById('current-player-name').textContent = currentPlayer.name;

  if (currentPlayer.isHuman) {
    document.body.classList.remove('waiting-turn');
  } else {
    document.body.classList.add('waiting-turn');
  }
}

function startTurnSequence() {
  const currentPlayer = getCurrentPlayer();
  updateTurnIndicator();

  const turnStartResult = processTurnStart(currentPlayer);

  if (turnStartResult.skipTurn) {
    const messages = [];
    if (turnStartResult.reason === 'Pulo') {
      messages.push(`${currentPlayer.name} pula a vez (Pulo)`);
    } else if (turnStartResult.reason === 'Pulo+1') {
      messages.push(`${currentPlayer.name} entregou ${turnStartResult.cardGiven} para ${turnStartResult.to}`);
      messages.push(`${currentPlayer.name} perde a vez`);
    }

    showEffect('Efeito Ativo', messages.join('\n'));

    setTimeout(() => {
      renderGame();
      endTurn();
      startTurnSequence();
    }, 2000);
    return;
  }

  if (turnStartResult.devolveResolved) {
    showEffect('Devolve Resolvido', `${currentPlayer.name} devolveu ${turnStartResult.card}`);
    setTimeout(() => {
      renderGame();
      continueCurrentTurn();
    }, 1500);
    return;
  }

  continueCurrentTurn();
}

function continueCurrentTurn() {
  const currentPlayer = getCurrentPlayer();

  if (checkWin(currentPlayer)) {
    showVictory(currentPlayer);
    return;
  }

  renderGame();

  if (!currentPlayer.isHuman) {
    aiTakeTurn(currentPlayer).then(result => {
      handleAIAction(result);
    });
  }
}

function handleAIAction(result) {
  const currentPlayer = getCurrentPlayer();
  const messages = [];

  if (result.devolveTrigger) {
    messages.push(`${currentPlayer.name} ativou Azar Devolve`);
    messages.push(`Devolveu ${result.devolveTrigger.card.name} para a pilha`);
  } else if (result.action === 'play') {
    messages.push(`${currentPlayer.name} jogou ${result.card.name}`);
  } else if (result.action === 'draw') {
    if (result.azarResult) {
      messages.push(`${currentPlayer.name} comprou Azar: ${result.card.name}`);
      messages.push(...result.azarResult.effects);
    } else {
      messages.push(`${currentPlayer.name} comprou 1 carta`);
    }
  } else if (result.action === 'steal') {
    if (result.from.isHuman) {
      showStolenCardFromHuman(result.card);
    }

    if (result.azarResult) {
      messages.push(`${currentPlayer.name} roubou de ${result.from.name}`);
      messages.push(`Era Azar: ${result.card.name}`);
      messages.push(...result.azarResult.effects);
    } else {
      messages.push(`${currentPlayer.name} roubou ${result.card.name} de ${result.from.name}`);
    }
  } else if (result.action === 'sorte') {
    messages.push(`${currentPlayer.name} usou ${result.card.name}`);
    if (result.result) {
      messages.push(...result.result.effects);
    }
  } else if (result.action === 'mais2-draw') {
    messages.push(`${currentPlayer.name} usou +2 (Comprar 2)`);
    result.draws.forEach(draw => {
      if (draw.azarResult) {
        messages.push(`Comprou Azar: ${draw.card.name}`);
        messages.push(...draw.azarResult.effects);
      }
    });
  }

  if (messages.length > 0) {
    showEffect(`Turno de ${currentPlayer.name}`, messages.join('\n'));
  }

  setTimeout(() => {
    renderGame();

    if (checkWin(currentPlayer)) {
      showVictory(currentPlayer);
      return;
    }

    endTurn();
    startTurnSequence();
  }, messages.length > 0 ? 2500 : 1000);
}

function showStolenCardFromHuman(card) {
  const overlay = document.createElement('div');
  overlay.className = 'stolen-card-overlay';

  const cardDisplay = document.createElement('div');
  cardDisplay.className = 'stolen-card-display';
  cardDisplay.innerHTML = `
    <div class="stolen-card-title">Carta Roubada!</div>
    <div class="card card-${card.type}">
      <div class="card-icon">${getCardIcon(card)}</div>
      <div class="card-name">${card.name}</div>
      ${card.biome ? `<div class="card-biome">${card.biome}</div>` : ''}
    </div>
  `;

  overlay.appendChild(cardDisplay);
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.classList.add('active');
  }, 10);

  setTimeout(() => {
    overlay.classList.remove('active');
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 500);
  }, 2000);
}

function showVictory(winner) {
  gameState.winner = winner;
  const modal = document.getElementById('victory-modal');
  const message = document.getElementById('victory-message');

  message.textContent = `${winner.name} venceu completando o bioma ${winner.biome}!`;
  modal.classList.add('active');
}

function initGameScreen() {
  const rulesBtn = document.getElementById('rules-btn');
  const rulesModal = document.getElementById('rules-modal');
  const closeModalBtn = rulesModal.querySelector('.close-modal-btn');

  rulesBtn.addEventListener('click', () => {
    rulesModal.classList.add('active');
  });

  closeModalBtn.addEventListener('click', () => {
    rulesModal.classList.remove('active');
  });

  rulesModal.addEventListener('click', (e) => {
    if (e.target === rulesModal) {
      rulesModal.classList.remove('active');
    }
  });

  const newGameBtn = document.getElementById('new-game-btn');
  newGameBtn.addEventListener('click', () => {
    location.reload();
  });

  const shuffleHandBtn = document.getElementById('shuffle-hand-btn');
  shuffleHandBtn.addEventListener('click', () => {
    const humanPlayer = gameState.players[gameState.humanPlayerIndex];
    if (humanPlayer && humanPlayer.hand.length > 0) {
      humanPlayer.hand = shuffle(humanPlayer.hand);
      renderPlayerArea();
    }
  });
}

function navigateToScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

function initModeSelectScreen() {
  const modeBtns = document.querySelectorAll('.mode-btn');

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      gameMode = mode;

      if (mode === 'local') {
        navigateToScreen('setup-screen');
      } else if (mode === 'online') {
        multiplayerManager = new MultiplayerManager();
        navigateToScreen('multiplayer-screen');
      }
    });
  });
}

function initMultiplayerScreen() {
  const createRoomBtn = document.getElementById('create-room-btn');
  const joinRoomBtn = document.getElementById('join-room-btn');
  const backToModeBtn = document.getElementById('back-to-mode-btn');
  const confirmCreateBtn = document.getElementById('confirm-create-room-btn');
  const confirmJoinBtn = document.getElementById('confirm-join-room-btn');

  const createRoomSection = document.getElementById('create-room-section');
  const joinRoomSection = document.getElementById('join-room-section');
  const lobbySection = document.getElementById('lobby-section');

  createRoomBtn.addEventListener('click', () => {
    createRoomSection.style.display = 'block';
    joinRoomSection.style.display = 'none';
    lobbySection.style.display = 'none';
  });

  joinRoomBtn.addEventListener('click', () => {
    createRoomSection.style.display = 'none';
    joinRoomSection.style.display = 'block';
    lobbySection.style.display = 'none';
  });

  backToModeBtn.addEventListener('click', () => {
    if (multiplayerManager) {
      multiplayerManager.disconnect();
      multiplayerManager = null;
    }
    navigateToScreen('mode-select-screen');
  });

  initCreateRoomFlow();
  initJoinRoomFlow();
}

function initCreateRoomFlow() {
  const playerCountBtns = document.querySelectorAll('.player-count-btn-mp');
  const biomeBtns = document.querySelectorAll('.biome-btn-mp');
  const confirmBtn = document.getElementById('confirm-create-room-btn');
  const hostNameInput = document.getElementById('host-name-input');
  const biomeSelectionMp = document.getElementById('biome-selection-mp');

  let mpSelectedCount = 0;
  let mpSelectedBiomes = [];

  playerCountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playerCountBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      mpSelectedCount = parseInt(btn.dataset.count);
      mpSelectedBiomes = [];
      biomeBtns.forEach(b => b.classList.remove('selected'));
      biomeSelectionMp.style.display = 'block';
      confirmBtn.style.display = 'none';
    });
  });

  biomeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const biome = btn.dataset.biome;

      if (mpSelectedBiomes.includes(biome)) {
        mpSelectedBiomes = mpSelectedBiomes.filter(b => b !== biome);
        btn.classList.remove('selected');
      } else if (mpSelectedBiomes.length < mpSelectedCount) {
        mpSelectedBiomes.push(biome);
        btn.classList.add('selected');
      }

      if (mpSelectedBiomes.length === mpSelectedCount) {
        confirmBtn.style.display = 'block';
      } else {
        confirmBtn.style.display = 'none';
      }
    });
  });

  confirmBtn.addEventListener('click', async () => {
    const hostName = hostNameInput.value.trim() || 'Host';

    try {
      const { room, player, code } = await multiplayerManager.createRoom(
        hostName,
        mpSelectedBiomes,
        18
      );

      selectedBiomes = mpSelectedBiomes;
      selectedPlayerCount = mpSelectedCount;

      showLobby(code, true);
      setupMultiplayerListeners();
    } catch (error) {
      alert('Erro ao criar sala: ' + error.message);
    }
  });
}

function initJoinRoomFlow() {
  const confirmBtn = document.getElementById('confirm-join-room-btn');
  const joinNameInput = document.getElementById('join-name-input');
  const roomCodeInput = document.getElementById('room-code-input');

  confirmBtn.addEventListener('click', async () => {
    const playerName = joinNameInput.value.trim() || 'Jogador';
    const code = roomCodeInput.value.trim().toUpperCase();

    if (!code) {
      alert('Digite o código da sala');
      return;
    }

    try {
      const { room, player } = await multiplayerManager.joinRoom(code, playerName);

      selectedBiomes = room.selected_biomes;
      selectedPlayerCount = room.selected_biomes.length;

      showLobby(code, false);
      setupMultiplayerListeners();
    } catch (error) {
      alert('Erro ao entrar na sala: ' + error.message);
    }
  });
}

function showLobby(code, isHost) {
  document.getElementById('create-room-section').style.display = 'none';
  document.getElementById('join-room-section').style.display = 'none';
  document.getElementById('lobby-section').style.display = 'block';
  document.getElementById('lobby-room-code').textContent = code;

  if (isHost) {
    document.getElementById('start-multiplayer-game-btn').style.display = 'block';
    document.getElementById('start-multiplayer-game-btn').addEventListener('click', startMultiplayerGame);
  }

  updateLobbyPlayers();
}

async function updateLobbyPlayers() {
  try {
    const players = await multiplayerManager.getPlayers(multiplayerManager.currentRoom.id);
    const lobbyList = document.getElementById('lobby-players-list');
    lobbyList.innerHTML = '';

    players.forEach(p => {
      const playerEl = document.createElement('div');
      playerEl.className = 'lobby-player';
      playerEl.innerHTML = `
        <div>
          <div class="lobby-player-name">${p.name} ${p.player_id === multiplayerManager.playerId ? '(Você)' : ''}</div>
          <div class="lobby-player-biome">${p.biome}</div>
        </div>
        <div>${p.is_ready ? '✅ Pronto' : '⏳ Aguardando'}</div>
      `;
      lobbyList.appendChild(playerEl);
    });

    // --- Controle do botão "Iniciar Jogo" ---
    const startBtn = document.getElementById('start-multiplayer-game-btn');
    const allReady = players.length >= 2 && players.every(p => p.is_ready);
    const isHost = multiplayerManager.isHost === true;

    if (startBtn) {
      if (allReady && isHost) {
        startBtn.style.display = 'block';
        startBtn.disabled = false;
      } else {
        startBtn.style.display = 'none';
        startBtn.disabled = true;
      }
    }

    // Atualiza o texto de status
    const lobbyStatus = document.getElementById('lobby-status');
    if (players.length === selectedPlayerCount) {
      if (allReady) {
        lobbyStatus.textContent = 'Todos prontos! Host pode iniciar a partida.';
      } else {
        lobbyStatus.textContent = 'Aguardando todos ficarem prontos...';
      }
    } else {
      lobbyStatus.textContent = `Aguardando jogadores... (${players.length}/${selectedPlayerCount})`;
    }
  } catch (error) {
    console.error('Error updating lobby:', error);
  }
}


async function startMultiplayerMatch(room) {
  console.log('Starting multiplayer match with room:', room);
}

initModeSelectScreen();
initSetupScreen();
initGameScreen();
initMultiplayerScreen();

// ===============================
// Função de fallback para iniciar o jogo multiplayer
// ===============================
async function startMultiPlayerGame() {  // <--- "P" maiúsculo aqui
  try {
    if (!multiplayerManager || !multiplayerManager.currentRoom) {
      alert("Erro: nenhuma sala ativa encontrada.");
      return;
    }

    const deck = []; // Aqui você pode carregar ou gerar o baralho padrão
    await multiplayerManager.startGame(deck);

    alert("Partida iniciada com sucesso!");
  } catch (error) {
    console.error("Erro ao iniciar jogo multiplayer:", error);
    alert("Erro ao iniciar jogo multiplayer: " + error.message);
  }
}

import {
  BOT_CONTEXTS,
  browserRandom,
  chooseComputerNumber,
  chooseComputerRole,
} from '../bot/index.js';
import {
  ACTIONS,
  DIFFICULTIES,
  ERROR_CODES,
  GameEngineError,
  PARTICIPANTS,
  PHASES,
  createGame,
  gameReducer,
  getCurrentBatter,
  validateDifficulty,
  validateNumber,
} from '../game/index.js';
import {
  DEFAULT_DELAY_RANGE,
  PRESENTATION_CONTEXT,
  PRESENTATION_STATUS,
} from './constants.js';
import { calculateDelay, validateDelayRange } from './delay.js';
import {
  CONTROLLER_ERROR_CODES,
  failController,
  isExpectedDomainError,
  toPublicError,
} from './errors.js';
import { browserCreateMatchId } from './idFactory.js';
import { browserScheduler } from './scheduler.js';

function idlePresentation() {
  return {
    status: PRESENTATION_STATUS.IDLE,
    context: null,
    selectedPlayerNumber: null,
    revealedPlayerNumber: null,
    revealedComputerNumber: null,
    revealedRole: null,
    pendingSince: null,
  };
}

function success() {
  return { ok: true };
}

function failure(error) {
  return { ok: false, error };
}

function validateDependencies(dependencies) {
  const functionDependencies = [
    ['random', dependencies.random],
    ['timingRandom', dependencies.timingRandom],
    ['createMatchId', dependencies.createMatchId],
    ['chooseNumber', dependencies.chooseNumber],
    ['chooseRole', dependencies.chooseRole],
    ['now', dependencies.now],
  ];

  functionDependencies.forEach(([name, dependency]) => {
    if (typeof dependency !== 'function') {
      failController(
        CONTROLLER_ERROR_CODES.INVALID_DEPENDENCY,
        `${name} must be a function.`,
      );
    }
  });

  if (
    !dependencies.scheduler ||
    typeof dependencies.scheduler.setTimeout !== 'function' ||
    typeof dependencies.scheduler.clearTimeout !== 'function'
  ) {
    failController(
      CONTROLLER_ERROR_CODES.INVALID_DEPENDENCY,
      'scheduler must provide setTimeout and clearTimeout.',
    );
  }

  validateDelayRange(dependencies.delayRange);
}

export function createGameController(options = {}) {
  const initialDifficulty = validateDifficulty(
    options.initialSetup?.difficulty ?? DIFFICULTIES.MEDIUM,
  );
  const initialPlayerName =
    typeof options.initialSetup?.playerName === 'string'
      ? options.initialSetup.playerName
      : '';
  const dependencies = {
    random: options.random ?? browserRandom,
    timingRandom: options.timingRandom ?? browserRandom,
    scheduler: options.scheduler ?? browserScheduler,
    createMatchId: options.createMatchId ?? browserCreateMatchId,
    delayRange: options.delayRange ?? DEFAULT_DELAY_RANGE,
    chooseNumber: options.chooseNumber ?? chooseComputerNumber,
    chooseRole: options.chooseRole ?? chooseComputerRole,
    now: options.now ?? (() => globalThis.performance.now()),
  };
  validateDependencies(dependencies);

  let snapshot = {
    game: null,
    setup: {
      difficulty: initialDifficulty,
      playerName: initialPlayerName,
    },
    presentation: idlePresentation(),
    controls: { locked: false },
    error: null,
  };
  let destroyed = false;
  let pendingOperation = null;
  let operationSequence = 0;
  const timerIds = new Set();
  const listeners = new Set();

  function notify() {
    if (!destroyed) {
      [...listeners].forEach((listener) => listener());
    }
  }

  function publish(changes) {
    snapshot = { ...snapshot, ...changes };
    notify();
  }

  function setExpectedError(error) {
    const publicError = toPublicError(error);
    publish({ error: publicError });
    return failure(publicError);
  }

  function runCommand(command) {
    if (destroyed) {
      return failure({
        code: CONTROLLER_ERROR_CODES.CONTROLLER_DESTROYED,
        message: 'The game controller has been destroyed.',
      });
    }

    try {
      return command();
    } catch (error) {
      if (isExpectedDomainError(error)) {
        return setExpectedError(error);
      }
      throw error;
    }
  }

  function requireGame() {
    if (!snapshot.game) {
      failController(
        CONTROLLER_ERROR_CODES.MATCH_NOT_STARTED,
        'Start a match before using this command.',
      );
    }
    return snapshot.game;
  }

  function requireAvailableControls() {
    if (pendingOperation || snapshot.controls.locked) {
      failController(
        CONTROLLER_ERROR_CODES.OPERATION_PENDING,
        'Wait for the current choice or reveal to finish.',
      );
    }
  }

  function cancelPendingWork() {
    timerIds.forEach((timerId) => dependencies.scheduler.clearTimeout(timerId));
    timerIds.clear();
    pendingOperation = null;
    operationSequence += 1;
  }

  function scheduleOperation(operation, callback) {
    let timerId;
    const guardedCallback = () => {
      if (timerId !== undefined) {
        timerIds.delete(timerId);
      }
      callback(operation.token);
    };

    timerId = dependencies.scheduler.setTimeout(guardedCallback, operation.delay);
    operation.timerId = timerId;

    if (pendingOperation === operation && !destroyed) {
      timerIds.add(timerId);
    } else {
      dependencies.scheduler.clearTimeout(timerId);
    }
  }

  function isCurrentOperation(operation, token) {
    return (
      !destroyed &&
      pendingOperation === operation &&
      operation.token === token &&
      snapshot.game?.matchId === operation.matchId &&
      snapshot.game?.currentRoundId === operation.roundId
    );
  }

  function completeOperation(operation) {
    if (operation.timerId !== undefined) {
      timerIds.delete(operation.timerId);
    }
    if (pendingOperation === operation) {
      pendingOperation = null;
    }
  }

  function handleAsyncError(operation, error) {
    completeOperation(operation);
    // Unlock BEFORE deciding whether to rethrow. This runs inside a scheduled
    // callback, so an unexpected error escapes to the host with no caller to
    // catch it -- and the controls were locked when the operation started.
    // Leaving them locked strands the player with a dead board and no recovery
    // short of a new match. The error is still rethrown so it stays visible.
    publish({
      presentation: idlePresentation(),
      controls: { locked: false },
      error: isExpectedDomainError(error)
        ? toPublicError(error)
        : {
            code: CONTROLLER_ERROR_CODES.UNEXPECTED_FAILURE,
            message: 'Something went wrong resolving that ball. Please try again.',
          },
    });
    if (!isExpectedDomainError(error)) throw error;
  }

  function resolveNumberOperation(operation, token) {
    if (!isCurrentOperation(operation, token)) {
      return;
    }

    try {
      const actionType =
        operation.context === PRESENTATION_CONTEXT.TOSS
          ? ACTIONS.RESOLVE_TOSS
          : ACTIONS.RESOLVE_DELIVERY;
      const game = gameReducer(snapshot.game, {
        type: actionType,
        payload: {
          matchId: operation.matchId,
          roundId: operation.roundId,
          playerNumber: operation.playerNumber,
          computerNumber: operation.computerNumber,
        },
      });

      completeOperation(operation);
      publish({
        game,
        presentation: {
          status: PRESENTATION_STATUS.SHOWING_REVEAL,
          context: operation.context,
          selectedPlayerNumber: operation.playerNumber,
          revealedPlayerNumber: operation.playerNumber,
          revealedComputerNumber: operation.computerNumber,
          revealedRole: null,
          pendingSince: null,
        },
        controls: { locked: true },
        error: null,
      });
    } catch (error) {
      handleAsyncError(operation, error);
    }
  }

  function resolveRoleOperation(operation, token) {
    if (!isCurrentOperation(operation, token)) {
      return;
    }

    try {
      const game = gameReducer(snapshot.game, {
        type: ACTIONS.CHOOSE_FIRST_ROLE,
        payload: {
          actor: PARTICIPANTS.COMPUTER,
          role: operation.role,
        },
      });

      completeOperation(operation);
      publish({
        game,
        presentation: {
          ...idlePresentation(),
          status: PRESENTATION_STATUS.SHOWING_REVEAL,
          context: PRESENTATION_CONTEXT.ROLE_CHOICE,
          revealedRole: operation.role,
        },
        controls: { locked: true },
        error: null,
      });
    } catch (error) {
      handleAsyncError(operation, error);
    }
  }

  function createOperation(base) {
    return {
      ...base,
      token: ++operationSequence,
      timerId: undefined,
    };
  }

  function commitNumberChoice(context, playerNumber) {
    const game = requireGame();
    requireAvailableControls();

    const validPhases =
      context === PRESENTATION_CONTEXT.TOSS
        ? [PHASES.TOSS_WAITING]
        : [PHASES.FIRST_INNINGS, PHASES.SECOND_INNINGS];
    if (!validPhases.includes(game.phase)) {
      throw new GameEngineError(
        ERROR_CODES.INVALID_PHASE,
        `Number selection is not valid during ${game.phase}.`,
      );
    }
    validateNumber(playerNumber);

    const visibleHistory = Object.freeze([...game.history.playerNumbers]);
    const botContext =
      context === PRESENTATION_CONTEXT.TOSS
        ? BOT_CONTEXTS.TOSS
        : getCurrentBatter(game) === PARTICIPANTS.PLAYER
          ? BOT_CONTEXTS.COMPUTER_BOWLING
          : BOT_CONTEXTS.COMPUTER_BATTING;
    const delay = calculateDelay(dependencies.timingRandom, dependencies.delayRange);
    const botInput = Object.freeze({
      difficulty: game.difficulty,
      context: botContext,
      visibleHistory,
      random: dependencies.random,
    });
    const computerNumber = dependencies.chooseNumber(botInput);
    const operation = createOperation({
      context,
      matchId: game.matchId,
      roundId: game.currentRoundId,
      playerNumber,
      computerNumber,
      delay,
    });
    pendingOperation = operation;

    publish({
      presentation: {
        status: PRESENTATION_STATUS.COMPUTER_THINKING,
        context,
        selectedPlayerNumber: playerNumber,
        revealedPlayerNumber: null,
        revealedComputerNumber: null,
        revealedRole: null,
        pendingSince: dependencies.now(),
      },
      controls: { locked: true },
      error: null,
    });

    if (pendingOperation === operation && !destroyed) {
      scheduleOperation(operation, (token) => resolveNumberOperation(operation, token));
    }
    return success();
  }

  function beginComputerRoleChoice(game) {
    const delay = calculateDelay(dependencies.timingRandom, dependencies.delayRange);
    const role = dependencies.chooseRole(
      Object.freeze({ difficulty: game.difficulty, random: dependencies.random }),
    );
    const operation = createOperation({
      context: PRESENTATION_CONTEXT.ROLE_CHOICE,
      matchId: game.matchId,
      roundId: game.currentRoundId,
      role,
      delay,
    });
    pendingOperation = operation;

    publish({
      game,
      presentation: {
        ...idlePresentation(),
        status: PRESENTATION_STATUS.COMPUTER_THINKING,
        context: PRESENTATION_CONTEXT.ROLE_CHOICE,
        pendingSince: dependencies.now(),
      },
      controls: { locked: true },
      error: null,
    });

    if (pendingOperation === operation && !destroyed) {
      scheduleOperation(operation, (token) => resolveRoleOperation(operation, token));
    }
  }

  function advanceTossReveal(game) {
    const roleSelectionGame = gameReducer(game, {
      type: ACTIONS.ADVANCE_PRESENTATION,
    });

    if (roleSelectionGame.toss.winner === PARTICIPANTS.COMPUTER) {
      beginComputerRoleChoice(roleSelectionGame);
    } else {
      publish({
        game: roleSelectionGame,
        presentation: idlePresentation(),
        controls: { locked: false },
        error: null,
      });
    }
  }

  const controller = {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      if (destroyed) {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    selectDifficulty(difficulty) {
      return runCommand(() => {
        if (snapshot.game) {
          throw new GameEngineError(
            ERROR_CODES.INVALID_PHASE,
            'Difficulty can only be changed before a match starts.',
          );
        }
        validateDifficulty(difficulty);
        publish({
          setup: { ...snapshot.setup, difficulty },
          error: null,
        });
        return success();
      });
    },

    startMatch(options = {}) {
      return runCommand(() => {
        const playerName = options?.playerName ?? snapshot.setup.playerName;
        const matchId = dependencies.createMatchId();
        const game = createGame({
          matchId,
          playerName,
          difficulty: snapshot.setup.difficulty,
        });
        cancelPendingWork();
        publish({
          game,
          setup: { ...snapshot.setup, playerName },
          presentation: idlePresentation(),
          controls: { locked: false },
          error: null,
        });
        return success();
      });
    },

    selectParity(parity) {
      return runCommand(() => {
        const game = requireGame();
        requireAvailableControls();
        const nextGame = gameReducer(game, {
          type: ACTIONS.SELECT_PARITY,
          payload: { parity },
        });
        publish({ game: nextGame, error: null });
        return success();
      });
    },

    submitTossNumber(playerNumber) {
      return runCommand(() =>
        commitNumberChoice(PRESENTATION_CONTEXT.TOSS, playerNumber),
      );
    },

    chooseRole(role) {
      return runCommand(() => {
        const game = requireGame();
        requireAvailableControls();
        const nextGame = gameReducer(game, {
          type: ACTIONS.CHOOSE_FIRST_ROLE,
          payload: { actor: PARTICIPANTS.PLAYER, role },
        });
        publish({
          game: nextGame,
          presentation: idlePresentation(),
          controls: { locked: false },
          error: null,
        });
        return success();
      });
    },

    submitPlayNumber(playerNumber) {
      return runCommand(() =>
        commitNumberChoice(PRESENTATION_CONTEXT.DELIVERY, playerNumber),
      );
    },

    advancePresentation() {
      return runCommand(() => {
        const game = requireGame();
        if (pendingOperation) {
          failController(
            CONTROLLER_ERROR_CODES.OPERATION_PENDING,
            'The computer choice is still pending.',
          );
        }
        if (snapshot.presentation.status !== PRESENTATION_STATUS.SHOWING_REVEAL) {
          failController(
            CONTROLLER_ERROR_CODES.NOTHING_TO_ADVANCE,
            'There is no visible presentation to advance.',
          );
        }

        if (snapshot.presentation.context === PRESENTATION_CONTEXT.TOSS) {
          advanceTossReveal(game);
          return success();
        }

        if (snapshot.presentation.context === PRESENTATION_CONTEXT.ROLE_CHOICE) {
          publish({
            presentation: idlePresentation(),
            controls: { locked: false },
            error: null,
          });
          return success();
        }

        if (game.phase === PHASES.MATCH_OVER) {
          failController(
            CONTROLLER_ERROR_CODES.NOTHING_TO_ADVANCE,
            'The decisive match reveal remains visible.',
          );
        }

        const nextGame =
          game.phase === PHASES.INNINGS_BREAK
            ? gameReducer(game, { type: ACTIONS.ADVANCE_PRESENTATION })
            : game;
        publish({
          game: nextGame,
          presentation: idlePresentation(),
          controls: { locked: false },
          error: null,
        });
        return success();
      });
    },

    newMatch(options = {}) {
      return runCommand(() => {
        const nextDifficulty = options?.difficulty ?? snapshot.setup.difficulty;
        const nextPlayerName = options?.playerName ?? snapshot.setup.playerName;
        validateDifficulty(nextDifficulty);

        if (options?.returnToSetup) {
          cancelPendingWork();
          publish({
            game: null,
            setup: { difficulty: nextDifficulty, playerName: nextPlayerName },
            presentation: idlePresentation(),
            controls: { locked: false },
            error: null,
          });
          return success();
        }

        const matchId = dependencies.createMatchId();
        const configuration = {
          matchId,
          playerName: nextPlayerName,
          difficulty: nextDifficulty,
        };
        const game = snapshot.game
          ? gameReducer(snapshot.game, {
              type: ACTIONS.NEW_MATCH,
              payload: configuration,
            })
          : createGame(configuration);
        cancelPendingWork();
        publish({
          game,
          setup: { difficulty: nextDifficulty, playerName: nextPlayerName },
          presentation: idlePresentation(),
          controls: { locked: false },
          error: null,
        });
        return success();
      });
    },

    clearError() {
      return runCommand(() => {
        if (snapshot.error) {
          publish({ error: null });
        }
        return success();
      });
    },

    destroy() {
      if (destroyed) {
        return failure({
          code: CONTROLLER_ERROR_CODES.CONTROLLER_DESTROYED,
          message: 'The game controller has already been destroyed.',
        });
      }
      cancelPendingWork();
      destroyed = true;
      listeners.clear();
      return success();
    },
  };

  return controller;
}

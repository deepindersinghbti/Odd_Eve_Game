import { Component, useCallback, useState } from 'react';

import AppShell from './components/AppShell.jsx';
import { ErrorBanner } from './components/GameBits.jsx';
import GameHeader from './components/GameHeader.jsx';
import NewMatchDialog from './components/NewMatchDialog.jsx';
import RulesDialog from './components/RulesDialog.jsx';
import { PRESENTATION_CONTEXT, PRESENTATION_STATUS } from './controller/index.js';
import { PHASES } from './game/index.js';
import { useGameController, useGestureRecognition } from './hooks/index.js';
import {
  HomeScreen,
  InningsBreakScreen,
  MatchScreen,
  ParityScreen,
  RecoveryScreen,
  ResultScreen,
  RoleSelectionScreen,
  TossScreen,
} from './screens/GameScreens.jsx';
import { loadPreferences, savePreferences } from './storage/index.js';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <AppShell>
          <RecoveryScreen onRecover={() => globalThis.location.reload()} />
        </AppShell>
      );
    }
    return this.props.children;
  }
}

function GameApplication({ controller, storage, gestureRecognizerFactory }) {
  const [preferences] = useState(() => loadPreferences(storage));
  const [name, setName] = useState(preferences.playerName);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // Each input screen owns its preview element. Keep the current element in state so
  // the recognizer can reattach its existing stream when the game swaps screens.
  const [videoElement, setVideoElement] = useState(null);
  const state = useGameController({ controller, initialSetup: preferences });

  const persist = useCallback((next) => savePreferences(next, storage), [storage]);
  const chooseDifficulty = (difficulty) => {
    state.selectDifficulty(difficulty);
    persist({ difficulty, playerName: name });
  };
  const startGame = (event) => {
    event.preventDefault();
    const playerName = name.trim().slice(0, 24);
    setName(playerName);
    persist({ difficulty: state.setup.difficulty, playerName });
    state.startMatch({ playerName });
  };
  const numberInputAvailable = Boolean(
    state.game &&
    [PHASES.TOSS_WAITING, PHASES.FIRST_INNINGS, PHASES.SECOND_INNINGS].includes(
      state.game.phase,
    ) &&
    state.presentation.status === PRESENTATION_STATUS.IDLE &&
    !state.controls.locked,
  );
  const submitGestureNumber = useCallback(
    (value) => {
      if (!numberInputAvailable) return false;
      const result =
        state.game.phase === PHASES.TOSS_WAITING
          ? state.submitTossNumber(value)
          : state.submitPlayNumber(value);
      return result.ok;
    },
    [numberInputAvailable, state],
  );
  const gesture = useGestureRecognition({
    video: videoElement,
    canSubmit: numberInputAvailable,
    onSubmit: submitGestureNumber,
    matchId: state.game?.matchId ?? null,
    recognizerFactory: gestureRecognizerFactory,
  });
  const returnToSetup = () => {
    gesture.useButtons();
    state.newMatch({ returnToSetup: true });
    setResetOpen(false);
  };
  const playAgain = () => {
    gesture.useButtons();
    state.newMatch();
  };

  let screen;
  if (!state.game) {
    screen = (
      <HomeScreen
        name={name}
        difficulty={state.setup.difficulty}
        onNameChange={setName}
        onDifficulty={chooseDifficulty}
        onStart={startGame}
        onRules={() => setRulesOpen(true)}
      />
    );
  } else if (state.presentation.context === PRESENTATION_CONTEXT.ROLE_CHOICE) {
    screen = (
      <RoleSelectionScreen
        game={state.game}
        presentation={state.presentation}
        onContinue={state.advancePresentation}
      />
    );
  } else {
    switch (state.game.phase) {
      case PHASES.PARITY_SELECTION:
        screen = (
          <ParityScreen
            game={state.game}
            onChoose={state.selectParity}
            onBack={returnToSetup}
          />
        );
        break;
      case PHASES.TOSS_WAITING:
      case PHASES.TOSS_REVEAL:
        screen = (
          <TossScreen
            game={state.game}
            presentation={state.presentation}
            locked={state.controls.locked}
            onChoose={state.submitTossNumber}
            onContinue={state.advancePresentation}
            gesture={gesture}
            videoRef={setVideoElement}
            inputEligible={numberInputAvailable}
          />
        );
        break;
      case PHASES.ROLE_SELECTION:
        screen = (
          <RoleSelectionScreen
            game={state.game}
            presentation={state.presentation}
            onChoose={state.chooseRole}
            onContinue={state.advancePresentation}
          />
        );
        break;
      case PHASES.FIRST_INNINGS:
      case PHASES.SECOND_INNINGS:
        screen = (
          <MatchScreen
            game={state.game}
            presentation={state.presentation}
            locked={state.controls.locked}
            onChoose={state.submitPlayNumber}
            onAdvance={state.advancePresentation}
            gesture={gesture}
            videoRef={setVideoElement}
            inputEligible={numberInputAvailable}
          />
        );
        break;
      case PHASES.INNINGS_BREAK:
        screen = (
          <InningsBreakScreen game={state.game} onContinue={state.advancePresentation} />
        );
        break;
      case PHASES.MATCH_OVER:
        screen = (
          <ResultScreen
            game={state.game}
            onPlayAgain={playAgain}
            onChangeDifficulty={returnToSetup}
          />
        );
        break;
      default:
        screen = <RecoveryScreen onRecover={returnToSetup} />;
    }
  }

  const activeMatch = state.game && state.game.phase !== PHASES.MATCH_OVER;
  const compactHeader = Boolean(state.game);
  return (
    <AppShell
      header={
        compactHeader ? (
          <GameHeader
            compact
            onRules={() => setRulesOpen(true)}
            onNewMatch={activeMatch ? () => setResetOpen(true) : undefined}
          />
        ) : undefined
      }
    >
      <ErrorBanner error={state.error} onDismiss={state.clearError} />
      {screen}
      {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} />}
      {resetOpen && (
        <NewMatchDialog onCancel={() => setResetOpen(false)} onConfirm={returnToSetup} />
      )}
    </AppShell>
  );
}

export default function App(props) {
  return (
    <AppErrorBoundary>
      <GameApplication {...props} />
    </AppErrorBoundary>
  );
}

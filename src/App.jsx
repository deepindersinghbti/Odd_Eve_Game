import { Component, useCallback, useState } from 'react';

import AppShell from './components/AppShell.jsx';
import { ErrorBanner } from './components/GameBits.jsx';
import GameHeader from './components/GameHeader.jsx';
import NewMatchDialog from './components/NewMatchDialog.jsx';
import RulesDialog from './components/RulesDialog.jsx';
import { PRESENTATION_CONTEXT } from './controller/index.js';
import { PHASES } from './game/index.js';
import { useGameController } from './hooks/index.js';
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

function GameApplication({ controller, storage }) {
  const [preferences] = useState(() => loadPreferences(storage));
  const [name, setName] = useState(preferences.playerName);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
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
  const returnToSetup = () => {
    state.newMatch({ returnToSetup: true });
    setResetOpen(false);
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
            onPlayAgain={state.newMatch}
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

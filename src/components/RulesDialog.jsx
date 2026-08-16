import Dialog from './Dialog.jsx';

const rules = [
  'Choose Odd or Even.',
  'Both sides select a number from 1 to 6 for the toss.',
  'The toss winner chooses batting or bowling.',
  'Different numbers score the batter’s number.',
  'Matching numbers mean the batter is out.',
  'Roles switch after the first dismissal.',
  'The chaser must exceed the first-innings score.',
  'Equal scores after dismissal produce a draw.',
];

export default function RulesDialog({ onClose }) {
  return (
    <Dialog title="How to Play" label="rules-dialog-title" onClose={onClose}>
      <ol className="rules-list">
        {rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>
    </Dialog>
  );
}

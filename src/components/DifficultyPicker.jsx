import { DIFFICULTIES } from '../game/index.js';

const options = [
  [DIFFICULTIES.EASY, 'Easy', 'Relaxed, fully random choices.'],
  [DIFFICULTIES.MEDIUM, 'Medium', 'Balanced with light pattern spotting.'],
  [DIFFICULTIES.HARD, 'Hard', 'Sharper prediction, always beatable.'],
];

export default function DifficultyPicker({ value, onChange }) {
  return (
    <fieldset className="difficulty-picker">
      <legend>Choose difficulty</legend>
      <div className="difficulty-picker__grid">
        {options.map(([difficulty, label, description]) => (
          <label
            className={`difficulty-card${value === difficulty ? ' is-selected' : ''}`}
            key={difficulty}
          >
            <input
              type="radio"
              name="difficulty"
              value={difficulty}
              checked={value === difficulty}
              onChange={() => onChange(difficulty)}
            />
            <span className="difficulty-card__title">{label}</span>
            <span>{description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

import { INPUT_METHODS } from '../../gesture/index.js';

export default function InputMethodToggle({ value, onChange }) {
  return (
    <div className="input-method-toggle" role="group" aria-label="Input method">
      <button
        type="button"
        className={value === INPUT_METHODS.BUTTONS ? 'is-selected' : ''}
        aria-pressed={value === INPUT_METHODS.BUTTONS}
        onClick={() => onChange(INPUT_METHODS.BUTTONS)}
      >
        Buttons
      </button>
      <button
        type="button"
        className={value === INPUT_METHODS.CAMERA ? 'is-selected' : ''}
        aria-pressed={value === INPUT_METHODS.CAMERA}
        onClick={() => onChange(INPUT_METHODS.CAMERA)}
      >
        Camera
      </button>
    </div>
  );
}

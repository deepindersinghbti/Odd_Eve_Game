import { useEffect } from 'react';

const numbers = [1, 2, 3, 4, 5, 6];

export default function NumberPad({ disabled, onChoose, label = 'Choose a number' }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (disabled || event.repeat || !numbers.includes(Number(event.key))) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
        return;
      event.preventDefault();
      onChoose(Number(event.key));
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [disabled, onChoose]);

  return (
    <div className="number-pad" aria-label={label}>
      {numbers.map((number) => (
        <button
          className="number-button"
          type="button"
          key={number}
          disabled={disabled}
          aria-label={`Choose number ${number}`}
          onClick={() => onChoose(number)}
        >
          {number}
        </button>
      ))}
    </div>
  );
}

import { useEffect, useRef } from 'react';

export default function Dialog({ title, children, onClose, actions, label }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', closeOnEscape);
    return () => globalThis.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-card__header">
          <h2 id={label}>{title}</h2>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="dialog-card__body">{children}</div>
        {actions && <div className="dialog-card__actions">{actions}</div>}
      </section>
    </div>
  );
}

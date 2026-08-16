import Dialog from './Dialog.jsx';

export default function NewMatchDialog({ onCancel, onConfirm }) {
  return (
    <Dialog
      title="Start a new match?"
      label="new-match-dialog-title"
      onClose={onCancel}
      actions={
        <>
          <button className="button button--quiet-dark" type="button" onClick={onCancel}>
            Keep Playing
          </button>
          <button className="button button--danger" type="button" onClick={onConfirm}>
            Discard Match
          </button>
        </>
      }
    >
      <p>
        Your current score and progress will be discarded. Your name and difficulty will
        stay saved.
      </p>
    </Dialog>
  );
}

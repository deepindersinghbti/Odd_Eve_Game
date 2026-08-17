import { INPUT_METHODS } from '../../gesture/index.js';
import NumberPad from '../NumberPad.jsx';
import CameraPanel from './CameraPanel.jsx';
import InputMethodToggle from './InputMethodToggle.jsx';

export default function NumberInputControls({
  disabled,
  onChoose,
  label,
  gesture,
  videoRef,
  eligible,
}) {
  return (
    <div className="number-input-controls">
      <InputMethodToggle value={gesture.method} onChange={gesture.selectMethod} />
      {gesture.method === INPUT_METHODS.CAMERA && (
        <CameraPanel
          videoRef={videoRef}
          state={gesture.state}
          eligible={eligible}
          onEnable={gesture.enableCamera}
          onUseButtons={gesture.useButtons}
        />
      )}
      <NumberPad disabled={disabled} onChoose={onChoose} label={label} />
    </div>
  );
}

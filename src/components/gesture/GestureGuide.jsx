import { forwardRef } from 'react';

const GestureGuide = forwardRef(function GestureGuide({ hidden = false }, ref) {
  return (
    <div className={`gesture-guide${hidden ? ' gesture-guide--hidden' : ''}`}>
      <video ref={ref} autoPlay muted playsInline aria-label="Mirrored camera preview" />
      {!hidden && (
        <div className="gesture-guide__frame" aria-hidden="true">
          <span>Place one hand here</span>
        </div>
      )}
    </div>
  );
});

export default GestureGuide;

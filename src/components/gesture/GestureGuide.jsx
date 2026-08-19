import { forwardRef } from 'react';

import { GUIDE_BOX } from '../../gesture/index.js';

// The dashed frame is positioned from the SAME GUIDE_BOX constant the
// processing crop uses, so the region the player aims at is exactly the region
// analyzed. The preview uses object-fit: cover on a square element, so the
// video's short edge maps to 100% of the element -- which is the same basis
// GUIDE_BOX.sizeRatio is defined against.
const framePercent = (value) => `${(value * 100).toFixed(2)}%`;

const GestureGuide = forwardRef(function GestureGuide({ hidden = false }, ref) {
  const frameStyle = {
    width: framePercent(GUIDE_BOX.sizeRatio),
    height: framePercent(GUIDE_BOX.sizeRatio),
    left: framePercent(GUIDE_BOX.centerXRatio - GUIDE_BOX.sizeRatio / 2),
    top: framePercent(GUIDE_BOX.centerYRatio - GUIDE_BOX.sizeRatio / 2),
  };

  return (
    <div className={`gesture-guide${hidden ? ' gesture-guide--hidden' : ''}`}>
      <video ref={ref} autoPlay muted playsInline aria-label="Mirrored camera preview" />
      {!hidden && (
        <div className="gesture-guide__frame" style={frameStyle} aria-hidden="true">
          <span>Hand here · wrist at bottom</span>
        </div>
      )}
    </div>
  );
});

export default GestureGuide;

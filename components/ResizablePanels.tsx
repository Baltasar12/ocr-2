import React, { useState, useRef, useCallback, ReactNode, useEffect } from 'react';

interface ResizablePanelsProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  initialRightPanelWidth?: number; // percentage
}

const ResizablePanels: React.FC<ResizablePanelsProps> = ({
  leftPanel,
  rightPanel,
  initialRightPanelWidth = 50,
}) => {
  const [rightPanelWidth, setRightPanelWidth] = useState(initialRightPanelWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newRightPanelWidth = ((containerRect.right - e.clientX) / containerRect.width) * 100;
    
    // Clamp the width to prevent panels from becoming too small
    const clampedWidth = Math.max(25, Math.min(75, newRightPanelWidth));
    
    setRightPanelWidth(clampedWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isResizing.current = true;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className="flex w-full h-full min-h-0">
      <div className="min-h-0" style={{ width: `${100 - rightPanelWidth}%` }}>
        {leftPanel}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleMouseDown}
        className="w-2 cursor-col-resize bg-slate-200 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-200 flex-shrink-0"
        tabIndex={0}
      />
      <div className="min-h-0" style={{ width: `${rightPanelWidth}%` }}>
        {rightPanel}
      </div>
    </div>
  );
};

export default ResizablePanels;

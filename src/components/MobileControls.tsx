/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store';

interface JoystickProps {
  onMove: (x: number, y: number) => void;
  className?: string;
  label?: string;
}

function Joystick({ onMove, className, label }: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    origin.current = { x: centerX, y: centerY };
    isDragging.current = true;
    containerRef.current.setPointerCapture(e.pointerId);
    
    // Process initial touch immediately
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const maxDist = 30; // Reduced from 40 for smaller joystick
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    let x = dx;
    let y = dy;

    if (dist > maxDist) {
      const angle = Math.atan2(dy, dx);
      x = Math.cos(angle) * maxDist;
      y = Math.sin(angle) * maxDist;
    }

    setPosition({ x, y });
    
    // Normalize output -1 to 1
    // Invert Y because screen Y is down, but usually joystick up is -1 or 1 depending on convention.
    // In 3D: Forward is -Z.
    // Screen Up (negative Y) -> Forward (-Z).
    // Screen Down (positive Y) -> Backward (+Z).
    // So we can pass raw normalized values and handle mapping in Player.tsx.
    onMove(x / maxDist, y / maxDist);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    setPosition({ x: 0, y: 0 });
    onMove(0, 0);
    if (containerRef.current) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-24 h-24 bg-white/10 rounded-full flex items-center justify-center touch-none select-none backdrop-blur-sm ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* Base */}
      <div className="absolute w-full h-full rounded-full border-2 border-white/20" />
      
      {/* Stick */}
      <div 
        className="absolute w-8 h-8 bg-lime-400/50 rounded-full shadow-[0_0_15px_rgba(163,230,53,0.5)]"
        style={{ 
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      />
      
      {label && (
        <div className="absolute -bottom-6 text-white/50 text-[10px] font-bold uppercase tracking-widest pointer-events-none">
          {label}
        </div>
      )}
    </div>
  );
}

function TouchPad() {
  const setMobileInput = useGameStore(state => state.setMobileInput);
  const activePointerId = useRef<number | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    activePointerId.current = e.pointerId;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    
    lastPointer.current = { x: e.clientX, y: e.clientY };
    
    // Scale delta value to register clean look swings
    setMobileInput({ 
      look: { 
        x: dx * 0.15, 
        y: dy * 0.15 
      } 
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activePointerId.current === e.pointerId) {
      e.stopPropagation();
      activePointerId.current = null;
      setMobileInput({ look: { x: 0, y: 0 } });
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div 
      className="absolute top-0 right-0 w-1/2 h-full pointer-events-auto select-none touch-none bg-transparent"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }}
    />
  );
}

export function MobileControls() {
  const setMobileInput = useGameStore(state => state.setMobileInput);
  const [shooting, setShooting] = useState(false);

  useEffect(() => {
    setMobileInput({ shooting });
  }, [shooting, setMobileInput]);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 select-none">
      {/* Left Stick (Move) */}
      <div 
        className="absolute bottom-8 left-8 pointer-events-auto"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Joystick 
          label="Move"
          onMove={(x, y) => setMobileInput({ move: { x, y } })} 
        />
      </div>

      {/* Right Screen TouchPad */}
      <TouchPad />

      {/* Action Buttons: Jump & Shoot staggered */}
      <div className="absolute bottom-8 right-8 flex items-center gap-4 pointer-events-auto z-30">
        {/* Jump */}
        <button
          className="w-16 h-16 rounded-full border-4 border-lime-500/50 bg-lime-500/10 flex items-center justify-center active:scale-95 transition-all touch-none select-none shadow-[0_0_15px_rgba(163,230,53,0.15)]"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setMobileInput({ jumping: true });
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            e.currentTarget.releasePointerCapture(e.pointerId);
            setMobileInput({ jumping: false });
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            e.currentTarget.releasePointerCapture(e.pointerId);
            setMobileInput({ jumping: false });
          }}
          style={{ touchAction: 'none' }}
        >
          <span className="text-lime-400 font-black text-xs tracking-tighter">JUMP</span>
        </button>

        {/* Shoot (Red glowing) */}
        <button
          className={`w-20 h-20 rounded-full border-4 border-red-500 flex items-center justify-center active:scale-95 transition-all touch-none select-none ${
            shooting ? 'bg-red-500/50 scale-95 shadow-[0_0_25px_rgba(239,68,68,0.75)]' : 'bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
          }`}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setShooting(true);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            e.currentTarget.releasePointerCapture(e.pointerId);
            setShooting(false);
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            e.currentTarget.releasePointerCapture(e.pointerId);
            setShooting(false);
          }}
          style={{ touchAction: 'none' }}
        >
          <div className="w-12 h-12 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
        </button>
      </div>
    </div>
  );
}

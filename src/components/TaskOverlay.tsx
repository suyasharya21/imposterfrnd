import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

export function TaskOverlay() {
  const isDoingTask = useGameStore(state => state.isDoingTask);
  const currentTaskId = useGameStore(state => state.currentTaskId);
  const socket = useGameStore(state => state.socket);
  const tasks = useGameStore(state => state.tasks);

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isDoingTask || !currentTaskId) return;

    setProgress(0);
    const startTime = Date.now();
    const duration = 5000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);

      if (elapsed >= duration) {
        clearInterval(interval);
        
        if (socket) {
          socket.emit('taskCompleted', currentTaskId);
        }

        const updatedTasks = tasks.filter(t => t.id !== currentTaskId);
        useGameStore.setState({
          tasks: updatedTasks,
          isDoingTask: false,
          currentTaskId: null,
          score: useGameStore.getState().score + 100,
          events: [...useGameStore.getState().events, {
            id: Math.random().toString(),
            message: "Task completed! Grid synced.",
            timestamp: Date.now()
          }]
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isDoingTask, currentTaskId, socket, tasks]);

  if (!isDoingTask) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[150] pointer-events-auto">
      <div className="bg-[#050f05] border-2 border-emerald-500 p-8 rounded-xl shadow-[0_0_35px_rgba(16,185,129,0.3)] max-w-md w-full font-mono relative overflow-hidden flex flex-col gap-6">
        
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(16,185,129,0.03)_50%,transparent_50%)] bg-[length:100%_4px] opacity-40" />

        <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4 relative z-10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-emerald-500 font-bold uppercase tracking-widest text-sm">System Decryption</h3>
          </div>
          <span className="text-emerald-500/40 text-[10px]">ID: {currentTaskId?.substring(0, 8)}</span>
        </div>

        <div className="bg-black/85 border border-emerald-500/20 rounded p-4 h-40 overflow-y-auto text-emerald-400 text-xs flex flex-col gap-1.5 relative z-10 leading-relaxed">
          <p className="text-emerald-500/60 font-black">&gt; INITIALIZING SYNC SEQUENCE...</p>
          <p>&gt; CONNECTING TO CORE INTERFACE...</p>
          {progress > 20 && <p>&gt; ACCESSING ENCRYPTED SECTOR...</p>}
          {progress > 50 && <p>&gt; DOWNLOADING GRID SCHEMATICS...</p>}
          {progress > 80 && <p>&gt; RE-ROUTING POWER PATHWAYS...</p>}
          {progress >= 100 && <p className="text-emerald-500 font-black animate-pulse">&gt; SYNCHRONIZATION 100% COMPLETE!</p>}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-emerald-500/60">&gt; Status:</span>
            <span className="text-emerald-400 animate-pulse">{progress < 100 ? 'DECRYPTING...' : 'COMPLETED'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 relative z-10">
          <div className="flex justify-between items-center text-xs">
            <span className="text-emerald-500/60 uppercase font-black tracking-wide">Sync Progress</span>
            <span className="text-emerald-400 font-black">{Math.floor(progress)}%</span>
          </div>
          <div className="w-full bg-emerald-950/40 border border-emerald-500/30 h-4 rounded overflow-hidden">
            <div 
              className="bg-emerald-500 h-full shadow-[0_0_15px_rgba(16,185,129,0.8)] transition-all duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="text-[10px] text-emerald-500/40 border-t border-emerald-500/10 pt-4 text-center leading-normal">
          <p className="font-bold text-emerald-500/60 uppercase tracking-widest animate-pulse mb-1">[ DETECTOR WARNING ]</p>
          <p>PILOT MUST REMAIN PERFECTLY STILL. ANY MOVEMENT DETECTED WILL SEVER INTERFACE AND RESET DECRYPTION.</p>
        </div>
      </div>
    </div>
  );
}

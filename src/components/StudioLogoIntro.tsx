import { useEffect, useRef, useState } from 'react';

export function StudioLogoIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    const img = new Image();
    img.src = '/logo.png';
    img.onload = () => {
      logoImgRef.current = img;
      setLogoLoaded(true);
    };
  }, []);

  const playTudumSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      // Deep bass beats
      const playBeat = (time: number, freq: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.65, time + dur);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + dur);
      };

      // Cyber lowpass sweeps
      const playSweep = (time: number, dur: number) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(80, time);
        osc1.frequency.exponentialRampToValueAtTime(280, time + dur * 0.45);

        osc2.type = 'square';
        osc2.frequency.setValueAtTime(81.5, time);
        osc2.frequency.exponentialRampToValueAtTime(278, time + dur * 0.45);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, time);
        filter.frequency.exponentialRampToValueAtTime(2200, time + 0.25);
        filter.frequency.exponentialRampToValueAtTime(70, time + dur);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.25, time + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, time + dur);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + dur);
        osc2.stop(time + dur);
      };

      const now = ctx.currentTime;
      // Play TU-DUM double pulse
      playBeat(now, 72, 0.45, 0.8);
      playBeat(now + 0.13, 56, 1.8, 0.9);
      playSweep(now + 0.13, 2.4);
    } catch (e) {
      console.warn('Audio play blocked:', e);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let startTime = Date.now();

    // Particle pool for intro convergence
    const particles: Array<{
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      speed: number;
      color: string;
      size: number;
    }> = [];

    const initParticles = (width: number, height: number) => {
      const centerX = width / 2;
      const centerY = height / 2 - 60;
      for (let i = 0; i < 180; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 280 + Math.random() * 220;
        particles.push({
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          targetX: centerX + (Math.random() - 0.5) * 180,
          targetY: centerY + (Math.random() - 0.5) * 180,
          speed: 0.025 + Math.random() * 0.03,
          color: Math.random() > 0.5 ? '#a3e635' : '#67e8f9',
          size: 1 + Math.random() * 2,
        });
      }
    };

    let particlesInitialized = false;

    const render = () => {
      const elapsed = Date.now() - startTime;
      const width = canvas.width = canvas.clientWidth;
      const height = canvas.height = canvas.clientHeight;
      const centerX = width / 2;
      const centerY = height / 2 - 60;
      const logoSize = Math.min(220, width * 0.5);

      if (!particlesInitialized && width > 0) {
        initParticles(width, height);
        particlesInitialized = true;
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Subtle grids
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Phase 1: Convergence
      if (elapsed < 1500) {
        const progress = elapsed / 1500;
        particles.forEach(p => {
          p.x += (p.targetX - p.x) * p.speed;
          p.y += (p.targetY - p.y) * p.speed;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.strokeStyle = `rgba(163, 230, 53, ${progress * 0.2})`;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 120 - progress * 50, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerX - 130, centerY);
        ctx.lineTo(centerX - 100, centerY);
        ctx.moveTo(centerX + 100, centerY);
        ctx.lineTo(centerX + 130, centerY);
        ctx.moveTo(centerX, centerY - 130);
        ctx.lineTo(centerX, centerY - 100);
        ctx.moveTo(centerX, centerY + 100);
        ctx.lineTo(centerX, centerY + 130);
        ctx.stroke();
      }

      // Phase 2: Reveal & Scan
      if (elapsed >= 1500) {
        if (!soundPlayedRef.current) {
          playTudumSound();
          soundPlayedRef.current = true;
        }

        const revealProgress = Math.min(1, (elapsed - 1500) / 1000);
        const shockSize = (elapsed - 1500) * 0.75;
        
        if (shockSize < width * 0.9) {
          ctx.strokeStyle = `rgba(103, 233, 249, ${Math.max(0, 1 - shockSize / (width * 0.9))})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(centerX, centerY, shockSize, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.save();
        ctx.globalAlpha = revealProgress;
        ctx.shadowColor = '#a3e635';
        ctx.shadowBlur = 25 + Math.sin(elapsed * 0.01) * 12;

        if (logoImgRef.current && logoLoaded) {
          let drawX = centerX - logoSize / 2;
          let drawY = centerY - logoSize / 2;

          if (elapsed > 3000 && Math.random() < 0.15) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
            ctx.drawImage(logoImgRef.current, drawX - 8, drawY, logoSize, logoSize);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
            ctx.drawImage(logoImgRef.current, drawX + 8, drawY, logoSize, logoSize);
            drawX += (Math.random() - 0.5) * 10;
            drawY += (Math.random() - 0.5) * 5;
          }

          ctx.drawImage(logoImgRef.current, drawX, drawY, logoSize, logoSize);
        }
        ctx.restore();

        // Laser Sweep matching logo size
        const scanY = centerY - (logoSize / 2) + revealProgress * logoSize;
        if (elapsed < 3000) {
          const scanGrad = ctx.createLinearGradient(centerX - logoSize / 2, scanY, centerX + logoSize / 2, scanY);
          scanGrad.addColorStop(0, 'rgba(163, 230, 53, 0)');
          scanGrad.addColorStop(0.5, '#a3e635');
          scanGrad.addColorStop(1, 'rgba(163, 230, 53, 0)');

          ctx.strokeStyle = scanGrad;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(centerX - logoSize / 2, scanY);
          ctx.lineTo(centerX + logoSize / 2, scanY);
          ctx.stroke();

          if (Math.random() < 0.6) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(centerX + (Math.random() - 0.5) * logoSize, scanY, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Phase 3: Labels
      if (elapsed >= 2200) {
        ctx.textAlign = 'center';
        
        ctx.fillStyle = 'rgba(163, 230, 53, 0.45)';
        ctx.font = 'black 11px monospace';
        ctx.letterSpacing = '0.4em';
        ctx.fillText('DEVELOPED BY', centerX, centerY + (logoSize / 2) + 35);

        ctx.font = 'black 34px monospace';
        ctx.letterSpacing = '0.25em';
        const textX = centerX;
        const textY = centerY + (logoSize / 2) + 75;

        if (elapsed > 3000 && Math.random() < 0.12) {
          ctx.fillStyle = '#ef4444';
          ctx.fillText('ARYA GAME CO.', textX - 3, textY);
          ctx.fillStyle = '#3b82f6';
          ctx.fillText('ARYA GAME CO.', textX + 3, textY);
        }

        ctx.fillStyle = '#a3e635';
        ctx.shadowColor = '#a3e635';
        ctx.shadowBlur = 15;
        ctx.fillText('ARYA GAME CO.', textX, textY);
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(163, 230, 53, 0.3)';
        ctx.font = '10px monospace';
        ctx.letterSpacing = '0.15em';
        ctx.fillText('© 2026 COMBAT CORE MODULE', centerX, centerY + (logoSize / 2) + 105);
      }

      // Terminal logs
      ctx.fillStyle = 'rgba(163, 230, 53, 0.4)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      
      const logTicks = [
        'INIT CORE SYNCHRONIZER...',
        'CONNECTING INTRO BUFFER...',
        'RENDERING LOGO SPRITES [HD OK]',
        'AUDIO EMITTER ONLINE',
        'SYSTEM READY: MAIN INTERFACE BOOT'
      ];
      const logIdx = Math.min(logTicks.length - 1, Math.floor(elapsed / 800));
      for (let i = 0; i <= logIdx; i++) {
        ctx.fillText(`> ${logTicks[i]}`, 20, height - 70 + i * 11);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [logoLoaded]);

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden z-[350]">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.015)_50%,transparent_50%)] bg-[length:100%_4px] z-50 animate-cyber-pulse" />
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}

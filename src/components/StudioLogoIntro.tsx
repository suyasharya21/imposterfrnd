import { useEffect, useRef, useState } from 'react';

export function StudioLogoIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = '/logo.png';
    img.onload = () => {
      logoImgRef.current = img;
      setLogoLoaded(true);
    };
  }, []);

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

    // Initialize convergence particles
    const initParticles = (width: number, height: number) => {
      const centerX = width / 2;
      const centerY = height / 2 - 20;
      for (let i = 0; i < 150; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 250 + Math.random() * 200;
        particles.push({
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          targetX: centerX + (Math.random() - 0.5) * 120,
          targetY: centerY + (Math.random() - 0.5) * 120,
          speed: 0.02 + Math.random() * 0.03,
          color: Math.random() > 0.5 ? '#a3e635' : '#67e8f9',
          size: 1 + Math.random() * 2,
        });
      }
    };

    let particlesInitialized = false;

    const render = () => {
      const elapsed = Date.now() - startTime; // milliseconds
      const width = canvas.width = canvas.clientWidth;
      const height = canvas.height = canvas.clientHeight;
      const centerX = width / 2;
      const centerY = height / 2 - 30;

      if (!particlesInitialized && width > 0) {
        initParticles(width, height);
        particlesInitialized = true;
      }

      // Background fill
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Draw subtle grid overlay
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

      // Phase 1: Convergence (0s - 1.5s)
      if (elapsed < 1500) {
        const progress = elapsed / 1500;
        
        // Draw convergence particles
        particles.forEach(p => {
          p.x += (p.targetX - p.x) * p.speed;
          p.y += (p.targetY - p.y) * p.speed;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });

        // Glowing vector target lines
        ctx.strokeStyle = `rgba(163, 230, 53, ${progress * 0.2})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 80 - progress * 40, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs
        ctx.beginPath();
        ctx.moveTo(centerX - 90, centerY);
        ctx.lineTo(centerX - 70, centerY);
        ctx.moveTo(centerX + 70, centerY);
        ctx.lineTo(centerX + 90, centerY);
        ctx.moveTo(centerX, centerY - 90);
        ctx.lineTo(centerX, centerY - 70);
        ctx.moveTo(centerX, centerY + 70);
        ctx.lineTo(centerX, centerY + 90);
        ctx.stroke();
      }

      // Phase 2: Logo Reveal & Laser Scan (1.5s - 3.0s)
      if (elapsed >= 1500) {
        const revealProgress = Math.min(1, (elapsed - 1500) / 1000); // 0 to 1

        // 1. Draw expanding sonic shockwave ring right at 1.5s
        const shockSize = (elapsed - 1500) * 0.6;
        if (shockSize < width * 0.8) {
          ctx.strokeStyle = `rgba(103, 233, 249, ${Math.max(0, 1 - shockSize / (width * 0.8))})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(centerX, centerY, shockSize, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 2. Draw HD Logo with glowing shadows
        ctx.save();
        ctx.globalAlpha = revealProgress;

        // Draw shadow glow behind logo
        const logoSize = 100;
        ctx.shadowColor = '#a3e635';
        ctx.shadowBlur = 20 + Math.sin(elapsed * 0.01) * 10;
        
        if (logoImgRef.current && logoLoaded) {
          // Add occasional digital glitch lines offset
          let drawX = centerX - logoSize / 2;
          let drawY = centerY - logoSize / 2;
          
          // Glitch split effect (3.0s - 4.0s)
          if (elapsed > 3000 && Math.random() < 0.15) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'; // Red channel shadow
            ctx.drawImage(logoImgRef.current, drawX - 6, drawY, logoSize, logoSize);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.4)'; // Blue channel shadow
            ctx.drawImage(logoImgRef.current, drawX + 6, drawY, logoSize, logoSize);
            
            drawX += (Math.random() - 0.5) * 8;
            drawY += (Math.random() - 0.5) * 4;
          }

          ctx.drawImage(logoImgRef.current, drawX, drawY, logoSize, logoSize);
        }
        ctx.restore();

        // 3. Horizontal laser scan bar moving down
        const scanY = centerY - 50 + revealProgress * 100;
        if (elapsed < 3000) {
          const scanGrad = ctx.createLinearGradient(centerX - 80, scanY, centerX + 80, scanY);
          scanGrad.addColorStop(0, 'rgba(163, 230, 53, 0)');
          scanGrad.addColorStop(0.5, '#a3e635');
          scanGrad.addColorStop(1, 'rgba(163, 230, 53, 0)');
          
          ctx.strokeStyle = scanGrad;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(centerX - 80, scanY);
          ctx.lineTo(centerX + 80, scanY);
          ctx.stroke();

          // Spark particles along scan bar
          if (Math.random() < 0.6) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(centerX + (Math.random() - 0.5) * 120, scanY, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Phase 3: Text reveal & Chromatic aberration (2.5s - 4.0s)
      if (elapsed >= 2200) {
        ctx.textAlign = 'center';
        
        // Developed by title text
        ctx.fillStyle = 'rgba(163, 230, 53, 0.45)';
        ctx.font = 'black 11px monospace';
        ctx.letterSpacing = '0.4em';
        ctx.fillText('DEVELOPED BY', centerX, centerY + 80);

        // Core Studio Title text (with aberration glitch effect)
        ctx.font = 'black 32px monospace';
        ctx.letterSpacing = '0.25em';

        const textX = centerX;
        const textY = centerY + 120;

        if (elapsed > 3000 && Math.random() < 0.12) {
          // Aberrated Red Text offset
          ctx.fillStyle = '#ef4444';
          ctx.fillText('ARYA GAME CO.', textX - 3, textY);
          // Aberrated Blue Text offset
          ctx.fillStyle = '#3b82f6';
          ctx.fillText('ARYA GAME CO.', textX + 3, textY);
        }

        ctx.fillStyle = '#a3e635';
        ctx.shadowColor = '#a3e635';
        ctx.shadowBlur = 12;
        ctx.fillText('ARYA GAME CO.', textX, textY);
        ctx.shadowBlur = 0; // reset

        // Footer copyright module
        ctx.fillStyle = 'rgba(163, 230, 53, 0.3)';
        ctx.font = '10px monospace';
        ctx.letterSpacing = '0.15em';
        ctx.fillText('© 2026 COMBAT CORE MODULE', centerX, centerY + 150);
      }

      // Diagnostics scroll log in bottom-left
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
      {/* Scanline CRT overlay filter */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.015)_50%,transparent_50%)] bg-[length:100%_4px] z-50 animate-cyber-pulse" />
      
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block"
      />
    </div>
  );
}

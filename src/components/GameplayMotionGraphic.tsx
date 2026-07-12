import { useEffect, useRef } from 'react';

export function GameplayMotionGraphic() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // Laser shots list
    const lasers: Array<{
      startX: number;
      startY: number;
      targetX: number;
      targetY: number;
      progress: number;
      color: string;
    }> = [];

    // Particle bursts list
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      alpha: number;
      color: string;
      size: number;
    }> = [];

    const draw = () => {
      time += 0.02;
      const width = canvas.width;
      const height = canvas.height;

      // Clear canvas
      ctx.fillStyle = '#020502';
      ctx.fillRect(0, 0, width, height);

      // 1. Draw moving 3D-perspective grid
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.08)';
      ctx.lineWidth = 1;
      
      const gridRows = 16;
      const gridCols = 16;
      const horizonY = height * 0.35;
      const speed = (time * 40) % 40;

      // Vertical perspective lines
      for (let i = 0; i <= gridCols; i++) {
        const xOffset = (i / gridCols - 0.5) * 2; // -1 to 1
        const startX = width / 2 + xOffset * 30;
        const endX = width / 2 + xOffset * (width * 0.95);
        ctx.beginPath();
        ctx.moveTo(startX, horizonY);
        ctx.lineTo(endX, height);
        ctx.stroke();
      }

      // Horizontal moving lines
      for (let i = 0; i <= gridRows; i++) {
        const linePos = (i * 40 + speed) / (gridRows * 40);
        const y = horizonY + linePos * (height - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Draw animated vector obstacles (boxes)
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.05)';
      ctx.lineWidth = 1.5;

      const drawBox = (cx: number, cy: number, size: number) => {
        ctx.beginPath();
        ctx.rect(cx - size / 2, cy - size / 2, size, size);
        ctx.fill();
        ctx.stroke();
        // Inner detail lines
        ctx.beginPath();
        ctx.moveTo(cx - size / 2, cy - size / 2);
        ctx.lineTo(cx + size / 2, cy + size / 2);
        ctx.moveTo(cx + size / 2, cy - size / 2);
        ctx.lineTo(cx - size / 2, cy + size / 2);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.stroke();
      };
      drawBox(width * 0.22, height * 0.65, 30);
      drawBox(width * 0.78, height * 0.6, 25);

      // 3. Draw player chassis (center)
      const px = width / 2;
      const py = height * 0.85;
      const tilt = Math.sin(time * 2.5) * 8; // tilting motion

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((tilt * Math.PI) / 180);

      // Thruster flame particles
      const flameGrad = ctx.createRadialGradient(0, 18, 0, 0, 18, 12);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.3, '#a3e635');
      flameGrad.addColorStop(1, 'rgba(163, 230, 53, 0)');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.arc(0, 18 + Math.sin(time * 20) * 3, 10, 0, Math.PI * 2);
      ctx.fill();

      // Main ship body vector
      ctx.strokeStyle = '#a3e635';
      ctx.fillStyle = 'rgba(163, 230, 53, 0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -15); // Nose
      ctx.lineTo(12, 10);  // Right wing
      ctx.lineTo(5, 5);    // Inner right
      ctx.lineTo(-5, 5);   // Inner left
      ctx.lineTo(-12, 10); // Left wing
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Pilot cockpit
      ctx.fillStyle = '#67e8f9';
      ctx.beginPath();
      ctx.arc(0, -2, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 4. Draw enemies with target lock overlays
      const bots = [
        { id: 'BOT-01', x: width * 0.35 + Math.sin(time * 1.5) * 20, y: height * 0.45 + Math.cos(time * 0.8) * 10, color: '#f87171' },
        { id: 'BOT-02', x: width * 0.65 + Math.cos(time * 1.2) * 15, y: height * 0.52 + Math.sin(time * 1.5) * 8, color: '#f87171' }
      ];

      bots.forEach((bot, index) => {
        // Draw Bot shape
        ctx.strokeStyle = bot.color;
        ctx.fillStyle = 'rgba(248, 113, 113, 0.1)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bot.x, bot.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner glowing core
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(bot.x, bot.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Target sight lock indicators
        const lockProgress = (time * 1.8 + index * Math.PI) % (Math.PI * 2);
        const lockSize = 18 + Math.sin(lockProgress) * 3;
        
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bot.x, bot.y, lockSize, 0, Math.PI * 2);
        ctx.stroke();

        // Lock corners
        const cornerLen = 4;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(bot.x - lockSize, bot.y - lockSize + cornerLen);
        ctx.lineTo(bot.x - lockSize, bot.y - lockSize);
        ctx.lineTo(bot.x - lockSize + cornerLen, bot.y - lockSize);
        // Top-right
        ctx.moveTo(bot.x + lockSize, bot.y - lockSize + cornerLen);
        ctx.lineTo(bot.x + lockSize, bot.y - lockSize);
        ctx.lineTo(bot.x + lockSize - cornerLen, bot.y - lockSize);
        // Bottom-left
        ctx.moveTo(bot.x - lockSize, bot.y + lockSize - cornerLen);
        ctx.lineTo(bot.x - lockSize, bot.y + lockSize);
        ctx.lineTo(bot.x - lockSize + cornerLen, bot.y + lockSize);
        // Bottom-right
        ctx.moveTo(bot.x + lockSize, bot.y + lockSize - cornerLen);
        ctx.lineTo(bot.x + lockSize, bot.y + lockSize);
        ctx.lineTo(bot.x + lockSize - cornerLen, bot.y + lockSize);
        ctx.stroke();

        // ID tag
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.font = '7px monospace';
        ctx.fillText(`${bot.id} // LOCK`, bot.x + lockSize + 4, bot.y + 2);

        // Randomly fire lasers from player to bot
        if (Math.random() < 0.02 && lasers.length < 3) {
          lasers.push({
            startX: px + (Math.random() - 0.5) * 12,
            startY: py - 12,
            targetX: bot.x,
            targetY: bot.y,
            progress: 0,
            color: '#a3e635'
          });
        }
      });

      // 5. Update and Draw lasers
      ctx.lineWidth = 2;
      for (let i = lasers.length - 1; i >= 0; i--) {
        const laser = lasers[i];
        laser.progress += 0.12;

        if (laser.progress >= 1) {
          // Trigger particle burst on target hit
          for (let p = 0; p < 8; p++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 2.5;
            particles.push({
              x: laser.targetX,
              y: laser.targetY,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              alpha: 1.0,
              color: '#a3e635',
              size: 1 + Math.random() * 2
            });
          }
          lasers.splice(i, 1);
          continue;
        }

        const currX = laser.startX + (laser.targetX - laser.startX) * laser.progress;
        const currY = laser.startY + (laser.targetY - laser.startY) * laser.progress;
        const prevX = laser.startX + (laser.targetX - laser.startX) * Math.max(0, laser.progress - 0.2);
        const prevY = laser.startY + (laser.targetY - laser.startY) * Math.max(0, laser.progress - 0.2);

        ctx.strokeStyle = laser.color;
        ctx.shadowColor = laser.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(currX, currY);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      }

      // 6. Update and Draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.04;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0; // reset

      // 7. Tactical logs overlay
      ctx.fillStyle = 'rgba(163, 230, 53, 0.8)';
      ctx.font = '7px monospace';
      
      const logFeeds = [
        `SYS.STATUS: INJECTING CONTROLS...`,
        `TARGETING DATA SYNCED [BOT COUNT: 2]`,
        `NEURAL FEED: SECURE // 60FPS`,
        `COORDINATES: X: ${Math.floor(width/2 + Math.sin(time)*50)}, Z: ${Math.floor(height * 0.8 + Math.cos(time)*30)}`
      ];

      const activeLogIndex = Math.floor(time * 0.5) % logFeeds.length;
      ctx.fillText(`> ${logFeeds[activeLogIndex]}`, 10, height - 10);

      // Flashing live tag
      if (Math.floor(time * 3) % 2 === 0) {
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(width - 45, 12, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText('LIVE FEED', width - 36, 14);
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative border-2 border-lime-400/25 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(163,230,53,0.15)] bg-black">
      {/* Viewport scanline screen cover */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.02)_50%,transparent_50%)] bg-[length:100%_4px]" />
      
      <canvas 
        ref={canvasRef} 
        width={340} 
        height={190} 
        className="block opacity-90 max-w-full"
      />
    </div>
  );
}

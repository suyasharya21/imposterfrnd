/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// Seeded PRNG for consistent multiplayer obstacle generation
export function mulberry32(a: number) {
  return function() {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ARENA_SIZE = 200;
export const ARENA_HALF_SIZE = 100;

export interface ObstacleData {
  type: 'box' | 'cylinder';
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  color: string;
  graffitiType?: 'bow' | 'chakra' | 'hanuman' | 'om' | 'lotus' | 'shiva_eye' | 'trishula' | 'tag1' | 'tag2' | 'cyber' | 'skull' | 'neon_bolt' | 'neon_eye' | 'neon_grid' | 'neon_skull' | 'neon_gun';
}

export const getObstacles = (_isMobile: boolean, seed: number = 12345): ObstacleData[] => {
  const count = 120; // Increased for a denser arena
  const rng = mulberry32(seed);
  const graffitiTypes: ('bow' | 'chakra' | 'hanuman' | 'om' | 'lotus' | 'shiva_eye' | 'trishula' | 'tag1' | 'tag2' | 'cyber' | 'skull' | 'neon_bolt' | 'neon_eye' | 'neon_grid' | 'neon_skull' | 'neon_gun')[] = ['bow', 'chakra', 'hanuman', 'om', 'lotus', 'shiva_eye', 'trishula', 'tag1', 'tag2', 'cyber', 'skull', 'neon_bolt', 'neon_eye', 'neon_grid', 'neon_skull', 'neon_gun'];
  
  const obstacles: ObstacleData[] = [];
  const BOUNDARY_MARGIN = 10; // Closer to outer walls
  const OBSTACLE_GAP = 4;    // Reduced gap for much higher density
  const SPAWN_RADIUS = ARENA_HALF_SIZE - BOUNDARY_MARGIN;

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 20) {
      attempts++;
      
      const type = rng() > 0.85 ? 'cylinder' : 'box';
      const isHorizontal = rng() > 0.5;
      
      let width, depth, height;
      if (type === 'box') {
        const isCluster = rng() > 0.9;
        width = isCluster ? rng() * 10 + 10 : (isHorizontal ? rng() * 15 + 5 : rng() * 1.5 + 0.5);
        depth = isCluster ? rng() * 10 + 10 : (isHorizontal ? rng() * 1.5 + 0.5 : rng() * 15 + 5);
        height = isCluster ? rng() * 3 + 2 : (rng() * 10 + 4);
      } else {
        width = depth = rng() * 6 + 2; // radius * 2
        height = rng() * 12 + 6;
      }
      
      const rangeX = SPAWN_RADIUS - width / 2;
      const rangeZ = SPAWN_RADIUS - depth / 2;
      
      const x = (rng() - 0.5) * 2 * rangeX;
      const z = (rng() - 0.5) * 2 * rangeZ;

      if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;

      let collision = false;
      for (const obs of obstacles) {
        const dx = Math.abs(x - obs.position[0]);
        const dz = Math.abs(z - obs.position[2]);
        const minDistanceX = (width + obs.size[0]) / 2 + OBSTACLE_GAP;
        const minDistanceZ = (depth + obs.size[2]) / 2 + OBSTACLE_GAP;
        
        if (dx < minDistanceX && dz < minDistanceZ) {
          collision = true;
          break;
        }
      }

      if (!collision) {
        const color = rng() > 0.5 ? '#39ff14' : '#ff0055';
        let graffitiType: typeof graffitiTypes[number] | undefined;
        if (type === 'box' && (width > 5 || depth > 5) && rng() > 0.15) {
          graffitiType = graffitiTypes[Math.floor(rng() * graffitiTypes.length)];
        }

        obstacles.push({
          type,
          position: [x, height / 2 - 0.1, z],
          size: [width, height, depth],
          rotation: [0, (rng() > 0.9 && type === 'box' ? Math.PI / 4 : 0), 0],
          color,
          graffitiType,
        });
        break;
      }
    }
  }
  
  return obstacles;
};

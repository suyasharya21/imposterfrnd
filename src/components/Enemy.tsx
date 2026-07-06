/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData } from '../store';
import { Text, Float } from '@react-three/drei';

const ENEMY_SPEED = 6.75;
const CHASE_DIST = 160;
const SHOOT_DIST = 25;
const SHOOT_COOLDOWN = 3500; 
const AIM_TIME = 1000; 
const BOT_FLOAT_HEIGHT = 0.05; 

export function Enemy({ data }: { data: EnemyData }) {
  const body = useRef<RapierRigidBody>(null);
  const { world, rapier } = useRapier();
  
  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const playerPosition = useGameStore(state => state.playerPosition);
  const coins = useGameStore(state => state.coins);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);
  const votingPhase = useGameStore(state => state.votingPhase);
  const isAlive = useGameStore(state => state.isAlive);
  const role = useGameStore(state => state.role);

  const lastShootTime = useRef(0);
  const isAiming = useRef(false);
  const aimStartTime = useRef(0);
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);
  const state = useRef<'patrol' | 'chase' | 'search' | 'collect'>('patrol');
  const lastKnownEnemyPos = useRef<THREE.Vector3 | null>(null);
  const searchStartTime = useRef(0);
  const spotDelay = useRef(0);
  const hasLineOfSight = useRef(false);
  const visorRef = useRef<THREE.Mesh>(null);
  const antennaRef = useRef<THREE.Group>(null);
  const thrusterRef = useRef<THREE.Mesh>(null);

  const groupRef = useRef<THREE.Group>(null);
  const gunGroupRef = useRef<THREE.Group>(null);
  const lastPos = useRef(new THREE.Vector3());
  const stuckTime = useRef(0);
  const muzzleRef = useRef<THREE.Group>(null);
  const lastSyncTime = useRef(0);

  // Initialize patrol target (start with a point somewhere in the arena)
  useMemo(() => {
    patrolTarget.current.set(
      (Math.random() - 0.5) * 180,
      BOT_FLOAT_HEIGHT,
      (Math.random() - 0.5) * 180
    );
  }, [data.id]); // only re-run if id changes (shouldn't)

  useFrame((state_fiber, delta) => {
    const fiberTime = state_fiber.clock.elapsedTime;
    
    if (!body.current || gameState !== 'playing') return;

    if (votingPhase || !isAlive) {
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    if (data.state === 'disabled') {
      if (body.current) {
        body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
        
        // Ensure they aren't frozen deep underground
        const currentTranslation = body.current.translation();
        if (currentTranslation.y < -0.1) {
          body.current.setTranslation({ x: currentTranslation.x, y: 0.1, z: currentTranslation.z }, true);
        }

        if (body.current.bodyType() !== rapier.RigidBodyType.Fixed) {
          body.current.setBodyType(rapier.RigidBodyType.Fixed, true);
        }
      }
      if (groupRef.current) {
        // Look like a dead body - tilt and static
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -Math.PI / 2.2, 0.1);
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0, 0.1);
      }
      return;
    }

    if (data.state === 'active') {
      if (body.current && body.current.bodyType() === rapier.RigidBodyType.Fixed) {
         body.current.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
      if (groupRef.current) {
        groupRef.current.rotation.x = 0;
        groupRef.current.rotation.z = 0;
        groupRef.current.position.y = 0;
      }
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const targetHeight = BOT_FLOAT_HEIGHT;
    
    // Procedural animations
    if (antennaRef.current) {
      antennaRef.current.rotation.z = Math.sin(fiberTime * 4) * 0.1;
      antennaRef.current.rotation.x = Math.cos(fiberTime * 3) * 0.05;
    }

    if (thrusterRef.current) {
      const scale = 1 + Math.sin(fiberTime * 20) * 0.1;
      thrusterRef.current.scale.set(scale, scale, scale);
    }

    // visors and glowing parts colors
    const isCombat = state.current === 'chase';
    const isSearching = state.current === 'search';
    const aiming = isAiming.current;

    // Visor color pulse logic
    if (visorRef.current) {
      // Let's simplify and just use the pulse
      const pulseSpeed = aiming ? 30 : (isCombat ? 12 : (isSearching ? 6 : 2));
      const pulse = 0.5 + Math.sin(fiberTime * pulseSpeed) * 0.5;
      
      if (aiming) {
        (visorRef.current.material as THREE.MeshBasicMaterial).color.set('#ffffff');
        (visorRef.current.material as THREE.MeshBasicMaterial).opacity = 1;
      } else {
        let baseColorStr = glowColor;
        if (isCombat) baseColorStr = '#ff0000';
        else if (isSearching) baseColorStr = '#ffff00';
        
        const baseColor = new THREE.Color(baseColorStr);
        (visorRef.current.material as THREE.MeshBasicMaterial).color.lerp(baseColor, 0.1);
        (visorRef.current.material as THREE.MeshBasicMaterial).opacity = (isCombat || isSearching) ? 0.6 + pulse * 0.4 : 1;
      }
    }
    
    // Sync position to store for minimap (real-time updates)
    useGameStore.getState().updateEnemyPosition(data.id, [pos.x, pos.y, pos.z]);

    let closestTargetPos: THREE.Vector3 | null = null;
    let closestDist = CHASE_DIST;

    const checkLoS = (targetPos: THREE.Vector3) => {
      const rayOrigin = new THREE.Vector3(currentPos.x, currentPos.y + 1, currentPos.z);
      const rayDir = new THREE.Vector3().subVectors(targetPos, rayOrigin).normalize();
      const dist = rayOrigin.distanceTo(targetPos);
      const ray = new rapier.Ray(rayOrigin, rayDir);
      const hit = world.castRay(ray, dist, true, undefined, undefined, undefined, body.current!);
      
      if (hit) {
        const parent = hit.collider.parent();
        const hitName = (parent?.userData as { name?: string })?.name || '';
        return hitName === 'player' || Object.keys(otherPlayers).includes(hitName);
      }
      return true; // No hit means clear air? Or we hit the target itself
    };

    const checkVisibility = (targetPos: THREE.Vector3, dist: number) => {
      // Proximity alert: spot target instantly if very close (e.g. 6 meters)
      if (dist < 6 && checkLoS(targetPos)) return true;
      
      // Field of view alert: spot target within 50 meters if in a 120-degree front cone
      if (dist < 50 && groupRef.current) {
        const facingDir = new THREE.Vector3(
          Math.sin(groupRef.current.rotation.y),
          0,
          Math.cos(groupRef.current.rotation.y)
        ).normalize();
        
        const toTarget = new THREE.Vector3().subVectors(targetPos, currentPos);
        toTarget.y = 0;
        toTarget.normalize();
        
        const dot = facingDir.dot(toTarget);
        if (dot > -0.707 && checkLoS(targetPos)) { // Wider vision (270 degrees)
          return true;
        }
      }
      return false;
    };

    if (playerState === 'active' && role !== 'imposter') {
      const pPos = new THREE.Vector3(playerPosition[0], pos.y, playerPosition[2]);
      const distToPlayer = currentPos.distanceTo(pPos);
      if (distToPlayer < closestDist && checkVisibility(pPos, distToPlayer)) {
        closestDist = distToPlayer;
        closestTargetPos = pPos;
      }
    }

    // Check other players
    Object.values(otherPlayers).forEach(p => {
      if (p.state === 'active' && p.role !== 'imposter') {
        const pPos = new THREE.Vector3(p.position[0], pos.y, p.position[2]);
        const dist = currentPos.distanceTo(pPos);
        if (dist < closestDist && checkVisibility(pPos, dist)) {
          closestDist = dist;
          closestTargetPos = pPos;
        }
      }
    });

    // Update line of sight memory
    if (closestTargetPos) {
      if (!hasLineOfSight.current) {
        spotDelay.current += delta;
        if (spotDelay.current > 0.4) { // 400ms to "spot"
          hasLineOfSight.current = true;
          lastKnownEnemyPos.current = closestTargetPos.clone();
        }
      } else {
        lastKnownEnemyPos.current = closestTargetPos.clone();
      }
    } else {
      spotDelay.current = 0;
      hasLineOfSight.current = false;
    }

    // Check coins - Bots can collect points if they approach prior to player
    let closestCoinPos: THREE.Vector3 | null = null;
    let closestCoinDist = 70; // High search radius for coins

    coins.forEach(c => {
      if (!c.collected) {
        const cPos = new THREE.Vector3(c.position[0], pos.y, c.position[2]);
        const dist = currentPos.distanceTo(cPos);
        if (dist < closestCoinDist) {
          closestCoinDist = dist;
          closestCoinPos = cPos;
        }
      }
    });

    // Decide AI state
    if (closestTargetPos && hasLineOfSight.current) {
      state.current = 'chase';
    } else if (lastKnownEnemyPos.current) {
      if (currentPos.distanceTo(lastKnownEnemyPos.current) < 3) {
        if (state.current !== 'search') {
          state.current = 'search';
          searchStartTime.current = fiberTime;
        }
        if (fiberTime - searchStartTime.current > 5) { // Search for 5 seconds
          lastKnownEnemyPos.current = null;
          state.current = 'patrol';
        }
      } else {
        state.current = 'chase'; // Move to last known
      }
    } else if (closestCoinPos && (closestCoinDist < 40)) {
       state.current = 'collect';
       patrolTarget.current.copy(closestCoinPos);
    } else {
      if (state.current !== 'patrol') {
        state.current = 'patrol';
        lastPatrolChange.current = 0; // Force immediate new target
      }
    }

    const direction = new THREE.Vector3();

    if (state.current === 'collect' && patrolTarget.current) {
       direction.subVectors(patrolTarget.current, currentPos).normalize();
       if (gunGroupRef.current) {
         gunGroupRef.current.lookAt(patrolTarget.current);
       }
    } else if (state.current === 'chase' && (closestTargetPos || lastKnownEnemyPos.current)) {
      const pursuitPos = closestTargetPos || lastKnownEnemyPos.current!;
      direction.subVectors(pursuitPos, currentPos).normalize();
      
      if (gunGroupRef.current) {
        gunGroupRef.current.lookAt(pursuitPos);
      }

      // Shooting logic (Only if clear LoS and close enough)
      const now = Date.now();
      if (closestTargetPos && hasLineOfSight.current && closestDist < SHOOT_DIST) {
        if (!isAiming.current && now - lastShootTime.current > SHOOT_COOLDOWN) {
          isAiming.current = true;
          aimStartTime.current = now;
        }

        if (isAiming.current) {
          direction.multiplyScalar(0.4);
          
          if (now - aimStartTime.current > AIM_TIME) {
            const laserOrigin = new THREE.Vector3();
            if (muzzleRef.current) muzzleRef.current.getWorldPosition(laserOrigin);
            else laserOrigin.copy(currentPos).add(new THREE.Vector3(0, 1.5, 0));

            const targetLookAt = closestTargetPos.clone();
            const spread = 0.04;
            targetLookAt.x += (Math.random() - 0.5) * spread * closestDist;
            targetLookAt.y += (Math.random() - 0.5) * spread * closestDist;
            targetLookAt.z += (Math.random() - 0.5) * spread * closestDist;

            const shootDir = new THREE.Vector3().subVectors(targetLookAt, laserOrigin).normalize();
            const shootRay = new rapier.Ray(laserOrigin, shootDir);
            const shootHit = world.castRay(shootRay, SHOOT_DIST * 2.5, true, undefined, undefined, undefined, body.current!);

            if (shootHit) {
              const rb = shootHit.collider.parent();
              const hitPoint = shootRay.pointAt(shootHit.timeOfImpact);

              if (rb && rb.userData) {
                const userData = rb.userData as { name?: string };
                const hitOtherPlayer = Object.keys(otherPlayers).includes(userData.name || '');
                
                if (userData.name === 'player') {
                  hitPlayer(data.id);
                  addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                  addLaser([laserOrigin.x, laserOrigin.y, laserOrigin.z], [hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                } else if (hitOtherPlayer) {
                  useGameStore.getState().hitEnemy(userData.name!, 2);
                  addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                  addLaser([laserOrigin.x, laserOrigin.y, laserOrigin.z], [hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                } else {
                  addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                  addLaser([laserOrigin.x, laserOrigin.y, laserOrigin.z], [hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                }
              } else {
                addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                addLaser([laserOrigin.x, laserOrigin.y, laserOrigin.z], [hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
              }
            }
            
            isAiming.current = false;
            lastShootTime.current = now;
          }
        }
      } else {
        isAiming.current = false;
      }
    } else if (state.current === 'search') {
      // Look around
      const searchAngle = fiberTime * 4;
      direction.set(Math.cos(searchAngle), 0, Math.sin(searchAngle)).multiplyScalar(0.1);
      if (gunGroupRef.current) {
        const dummy = currentPos.clone().add(direction.clone().multiplyScalar(5));
        gunGroupRef.current.lookAt(dummy);
      }
    } else {
      // Patrol
      const now = Date.now();
      if (currentPos.distanceTo(patrolTarget.current) < 5 || now - lastPatrolChange.current > 8000) {
        patrolTarget.current.set((Math.random() - 0.5) * 180, targetHeight, (Math.random() - 0.5) * 180);
        lastPatrolChange.current = now;
      }
      direction.subVectors(patrolTarget.current, currentPos).normalize();
      if (gunGroupRef.current) {
        const dummy = currentPos.clone().add(direction.clone().multiplyScalar(5));
        gunGroupRef.current.lookAt(dummy);
      }
    }

    // Unjamming logic: if significantly stuck, pick a temporary detour
    if (direction.lengthSq() > 0.1) {
      if (currentPos.distanceTo(lastPos.current) < 0.005) {
        stuckTime.current += delta;
        if (stuckTime.current > 1.2) {
          // Instead of patrol, just shift the current target temporarily or wiggle
          if (state.current === 'chase') {
             // Wiggle laterally
             const wiggle = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).multiplyScalar(5);
             patrolTarget.current.copy(currentPos).add(wiggle);
             state.current = 'patrol'; // Short-term patrol to unjam
             lastPatrolChange.current = Date.now() - 6000; // Force another change soon
          } else {
            patrolTarget.current.set(
              (Math.random() - 0.5) * 180,
              targetHeight,
              (Math.random() - 0.5) * 180
            );
          }
          stuckTime.current = 0;
        }
      } else {
        stuckTime.current = 0;
      }
    }
    lastPos.current.copy(currentPos);

    // Apply Obstacle Avoidance for all states to prevent getting stuck on walls
    if (direction.lengthSq() > 0.01) {
      const rayOrigin = new THREE.Vector3(currentPos.x, currentPos.y + 0.5, currentPos.z);
      const rayDir = direction.clone().normalize();
      const ray = new rapier.Ray(rayOrigin, rayDir);
      const hit = world.castRay(ray, 3.5, true, undefined, undefined, undefined, body.current!);
      
      if (hit) {
        const parent = hit.collider.parent();
        const hitName = (parent?.userData as { name?: string })?.name || '';
        
        if (hitName !== 'player' && !Object.keys(otherPlayers).includes(hitName) && hitName !== data.id) {
          // Steer laterally to go around the wall/obstacle
          const rightSteer = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
          direction.add(rightSteer.multiplyScalar(3.0)).normalize();
          
          // If in patrol state, also pick a new target since we are about to hit a wall
          if (state.current === 'patrol') {
            patrolTarget.current.set(
              (Math.random() - 0.5) * 170,
              targetHeight,
              (Math.random() - 0.5) * 170
            );
            lastPatrolChange.current = Date.now();
          }
        }
      }
    }

    // Apply movement
    const velocity = body.current.linvel();
    
    // Direct proportional height controller for a smooth hover (no hopping)
    let yVel = (targetHeight - pos.y) * 8.0;

    // Hard floor collision prevention - soft version
    if (pos.y < 0.01) {
      if (pos.y < -1.0) {
        // Emergency teleport if fallen through ground
        body.current.setTranslation({ x: pos.x, y: 1.5, z: pos.z }, true);
        yVel = 0;
      } else {
        // Continuous smooth upward push instead of hard impulse
        const pushUp = (0.01 - pos.y) * 40.0;
        yVel += pushUp * delta;
      }
    }

    // Smoothen horizontal movement to prevent "twitching"
    const currentMoveDir = new THREE.Vector3(velocity.x, 0, velocity.z);
    const targetMoveDir = direction.clone().multiplyScalar(ENEMY_SPEED);
    
    // Lerp the move direction for fluidity (higher values = more responsive, lower = smoother)
    const smoothDir = currentMoveDir.lerp(targetMoveDir, 0.15);

    body.current.setLinvel({
      x: smoothDir.x,
      y: yVel,
      z: smoothDir.z
    }, true);

    // Rotate to face direction
    if (groupRef.current && direction.lengthSq() > 0.01) {
      const targetRotationY = Math.atan2(direction.x, direction.z);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotationY, 0.15);
    }
  });

  const handleCollision = (e: any) => {
    if (data.state !== 'active') return;
    const other = e.other.rigidBodyObject;
    if (other && other.userData && other.userData.name) {
      const hitName = other.userData.name;
      // If it's a wall or obstacle
      if (hitName.startsWith('obstacle-') || hitName.startsWith('wall') || hitName === 'floor') {
        // Change patrol target immediately
        patrolTarget.current.set(
          (Math.random() - 0.5) * 170,
          BOT_FLOAT_HEIGHT,
          (Math.random() - 0.5) * 170
        );
        lastPatrolChange.current = Date.now();
        
        // Push them slightly away in the opposite direction to unstick
        if (body.current) {
          const linvel = body.current.linvel();
          body.current.setLinvel({
            x: -linvel.x * 0.75,
            y: linvel.y,
            z: -linvel.z * 0.75
          }, true);
        }
      }
    }
  };

  const color = data.state === 'disabled' ? '#333' : '#ff0055';
  const glowColor = data.state === 'disabled' ? '#111' : '#39ff14';

  return (
    <RigidBody
      ref={body}
      onCollisionEnter={handleCollision}
      colliders={false}
      mass={5}
      type="dynamic"
      position={data.position}
      enabledRotations={[false, false, false]}
      gravityScale={0}
      linearDamping={1}
      friction={1}
      userData={{ name: data.state === 'active' ? data.id : 'dead-bot' }}
      ccd={true}
    >
      <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} />
      
      <group ref={groupRef}>
        <Float speed={0} rotationIntensity={0} floatIntensity={0}>
          {/* Main Bot Body */}
          <group position={[0, 0, 0]}>
            {/* Hover Base */}
            <mesh position={[0, 0.3, 0]} castShadow>
              <cylinderGeometry args={[0.6, 0.4, 0.4, 16]} />
              <meshStandardMaterial color="#222" metalness={0.9} roughness={0.1} />
            </mesh>
            
            {/* Thruster Glow */}
            <mesh ref={thrusterRef} position={[0, 0.1, 0]}>
              <cylinderGeometry args={[0.5, 0, 0.2, 16]} />
              <meshBasicMaterial color={glowColor} toneMapped={false} transparent opacity={0.6} />
            </mesh>
            
            <mesh position={[0, 0.15, 0]}>
              <cylinderGeometry args={[0.7, 0.7, 0.05, 16]} />
              <meshBasicMaterial color={glowColor} toneMapped={false} />
            </mesh>

            {/* Torso with mechanical detail */}
            <mesh position={[0, 1.0, 0]} castShadow>
              <boxGeometry args={[0.8, 0.8, 0.8]} />
              <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
            </mesh>
            
            {/* Vents / Panels */}
            <mesh position={[0, 1.0, 0.41]}>
              <boxGeometry args={[0.5, 0.1, 0.02]} />
              <meshStandardMaterial color="#333" />
            </mesh>
            <mesh position={[0, 0.8, 0.41]}>
              <boxGeometry args={[0.5, 0.1, 0.02]} />
              <meshStandardMaterial color="#333" />
            </mesh>

            {/* Head */}
            <group position={[0, 1.7, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.45, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
              </mesh>
              <mesh castShadow rotation={[Math.PI, 0, 0]}>
                <sphereGeometry args={[0.45, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#222" metalness={0.9} />
              </mesh>
              
              {/* Eye Visor */}
              <mesh ref={visorRef} position={[0, 0.1, 0.35]} rotation={[0.2, 0, 0]}>
                <boxGeometry args={[0.6, 0.15, 0.1]} />
                <meshBasicMaterial color={glowColor} toneMapped={false} transparent />
              </mesh>
              
              {/* Antennae */}
              <group ref={antennaRef} position={[0.25, 0.35, 0]}>
                <mesh rotation={[0, 0, 0.5]}>
                  <cylinderGeometry args={[0.01, 0.01, 0.6]} />
                  <meshStandardMaterial color="#222" />
                </mesh>
                <mesh position={[0, 0.3, 0]}>
                  <sphereGeometry args={[0.04]} />
                  <meshBasicMaterial color={glowColor} toneMapped={false} />
                </mesh>
              </group>
            </group>

            {/* Gun Turret System */}
            <group ref={gunGroupRef} position={[0, 1.1, 0]}>
              {/* Right Gun Arm */}
              <group position={[0.7, 0, 0]}>
                {/* Arm connector */}
                <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.05, 0.05, 0.4]} />
                  <meshStandardMaterial color="#333" />
                </mesh>
                
                <group position={[0, 0, -0.2]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.15, 0.25, 0.3]} />
                    <meshStandardMaterial color="#222" />
                  </mesh>
                  {/* Barrel */}
                  <mesh position={[0, 0, -0.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
                    <meshStandardMaterial color="#111" metalness={0.9} />
                  </mesh>
                  {/* Energy Coil */}
                  <mesh position={[0, 0, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.09, 0.02, 8, 16]} />
                    <meshBasicMaterial color={glowColor} toneMapped={false} />
                  </mesh>
                  <mesh position={[0, 0, -0.8]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.1, 0.1, 0.05, 8]} />
                    <meshBasicMaterial color={glowColor} toneMapped={false} />
                  </mesh>
                  <group ref={muzzleRef} position={[0, 0, -0.9]} />
                </group>
              </group>
              
              {/* Left Sensor/Counterweight Arm */}
              <group position={[-0.7, 0, 0]}>
                <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.05, 0.05, 0.4]} />
                  <meshStandardMaterial color="#333" />
                </mesh>
                <group position={[0, 0, -0.1]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.15, 0.2, 0.2]} />
                    <meshStandardMaterial color="#222" />
                  </mesh>
                  <mesh position={[0, 0.1, 0.15]}>
                    <sphereGeometry args={[0.05]} />
                    <meshBasicMaterial color={glowColor} toneMapped={false} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </Float>

        <Text
          position={[0, 2.7, 0]}
          fontSize={0.3}
          color={data.state === 'active' ? '#ff0055' : '#666666'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {data.id}
        </Text>

        {/* Health Indicator */}
        {data.state === 'active' && (
          <group position={[0, 2.3, 0]}>
            {Array.from({ length: 2 }).map((_, i) => (
              <mesh key={i} position={[(i - 0.5) * 0.3, 0, 0]}>
                <sphereGeometry args={[0.08]} />
                <meshBasicMaterial color={i < data.health ? '#39ff14' : '#333'} toneMapped={false} />
              </mesh>
            ))}
          </group>
        )}
      </group>
    </RigidBody>
  );
}


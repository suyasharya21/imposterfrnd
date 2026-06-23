/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';

const SPEED = 14;
const MAX_LASER_DIST = 100;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    return uaMatch || coarsePointer || window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(uaMatch || coarsePointer || window.innerWidth < 768);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { rapier, world } = useRapier();
  
  const { 
    playerState, 
    gameState, 
    addLaser, 
    hitEnemy, 
    addParticles, 
    updatePlayerPosition,
    mobileInput,
    setCursorLocked,
    currentWeapon,
    cycleWeapon,
    useAmmo,
    addEvent
  } = useGameStore(useShallow(state => ({
    playerState: state.playerState,
    gameState: state.gameState,
    addLaser: state.addLaser,
    hitEnemy: state.hitEnemy,
    addParticles: state.addParticles,
    updatePlayerPosition: state.updatePlayerPosition,
    mobileInput: state.mobileInput,
    setCursorLocked: state.setCursorLocked,
    currentWeapon: state.currentWeapon,
    cycleWeapon: state.cycleWeapon,
    useAmmo: state.useAmmo,
    addEvent: state.addEvent
  })));

  const keys = useRef({ 
    w: false, a: false, s: false, d: false,
    arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
    ' ': false
  });
  const lastEmitTime = useRef(0);
  const lastShootTime = useRef(0);
  const lastSpacePressed = useRef(false);

  const gunGroupRef = useRef<THREE.Group>(null);
  const gunVisualRef = useRef<THREE.Group>(null);
  const gunBarrelRef = useRef<THREE.Group>(null);

  // More robust mobile detection (checks for touch support)
  const isTouchDevice = useRef(false);
  useEffect(() => {
    isTouchDevice.current = window.matchMedia('(pointer: coarse)').matches || 
                           'ontouchstart' in window || 
                           navigator.maxTouchPoints > 0;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current || key === ' ') {
        keys.current[key as keyof typeof keys.current] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current || key === ' ') {
        keys.current[key as keyof typeof keys.current] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Shooting logic function
  const shoot = useCallback(() => {
    if (gameState !== 'playing' || playerState !== 'active') return;
    
    // Set weapon parameters
    let range = MAX_LASER_DIST;
    let cooldown = 200;
    let particleColor = '#39ff14';
    let damage = 2; // Gun takes 1 shot (HP=2)

    // Check for ammo before proceeding
    if (!useAmmo(currentWeapon)) {
      // Empty click sound or visual?
      addEvent(`OUT OF AMMO: ${currentWeapon.toUpperCase()}`);
      return;
    }

    if (currentWeapon === 'knife') {
      range = 3.5;
      cooldown = 400;
      particleColor = '#ff0055';
      damage = 1; // Knife takes 2 hits
      
      // Trigger swing animation
      if (gunVisualRef.current) {
        const visual = gunVisualRef.current;
        // Simple kick/swing animation using a temporary offset or rotation
        // We'll use a local variable to trigger a frame effect
        visual.rotation.z += 0.5;
        visual.position.z -= 0.2;
      }
    } else if (currentWeapon === 'pistol') {
      range = 60;
      cooldown = 400;
      particleColor = '#39ff14';
      damage = 1; // Pistol takes 2 shots
    }

    // Rate limit shooting
    const now = Date.now();
    if (now - lastShootTime.current < cooldown) return;
    lastShootTime.current = now;

    // Raycast from camera
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Start raycast slightly ahead of the camera to avoid hitting the player's own collider
    const rayStart = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(0.8));
    const ray = new rapier.Ray(rayStart, raycaster.ray.direction);
    const hit = world.castRay(ray, range, true);

    const startPosVec = new THREE.Vector3();
    if (gunBarrelRef.current) {
      gunBarrelRef.current.getWorldPosition(startPosVec);
    } else {
      startPosVec.copy(camera.position);
    }
    const startPos: [number, number, number] = [startPosVec.x, startPosVec.y, startPosVec.z];

    let endPos: [number, number, number];

    if (hit) {
      const hitPoint = ray.pointAt(hit.timeOfImpact);
      endPos = [hitPoint.x, hitPoint.y, hitPoint.z];
      
      const collider = hit.collider;
      const rb = collider.parent();
      if (rb && rb.userData) {
        const userData = rb.userData as { name?: string };
        const name = userData.name;
        
        if (name) {
          // Check if it's a bot
          if (name.startsWith('bot-')) {
            hitEnemy(name, damage, true);
          } 
          // Check if it's another player (socket ID)
          else if (name !== 'player' && useGameStore.getState().otherPlayers[name]) {
            hitEnemy(name, damage, true);
          }
        }
      }
      
      addParticles(endPos, particleColor);
    } else {
      endPos = [
        camera.position.x + raycaster.ray.direction.x * range,
        camera.position.y + raycaster.ray.direction.y * range,
        camera.position.z + raycaster.ray.direction.z * range
      ];
    }

    if (currentWeapon !== 'knife') {
      addLaser(startPos, endPos, particleColor);
    } else if (hit) {
      // Small visual flash for knife hit
      addLaser(startPos, endPos, particleColor);
    }
  }, [gameState, playerState, camera, world, rapier, hitEnemy, addParticles, addLaser, currentWeapon]);

  // Use YXZ order for FPS-style rotation (Yaw then Pitch)
  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useFrame((_, delta) => {
    if (!body.current || gameState !== 'playing') return;

    const now = Date.now();
    const pCamera = camera as THREE.PerspectiveCamera;
    
    const mobileInput = useGameStore.getState().mobileInput;

    // Handle Mobile Shooting
    if (mobileInput.shooting) {
      shoot();
    }

    // Movement
    const velocity = body.current.linvel();
    
    const k = keys.current;
    
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    const joyMoveZ = -mobileInput.move.y;
    const joyMoveX = mobileInput.move.x;

    const combinedMoveZ = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0) + joyMoveZ;
    const combinedMoveX = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + joyMoveX;

    const direction = new THREE.Vector3();
    direction.addScaledVector(forward, combinedMoveZ);
    direction.addScaledVector(right, combinedMoveX);
    
    if (direction.lengthSq() > 0) {
      if (direction.lengthSq() > 1) direction.normalize();
      direction.multiplyScalar(SPEED);
    }

    const pos = body.current.translation();

    // Grounded check (raycast down)
    const rayOrigin = { x: pos.x, y: pos.y + 0.1, z: pos.z };
    const rayDir = { x: 0, y: -1, z: 0 };
    const ray = new rapier.Ray(rayOrigin, rayDir);
    const hit = world.castRay(ray, 0.25, true); // Adjusted to be more precise
    
    let isGrounded = hit !== null;
    let isStandingOnObstacle = false;
    
    if (hit) {
      const parent = hit.collider.parent();
      const hitName = (parent?.userData as { name?: string })?.name || '';
      if (hitName.startsWith('obstacle-') || hitName.startsWith('wall-')) {
        isStandingOnObstacle = true;
      }
    }

    // Handle Jump - Just a single hop on press (Keyboard or Mobile)
    const spacePressed = k[' '] || mobileInput.jumping;
    const jumpTriggered = spacePressed && !lastSpacePressed.current;
    lastSpacePressed.current = spacePressed;

    let jumpVelocity = velocity.y;
    let finalVelocityX = direction.x;
    let finalVelocityZ = direction.z;

    if (isStandingOnObstacle) {
      const parent = hit!.collider.parent();
      if (parent) {
        const obsPos = parent.translation();
        const pushDir = new THREE.Vector3(pos.x - obsPos.x, 0, pos.z - obsPos.z).normalize();
        if (pushDir.lengthSq() < 0.01) {
          pushDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        }
        // Push the player off the wall horizontally
        finalVelocityX = pushDir.x * 15;
        finalVelocityZ = pushDir.z * 15;
        jumpVelocity = -3; // Push down
        isGrounded = false; // Disable jumping while sliding off
      }
    } else {
      if (isGrounded && jumpTriggered) {
        jumpVelocity = 9.5; // Jump strength
      }
    }

    // Safety check: falling through floor or too high
    if (pos.y < -1.5) {
      body.current.setTranslation({ x: pos.x, y: 3, z: pos.z }, true);
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      useGameStore.getState().addEvent('Recovered from floor-glitch');
    }

    body.current.setLinvel({ x: finalVelocityX, y: jumpVelocity, z: finalVelocityZ }, true);

    // Mobile Look Rotation
    if (Math.abs(mobileInput.look.x) > 0.01 || Math.abs(mobileInput.look.y) > 0.01) {
      const lookSpeed = 2.0 * delta;
      // Yaw (Left/Right) - Rotate around Y axis
      // Joystick Right (x > 0) -> Turn Right (negative rotation around Y in standard right-handed? No, usually -Y is right? Let's test)
      // PointerLockControls: moving mouse right -> camera rotates right.
      // Euler Y decreases?
      camera.rotation.y -= mobileInput.look.x * lookSpeed;
      
      // Pitch (Up/Down) - Rotate around X axis
      // Joystick Up (y < 0) -> Look Up.
      // Looking up means increasing X rotation? Or decreasing?
      // Usually looking up is positive X?
      // Let's try standard mapping.
      camera.rotation.x -= mobileInput.look.y * lookSpeed;
      
      // Clamp pitch to avoid flipping
      camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x));
    }

    // Update camera position - strictly follow for FPS stability with very high smoothing only if needed
    const targetCamPos = new THREE.Vector3(pos.x, pos.y + 1.6, pos.z);
    
    // Using a slightly lower but more consistent follow for visual stability
    camera.position.lerp(targetCamPos, 0.9);

    // Sync gun to camera with sway
    if (gunGroupRef.current) {
      gunGroupRef.current.position.copy(camera.position);
      
      // Calculate smooth rotation for the gun (slight delay)
      const targetRotation = camera.quaternion.clone();
      gunGroupRef.current.quaternion.slerp(targetRotation, 0.25); 

      // Subtle gun sway based on movement and rotation
      if (gunVisualRef.current) {
        const time = _.clock.elapsedTime;
        const velSq = combinedMoveX * combinedMoveX + combinedMoveZ * combinedMoveZ;
        const swayAmount = 0.008; // Reduced sway for stability
        const bopAmount = 0.012;
        const speed = velSq > 0 ? 8 : 2;

        gunVisualRef.current.position.x = 0.4 + Math.sin(time * speed) * swayAmount * (velSq > 0 ? 2 : 0.5);
        gunVisualRef.current.position.y = -0.3 + Math.cos(time * speed * 2) * bopAmount * (velSq > 0 ? 1.5 : 0.2);
        
        // Tilt gun slightly when strafing
        gunVisualRef.current.rotation.z = THREE.MathUtils.lerp(gunVisualRef.current.rotation.z, -combinedMoveX * 0.1, delta * 5);
        
        // Return from knife swing/kick
        gunVisualRef.current.rotation.z = THREE.MathUtils.lerp(gunVisualRef.current.rotation.z, -combinedMoveX * 0.1, delta * 10);
        gunVisualRef.current.position.z = THREE.MathUtils.lerp(gunVisualRef.current.position.z, -0.6, delta * 10);
      }
    }
    
    // Handle FOV zoom transition with smoother smoothing
    const targetFov = isZoomed ? zoomFov : baseFov;
    if (Math.abs(pCamera.fov - targetFov) > 0.01) {
      // Frame-rate independent exponential smoothing
      const alpha = 1 - Math.exp(-15 * delta); 
      pCamera.fov = THREE.MathUtils.lerp(pCamera.fov, targetFov, alpha);
      pCamera.updateProjectionMatrix();
    }
    
    // Recover recoil - REMOVED AS PER USER REQUEST
    /*
    if (gunVisualRef.current) {
      gunVisualRef.current.position.z = THREE.MathUtils.lerp(gunVisualRef.current.position.z, -0.6, delta * 15);
      gunVisualRef.current.rotation.x = THREE.MathUtils.lerp(gunVisualRef.current.rotation.x, 0, delta * 15);
    }
    */

    // Emit position to server
    if (now - lastEmitTime.current > 16) { // Increased frequency for smoother sync (60fps sync)
      updatePlayerPosition([pos.x, pos.y, pos.z], camera.rotation.y);
      lastEmitTime.current = now;
    }
  });

  // Handle random respawn when transitioning from disabled to active
  const lastPlayerState = useRef(playerState);
  useEffect(() => {
    if (playerState === 'active' && lastPlayerState.current === 'disabled') {
      if (body.current) {
        // Random position within arena (avoiding very edges)
        const x = (Math.random() - 0.5) * 160;
        const z = (Math.random() - 0.5) * 160;
        
        body.current.setTranslation({ x, y: 2, z }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        
        // Update camera position to prevent the high-lerp "sliding" effect from old position
        camera.position.set(x, 4, z);
        
        // Add a spawn event
        useGameStore.getState().addEvent('Respawned at new location');
      }
    }
    lastPlayerState.current = playerState;
  }, [playerState, camera]);

  const [showGun, setShowGun] = useState(true);
  const isZoomedRef = useRef(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const baseFov = 80;
  const zoomFov = baseFov / 2.2; // Slightly more than 2x for impact

  const [controlsEnabled, setControlsEnabled] = useState(false);

  useEffect(() => {
    // Small delay to allow react to finish mounting components before enabling controls
    // to avoid "cannot be acquired immediately" if we just switched state
    const timer = setTimeout(() => {
      setControlsEnabled(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Handle zooming via wheel
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (document.pointerLockElement && gameState === 'playing') {
        const threshold = 10; // Scroll threshold
        if (e.deltaY < -threshold && !isZoomedRef.current) {
          isZoomedRef.current = true;
          setIsZoomed(true);
        } else if (e.deltaY > threshold && isZoomedRef.current) {
          isZoomedRef.current = false;
          setIsZoomed(false);
        }
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [gameState]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Only shoot on left click (button 0)
      if (e.button === 0 && document.pointerLockElement && gameState === 'playing' && playerState === 'active') {
        shoot();
      }
      // Cycle weapon on right click (button 2)
      if (e.button === 2 && document.pointerLockElement) {
        cycleWeapon();
      }
    };
    
    // Prevent context menu on right click
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [gameState, playerState, shoot]);

  const isMobile = useIsMobile();
  
  return (
    <>
      {!isMobile && gameState === 'playing' && controlsEnabled && (
        <PointerLockControls 
          makeDefault 
          onLock={() => setCursorLocked(true)}
          onUnlock={() => {
            setCursorLocked(false);
          }}
        />
      )}
      <RigidBody
        ref={body}
        colliders={false}
        mass={1}
        type="dynamic"
        position={[0, 2, 0]}
        enabledRotations={[false, false, false]}
        userData={{ name: 'player' }}
        friction={0}
        ccd={true}
      >
        <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} friction={0} />
      </RigidBody>

      {/* First Person Weapon */}
      {gameState === 'playing' && (
        <group ref={gunGroupRef}>
          <group ref={gunVisualRef} position={[0.4, -0.3, -0.6]}>
            {currentWeapon === 'gun' && (
              <>
                {/* Main body */}
                <mesh position={[0, 0, 0.2]}>
                  <boxGeometry args={[0.1, 0.15, 0.45]} />
                  <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
                </mesh>
                
                {/* Power Core / Magazine */}
                <mesh position={[0, -0.08, 0.15]}>
                  <boxGeometry args={[0.08, 0.1, 0.15]} />
                  <meshStandardMaterial color="#050505" metalness={1} roughness={0.1} />
                </mesh>
                <mesh position={[0, -0.08, 0.15]}>
                  <boxGeometry args={[0.09, 0.05, 0.1]} />
                  <meshBasicMaterial color="#39ff14" toneMapped={false} />
                </mesh>
                
                {/* Sight / Scope */}
                <group position={[0, 0.1, 0.1]}>
                  <mesh>
                    <boxGeometry args={[0.04, 0.06, 0.1]} />
                    <meshStandardMaterial color="#111" />
                  </mesh>
                  <mesh position={[0, 0.01, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.015, 0.02, 16]} />
                    <meshBasicMaterial color="#39ff14" toneMapped={false} />
                  </mesh>
                </group>

                {/* Barrel - multi-segment */}
                <mesh position={[0, 0.04, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.035, 0.035, 0.3, 12]} />
                  <meshStandardMaterial color="#0a0a0a" metalness={0.9} roughness={0.1} />
                </mesh>
                <mesh position={[0, 0.04, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.02, 12]} />
                  <meshBasicMaterial color="#39ff14" toneMapped={false} />
                </mesh>
                <mesh position={[0, 0.04, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.02, 12]} />
                  <meshBasicMaterial color="#39ff14" toneMapped={false} />
                </mesh>

                {/* Neon accents along body */}
                <mesh position={[0.055, 0, 0.2]}>
                  <boxGeometry args={[0.01, 0.08, 0.3]} />
                  <meshBasicMaterial color="#39ff14" toneMapped={false} />
                </mesh>
                <mesh position={[-0.055, 0, 0.2]}>
                  <boxGeometry args={[0.01, 0.08, 0.3]} />
                  <meshBasicMaterial color="#39ff14" toneMapped={false} />
                </mesh>
                
                <group ref={gunBarrelRef} position={[0, 0.04, -0.32]} />
              </>
            )}

            {currentWeapon === 'knife' && (
              <group rotation={[Math.PI / 2.5, 0, 0]} position={[0, -0.1, 0.1]}>
                {/* Handle / Guard */}
                <mesh position={[0, -0.18, 0]}>
                  <boxGeometry args={[0.05, 0.15, 0.05]} />
                  <meshStandardMaterial color="#111" />
                </mesh>
                <mesh position={[0, -0.1, 0]}>
                  <boxGeometry args={[0.12, 0.02, 0.06]} />
                  <meshStandardMaterial color="#222" />
                </mesh>
                
                {/* Power Cell in handle */}
                <mesh position={[0, -0.18, 0]}>
                  <boxGeometry args={[0.055, 0.05, 0.055]} />
                  <meshBasicMaterial color="#ff0055" toneMapped={false} />
                </mesh>

                {/* Blade - futuristic geometry */}
                <mesh position={[0, 0.1, 0]}>
                  <boxGeometry args={[0.01, 0.35, 0.08]} />
                  <meshStandardMaterial color="#222" metalness={0.9} roughness={0.1} />
                </mesh>
                
                {/* Glowing Core Edge */}
                <mesh position={[0, 0.12, 0.03]}>
                  <boxGeometry args={[0.015, 0.3, 0.02]} />
                  <meshBasicMaterial color="#ff0055" toneMapped={false} opacity={0.8} transparent />
                </mesh>
                
                {/* Laser Edge */}
                <mesh position={[0, 0.12, -0.04]} rotation={[0, 0, 0]}>
                  <boxGeometry args={[0.005, 0.32, 0.01]} />
                  <meshBasicMaterial color="#ff0055" toneMapped={false} />
                </mesh>

                {/* Cross-guard lights */}
                <mesh position={[0.05, -0.1, 0]}>
                  <sphereGeometry args={[0.01, 8, 8]} />
                  <meshBasicMaterial color="#ff0055" toneMapped={false} />
                </mesh>
                <mesh position={[-0.05, -0.1, 0]}>
                  <sphereGeometry args={[0.01, 8, 8]} />
                  <meshBasicMaterial color="#ff0055" toneMapped={false} />
                </mesh>

                <group ref={gunBarrelRef} position={[0, 0.3, 0]} />
              </group>
            )}

            {currentWeapon === 'pistol' && (
              <group scale={0.7} position={[0, 0, 0.1]}>
                {/* Main Frame */}
                <mesh position={[0, 0.02, 0.1]}>
                  <boxGeometry args={[0.08, 0.14, 0.25]} />
                  <meshStandardMaterial color="#1a1a1a" />
                </mesh>
                
                {/* Grip with ergonomic detail */}
                <mesh position={[0, -0.12, 0.18]} rotation={[Math.PI / 6, 0, 0]}>
                  <boxGeometry args={[0.07, 0.18, 0.08]} />
                  <meshStandardMaterial color="#0a0a0a" />
                </mesh>
                
                {/* Neon slide detail */}
                <mesh position={[0, 0.08, 0.1]}>
                  <boxGeometry args={[0.085, 0.02, 0.2]} />
                  <meshBasicMaterial color="#39ff14" toneMapped={false} />
                </mesh>

                {/* Forward laser sight */}
                <mesh position={[0, -0.04, -0.02]}>
                  <boxGeometry args={[0.04, 0.04, 0.08]} />
                  <meshStandardMaterial color="#000" />
                </mesh>
                <mesh position={[0, -0.04, -0.06]}>
                  <sphereGeometry args={[0.01, 8, 8]} />
                  <meshBasicMaterial color="#ff0055" toneMapped={false} />
                </mesh>

                {/* Barrel */}
                <mesh position={[0, 0.04, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.028, 0.028, 0.15, 12]} />
                  <meshStandardMaterial color="#050505" metalness={1} />
                </mesh>
                <mesh position={[0, 0.04, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.032, 0.032, 0.02, 12]} />
                  <meshBasicMaterial color="#39ff14" toneMapped={false} />
                </mesh>

                <group ref={gunBarrelRef} position={[0, 0.04, -0.16]} />
              </group>
            )}
          </group>
        </group>
      )}
    </>
  );
}

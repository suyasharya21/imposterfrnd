import React, { useEffect, useState, useRef } from 'react';
import { useGameStore, PlayerData } from '../store';
import { Mic, MicOff, Send, AlertTriangle, MessageSquare, ShieldAlert, Volume2 } from 'lucide-react';

export function VotingAndChatOverlay() {
  const votingPhase = useGameStore(state => state.votingPhase);
  const isAlive = useGameStore(state => state.isAlive);
  const role = useGameStore(state => state.role);
  const timeLeft = useGameStore(state => state.timeLeft);
  const socket = useGameStore(state => state.socket);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const chatHistory = useGameStore(state => state.chatHistory);

  const [chatInput, setChatInput] = useState('');
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [popup, setPopup] = useState<{ type: 'crewmates_win' | 'crewmate_killed'; name?: string } | null>(null);

  // WebRTC refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Gather all alive players in the room (including local player)
  const myId = socket?.id || '';
  const myName = "You";
  const myColor = '#39ff14'; // neon green for local player

  const allPlayers = [
    { id: myId, name: myName, color: myColor, isAlive, role, currentVote: null }, // local vote is handled separately or in state
    ...Object.values(otherPlayers).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isAlive: p.isAlive ?? true,
      role: p.role,
      currentVote: p.currentVote
    }))
  ];

  const alivePlayers = allPlayers.filter(p => p.isAlive);

  // Calculate vote tallies for alive players
  const voteTallies = alivePlayers.reduce((acc, p) => {
    acc[p.id] = 0;
    return acc;
  }, {} as Record<string, number>);

  // Tally votes from other players
  Object.values(otherPlayers).forEach(p => {
    if (p.isAlive && p.currentVote && voteTallies[p.currentVote] !== undefined) {
      voteTallies[p.currentVote]++;
    }
  });
  // Tally local player's vote if selected
  if (selectedVote && voteTallies[selectedVote] !== undefined) {
    voteTallies[selectedVote]++;
  }

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Setup WebRTC and Socket listeners for signaling
  useEffect(() => {
    if (!votingPhase || !socket) return;

    let localStream: MediaStream | null = null;

    const setupAudio = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = localStream;

        // Loop through all OTHER alive players to establish WebRTC peer connections
        Object.values(otherPlayers).forEach(async (player) => {
          if (!player.isAlive) return;

          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });

          // Add local audio tracks to the peer connection
          localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream!);
          });

          // Send ICE candidates
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('webrtc-ice-candidate', {
                candidate: event.candidate,
                targetId: player.id
              });
            }
          };

          // Receive remote audio tracks
          pc.ontrack = (event) => {
            const remoteStream = event.streams[0];
            let audioEl = document.getElementById(`audio-${player.id}`) as HTMLAudioElement;
            if (!audioEl) {
              audioEl = document.createElement('audio');
              audioEl.id = `audio-${player.id}`;
              audioEl.autoplay = true;
              document.body.appendChild(audioEl);
            }
            audioEl.srcObject = remoteStream;
          };

          pcsRef.current[player.id] = pc;

          // If our socket ID is smaller than the remote player's ID, we initiate the call
          if (socket.id! < player.id) {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit('webrtc-offer', { sdp: offer, targetId: player.id });
            } catch (err) {
              console.error('Error creating offer:', err);
            }
          }
        });
      } catch (err) {
        console.error('Audio capture failed:', err);
      }
    };

    setupAudio();

    // Socket signaling listeners
    socket.on('webrtc-offer', async (data: { sdp: any, senderId: string }) => {
      let pc = pcsRef.current[data.senderId];
      if (!pc) {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        if (localStream) {
          localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream!);
          });
        }

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
              candidate: event.candidate,
              targetId: data.senderId
            });
          }
        };

        pc.ontrack = (event) => {
          const remoteStream = event.streams[0];
          let audioEl = document.getElementById(`audio-${data.senderId}`) as HTMLAudioElement;
          if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-${data.senderId}`;
            audioEl.autoplay = true;
            document.body.appendChild(audioEl);
          }
          audioEl.srcObject = remoteStream;
        };

        pcsRef.current[data.senderId] = pc;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { sdp: answer, targetId: data.senderId });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    });

    socket.on('webrtc-answer', async (data: { sdp: any, senderId: string }) => {
      const pc = pcsRef.current[data.senderId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (err) {
          console.error('Error handling WebRTC answer:', err);
        }
      }
    });

    socket.on('webrtc-ice-candidate', async (data: { candidate: any, senderId: string }) => {
      const pc = pcsRef.current[data.senderId];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    // Listeners for voting resolution
    socket.on('votingEnded', (data: { result: 'crewmate_killed'; name?: string }) => {
      setPopup({ type: 'crewmate_killed', name: data.name });
      setTimeout(() => {
        setPopup(null);
        useGameStore.setState({ votingPhase: false });
      }, 3000);
    });

    socket.on('gameOver', (data: { result: 'crewmates_win' | 'imposter_wins'; name?: string }) => {
      if (data.result === 'crewmates_win') {
        setPopup({ type: 'crewmates_win', name: data.name });
      }
    });

    return () => {
      // Clean up WebRTC signaling listeners
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
      socket.off('votingEnded');

      // Stop local audio tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      // Close all peer connections
      Object.values(pcsRef.current).forEach(pc => {
        pc.close();
      });
      pcsRef.current = {};

      // Remove audio DOM elements
      const audios = document.querySelectorAll('audio[id^="audio-"]');
      audios.forEach(el => el.remove());
    };
  }, [votingPhase, socket]);

  // Handle local microphone toggle
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Handle Click Voting
  const handleProfileClick = (targetId: string) => {
    if (!isAlive || !socket) return;
    if (selectedVote === targetId) {
      setSelectedVote(null);
      socket.emit('submitVote', null);
    } else {
      setSelectedVote(targetId);
      socket.emit('submitVote', targetId);
    }
  };

  // Chat Input restriction: dead players type emojis only
  const handleChatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!isAlive) {
      // Strip all alphanumeric characters
      val = val.replace(/[a-zA-Z0-9]/g, '');
    }
    setChatInput(val);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('sendChatMessage', chatInput);
    setChatInput('');
  };

  if (!votingPhase) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col z-[180] pointer-events-auto p-4 md:p-6 font-mono select-text">
      
      {/* 1. Popups */}
      {popup && popup.type === 'crewmates_win' && (
        <div className="absolute inset-0 bg-black/95 z-[210] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="bg-emerald-500/10 border-4 border-emerald-500 p-10 rounded-2xl flex flex-col items-center gap-6 max-w-lg text-center shadow-[0_0_60px_rgba(16,185,129,0.4)]">
            <ShieldAlert size={64} className="text-emerald-500 animate-bounce" />
            <h2 className="text-4xl md:text-5xl font-black text-emerald-500 tracking-tighter uppercase italic">
              GUESS RIGHT!
            </h2>
            <p className="text-white text-xl font-bold mt-2">
              Imposter dies = <span className="text-emerald-400 font-black uppercase tracking-wider">{popup.name}</span>
            </p>
          </div>
        </div>
      )}

      {popup && popup.type === 'crewmate_killed' && (
        <div className="absolute inset-0 bg-black/95 z-[210] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="bg-red-500/10 border-4 border-red-500 p-10 rounded-2xl flex flex-col items-center gap-6 max-w-lg text-center shadow-[0_0_60px_rgba(239,68,68,0.4)]">
            <AlertTriangle size={64} className="text-red-500 animate-pulse" />
            <h2 className="text-4xl md:text-5xl font-black text-red-500 tracking-tighter uppercase italic">
              INCORRECT LOGIC
            </h2>
            <p className="text-white text-xl font-bold mt-2">
              Imposter is alive, ready to do or die.
            </p>
            <p className="text-red-400/70 text-sm mt-1 uppercase tracking-widest font-black">
              Ejected: {popup.name}
            </p>
          </div>
        </div>
      )}

      {/* 2. Top Header Status Area */}
      <div className="flex flex-col md:flex-row justify-between items-center border-b border-red-500/20 pb-4 mb-4 gap-4">
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-red-500/40 text-[10px] uppercase font-black tracking-widest">Protocol Phase</span>
            <span className="text-red-500 font-black text-2xl tracking-[0.05em] uppercase italic flex items-center gap-2">
              <ShieldAlert className="text-red-500 animate-pulse" size={20} />
              EMERGENCY DISCUSSION
            </span>
          </div>
        </div>

        {/* Pulsing Tiebreaker Warning */}
        <div className="flex items-center gap-3 bg-red-950/20 border border-red-500/30 px-6 py-2.5 rounded-lg animate-pulse max-w-md">
          <AlertTriangle className="text-red-500 flex-shrink-0" size={24} />
          <div className="text-[10px] md:text-xs text-red-400 font-black tracking-wide leading-tight">
            IMP INSTRUCTION: If votes are tied, a random tied player dies!
          </div>
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-red-500/40 text-[10px] uppercase font-black tracking-widest text-right">TALLY TIME REMAINING</span>
            <span className="text-red-500 font-black text-3xl tabular-nums drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
              {timeLeft.toString().padStart(2, '0')}<span className="text-red-500/40 text-lg">s</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Split Screen Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        {/* Left Side: Alive Player Profiles Grid (8 cols) */}
        <div className="lg:col-span-7 flex flex-col min-h-0 bg-black/40 border border-red-500/10 rounded-xl p-4">
          <div className="text-[11px] text-red-500/50 uppercase font-black tracking-[0.2em] mb-4 border-b border-red-500/10 pb-2 flex justify-between">
            <span>Grid Coordinates (Alive Targets)</span>
            <span>{!isAlive && <span className="text-red-400 font-black animate-pulse">[ DEAD - OBSERVING ]</span>}</span>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-1">
            {alivePlayers.map(p => {
              const hasVotedForThis = selectedVote === p.id;
              const hasCastTheirVote = p.id === myId ? selectedVote !== null : (otherPlayers[p.id]?.currentVote !== null);
              
              return (
                <div 
                  key={p.id}
                  onClick={() => isAlive && handleProfileClick(p.id)}
                  className={`bg-[#050000] border-2 rounded-xl p-4 flex flex-col justify-between transition-all duration-300 relative overflow-hidden group select-none ${
                    isAlive 
                      ? 'cursor-pointer hover:border-red-500/60 active:scale-[0.98]' 
                      : 'cursor-not-allowed opacity-60'
                  } ${
                    hasVotedForThis 
                      ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)] bg-red-950/10' 
                      : 'border-red-950/40'
                  }`}
                >
                  {/* Decorative corner tag */}
                  <div className="absolute top-0 right-0 w-2 h-2 bg-red-500/10 rounded-bl" />

                  <div className="flex items-center gap-3">
                    {/* Glowing Player Avatar Spot */}
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-black border shadow-inner relative"
                      style={{ 
                        backgroundColor: p.color,
                        borderColor: p.color,
                        boxShadow: `0 0 10px ${p.color}40`
                      }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                      {/* Voted check indicator */}
                      {hasCastTheirVote && (
                        <div className="absolute -top-1.5 -right-1.5 bg-red-500 border border-black w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-black animate-in zoom-in duration-200">
                          V
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col">
                      <span className="text-white font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                        {p.name}
                        {p.id === myId && <span className="text-lime-400 text-[10px] font-black uppercase">[Me]</span>}
                      </span>
                      <span className="text-red-500/40 text-[9px] font-black uppercase tracking-widest mt-0.5">
                        Target Linked
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-end mt-6 border-t border-red-950/30 pt-3">
                    <span className="text-[10px] text-red-500/30 uppercase font-black tracking-widest">
                      Eject Request Count
                    </span>
                    <span className="text-red-500 font-black text-2xl tabular-nums">
                      {voteTallies[p.id] || 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Chat Box & WebRTC Controls (5 cols) */}
        <div className="lg:col-span-5 flex flex-col min-h-0 bg-black/40 border border-red-500/10 rounded-xl p-4">
          
          {/* Audio Comms HUD Section */}
          <div className="flex items-center justify-between bg-red-950/10 border border-red-500/20 p-3 rounded-lg mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 flex items-center justify-center animate-pulse">
                <Volume2 size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-white text-[10px] font-black uppercase tracking-wider">Voice link channel</span>
                <span className="text-red-500/60 text-[9px] font-bold uppercase tracking-widest">
                  WebRTC discussion active
                </span>
              </div>
            </div>

            <button
              onClick={toggleMute}
              className={`flex items-center gap-2 px-4 py-2 border rounded font-black text-xs transition-all uppercase tracking-widest active:scale-95 ${
                isMuted
                  ? 'bg-red-500 border-red-500 text-black hover:bg-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                  : 'bg-red-500/10 border-red-500 text-red-500 hover:bg-red-500/20'
              }`}
            >
              {isMuted ? (
                <>
                  <MicOff size={14} strokeWidth={2.5} />
                  Muted
                </>
              ) : (
                <>
                  <Mic size={14} strokeWidth={2.5} />
                  Mic On
                </>
              )}
            </button>
          </div>

          <div className="text-[11px] text-red-500/50 uppercase font-black tracking-[0.2em] mb-2 border-b border-red-500/10 pb-2 flex items-center gap-2">
            <MessageSquare size={14} />
            <span>Encrypted Lobby Chat</span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 bg-[#030000] border border-red-950/50 rounded-lg p-3 overflow-y-auto flex flex-col gap-2.5 mb-4 custom-scrollbar">
            {chatHistory.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-red-500/20 text-xs italic font-bold">
                Awaiting pilot coordinates...
              </div>
            ) : (
              chatHistory.map((msg, index) => {
                const isSystem = msg.sender === 'System';
                
                return (
                  <div key={index} className="flex flex-col text-xs leading-normal animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span 
                        className={`font-black uppercase tracking-wide ${isSystem ? 'text-red-500' : 'text-white'}`}
                        style={{ color: isSystem ? undefined : undefined }} // we can apply specific colors if sent
                      >
                        {msg.sender}
                      </span>
                      <span className="text-red-500/30 text-[8px] tabular-nums">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-red-400 break-words font-medium ${isSystem ? 'text-red-500 font-bold italic' : ''}`}>
                      {msg.message}
                    </p>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={handleChatChange}
              placeholder={isAlive ? "TRANSMIT SQUAD MESSAGE..." : "👻 DEAD CAN ONLY TYPE EMOJIS..."}
              className="flex-1 bg-black border-2 border-red-950/60 focus:border-red-500 text-red-400 px-4 py-2 text-xs outline-none rounded-lg placeholder-red-500/30"
              maxLength={isAlive ? 100 : 30}
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="bg-red-500 text-black px-4 rounded-lg flex items-center justify-center hover:bg-white hover:scale-105 active:scale-95 disabled:opacity-20 disabled:scale-100 disabled:pointer-events-none transition-all"
            >
              <Send size={16} strokeWidth={2.5} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

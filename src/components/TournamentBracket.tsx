import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import {
  Tournament,
  TournamentBracket as ITournamentBracket,
  TournamentRound,
  TournamentMatch,
  TournamentPlayer,
  TournamentFormat,
  MatchStatus,
  PlayerStatus
} from '../types/party';
import { tournamentSoundService } from '../services/TournamentSoundService';
import './TournamentBracket.css';

interface TournamentBracketProps {
  tournament: Tournament;
  currentPlayerId?: string;
  onMatchSelect?: (match: TournamentMatch) => void;
  onPlayerSelect?: (player: TournamentPlayer) => void;
  showMatchDetails?: boolean;
  interactive?: boolean;
}

interface BracketNode {
  id: string;
  match?: TournamentMatch;
  player?: TournamentPlayer;
  round: number;
  position: number;
  children?: BracketNode[];
  parent?: BracketNode;
  isBye?: boolean;
}

export const TournamentBracket: React.FC<TournamentBracketProps> = ({
  tournament,
  currentPlayerId,
  onMatchSelect,
  onPlayerSelect,
  showMatchDetails = true,
  interactive = true
}) => {
  const { t } = useTranslation();
  const [selectedMatch, setSelectedMatch] = useState<TournamentMatch | null>(null);
  const [bracketView, setBracketView] = useState<'bracket' | 'rounds' | 'standings'>('bracket');
  const [bracketNodes, setBracketNodes] = useState<BracketNode[]>([]);
  const [animatingMatches, setAnimatingMatches] = useState<Set<string>>(new Set());
  const [recentlyCompletedMatches, setRecentlyCompletedMatches] = useState<Set<string>>(new Set());

  useEffect(() => {
    generateBracketNodes();
  }, [tournament]);

  // Handle match status changes for animations
  useEffect(() => {
    const allMatches = tournament.bracket.rounds.flatMap(round => round.matches);
    
    allMatches.forEach(match => {
      // Check for newly completed matches
      if (match.status === 'completed' && !recentlyCompletedMatches.has(match.id)) {
        setRecentlyCompletedMatches(prev => new Set(Array.from(prev).concat(match.id)));
        
        // Play sound effect
        if (match.player1Id === currentPlayerId || match.player2Id === currentPlayerId) {
          const isWinner = match.result?.winnerId === currentPlayerId;
          tournamentSoundService.playMatchEnd(isWinner);
          
          // Show notification via global animation system
          if ((window as any).tournamentAnimations) {
            if (isWinner) {
              const opponent = getPlayerById(match.player1Id === currentPlayerId ? match.player2Id : match.player1Id);
              (window as any).tournamentAnimations.showVictory(
                getPlayerById(currentPlayerId!)?.name || 'You',
                opponent?.name || 'Opponent'
              );
            } else {
              (window as any).tournamentAnimations.showElimination();
            }
          }
        }
        
        // Remove from recently completed after animation
        setTimeout(() => {
          setRecentlyCompletedMatches(prev => {
            const newSet = new Set(prev);
            newSet.delete(match.id);
            return newSet;
          });
        }, 3000);
      }
      
      // Check for matches ready to start
      if (match.status === 'scheduled' && 
          (match.player1Id === currentPlayerId || match.player2Id === currentPlayerId)) {
        if ((window as any).tournamentAnimations) {
          (window as any).tournamentAnimations.showMatchReady(
            getPlayerById(currentPlayerId!)?.name || 'You'
          );
        }
        tournamentSoundService.playMatchStart();
      }
    });
  }, [tournament.bracket, currentPlayerId, recentlyCompletedMatches]);

  const generateBracketNodes = () => {
    if (!tournament.bracket) return;

    const nodes: BracketNode[] = [];
    
    // Generate nodes based on tournament format
    switch (tournament.format) {
      case TournamentFormat.SINGLE_ELIMINATION:
        generateSingleEliminationNodes(nodes);
        break;
      case TournamentFormat.DOUBLE_ELIMINATION:
        generateDoubleEliminationNodes(nodes);
        break;
      case TournamentFormat.ROUND_ROBIN:
        generateRoundRobinNodes(nodes);
        break;
    }

    setBracketNodes(nodes);
  };

  const generateSingleEliminationNodes = (nodes: BracketNode[]) => {
    const rounds = tournament.bracket.rounds;
    let nodeId = 0;

    rounds.forEach((round, roundIndex) => {
      round.matches.forEach((match, matchIndex) => {
        const node: BracketNode = {
          id: `node_${nodeId++}`,
          match,
          round: roundIndex,
          position: matchIndex
        };
        nodes.push(node);
      });
    });
  };

  const generateDoubleEliminationNodes = (nodes: BracketNode[]) => {
    // Implementation for double elimination bracket
    // This would create both winners and losers bracket nodes
    generateSingleEliminationNodes(nodes); // Simplified for now
  };

  const generateRoundRobinNodes = (nodes: BracketNode[]) => {
    // Round robin doesn't use traditional bracket visualization
    // Instead, show a matrix or list of all matches
    generateSingleEliminationNodes(nodes); // Simplified for now
  };

  const handleMatchClick = (match: TournamentMatch) => {
    if (!interactive) return;
    
    tournamentSoundService.playButtonClick();
    setSelectedMatch(match);
    onMatchSelect?.(match);
  };

  const handlePlayerClick = (player: TournamentPlayer) => {
    if (!interactive) return;
    
    tournamentSoundService.playButtonClick();
    onPlayerSelect?.(player);
  };

  const getPlayerById = (playerId: string): TournamentPlayer | undefined => {
    return tournament.players.find(p => p.id === playerId);
  };

  const getMatchStatusColor = (status: MatchStatus): string => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'in_progress': return '#FF9800';
      case 'scheduled': return '#2196F3';
      case 'cancelled': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getPlayerStatusColor = (status: PlayerStatus): string => {
    switch (status) {
      case PlayerStatus.READY: return '#4CAF50';
      case PlayerStatus.ELIMINATED: return '#F44336';
      case PlayerStatus.WAITING: return '#FF9800';
      case PlayerStatus.IN_MATCH: return '#2196F3';
      case PlayerStatus.SPECTATING: return '#9C27B0';
      case PlayerStatus.DISCONNECTED: return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const renderBracketView = () => {
    if (tournament.format === TournamentFormat.ROUND_ROBIN) {
      return renderRoundRobinView();
    }

    return (
      <div className="bracket-container">
        <div className="bracket-rounds">
          {tournament.bracket.rounds.map((round, roundIndex) => (
            <div key={roundIndex} className="bracket-round">
              <div className="round-header">
                <h3>Round {round.roundNumber}</h3>
                <span className="round-status">{round.status}</span>
              </div>
              
              <div className="round-matches">
                {round.matches.map((match, matchIndex) => (
                  <div
                    key={match.id}
                    className={`bracket-match ${selectedMatch?.id === match.id ? 'selected' : ''} ${
                      match.player1Id === currentPlayerId || match.player2Id === currentPlayerId ? 'current-player' : ''
                    } ${match.status === 'completed' && match.result ? 'winner-celebration' : ''} ${
                      match.status === 'scheduled' && (match.player1Id === currentPlayerId || match.player2Id === currentPlayerId) ? 'match-ready' : ''
                    } ${recentlyCompletedMatches.has(match.id) ? 'just-completed' : ''}`}
                    onClick={() => handleMatchClick(match)}
                  >
                    <div className="match-header">
                      <span className="match-id">Match {matchIndex + 1}</span>
                      <span 
                        className="match-status"
                        style={{ color: getMatchStatusColor(match.status) }}
                      >
                        {match.status}
                      </span>
                    </div>
                    
                    <div className="match-players">
                      <div 
                        className={`match-player ${match.result?.winnerId === match.player1Id ? 'winner' : ''} ${
                          match.player1Id === currentPlayerId ? 'current' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const player1 = getPlayerById(match.player1Id);
                          if (player1) handlePlayerClick(player1);
                        }}
                      >
                        <span className="player-name">{getPlayerById(match.player1Id)?.name || 'TBD'}</span>
                        {match.result && (
                          <span className="player-score">{match.result.player1Score}</span>
                        )}
                      </div>
                      
                      <div className="match-vs">VS</div>
                      
                      <div 
                        className={`match-player ${match.result?.winnerId === match.player2Id ? 'winner' : ''} ${
                          match.player2Id === currentPlayerId ? 'current' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const player2 = getPlayerById(match.player2Id);
                          if (player2) handlePlayerClick(player2);
                        }}
                      >
                        <span className="player-name">{getPlayerById(match.player2Id)?.name || 'TBD'}</span>
                        {match.result && (
                          <span className="player-score">{match.result.player2Score}</span>
                        )}
                      </div>
                    </div>
                    
                    {match.startTime && (
                      <div className="match-time">
                        {new Date(match.startTime).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        {tournament.format === TournamentFormat.DOUBLE_ELIMINATION && (
          <div className="losers-bracket">
            <h3>Losers Bracket</h3>
            {/* Losers bracket implementation */}
          </div>
        )}
      </div>
    );
  };

  const renderRoundRobinView = () => {
    const players = tournament.players;
    const allMatches = tournament.bracket.rounds.flatMap(round => round.matches);

    return (
      <div className="round-robin-container">
        <div className="round-robin-matrix">
          <table className="rr-table">
            <thead>
              <tr>
                <th>Player</th>
                {players.map(player => (
                  <th key={player.id} className="player-header">
                    {player.name}
                  </th>
                ))}
                <th>W-L</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player1 => (
                <tr key={player1.id}>
                  <td className="player-name-cell">
                    <span 
                      className={`player-name ${player1.id === currentPlayerId ? 'current' : ''}`}
                      style={{ color: getPlayerStatusColor(player1.status) }}
                    >
                      {player1.name}
                    </span>
                  </td>
                  {players.map(player2 => (
                    <td key={player2.id} className="match-cell">
                      {player1.id === player2.id ? (
                        <span className="self-match">-</span>
                      ) : (
                        (() => {
                          const match = allMatches.find(m => 
                            (m.player1Id === player1.id && m.player2Id === player2.id) ||
                            (m.player1Id === player2.id && m.player2Id === player1.id)
                          );
                          
                          if (!match) return <span className="no-match">-</span>;
                          
                          const isPlayer1 = match.player1Id === player1.id;
                          const playerScore = isPlayer1 ? match.result?.player1Score : match.result?.player2Score;
                          const opponentScore = isPlayer1 ? match.result?.player2Score : match.result?.player1Score;
                          
                          return (
                            <div 
                              className={`rr-match ${match.status} ${match.result?.winnerId === player1.id ? 'won' : match.result?.winnerId === player2.id ? 'lost' : ''}`}
                              onClick={() => handleMatchClick(match)}
                            >
                              {match.result ? (
                                <span className="match-score">
                                  {playerScore}-{opponentScore}
                                </span>
                              ) : (
                                <span className="match-pending">
                                  {match.status === 'scheduled' ? '⏳' : '▶️'}
                                </span>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </td>
                  ))}
                  <td className="record-cell">
                    {player1.statistics.matchesWon}-{player1.statistics.matchesLost}
                  </td>
                  <td className="points-cell">
                    {player1.statistics.totalPoints}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderRoundsView = () => {
    return (
      <div className="rounds-view">
        {tournament.bracket.rounds.map((round, index) => (
          <div key={index} className="round-card">
            <div className="round-card-header">
              <h3>Round {round.roundNumber}</h3>
              <div className="round-info">
                <span className="round-status">{round.status}</span>
                <span className="round-matches">{round.matches.length} matches</span>
              </div>
            </div>
            
            <div className="round-matches-list">
              {round.matches.map((match, matchIndex) => (
                <div 
                  key={match.id}
                  className={`round-match ${selectedMatch?.id === match.id ? 'selected' : ''}`}
                  onClick={() => handleMatchClick(match)}
                >
                  <div className="match-info">
                    <span className="match-number">#{matchIndex + 1}</span>
                    <span 
                      className="match-status-badge"
                      style={{ backgroundColor: getMatchStatusColor(match.status) }}
                    >
                      {match.status}
                    </span>
                  </div>
                  
                  <div className="match-players-horizontal">
                    <span className={`player ${match.result?.winnerId === match.player1Id ? 'winner' : ''}`}>
                      {getPlayerById(match.player1Id)?.name || 'TBD'}
                      {match.result && ` (${match.result.player1Score})`}
                    </span>
                    <span className="vs">vs</span>
                    <span className={`player ${match.result?.winnerId === match.player2Id ? 'winner' : ''}`}>
                      {getPlayerById(match.player2Id)?.name || 'TBD'}
                      {match.result && ` (${match.result.player2Score})`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderStandingsView = () => {
    const sortedPlayers = [...tournament.players].sort((a, b) => {
      // Sort by elimination status first, then by points
      if (a.isEliminated !== b.isEliminated) {
        return a.isEliminated ? 1 : -1;
      }
      return b.statistics.totalPoints - a.statistics.totalPoints;
    });

    return (
      <div className="standings-view">
        <div className="standings-table">
          <div className="standings-header">
            <span className="rank-col">Rank</span>
            <span className="player-col">Player</span>
            <span className="record-col">W-L</span>
            <span className="points-col">Points</span>
            <span className="status-col">Status</span>
          </div>
          
          {sortedPlayers.map((player, index) => (
            <div 
              key={player.id}
              className={`standings-row ${player.id === currentPlayerId ? 'current-player' : ''} ${player.isEliminated ? 'eliminated' : ''}`}
              onClick={() => handlePlayerClick(player)}
            >
              <span className="rank-col">#{index + 1}</span>
              <span className="player-col">
                <span className="player-name">{player.name}</span>
                {player.isHost && <span className="host-badge">👑</span>}
              </span>
              <span className="record-col">
                {player.statistics.matchesWon}-{player.statistics.matchesLost}
              </span>
              <span className="points-col">{player.statistics.totalPoints}</span>
              <span 
                className="status-col"
                style={{ color: getPlayerStatusColor(player.status) }}
              >
                {player.isEliminated ? 'Eliminated' : player.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`tournament-bracket ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      <div className="bracket-header">
        <div className="bracket-title">
          <h2>{tournament.format} Tournament</h2>
          <span className="tournament-status">{tournament.status}</span>
        </div>
        
        <div className="bracket-controls">
          <div className="view-selector">
            <button 
              className={`view-btn ${bracketView === 'bracket' ? 'active' : ''}`}
              onClick={() => setBracketView('bracket')}
            >
              🏆 Bracket
            </button>
            <button 
              className={`view-btn ${bracketView === 'rounds' ? 'active' : ''}`}
              onClick={() => setBracketView('rounds')}
            >
              📋 Rounds
            </button>
            <button 
              className={`view-btn ${bracketView === 'standings' ? 'active' : ''}`}
              onClick={() => setBracketView('standings')}
            >
              📊 Standings
            </button>
          </div>
        </div>
      </div>

      <div className="bracket-content">
        {bracketView === 'bracket' && renderBracketView()}
        {bracketView === 'rounds' && renderRoundsView()}
        {bracketView === 'standings' && renderStandingsView()}
      </div>

      {showMatchDetails && selectedMatch && (
        <div className="match-details-panel">
          <div className="match-details-header">
            <h3>Match Details</h3>
            <button 
              className="close-details"
              onClick={() => setSelectedMatch(null)}
            >
              ✕
            </button>
          </div>
          
          <div className="match-details-content">
            <div className="match-info-grid">
              <div className="info-item">
                <label>Round:</label>
                <span>{selectedMatch.roundNumber}</span>
              </div>
              <div className="info-item">
                <label>Status:</label>
                <span style={{ color: getMatchStatusColor(selectedMatch.status) }}>
                  {selectedMatch.status}
                </span>
              </div>
              {selectedMatch.startTime && (
                <div className="info-item">
                  <label>Start Time:</label>
                  <span>{new Date(selectedMatch.startTime).toLocaleString()}</span>
                </div>
              )}
              {selectedMatch.endTime && (
                <div className="info-item">
                  <label>End Time:</label>
                  <span>{new Date(selectedMatch.endTime).toLocaleString()}</span>
                </div>
              )}
            </div>
            
            <div className="match-players-details">
              <div className="player-detail">
                <h4>{getPlayerById(selectedMatch.player1Id)?.name || 'TBD'}</h4>
                {selectedMatch.result && (
                  <div className="player-stats">
                    <span>Score: {selectedMatch.result.player1Score}</span>
                  </div>
                )}
              </div>
              
              <div className="vs-divider">VS</div>
              
              <div className="player-detail">
                <h4>{getPlayerById(selectedMatch.player2Id)?.name || 'TBD'}</h4>
                {selectedMatch.result && (
                  <div className="player-stats">
                    <span>Score: {selectedMatch.result.player2Score}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentBracket;
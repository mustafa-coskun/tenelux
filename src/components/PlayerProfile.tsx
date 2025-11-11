import React from 'react';
import { PlayerProfileProps } from '../types';

// PlayerProfile component - to be implemented in task 6
const PlayerProfile: React.FC<PlayerProfileProps> = ({
  player,
  statistics,
}) => {
  return (
    <div>
      <h3>Player Profile - To be implemented in task 6</h3>
      <p>Name: {player.name}</p>
      <p>Trust Score: {player.trustScore}</p>
      <p>Games Played: {player.totalGamesPlayed}</p>
    </div>
  );
};

export default PlayerProfile;

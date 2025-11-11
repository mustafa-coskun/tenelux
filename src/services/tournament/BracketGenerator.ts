import {
  TournamentPlayer,
  TournamentBracket,
  TournamentRound,
  TournamentMatch,
  MatchResult,
  MatchPairing,
  BracketGenerator,
  BracketUpdate,
  TournamentFormat,
  RoundStatus,
  MatchStatus,
  PlayerStatus
} from '../../types/party';

/**
 * Base class for tournament bracket generation
 */
export abstract class BaseBracketGenerator implements BracketGenerator {
  abstract generateBracket(players: TournamentPlayer[]): TournamentBracket;
  abstract processMatchResult(result: MatchResult, bracket: TournamentBracket): BracketUpdate;
  abstract getNextMatches(bracket: TournamentBracket): MatchPairing[];
  abstract isComplete(bracket: TournamentBracket): boolean;

  protected generateMatchId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected shufflePlayers(players: TournamentPlayer[]): TournamentPlayer[] {
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  protected createMatch(
    player1Id: string,
    player2Id: string,
    tournamentId: string,
    roundNumber: number
  ): TournamentMatch {
    return {
      id: this.generateMatchId(),
      tournamentId,
      roundNumber,
      player1Id,
      player2Id,
      status: MatchStatus.SCHEDULED
    };
  }
}

/**
 * Single Elimination Tournament Bracket Generator
 */
export class SingleEliminationBracket extends BaseBracketGenerator {
  generateBracket(players: TournamentPlayer[]): TournamentBracket {
    const shuffledPlayers = this.shufflePlayers(players);
    const rounds: TournamentRound[] = [];
    
    // Calculate number of rounds needed
    const totalRounds = Math.ceil(Math.log2(players.length));
    
    // Generate first round with all players
    const firstRoundMatches = this.generateFirstRound(shuffledPlayers, 'tournament_temp');
    
    rounds.push({
      roundNumber: 1,
      matches: firstRoundMatches,
      status: RoundStatus.NOT_STARTED,
      startTime: new Date()
    });

    // Generate placeholder rounds for the bracket structure
    for (let round = 2; round <= totalRounds; round++) {
      rounds.push({
        roundNumber: round,
        matches: [],
        status: RoundStatus.NOT_STARTED,
        startTime: new Date()
      });
    }

    return {
      rounds,
      eliminatedPlayers: [],
      activeMatches: new Map(),
      nextMatchPairings: this.getFirstRoundPairings(shuffledPlayers)
    };
  }

  private generateFirstRound(players: TournamentPlayer[], tournamentId: string): TournamentMatch[] {
    const matches: TournamentMatch[] = [];
    
    // Handle odd number of players with bye
    const playersToMatch = players.length % 2 === 0 ? players : players.slice(0, -1);
    
    for (let i = 0; i < playersToMatch.length; i += 2) {
      matches.push(this.createMatch(
        playersToMatch[i].id,
        playersToMatch[i + 1].id,
        tournamentId,
        1
      ));
    }

    return matches;
  }

  private getFirstRoundPairings(players: TournamentPlayer[]): MatchPairing[] {
    const pairings: MatchPairing[] = [];
    const playersToMatch = players.length % 2 === 0 ? players : players.slice(0, -1);
    
    for (let i = 0; i < playersToMatch.length; i += 2) {
      pairings.push({
        player1Id: playersToMatch[i].id,
        player2Id: playersToMatch[i + 1].id,
        roundNumber: 1,
        bracketPosition: Math.floor(i / 2)
      });
    }

    return pairings;
  }

  processMatchResult(result: MatchResult, bracket: TournamentBracket): BracketUpdate {
    const updatedBracket = { ...bracket };
    const eliminatedPlayers = [...bracket.eliminatedPlayers];
    
    // Find and update the completed match
    const currentRound = updatedBracket.rounds.find(r => 
      r.matches.some(m => m.id === result.matchId)
    );
    
    if (!currentRound) {
      throw new Error('Match not found in bracket');
    }

    const match = currentRound.matches.find(m => m.id === result.matchId);
    if (match) {
      match.status = MatchStatus.COMPLETED;
      match.result = result;
      match.endTime = new Date();
    }

    // Add loser to eliminated players
    const loser = bracket.activeMatches.get(result.matchId)?.player1.id === result.loserId
      ? bracket.activeMatches.get(result.matchId)?.player1
      : bracket.activeMatches.get(result.matchId)?.player2;
    
    if (loser) {
      loser.isEliminated = true;
      loser.status = PlayerStatus.ELIMINATED;
      eliminatedPlayers.push(loser);
    }

    // Remove from active matches
    updatedBracket.activeMatches.delete(result.matchId);

    // Check if round is complete and advance winner
    const nextMatches = this.advanceWinner(result.winnerId, currentRound, updatedBracket);
    
    const isComplete = this.isComplete(updatedBracket);

    return {
      updatedBracket,
      eliminatedPlayers,
      nextMatches,
      isComplete
    };
  }

  private advanceWinner(winnerId: string, currentRound: TournamentRound, bracket: TournamentBracket): MatchPairing[] {
    const nextRoundNumber = currentRound.roundNumber + 1;
    const nextRound = bracket.rounds.find(r => r.roundNumber === nextRoundNumber);
    
    if (!nextRound) {
      return []; // Tournament complete
    }

    // Check if all matches in current round are complete
    const allMatchesComplete = currentRound.matches.every(m => m.status === MatchStatus.COMPLETED);
    
    if (allMatchesComplete) {
      currentRound.status = RoundStatus.COMPLETED;
      currentRound.endTime = new Date();
      
      // Generate next round matches
      const winners = currentRound.matches
        .filter(m => m.result)
        .map(m => m.result!.winnerId);
      
      const nextMatches: MatchPairing[] = [];
      for (let i = 0; i < winners.length; i += 2) {
        if (i + 1 < winners.length) {
          nextMatches.push({
            player1Id: winners[i],
            player2Id: winners[i + 1],
            roundNumber: nextRoundNumber,
            bracketPosition: Math.floor(i / 2)
          });
        }
      }
      
      return nextMatches;
    }

    return [];
  }

  getNextMatches(bracket: TournamentBracket): MatchPairing[] {
    // Find the first round that's not complete
    const nextRound = bracket.rounds.find(r => r.status === RoundStatus.NOT_STARTED);
    
    if (!nextRound) {
      return [];
    }

    // If it's the first round, return existing pairings
    if (nextRound.roundNumber === 1) {
      return bracket.nextMatchPairings;
    }

    // For subsequent rounds, check if previous round is complete
    const previousRound = bracket.rounds.find(r => r.roundNumber === nextRound.roundNumber - 1);
    if (previousRound?.status === RoundStatus.COMPLETED) {
      return bracket.nextMatchPairings;
    }

    return [];
  }

  isComplete(bracket: TournamentBracket): boolean {
    const lastRound = bracket.rounds[bracket.rounds.length - 1];
    return lastRound.status === RoundStatus.COMPLETED && 
           lastRound.matches.length === 1 && 
           lastRound.matches[0].status === MatchStatus.COMPLETED;
  }
}

/**
 * Double Elimination Tournament Bracket Generator
 * Implements full double elimination with winners and losers brackets
 */
export class DoubleEliminationBracket extends BaseBracketGenerator {
  private winnersRounds: TournamentRound[] = [];
  private losersRounds: TournamentRound[] = [];

  generateBracket(players: TournamentPlayer[]): TournamentBracket {
    const shuffledPlayers = this.shufflePlayers(players);
    const rounds: TournamentRound[] = [];
    
    // Generate winners bracket first round
    const winnersFirstRound = this.generateWinnersFirstRound(shuffledPlayers, 'tournament_temp');
    this.winnersRounds = [winnersFirstRound];
    
    // Calculate total winners bracket rounds
    const winnersRoundsCount = Math.ceil(Math.log2(players.length));
    
    // Generate placeholder winners rounds
    for (let round = 2; round <= winnersRoundsCount; round++) {
      this.winnersRounds.push({
        roundNumber: round,
        matches: [],
        status: RoundStatus.NOT_STARTED,
        startTime: new Date()
      });
    }

    // Generate losers bracket structure
    this.generateLosersBracketStructure(players.length);
    
    // Combine all rounds (winners first, then losers, then grand finals)
    rounds.push(...this.winnersRounds);
    rounds.push(...this.losersRounds);
    
    // Add grand finals round
    const grandFinalsRound: TournamentRound = {
      roundNumber: rounds.length + 1,
      matches: [],
      status: RoundStatus.NOT_STARTED,
      startTime: new Date()
    };
    rounds.push(grandFinalsRound);

    return {
      rounds,
      eliminatedPlayers: [],
      activeMatches: new Map(),
      nextMatchPairings: this.getFirstRoundPairings(shuffledPlayers)
    };
  }

  private generateWinnersFirstRound(players: TournamentPlayer[], tournamentId: string): TournamentRound {
    const matches: TournamentMatch[] = [];
    const playersToMatch = players.length % 2 === 0 ? players : players.slice(0, -1);
    
    for (let i = 0; i < playersToMatch.length; i += 2) {
      matches.push(this.createMatch(
        playersToMatch[i].id,
        playersToMatch[i + 1].id,
        tournamentId,
        1
      ));
    }

    return {
      roundNumber: 1,
      matches,
      status: RoundStatus.NOT_STARTED,
      startTime: new Date()
    };
  }

  private generateLosersBracketStructure(playerCount: number): void {
    // Losers bracket has approximately 2 * log2(n) - 1 rounds
    const losersRoundsCount = Math.max(1, (Math.ceil(Math.log2(playerCount)) * 2) - 2);
    
    for (let round = 1; round <= losersRoundsCount; round++) {
      this.losersRounds.push({
        roundNumber: this.winnersRounds.length + round,
        matches: [],
        status: RoundStatus.NOT_STARTED,
        startTime: new Date()
      });
    }
  }

  private getFirstRoundPairings(players: TournamentPlayer[]): MatchPairing[] {
    const pairings: MatchPairing[] = [];
    const playersToMatch = players.length % 2 === 0 ? players : players.slice(0, -1);
    
    for (let i = 0; i < playersToMatch.length; i += 2) {
      pairings.push({
        player1Id: playersToMatch[i].id,
        player2Id: playersToMatch[i + 1].id,
        roundNumber: 1,
        bracketPosition: Math.floor(i / 2)
      });
    }

    return pairings;
  }

  processMatchResult(result: MatchResult, bracket: TournamentBracket): BracketUpdate {
    const updatedBracket = { ...bracket };
    const eliminatedPlayers = [...bracket.eliminatedPlayers];
    
    // Find the match and determine if it's in winners or losers bracket
    const matchRound = updatedBracket.rounds.find(r => 
      r.matches.some(m => m.id === result.matchId)
    );
    
    if (!matchRound) {
      throw new Error('Match not found in bracket');
    }

    const match = matchRound.matches.find(m => m.id === result.matchId);
    if (match) {
      match.status = MatchStatus.COMPLETED;
      match.result = result;
      match.endTime = new Date();
    }

    const isWinnersBracket = matchRound.roundNumber <= this.winnersRounds.length;
    const isGrandFinals = matchRound.roundNumber === updatedBracket.rounds.length;

    if (isGrandFinals) {
      // Grand finals completed - tournament over
      return {
        updatedBracket,
        eliminatedPlayers,
        nextMatches: [],
        isComplete: true
      };
    }

    let nextMatches: MatchPairing[] = [];

    if (isWinnersBracket) {
      // Winners bracket match
      nextMatches = this.processWinnersBracketResult(result, updatedBracket, matchRound);
      
      // Loser goes to losers bracket (not eliminated yet)
      const loser = bracket.activeMatches.get(result.matchId)?.player1.id === result.loserId
        ? bracket.activeMatches.get(result.matchId)?.player1
        : bracket.activeMatches.get(result.matchId)?.player2;
      
      if (loser) {
        loser.status = PlayerStatus.WAITING; // Still in tournament, just in losers bracket
      }
    } else {
      // Losers bracket match
      nextMatches = this.processLosersBracketResult(result, updatedBracket, matchRound);
      
      // Loser is eliminated from tournament
      const loser = bracket.activeMatches.get(result.matchId)?.player1.id === result.loserId
        ? bracket.activeMatches.get(result.matchId)?.player1
        : bracket.activeMatches.get(result.matchId)?.player2;
      
      if (loser) {
        loser.isEliminated = true;
        loser.status = PlayerStatus.ELIMINATED;
        eliminatedPlayers.push(loser);
      }
    }

    // Remove from active matches
    updatedBracket.activeMatches.delete(result.matchId);

    // Check if we need to create grand finals
    const isComplete = this.checkForGrandFinals(updatedBracket) || this.isComplete(updatedBracket);

    return {
      updatedBracket,
      eliminatedPlayers,
      nextMatches,
      isComplete
    };
  }

  private processWinnersBracketResult(
    result: MatchResult, 
    bracket: TournamentBracket, 
    currentRound: TournamentRound
  ): MatchPairing[] {
    // Winner advances in winners bracket
    const nextWinnersRound = bracket.rounds.find(r => r.roundNumber === currentRound.roundNumber + 1);
    
    if (nextWinnersRound && nextWinnersRound.roundNumber <= this.winnersRounds.length) {
      // Create match in next winners round
      return [{
        player1Id: result.winnerId,
        player2Id: '', // Will be filled when opponent is determined
        roundNumber: nextWinnersRound.roundNumber,
        bracketPosition: 0
      }];
    }

    return [];
  }

  private processLosersBracketResult(
    result: MatchResult, 
    bracket: TournamentBracket, 
    currentRound: TournamentRound
  ): MatchPairing[] {
    // Winner advances in losers bracket
    const nextLosersRound = bracket.rounds.find(r => 
      r.roundNumber === currentRound.roundNumber + 1 && 
      r.roundNumber > this.winnersRounds.length
    );
    
    if (nextLosersRound) {
      return [{
        player1Id: result.winnerId,
        player2Id: '', // Will be filled when opponent is determined
        roundNumber: nextLosersRound.roundNumber,
        bracketPosition: 0
      }];
    }

    return [];
  }

  private checkForGrandFinals(bracket: TournamentBracket): boolean {
    // Check if both winners and losers bracket finals are complete
    const winnersFinalsComplete = this.winnersRounds[this.winnersRounds.length - 1]?.status === RoundStatus.COMPLETED;
    const losersFinalsComplete = this.losersRounds[this.losersRounds.length - 1]?.status === RoundStatus.COMPLETED;
    
    if (winnersFinalsComplete && losersFinalsComplete) {
      // Create grand finals match
      const grandFinalsRound = bracket.rounds[bracket.rounds.length - 1];
      if (grandFinalsRound.matches.length === 0) {
        // Get winners bracket champion and losers bracket champion
        const winnersChampion = this.getWinnersBracketChampion(bracket);
        const losersChampion = this.getLosersBracketChampion(bracket);
        
        if (winnersChampion && losersChampion) {
          const grandFinalsMatch = this.createMatch(
            winnersChampion,
            losersChampion,
            'tournament_temp',
            grandFinalsRound.roundNumber
          );
          
          grandFinalsRound.matches.push(grandFinalsMatch);
          grandFinalsRound.status = RoundStatus.IN_PROGRESS;
          
          return true;
        }
      }
    }

    return false;
  }

  private getWinnersBracketChampion(bracket: TournamentBracket): string | null {
    const winnersFinalsRound = this.winnersRounds[this.winnersRounds.length - 1];
    const finalMatch = winnersFinalsRound?.matches[0];
    return finalMatch?.result?.winnerId || null;
  }

  private getLosersBracketChampion(bracket: TournamentBracket): string | null {
    const losersFinalsRound = this.losersRounds[this.losersRounds.length - 1];
    const finalMatch = losersFinalsRound?.matches[0];
    return finalMatch?.result?.winnerId || null;
  }

  getNextMatches(bracket: TournamentBracket): MatchPairing[] {
    // Find matches ready to be played in winners bracket first
    for (const round of this.winnersRounds) {
      if (round.status === RoundStatus.NOT_STARTED && this.canStartRound(round, bracket)) {
        return round.matches.map(match => ({
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          roundNumber: match.roundNumber,
          bracketPosition: 0
        }));
      }
    }

    // Then check losers bracket
    for (const round of this.losersRounds) {
      if (round.status === RoundStatus.NOT_STARTED && this.canStartRound(round, bracket)) {
        return round.matches.map(match => ({
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          roundNumber: match.roundNumber,
          bracketPosition: 0
        }));
      }
    }

    // Check grand finals
    const grandFinalsRound = bracket.rounds[bracket.rounds.length - 1];
    if (grandFinalsRound.status === RoundStatus.NOT_STARTED && grandFinalsRound.matches.length > 0) {
      return grandFinalsRound.matches.map(match => ({
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        roundNumber: match.roundNumber,
        bracketPosition: 0
      }));
    }

    return [];
  }

  private canStartRound(round: TournamentRound, bracket: TournamentBracket): boolean {
    if (round.roundNumber === 1) return true;
    
    const previousRound = bracket.rounds.find(r => r.roundNumber === round.roundNumber - 1);
    return previousRound?.status === RoundStatus.COMPLETED;
  }

  isComplete(bracket: TournamentBracket): boolean {
    const grandFinalsRound = bracket.rounds[bracket.rounds.length - 1];
    return grandFinalsRound.status === RoundStatus.COMPLETED && 
           grandFinalsRound.matches.length > 0 && 
           grandFinalsRound.matches[0].status === MatchStatus.COMPLETED;
  }
}

/**
 * Round Robin Tournament Bracket Generator
 * Implements fair round-robin scheduling with optimal pairing distribution
 */
export class RoundRobinBracket extends BaseBracketGenerator {
  generateBracket(players: TournamentPlayer[]): TournamentBracket {
    const rounds: TournamentRound[] = [];
    
    // Use round-robin algorithm for fair scheduling
    const roundSchedule = this.generateRoundRobinSchedule(players);
    
    for (let roundNum = 1; roundNum <= roundSchedule.length; roundNum++) {
      const roundPairings = roundSchedule[roundNum - 1];
      
      const matches = roundPairings.map(pairing => 
        this.createMatch(pairing.player1Id, pairing.player2Id, 'tournament_temp', roundNum)
      );

      rounds.push({
        roundNumber: roundNum,
        matches,
        status: roundNum === 1 ? RoundStatus.NOT_STARTED : RoundStatus.NOT_STARTED,
        startTime: new Date()
      });
    }

    return {
      rounds,
      eliminatedPlayers: [],
      activeMatches: new Map(),
      nextMatchPairings: roundSchedule.length > 0 ? roundSchedule[0] : []
    };
  }

  /**
   * Generate optimal round-robin schedule using circle method
   * Ensures each player plays exactly once per round when possible
   */
  private generateRoundRobinSchedule(players: TournamentPlayer[]): MatchPairing[][] {
    const playerIds = players.map(p => p.id);
    const n = playerIds.length;
    
    // Handle odd number of players by adding a "bye" placeholder
    const hasOddPlayers = n % 2 === 1;
    const workingPlayers = hasOddPlayers ? [...playerIds, 'BYE'] : [...playerIds];
    const totalPlayers = workingPlayers.length;
    
    const rounds: MatchPairing[][] = [];
    const totalRounds = totalPlayers - 1;
    
    for (let round = 0; round < totalRounds; round++) {
      const roundPairings: MatchPairing[] = [];
      
      // Use circle method for round-robin scheduling
      for (let match = 0; match < totalPlayers / 2; match++) {
        let player1Index: number;
        let player2Index: number;
        
        if (match === 0) {
          // First player stays fixed
          player1Index = 0;
          player2Index = totalPlayers - 1 - round;
        } else {
          // Other players rotate
          player1Index = (match + round) % (totalPlayers - 1);
          if (player1Index >= totalPlayers - 1 - round) {
            player1Index++;
          }
          
          player2Index = (totalPlayers - 1 - match + round) % (totalPlayers - 1);
          if (player2Index >= totalPlayers - 1 - round) {
            player2Index++;
          }
        }
        
        // Normalize indices
        player1Index = player1Index % totalPlayers;
        player2Index = player2Index % totalPlayers;
        
        const player1Id = workingPlayers[player1Index];
        const player2Id = workingPlayers[player2Index];
        
        // Skip matches involving the "BYE" player
        if (player1Id !== 'BYE' && player2Id !== 'BYE') {
          roundPairings.push({
            player1Id,
            player2Id,
            roundNumber: round + 1,
            bracketPosition: match
          });
        }
      }
      
      if (roundPairings.length > 0) {
        rounds.push(roundPairings);
      }
    }
    
    return rounds;
  }

  /**
   * Alternative fair pairing method for smaller tournaments
   */
  private generateFairPairings(players: TournamentPlayer[]): MatchPairing[][] {
    const allPairings = this.generateAllPairings(players);
    const rounds: MatchPairing[][] = [];
    const usedPairings = new Set<string>();
    
    const maxConcurrentMatches = Math.floor(players.length / 2);
    
    while (usedPairings.size < allPairings.length) {
      const roundPairings: MatchPairing[] = [];
      const playersInRound = new Set<string>();
      
      for (const pairing of allPairings) {
        const pairingKey = `${pairing.player1Id}-${pairing.player2Id}`;
        
        if (!usedPairings.has(pairingKey) && 
            !playersInRound.has(pairing.player1Id) && 
            !playersInRound.has(pairing.player2Id) &&
            roundPairings.length < maxConcurrentMatches) {
          
          roundPairings.push({
            ...pairing,
            roundNumber: rounds.length + 1
          });
          
          usedPairings.add(pairingKey);
          playersInRound.add(pairing.player1Id);
          playersInRound.add(pairing.player2Id);
        }
      }
      
      if (roundPairings.length > 0) {
        rounds.push(roundPairings);
      } else {
        break; // Prevent infinite loop
      }
    }
    
    return rounds;
  }

  private generateAllPairings(players: TournamentPlayer[]): MatchPairing[] {
    const pairings: MatchPairing[] = [];
    
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        pairings.push({
          player1Id: players[i].id,
          player2Id: players[j].id,
          roundNumber: 1, // Will be updated when distributed to rounds
          bracketPosition: pairings.length
        });
      }
    }

    return pairings;
  }

  private calculateRoundsNeeded(playerCount: number): number {
    // In round robin, each player plays (n-1) matches
    // With optimal scheduling, we need (n-1) rounds for even n, n rounds for odd n
    return playerCount % 2 === 0 ? playerCount - 1 : playerCount;
  }

  processMatchResult(result: MatchResult, bracket: TournamentBracket): BracketUpdate {
    const updatedBracket = { ...bracket };
    
    // Find and update the completed match
    const currentRound = updatedBracket.rounds.find(r => 
      r.matches.some(m => m.id === result.matchId)
    );
    
    if (!currentRound) {
      throw new Error('Match not found in bracket');
    }

    const match = currentRound.matches.find(m => m.id === result.matchId);
    if (match) {
      match.status = MatchStatus.COMPLETED;
      match.result = result;
      match.endTime = new Date();
    }

    // Remove from active matches
    updatedBracket.activeMatches.delete(result.matchId);

    // Check if round is complete
    const allMatchesComplete = currentRound.matches.every(m => m.status === MatchStatus.COMPLETED);
    if (allMatchesComplete) {
      currentRound.status = RoundStatus.COMPLETED;
      currentRound.endTime = new Date();
    }

    // Get next matches from next round
    const nextMatches = this.getNextRoundMatches(updatedBracket, currentRound.roundNumber);
    
    const isComplete = this.isComplete(updatedBracket);

    return {
      updatedBracket,
      eliminatedPlayers: [], // No eliminations in round robin
      nextMatches,
      isComplete
    };
  }

  private getNextRoundMatches(bracket: TournamentBracket, completedRoundNumber: number): MatchPairing[] {
    const nextRound = bracket.rounds.find(r => r.roundNumber === completedRoundNumber + 1);
    
    if (!nextRound || nextRound.status !== RoundStatus.NOT_STARTED) {
      return [];
    }

    return nextRound.matches.map(match => ({
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      roundNumber: match.roundNumber,
      bracketPosition: 0
    }));
  }

  getNextMatches(bracket: TournamentBracket): MatchPairing[] {
    // Find the first round that's not complete
    const nextRound = bracket.rounds.find(r => r.status === RoundStatus.NOT_STARTED);
    
    if (!nextRound) {
      return [];
    }

    return nextRound.matches.map(match => ({
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      roundNumber: match.roundNumber,
      bracketPosition: 0
    }));
  }

  isComplete(bracket: TournamentBracket): boolean {
    return bracket.rounds.every(round => round.status === RoundStatus.COMPLETED);
  }
}

/**
 * Factory for creating bracket generators
 */
export class BracketGeneratorFactory {
  static create(format: TournamentFormat): BracketGenerator {
    switch (format) {
      case TournamentFormat.SINGLE_ELIMINATION:
        return new SingleEliminationBracket();
      case TournamentFormat.DOUBLE_ELIMINATION:
        return new DoubleEliminationBracket();
      case TournamentFormat.ROUND_ROBIN:
        return new RoundRobinBracket();
      default:
        throw new Error(`Unsupported tournament format: ${format}`);
    }
  }
}

export default BracketGeneratorFactory;
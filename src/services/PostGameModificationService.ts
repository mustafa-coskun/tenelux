// Post-Game Modification Service - Handle game result modifications with mutual consent

import { 
  ModificationRequest, 
  GameModification, 
  ModificationResult, 
  PostGameStats,
  GameResults,
  EnhancedGameResult
} from '../database/core/types';
import { getLogger } from './LoggingService';
import { getDatabaseManager } from '../database/DatabaseManager';
import { ValidationError, NotFoundError } from '../database/core/errors';

export interface IPostGameModificationService {
  submitModificationRequest(gameId: string, playerId: string, request: ModificationRequest): Promise<void>;
  processModifications(gameId: string): Promise<ModificationResult>;
  showPostGameStats(gameId: string): Promise<PostGameStats>;
  getModificationHistory(gameId: string): Promise<GameModification | null>;
  hasModificationRequest(gameId: string, playerId: string): Promise<boolean>;
  getModificationStatus(gameId: string): Promise<'none' | 'pending' | 'applied' | 'rejected'>;
}

export class PostGameModificationService implements IPostGameModificationService {
  private readonly logger = getLogger();

  constructor() {
    this.logger.info('Post-Game Modification Service initialized');
  }

  /**
   * Submit a modification request for a completed game
   */
  async submitModificationRequest(gameId: string, playerId: string, request: ModificationRequest): Promise<void> {
    try {
      this.logger.debug('Submitting modification request', { gameId, playerId, request });

      // Validate the game exists and is completed
      await this.validateGameForModification(gameId);

      // Validate the player is part of the game
      await this.validatePlayerInGame(gameId, playerId);

      // Validate the modification request
      this.validateModificationRequest(request);

      const dbManager = getDatabaseManager();

      // Check if modification record exists
      let existingModification = await this.getModificationRecord(gameId);

      if (!existingModification) {
        // Create new modification record
        await dbManager.executeRawCommand(
          `INSERT INTO game_modifications 
           (game_id, player1_id, player2_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            gameId,
            await this.getPlayer1Id(gameId),
            await this.getPlayer2Id(gameId),
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
        existingModification = await this.getModificationRecord(gameId);
      }

      if (!existingModification) {
        throw new Error('Failed to create modification record');
      }

      // Determine which player is making the request
      const isPlayer1 = existingModification.player1Id === playerId;
      const isPlayer2 = existingModification.player2Id === playerId;

      if (!isPlayer1 && !isPlayer2) {
        throw new ValidationError('Player not authorized to modify this game');
      }

      // Update the appropriate player's request
      if (isPlayer1) {
        await this.updatePlayer1Request(gameId, request);
      } else {
        await this.updatePlayer2Request(gameId, request);
      }

      // Check if both players have submitted requests and process if needed
      const updatedModification = await this.getModificationRecord(gameId);
      if (updatedModification && updatedModification.player1Request && updatedModification.player2Request) {
        await this.processModifications(gameId);
      }

      this.logger.info('Modification request submitted successfully', { gameId, playerId });
    } catch (error) {
      this.logger.error('Failed to submit modification request', error as Error, { gameId, playerId });
      throw error;
    }
  }

  /**
   * Process modifications when both players have submitted requests
   */
  async processModifications(gameId: string): Promise<ModificationResult> {
    try {
      this.logger.debug('Processing modifications', { gameId });

      const modification = await this.getModificationRecord(gameId);
      if (!modification) {
        throw new NotFoundError('No modification record found', { gameId });
      }

      if (!modification.player1Request || !modification.player2Request) {
        throw new ValidationError('Both players must submit requests before processing');
      }

      // Parse the requests
      const player1Request = JSON.parse(modification.player1Request) as ModificationRequest;
      const player2Request = JSON.parse(modification.player2Request) as ModificationRequest;

      // Check if requests match (mutual consent)
      const requestsMatch = this.doRequestsMatch(player1Request, player2Request);

      let finalResult: GameResults;
      let applied = false;
      let reason = '';

      if (requestsMatch && player1Request.type !== 'no_change') {
        // Apply the modification
        finalResult = await this.applyModification(gameId, player1Request);
        applied = true;
        reason = 'Mutual consent - modification applied';
      } else {
        // Keep original result
        finalResult = await this.getOriginalGameResult(gameId);
        applied = false;
        reason = requestsMatch 
          ? 'Both players agreed to no changes' 
          : 'Requests did not match - no modification applied';
      }

      // Update modification record with final decision
      await this.updateModificationRecord(gameId, {
        finalDecision: JSON.stringify({
          applied,
          reason,
          processedAt: new Date().toISOString()
        }),
        applied
      });

      const result: ModificationResult = {
        applied,
        finalResult,
        reason
      };

      this.logger.info('Modifications processed', { gameId, applied, reason });
      return result;
    } catch (error) {
      this.logger.error('Failed to process modifications', error as Error, { gameId });
      throw error;
    }
  }

  /**
   * Show post-game statistics regardless of modification status
   */
  async showPostGameStats(gameId: string): Promise<PostGameStats> {
    try {
      this.logger.debug('Showing post-game statistics', { gameId });

      // Get game results (original or modified)
      const gameResults = await this.getFinalGameResult(gameId);
      
      // Get player statistics from the game
      const playerStats = await this.getPlayerStatsFromGame(gameId);
      
      // Get modification status
      const modificationStatus = await this.getModificationStatus(gameId);

      const postGameStats: PostGameStats = {
        gameId,
        player1Stats: playerStats.player1,
        player2Stats: playerStats.player2,
        gameResults,
        modificationStatus
      };

      this.logger.info('Post-game statistics retrieved', { gameId });
      return postGameStats;
    } catch (error) {
      this.logger.error('Failed to show post-game statistics', error as Error, { gameId });
      throw error;
    }
  }

  /**
   * Get modification history for a game
   */
  async getModificationHistory(gameId: string): Promise<GameModification | null> {
    try {
      return await this.getModificationRecord(gameId);
    } catch (error) {
      this.logger.error('Failed to get modification history', error as Error, { gameId });
      throw error;
    }
  }

  /**
   * Check if a player has submitted a modification request
   */
  async hasModificationRequest(gameId: string, playerId: string): Promise<boolean> {
    try {
      const modification = await this.getModificationRecord(gameId);
      if (!modification) {
        return false;
      }

      const isPlayer1 = modification.player1Id === playerId;
      const isPlayer2 = modification.player2Id === playerId;

      if (isPlayer1) {
        return !!modification.player1Request;
      } else if (isPlayer2) {
        return !!modification.player2Request;
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to check modification request', error as Error, { gameId, playerId });
      return false;
    }
  }

  /**
   * Get the current modification status for a game
   */
  async getModificationStatus(gameId: string): Promise<'none' | 'pending' | 'applied' | 'rejected'> {
    try {
      const modification = await this.getModificationRecord(gameId);
      if (!modification) {
        return 'none';
      }

      if (modification.applied) {
        return 'applied';
      }

      if (modification.finalDecision) {
        return 'rejected';
      }

      if (modification.player1Request || modification.player2Request) {
        return 'pending';
      }

      return 'none';
    } catch (error) {
      this.logger.error('Failed to get modification status', error as Error, { gameId });
      return 'none';
    }
  }

  // Private helper methods

  private async validateGameForModification(gameId: string): Promise<void> {
    const dbManager = getDatabaseManager();
    
    const game = await dbManager.executeRawQuery<any>(
      'SELECT status, completed_at FROM games WHERE id = ?',
      [gameId]
    );

    if (game.length === 0) {
      throw new NotFoundError('Game not found', { gameId });
    }

    if (game[0].status !== 'completed') {
      throw new ValidationError('Game must be completed to request modifications');
    }

    if (!game[0].completed_at) {
      throw new ValidationError('Game completion time not recorded');
    }

    // Check if modification window has expired (e.g., 24 hours)
    const completedAt = new Date(game[0].completed_at);
    const now = new Date();
    const hoursSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceCompletion > 24) {
      throw new ValidationError('Modification window has expired (24 hours after game completion)');
    }
  }

  private async validatePlayerInGame(gameId: string, playerId: string): Promise<void> {
    const dbManager = getDatabaseManager();
    
    const game = await dbManager.executeRawQuery<any>(
      'SELECT players FROM games WHERE id = ?',
      [gameId]
    );

    if (game.length === 0) {
      throw new NotFoundError('Game not found', { gameId });
    }

    const players = JSON.parse(game[0].players || '[]');
    const playerInGame = players.some((player: any) => player.id === playerId);

    if (!playerInGame) {
      throw new ValidationError('Player not found in this game');
    }
  }

  private validateModificationRequest(request: ModificationRequest): void {
    const validTypes = ['score_change', 'result_change', 'no_change'];
    if (!validTypes.includes(request.type)) {
      throw new ValidationError('Invalid modification type');
    }

    if (request.type === 'score_change' && request.newScore === undefined) {
      throw new ValidationError('New score required for score change request');
    }

    if (request.type === 'result_change' && !request.newResult) {
      throw new ValidationError('New result required for result change request');
    }

    if (request.newResult && !['win', 'loss', 'draw'].includes(request.newResult)) {
      throw new ValidationError('Invalid new result value');
    }

    if (!request.details || request.details.trim().length === 0) {
      throw new ValidationError('Modification details are required');
    }
  }

  private async getModificationRecord(gameId: string): Promise<GameModification | null> {
    const dbManager = getDatabaseManager();
    
    const result = await dbManager.executeRawQuery<any>(
      'SELECT * FROM game_modifications WHERE game_id = ?',
      [gameId]
    );

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      gameId: row.game_id,
      player1Id: row.player1_id,
      player2Id: row.player2_id,
      player1Request: row.player1_request,
      player2Request: row.player2_request,
      player1NewScore: row.player1_new_score,
      player2NewScore: row.player2_new_score,
      player1NewResult: row.player1_new_result,
      player2NewResult: row.player2_new_result,
      finalDecision: row.final_decision,
      applied: row.applied,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private async getPlayer1Id(gameId: string): Promise<string> {
    const dbManager = getDatabaseManager();
    
    const result = await dbManager.executeRawQuery<any>(
      'SELECT players FROM games WHERE id = ?',
      [gameId]
    );

    if (result.length === 0) {
      throw new NotFoundError('Game not found', { gameId });
    }

    const players = JSON.parse(result[0].players || '[]');
    return players[0]?.id || '';
  }

  private async getPlayer2Id(gameId: string): Promise<string> {
    const dbManager = getDatabaseManager();
    
    const result = await dbManager.executeRawQuery<any>(
      'SELECT players FROM games WHERE id = ?',
      [gameId]
    );

    if (result.length === 0) {
      throw new NotFoundError('Game not found', { gameId });
    }

    const players = JSON.parse(result[0].players || '[]');
    return players[1]?.id || '';
  }

  private async updatePlayer1Request(gameId: string, request: ModificationRequest): Promise<void> {
    const dbManager = getDatabaseManager();
    
    await dbManager.executeRawCommand(
      `UPDATE game_modifications 
       SET player1_request = ?, player1_new_score = ?, player1_new_result = ?, updated_at = ?
       WHERE game_id = ?`,
      [
        JSON.stringify(request),
        request.newScore || null,
        request.newResult || null,
        new Date().toISOString(),
        gameId
      ]
    );
  }

  private async updatePlayer2Request(gameId: string, request: ModificationRequest): Promise<void> {
    const dbManager = getDatabaseManager();
    
    await dbManager.executeRawCommand(
      `UPDATE game_modifications 
       SET player2_request = ?, player2_new_score = ?, player2_new_result = ?, updated_at = ?
       WHERE game_id = ?`,
      [
        JSON.stringify(request),
        request.newScore || null,
        request.newResult || null,
        new Date().toISOString(),
        gameId
      ]
    );
  }

  private async updateModificationRecord(gameId: string, updates: Partial<GameModification>): Promise<void> {
    const dbManager = getDatabaseManager();
    
    const setParts: string[] = [];
    const values: any[] = [];

    if (updates.finalDecision !== undefined) {
      setParts.push('final_decision = ?');
      values.push(updates.finalDecision);
    }

    if (updates.applied !== undefined) {
      setParts.push('applied = ?');
      values.push(updates.applied);
    }

    setParts.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(gameId);

    await dbManager.executeRawCommand(
      `UPDATE game_modifications SET ${setParts.join(', ')} WHERE game_id = ?`,
      values
    );
  }

  private doRequestsMatch(request1: ModificationRequest, request2: ModificationRequest): boolean {
    // Requests match if they are the same type and have the same values
    if (request1.type !== request2.type) {
      return false;
    }

    if (request1.type === 'no_change') {
      return true; // Both want no changes
    }

    if (request1.type === 'score_change') {
      return request1.newScore === request2.newScore;
    }

    if (request1.type === 'result_change') {
      return request1.newResult === request2.newResult;
    }

    return false;
  }

  private async applyModification(gameId: string, request: ModificationRequest): Promise<GameResults> {
    const dbManager = getDatabaseManager();
    
    // Get original game result
    const originalResult = await this.getOriginalGameResult(gameId);
    
    // Apply the modification based on request type
    let modifiedResult = { ...originalResult };

    if (request.type === 'score_change' && request.newScore !== undefined) {
      // Update scores for both players (assuming they agreed on the same score)
      const playerIds = Object.keys(originalResult.finalScores);
      modifiedResult.finalScores = {};
      playerIds.forEach(playerId => {
        modifiedResult.finalScores[playerId] = request.newScore!;
      });
    } else if (request.type === 'result_change' && request.newResult) {
      // Update the winner based on new result
      const playerIds = Object.keys(originalResult.finalScores);
      if (request.newResult === 'draw') {
        modifiedResult.winner = undefined;
      } else if (request.newResult === 'win') {
        // This is ambiguous - in a real implementation, you'd need to specify which player wins
        // For now, we'll keep the original winner logic
        modifiedResult.winner = originalResult.winner;
      }
    }

    // Update the game record with modified results
    await dbManager.executeRawCommand(
      'UPDATE games SET results = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(modifiedResult), new Date().toISOString(), gameId]
    );

    return modifiedResult;
  }

  private async getOriginalGameResult(gameId: string): Promise<GameResults> {
    const dbManager = getDatabaseManager();
    
    const result = await dbManager.executeRawQuery<any>(
      'SELECT results FROM games WHERE id = ?',
      [gameId]
    );

    if (result.length === 0) {
      throw new NotFoundError('Game not found', { gameId });
    }

    return JSON.parse(result[0].results || '{}');
  }

  private async getFinalGameResult(gameId: string): Promise<GameResults> {
    // This returns the current game result (which may be modified)
    return await this.getOriginalGameResult(gameId);
  }

  private async getPlayerStatsFromGame(gameId: string): Promise<{ player1: any; player2: any }> {
    const gameResult = await this.getFinalGameResult(gameId);
    
    // Extract player statistics from game results
    const playerIds = Object.keys(gameResult.finalScores);
    const player1Id = playerIds[0];
    const player2Id = playerIds[1];

    return {
      player1: {
        playerId: player1Id,
        score: gameResult.finalScores[player1Id],
        isWinner: gameResult.winner === player1Id,
        stats: gameResult.statistics?.playerStats?.[player1Id] || {}
      },
      player2: {
        playerId: player2Id,
        score: gameResult.finalScores[player2Id],
        isWinner: gameResult.winner === player2Id,
        stats: gameResult.statistics?.playerStats?.[player2Id] || {}
      }
    };
  }
}

// Singleton instance
let postGameModificationServiceInstance: PostGameModificationService | null = null;

export function getPostGameModificationService(): PostGameModificationService {
  if (!postGameModificationServiceInstance) {
    postGameModificationServiceInstance = new PostGameModificationService();
  }
  return postGameModificationServiceInstance;
}

// Reset for testing
export function resetPostGameModificationService(): void {
  postGameModificationServiceInstance = null;
}
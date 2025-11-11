/**
 * Tournament Load Testing Suite
 * Tests multiple concurrent tournaments, maximum player counts, and network resilience
 * Requirements: 1.5, 2.5, 4.4
 */

import { TournamentLoadTester } from './TournamentLoadTester';
import { getPartyLobbyService } from '../services/PartyLobbyService';
import { TournamentEngine } from '../services/tournament/TournamentEngine';
import { TournamentFormat, LobbyStatus, TournamentStatus } from '../types/party';

describe('Tournament Load Testing', () => {
  let loadTester: TournamentLoadTester;
  let lobbyService: ReturnType<typeof getPartyLobbyService>;
  let tournamentEngine: TournamentEngine;

  beforeAll(async () => {
    // Initialize services
    lobbyService = getPartyLobbyService();
    tournamentEngine = new TournamentEngine();
    
    // Initialize load tester without WebSocket server for simplified testing
    loadTester = new TournamentLoadTester(
      lobbyService,
      tournamentEngine
    );
  });

  afterAll(async () => {
    // Clean up
    await loadTester.cleanup();
  });

  describe('Multiple Concurrent Tournaments', () => {
    test('should handle 5 concurrent tournaments with 8 players each', async () => {
      const result = await loadTester.testConcurrentTournaments({
        tournamentCount: 5,
        playersPerTournament: 8,
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        maxConcurrentMatches: 10
      });

      expect(result.success).toBe(true);
      expect(result.tournamentsCompleted).toBe(5);
      expect(result.totalPlayersSimulated).toBe(40);
      expect(result.averageTournamentDuration).toBeLessThan(300000); // Less than 5 minutes
      expect(result.errors.length).toBe(0);
    }, 600000); // 10 minute timeout

    test('should handle 3 concurrent tournaments with maximum 16 players each', async () => {
      const result = await loadTester.testConcurrentTournaments({
        tournamentCount: 3,
        playersPerTournament: 16,
        tournamentFormat: TournamentFormat.DOUBLE_ELIMINATION,
        maxConcurrentMatches: 15
      });

      expect(result.success).toBe(true);
      expect(result.tournamentsCompleted).toBe(3);
      expect(result.totalPlayersSimulated).toBe(48);
      expect(result.averageTournamentDuration).toBeLessThan(600000); // Less than 10 minutes
      expect(result.errors.length).toBe(0);
    }, 900000); // 15 minute timeout

    test('should maintain performance with 10 small concurrent tournaments', async () => {
      const result = await loadTester.testConcurrentTournaments({
        tournamentCount: 10,
        playersPerTournament: 4,
        tournamentFormat: TournamentFormat.ROUND_ROBIN,
        maxConcurrentMatches: 20
      });

      expect(result.success).toBe(true);
      expect(result.tournamentsCompleted).toBe(10);
      expect(result.totalPlayersSimulated).toBe(40);
      expect(result.averageMatchDuration).toBeLessThan(30000); // Less than 30 seconds per match
      expect(result.errors.length).toBe(0);
    }, 600000);
  });

  describe('Maximum Player Count Performance', () => {
    test('should handle tournament with maximum 16 players efficiently', async () => {
      const result = await loadTester.testMaximumPlayerCount({
        playerCount: 16,
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        simulateRealisticBehavior: true
      });

      expect(result.success).toBe(true);
      expect(result.playersSimulated).toBe(16);
      expect(result.lobbyCreationTime).toBeLessThan(5000); // Less than 5 seconds
      expect(result.tournamentStartTime).toBeLessThan(10000); // Less than 10 seconds
      expect(result.averageMatchStartTime).toBeLessThan(3000); // Less than 3 seconds per match
      expect(result.totalTournamentTime).toBeLessThan(300000); // Less than 5 minutes total
      expect(result.memoryUsage.peak).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    }, 400000); // 6.5 minute timeout

    test('should handle double elimination with 16 players', async () => {
      const result = await loadTester.testMaximumPlayerCount({
        playerCount: 16,
        tournamentFormat: TournamentFormat.DOUBLE_ELIMINATION,
        simulateRealisticBehavior: true
      });

      expect(result.success).toBe(true);
      expect(result.playersSimulated).toBe(16);
      expect(result.totalMatches).toBeGreaterThan(15); // Double elimination has more matches
      expect(result.totalTournamentTime).toBeLessThan(600000); // Less than 10 minutes
      expect(result.errors.length).toBe(0);
    }, 700000); // 11.5 minute timeout

    test('should handle round robin with 12 players', async () => {
      const result = await loadTester.testMaximumPlayerCount({
        playerCount: 12,
        tournamentFormat: TournamentFormat.ROUND_ROBIN,
        simulateRealisticBehavior: true
      });

      expect(result.success).toBe(true);
      expect(result.playersSimulated).toBe(12);
      expect(result.totalMatches).toBe(66); // 12 * 11 / 2 = 66 matches
      expect(result.totalTournamentTime).toBeLessThan(900000); // Less than 15 minutes
      expect(result.errors.length).toBe(0);
    }, 1000000); // 16.5 minute timeout
  });

  describe('Network Resilience During Tournament Play', () => {
    test('should handle network interruptions during tournament', async () => {
      const result = await loadTester.testNetworkResilience({
        playerCount: 8,
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        networkInterruptions: [
          { delay: 30000, duration: 5000, type: 'disconnect' }, // Disconnect after 30s for 5s
          { delay: 60000, duration: 3000, type: 'latency', severity: 2000 }, // High latency after 60s
          { delay: 90000, duration: 2000, type: 'packet_loss', severity: 0.1 } // 10% packet loss after 90s
        ]
      });

      expect(result.success).toBe(true);
      expect(result.playersSimulated).toBe(8);
      expect(result.networkInterruptionsHandled).toBe(3);
      expect(result.reconnectionSuccessRate).toBeGreaterThan(0.9); // 90% success rate
      expect(result.tournamentCompleted).toBe(true);
      expect(result.dataIntegrityMaintained).toBe(true);
    }, 300000); // 5 minute timeout

    test('should recover from WebSocket server restart', async () => {
      const result = await loadTester.testServerRestart({
        playerCount: 6,
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        restartDelay: 45000, // Restart server after 45 seconds
        restartDuration: 10000 // Server down for 10 seconds
      });

      expect(result.success).toBe(true);
      expect(result.playersSimulated).toBe(6);
      expect(result.serverRestartHandled).toBe(true);
      expect(result.reconnectionSuccessRate).toBeGreaterThan(0.8); // 80% success rate
      expect(result.tournamentStateRecovered).toBe(true);
      expect(result.tournamentCompleted).toBe(true);
    }, 200000); // 3.5 minute timeout

    test('should handle high message throughput during tournament', async () => {
      const result = await loadTester.testHighMessageThroughput({
        playerCount: 12,
        tournamentFormat: TournamentFormat.ROUND_ROBIN,
        messagesPerSecond: 100,
        testDuration: 120000, // 2 minutes
        includeChat: true,
        includeStatusUpdates: true
      });

      expect(result.success).toBe(true);
      expect(result.playersSimulated).toBe(12);
      expect(result.totalMessagesSent).toBeGreaterThan(10000);
      expect(result.averageMessageLatency).toBeLessThan(100); // Less than 100ms
      expect(result.messageDeliveryRate).toBeGreaterThan(0.95); // 95% delivery rate
      expect(result.serverPerformanceDegraded).toBe(false);
    }, 180000); // 3 minute timeout
  });

  describe('Stress Testing Edge Cases', () => {
    test('should handle rapid tournament creation and destruction', async () => {
      const result = await loadTester.testRapidTournamentCycling({
        cycleCount: 20,
        playersPerTournament: 4,
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        cycleInterval: 5000 // New tournament every 5 seconds
      });

      expect(result.success).toBe(true);
      expect(result.tournamentsCreated).toBe(20);
      expect(result.tournamentsCompleted).toBe(20);
      expect(result.averageCycleTime).toBeLessThan(30000); // Less than 30 seconds per cycle
      expect(result.memoryLeaks.detected).toBe(false);
      expect(result.errors.length).toBe(0);
    }, 800000); // 13.5 minute timeout

    test('should handle tournament with players joining and leaving during setup', async () => {
      const result = await loadTester.testDynamicPlayerManagement({
        initialPlayers: 4,
        maxPlayers: 16,
        playerJoinRate: 2, // 2 players per 10 seconds
        playerLeaveRate: 1, // 1 player per 15 seconds
        testDuration: 60000, // 1 minute of dynamic changes
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION
      });

      expect(result.success).toBe(true);
      expect(result.finalPlayerCount).toBeGreaterThanOrEqual(4);
      expect(result.finalPlayerCount).toBeLessThanOrEqual(16);
      expect(result.tournamentStarted).toBe(true);
      expect(result.lobbyStabilityMaintained).toBe(true);
      expect(result.errors.length).toBe(0);
    }, 120000); // 2 minute timeout

    test('should maintain performance under memory pressure', async () => {
      const result = await loadTester.testMemoryPressure({
        tournamentCount: 5,
        playersPerTournament: 8,
        tournamentFormat: TournamentFormat.DOUBLE_ELIMINATION,
        simulateMemoryPressure: true,
        memoryPressureLevel: 0.8 // Use 80% of available memory
      });

      expect(result.success).toBe(true);
      expect(result.tournamentsCompleted).toBe(5);
      expect(result.memoryUsage.peak).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
      expect(result.performanceDegradation).toBeLessThan(0.3); // Less than 30% degradation
      expect(result.outOfMemoryErrors).toBe(0);
    }, 600000); // 10 minute timeout
  });

  describe('Performance Benchmarks', () => {
    test('should meet tournament creation performance benchmarks', async () => {
      const result = await loadTester.benchmarkTournamentCreation({
        iterations: 100,
        playersPerTournament: 8,
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION
      });

      expect(result.success).toBe(true);
      expect(result.averageCreationTime).toBeLessThan(1000); // Less than 1 second
      expect(result.p95CreationTime).toBeLessThan(2000); // 95th percentile less than 2 seconds
      expect(result.p99CreationTime).toBeLessThan(5000); // 99th percentile less than 5 seconds
      expect(result.errors.length).toBe(0);
    }, 300000); // 5 minute timeout

    test('should meet match coordination performance benchmarks', async () => {
      const result = await loadTester.benchmarkMatchCoordination({
        tournamentCount: 3,
        playersPerTournament: 16,
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        measureLatency: true
      });

      expect(result.success).toBe(true);
      expect(result.averageMatchStartLatency).toBeLessThan(2000); // Less than 2 seconds
      expect(result.averageResultProcessingTime).toBeLessThan(500); // Less than 500ms
      expect(result.bracketUpdateLatency).toBeLessThan(1000); // Less than 1 second
      expect(result.errors.length).toBe(0);
    }, 400000); // 6.5 minute timeout
  });
});
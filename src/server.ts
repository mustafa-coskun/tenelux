import { MultiplayerSyncService } from './services/MultiplayerSyncService';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

async function startServer() {
  try {
    console.log('Starting Tenelux multiplayer server...');

    const multiplayerService = new MultiplayerSyncService({
      port: PORT,
      enableHeartbeat: true,
      heartbeatInterval: 30000,
      connectionTimeout: 60000,
    });

    await multiplayerService.start(PORT);

    console.log(
      `Tenelux multiplayer server started successfully on port ${PORT}`
    );
    console.log('Server statistics will be logged every 30 seconds...');

    // Log server statistics periodically
    setInterval(() => {
      const stats = multiplayerService.getServiceStats();
      console.log('Server Stats:', {
        isRunning: stats.isRunning,
        connections: stats.connections,
        activeConnections: stats.activeConnections,
        playersInLobby: stats.playersInLobby,
        playersInQueue: stats.playersInQueue,
        activeGames: stats.activeGames,
        activeMatches: stats.activeMatches,
      });
    }, 30000);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await multiplayerService.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await multiplayerService.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

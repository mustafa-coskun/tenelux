-- Tenebris Game Database Schema

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_ai BOOLEAN NOT NULL DEFAULT 0,
    trust_score REAL NOT NULL DEFAULT 0.0,
    total_games_played INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    current_phase TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    winner_id TEXT,
    max_rounds INTEGER NOT NULL,
    trust_phase_rounds INTEGER NOT NULL,
    communication_time_limit INTEGER NOT NULL,
    allow_decision_reversal BOOLEAN NOT NULL,
    game_mode TEXT NOT NULL,
    ai_strategy TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (winner_id) REFERENCES players(id)
);

-- Session players (many-to-many relationship)
CREATE TABLE IF NOT EXISTS session_players (
    session_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    PRIMARY KEY (session_id, player_id),
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Rounds table
CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    phase_type TEXT NOT NULL,
    player_a_score INTEGER NOT NULL DEFAULT 0,
    player_b_score INTEGER NOT NULL DEFAULT 0,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);

-- Player decisions table
CREATE TABLE IF NOT EXISTS player_decisions (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    can_reverse BOOLEAN NOT NULL DEFAULT 0,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Communication messages table
CREATE TABLE IF NOT EXISTS communication_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Player statistics table (for historical tracking)
CREATE TABLE IF NOT EXISTS player_statistics (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    cooperation_percentage REAL NOT NULL DEFAULT 0.0,
    betrayal_percentage REAL NOT NULL DEFAULT 0.0,
    most_fearful_round INTEGER,
    total_points INTEGER NOT NULL DEFAULT 0,
    games_won INTEGER NOT NULL DEFAULT 0,
    games_lost INTEGER NOT NULL DEFAULT 0,
    average_trust_score REAL NOT NULL DEFAULT 0.0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
CREATE INDEX IF NOT EXISTS idx_players_trust_score ON players(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_players_games_played ON players(total_games_played DESC);
CREATE INDEX IF NOT EXISTS idx_players_created_at ON players(created_at);

CREATE INDEX IF NOT EXISTS idx_game_sessions_start_time ON game_sessions(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_end_time ON game_sessions(end_time);
CREATE INDEX IF NOT EXISTS idx_game_sessions_winner ON game_sessions(winner_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_phase ON game_sessions(current_phase);

CREATE INDEX IF NOT EXISTS idx_session_players_player ON session_players(player_id);
CREATE INDEX IF NOT EXISTS idx_session_players_session ON session_players(session_id);

CREATE INDEX IF NOT EXISTS idx_rounds_session_id ON rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_rounds_session_round ON rounds(session_id, round_number);
CREATE INDEX IF NOT EXISTS idx_rounds_timestamp ON rounds(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_player_decisions_round_id ON player_decisions(round_id);
CREATE INDEX IF NOT EXISTS idx_player_decisions_player_id ON player_decisions(player_id);
CREATE INDEX IF NOT EXISTS idx_player_decisions_player_round ON player_decisions(player_id, round_id);
CREATE INDEX IF NOT EXISTS idx_player_decisions_timestamp ON player_decisions(timestamp);

CREATE INDEX IF NOT EXISTS idx_communication_messages_session_id ON communication_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_communication_messages_player ON communication_messages(player_id);
CREATE INDEX IF NOT EXISTS idx_communication_messages_timestamp ON communication_messages(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_player_statistics_player_id ON player_statistics(player_id);
CREATE INDEX IF NOT EXISTS idx_player_statistics_session ON player_statistics(session_id);
CREATE INDEX IF NOT EXISTS idx_player_statistics_cooperation ON player_statistics(cooperation_percentage DESC);
CREATE INDEX IF NOT EXISTS idx_player_statistics_created ON player_statistics(created_at DESC);

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_sessions_active ON game_sessions(start_time, end_time) WHERE end_time IS NULL;
CREATE INDEX IF NOT EXISTS idx_players_leaderboard ON players(trust_score DESC, total_games_played DESC) WHERE total_games_played > 0;
CREATE INDEX IF NOT EXISTS idx_statistics_aggregation ON player_statistics(player_id, cooperation_percentage, total_points);

-- ========================================
-- TOURNAMENT AND PARTY MODE SCHEMA
-- ========================================

-- Party lobbies table
CREATE TABLE IF NOT EXISTS party_lobbies (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    host_player_id TEXT NOT NULL,
    max_players INTEGER NOT NULL CHECK (max_players >= 4 AND max_players <= 16),
    current_player_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('waiting_for_players', 'ready_to_start', 'tournament_in_progress', 'tournament_completed', 'lobby_closed')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_player_id) REFERENCES players(id)
);

-- Party lobby settings table
CREATE TABLE IF NOT EXISTS party_lobby_settings (
    lobby_id TEXT PRIMARY KEY,
    round_count INTEGER NOT NULL CHECK (round_count >= 5 AND round_count <= 20),
    tournament_format TEXT NOT NULL CHECK (tournament_format IN ('single_elimination', 'double_elimination', 'round_robin')),
    allow_spectators BOOLEAN NOT NULL DEFAULT 1,
    chat_enabled BOOLEAN NOT NULL DEFAULT 1,
    auto_start_when_full BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (lobby_id) REFERENCES party_lobbies(id) ON DELETE CASCADE
);

-- Party lobby participants table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS party_lobby_participants (
    lobby_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    is_host BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'in_match', 'eliminated', 'spectating', 'disconnected')),
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lobby_id, player_id),
    FOREIGN KEY (lobby_id) REFERENCES party_lobbies(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin')),
    current_round INTEGER NOT NULL DEFAULT 0,
    total_rounds INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'cancelled')),
    start_time DATETIME,
    end_time DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lobby_id) REFERENCES party_lobbies(id)
);

-- Tournament players table
CREATE TABLE IF NOT EXISTS tournament_players (
    tournament_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    is_eliminated BOOLEAN NOT NULL DEFAULT 0,
    current_rank INTEGER NOT NULL DEFAULT 0,
    tournament_points INTEGER NOT NULL DEFAULT 0,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    eliminated_at DATETIME,
    PRIMARY KEY (tournament_id, player_id),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Tournament rounds table
CREATE TABLE IF NOT EXISTS tournament_rounds (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    start_time DATETIME,
    end_time DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- Tournament matches table
CREATE TABLE IF NOT EXISTS tournament_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    round_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    game_session_id TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    bracket_position INTEGER,
    start_time DATETIME,
    end_time DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (round_id) REFERENCES tournament_rounds(id) ON DELETE CASCADE,
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id),
    FOREIGN KEY (game_session_id) REFERENCES game_sessions(id)
);

-- Tournament match results table
CREATE TABLE IF NOT EXISTS tournament_match_results (
    match_id TEXT PRIMARY KEY,
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    winner_id TEXT NOT NULL,
    loser_id TEXT NOT NULL,
    player1_score INTEGER NOT NULL DEFAULT 0,
    player2_score INTEGER NOT NULL DEFAULT 0,
    game_session_id TEXT NOT NULL,
    total_rounds INTEGER NOT NULL DEFAULT 0,
    player1_cooperations INTEGER NOT NULL DEFAULT 0,
    player1_betrayals INTEGER NOT NULL DEFAULT 0,
    player2_cooperations INTEGER NOT NULL DEFAULT 0,
    player2_betrayals INTEGER NOT NULL DEFAULT 0,
    match_duration INTEGER NOT NULL DEFAULT 0, -- in seconds
    completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE,
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id),
    FOREIGN KEY (winner_id) REFERENCES players(id),
    FOREIGN KEY (loser_id) REFERENCES players(id),
    FOREIGN KEY (game_session_id) REFERENCES game_sessions(id)
);

-- Tournament player statistics table
CREATE TABLE IF NOT EXISTS tournament_player_statistics (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    matches_played INTEGER NOT NULL DEFAULT 0,
    matches_won INTEGER NOT NULL DEFAULT 0,
    matches_lost INTEGER NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0,
    cooperation_rate REAL NOT NULL DEFAULT 0.0,
    betrayal_rate REAL NOT NULL DEFAULT 0.0,
    average_match_score REAL NOT NULL DEFAULT 0.0,
    tournament_points INTEGER NOT NULL DEFAULT 0,
    final_rank INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id),
    UNIQUE(tournament_id, player_id)
);

-- Head-to-head statistics table
CREATE TABLE IF NOT EXISTS tournament_head_to_head (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    matches_played INTEGER NOT NULL DEFAULT 0,
    player1_wins INTEGER NOT NULL DEFAULT 0,
    player2_wins INTEGER NOT NULL DEFAULT 0,
    player1_total_points INTEGER NOT NULL DEFAULT 0,
    player2_total_points INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id),
    UNIQUE(tournament_id, player1_id, player2_id)
);

-- Tournament statistics table (overall tournament metrics)
CREATE TABLE IF NOT EXISTS tournament_statistics (
    tournament_id TEXT PRIMARY KEY,
    total_matches INTEGER NOT NULL DEFAULT 0,
    total_rounds INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 0, -- in seconds
    most_cooperative_player_id TEXT,
    most_competitive_player_id TEXT,
    highest_scoring_match_id TEXT,
    tournament_mvp_id TEXT,
    average_match_duration REAL NOT NULL DEFAULT 0.0,
    cooperation_rate REAL NOT NULL DEFAULT 0.0,
    betrayal_rate REAL NOT NULL DEFAULT 0.0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (most_cooperative_player_id) REFERENCES players(id),
    FOREIGN KEY (most_competitive_player_id) REFERENCES players(id),
    FOREIGN KEY (highest_scoring_match_id) REFERENCES tournament_matches(id),
    FOREIGN KEY (tournament_mvp_id) REFERENCES players(id)
);

-- Tournament rankings table (final tournament results)
CREATE TABLE IF NOT EXISTS tournament_rankings (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    rank INTEGER NOT NULL,
    final_score INTEGER NOT NULL DEFAULT 0,
    match_record TEXT NOT NULL, -- "5-2" format
    cooperation_percentage REAL NOT NULL DEFAULT 0.0,
    average_points_per_match REAL NOT NULL DEFAULT 0.0,
    tournament_points INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id),
    UNIQUE(tournament_id, player_id)
);

-- Tournament chat messages table
CREATE TABLE IF NOT EXISTS tournament_chat_messages (
    id TEXT PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    tournament_id TEXT,
    sender_id TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'player_message' CHECK (message_type IN ('player_message', 'system_message', 'host_message', 'tournament_update')),
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lobby_id) REFERENCES party_lobbies(id) ON DELETE CASCADE,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES players(id)
);

-- Tournament history archive table (for completed tournaments)
CREATE TABLE IF NOT EXISTS tournament_history (
    id TEXT PRIMARY KEY,
    original_tournament_id TEXT NOT NULL,
    lobby_code TEXT NOT NULL,
    format TEXT NOT NULL,
    total_players INTEGER NOT NULL,
    total_matches INTEGER NOT NULL,
    total_rounds INTEGER NOT NULL,
    duration INTEGER NOT NULL, -- in seconds
    winner_id TEXT NOT NULL,
    winner_name TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    cooperation_rate REAL NOT NULL DEFAULT 0.0,
    betrayal_rate REAL NOT NULL DEFAULT 0.0,
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (winner_id) REFERENCES players(id)
);

-- Tournament history player records table
CREATE TABLE IF NOT EXISTS tournament_history_players (
    id TEXT PRIMARY KEY,
    history_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    final_rank INTEGER NOT NULL,
    matches_played INTEGER NOT NULL,
    matches_won INTEGER NOT NULL,
    matches_lost INTEGER NOT NULL,
    total_points INTEGER NOT NULL,
    cooperation_rate REAL NOT NULL DEFAULT 0.0,
    betrayal_rate REAL NOT NULL DEFAULT 0.0,
    tournament_points INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (history_id) REFERENCES tournament_history(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- ========================================
-- TOURNAMENT INDEXES FOR PERFORMANCE
-- ========================================

-- Party lobby indexes
CREATE INDEX IF NOT EXISTS idx_party_lobbies_code ON party_lobbies(code);
CREATE INDEX IF NOT EXISTS idx_party_lobbies_host ON party_lobbies(host_player_id);
CREATE INDEX IF NOT EXISTS idx_party_lobbies_status ON party_lobbies(status);
CREATE INDEX IF NOT EXISTS idx_party_lobbies_created ON party_lobbies(created_at DESC);

-- Party lobby participants indexes
CREATE INDEX IF NOT EXISTS idx_lobby_participants_lobby ON party_lobby_participants(lobby_id);
CREATE INDEX IF NOT EXISTS idx_lobby_participants_player ON party_lobby_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_lobby_participants_status ON party_lobby_participants(status);

-- Tournament indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_lobby ON tournaments(lobby_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_format ON tournaments(format);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_time ON tournaments(start_time DESC);

-- Tournament player indexes
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON tournament_players(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_eliminated ON tournament_players(is_eliminated);
CREATE INDEX IF NOT EXISTS idx_tournament_players_rank ON tournament_players(current_rank);

-- Tournament round indexes
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament ON tournament_rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_number ON tournament_rounds(tournament_id, round_number);
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_status ON tournament_rounds(status);

-- Tournament match indexes
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_players ON tournament_matches(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_session ON tournament_matches(game_session_id);

-- Tournament match results indexes
CREATE INDEX IF NOT EXISTS idx_match_results_match ON tournament_match_results(match_id);
CREATE INDEX IF NOT EXISTS idx_match_results_players ON tournament_match_results(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_match_results_winner ON tournament_match_results(winner_id);
CREATE INDEX IF NOT EXISTS idx_match_results_completed ON tournament_match_results(completed_at DESC);

-- Tournament statistics indexes
CREATE INDEX IF NOT EXISTS idx_tournament_player_stats_tournament ON tournament_player_statistics(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_player_stats_player ON tournament_player_statistics(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_player_stats_rank ON tournament_player_statistics(final_rank);
CREATE INDEX IF NOT EXISTS idx_tournament_player_stats_points ON tournament_player_statistics(tournament_points DESC);

-- Head-to-head indexes
CREATE INDEX IF NOT EXISTS idx_head_to_head_tournament ON tournament_head_to_head(tournament_id);
CREATE INDEX IF NOT EXISTS idx_head_to_head_players ON tournament_head_to_head(player1_id, player2_id);

-- Tournament rankings indexes
CREATE INDEX IF NOT EXISTS idx_tournament_rankings_tournament ON tournament_rankings(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_rankings_rank ON tournament_rankings(tournament_id, rank);
CREATE INDEX IF NOT EXISTS idx_tournament_rankings_player ON tournament_rankings(player_id);

-- Tournament chat indexes
CREATE INDEX IF NOT EXISTS idx_tournament_chat_lobby ON tournament_chat_messages(lobby_id);
CREATE INDEX IF NOT EXISTS idx_tournament_chat_tournament ON tournament_chat_messages(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_chat_sender ON tournament_chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_tournament_chat_timestamp ON tournament_chat_messages(timestamp DESC);

-- Tournament history indexes
CREATE INDEX IF NOT EXISTS idx_tournament_history_original ON tournament_history(original_tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_history_winner ON tournament_history(winner_id);
CREATE INDEX IF NOT EXISTS idx_tournament_history_format ON tournament_history(format);
CREATE INDEX IF NOT EXISTS idx_tournament_history_archived ON tournament_history(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_tournament_history_start_time ON tournament_history(start_time DESC);

-- Tournament history players indexes
CREATE INDEX IF NOT EXISTS idx_history_players_history ON tournament_history_players(history_id);
CREATE INDEX IF NOT EXISTS idx_history_players_player ON tournament_history_players(player_id);
CREATE INDEX IF NOT EXISTS idx_history_players_rank ON tournament_history_players(final_rank);

-- ========================================
-- TOURNAMENT COMPOSITE INDEXES
-- ========================================

-- Active tournaments
CREATE INDEX IF NOT EXISTS idx_tournaments_active ON tournaments(status, start_time) WHERE status = 'in_progress';

-- Tournament leaderboards
CREATE INDEX IF NOT EXISTS idx_tournament_leaderboard ON tournament_player_statistics(tournament_id, tournament_points DESC, final_rank ASC);

-- Player tournament history
CREATE INDEX IF NOT EXISTS idx_player_tournament_history ON tournament_player_statistics(player_id, tournament_points DESC) WHERE final_rank IS NOT NULL;

-- Match scheduling
CREATE INDEX IF NOT EXISTS idx_match_scheduling ON tournament_matches(tournament_id, round_number, status) WHERE status IN ('scheduled', 'in_progress');

-- Tournament completion tracking
CREATE INDEX IF NOT EXISTS idx_tournament_completion ON tournament_rounds(tournament_id, status) WHERE status = 'completed';
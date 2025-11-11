// Database module exports
export { default as DatabaseConnection } from './DatabaseConnection';
export {
  BaseRepository,
  DatabaseError,
  DatabaseConstraintError,
  DatabaseBusyError,
  DatabaseLockedError,
  RecordNotFoundError,
} from './BaseRepository';

// Re-export repository classes (will be added in next subtask)
export * from './repositories';

let database;
try {
  // Dynamic import keeps configuration failures inside this error boundary.
  database = await import('../app/config/db.js');
  await database.checkDatabaseConnection();
  console.log('PostgreSQL connection successful.');
} catch (error) {
  const safeMessage = ['DatabaseConfigurationError', 'DatabaseConnectionError'].includes(error?.name)
    ? error.message
    : 'Database check failed. Verify dependencies and local PostgreSQL configuration.';
  console.error(safeMessage);
  process.exitCode = 1;
} finally {
  if (database) {
    try {
      await database.closeDatabase();
    } catch {
      console.error('Database pool could not close cleanly.');
      process.exitCode = 1;
    }
  }
}

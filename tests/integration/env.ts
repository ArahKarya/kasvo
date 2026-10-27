// Point the app's db client at the test database before anything imports it.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://kasvo:kasvo@localhost:5433/kasvo_test";

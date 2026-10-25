`pgmq-1.5.1.sql` is the unmodified upstream pgmq SQL implementation from
https://github.com/pgmq/pgmq/blob/v1.5.1/pgmq-extension/sql/pgmq.sql.
Used only by local database integration tests to execute real queue operations in PGlite.
Production enables Supabase's installed `pgmq` extension; it never installs this fixture.
Upstream license: https://github.com/pgmq/pgmq/blob/v1.5.1/LICENSE

CREATE ROLE app_user
  LOGIN
  PASSWORD 'marketplace_password';

CREATE ROLE backup_user
  LOGIN;

GRANT pg_read_all_data
TO backup_user;

GRANT CONNECT
ON DATABASE marketplace
  TO app_user;

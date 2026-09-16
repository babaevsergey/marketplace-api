CREATE ROLE app_user
  LOGIN
  PASSWORD 'marketplace_password';

GRANT CONNECT
ON DATABASE marketplace
  TO app_user;

DROP TABLE IF EXISTS hosts;
CREATE TABLE IF NOT EXISTS hosts(
       name TEXT PRIMARY KEY,
       pinged TEXT,
       alarmed TEXT
);

DROP TABLE IF EXISTS weathers;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS meetups;

CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    search_query VARCHAR(255),
    formatted_query VARCHAR(255),
    latitude NUMERIC,
    longitude NUMERIC
);date

CREATE TABLE weathers (
    id SERIAL PRIMARY KEY,
    forecast VARCHAR(255),
    time VARCHAR(255),
    created_at NUMERIC,
    location_id INTEGER NOT NULL,
    FOREIGN KEY (location_id) REFERENCES locations (id) 
);

CREATE TABLE meetups (
    id SERIAL PRIMARY KEY,
    link VARCHAR(255),
    name VARCHAR(255),
    creation_date VARCHAR(255),
    host VARCHAR(255)
);

CREATE TABLE hiking (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    location VARCHAR(255),
    length FLOAT,
    stars FLOAT,
    star_votes INT,
    summary VARCHAR(255),
    trail_url VARCHAR(255),
    conditions VARCHAR(255),
    condition_date VARCHAR(255),
    condition_time VARCHAR(255)
);